import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import { parseClientMessage, type ServerMessage } from '../types/events.js';
import { startNewSession, resumeSession } from '../services/agent-query.js';
import { SessionManager } from '../services/session-manager.js';
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function registerWsRoute(app: FastifyInstance, sessionManager: SessionManager): void {
  app.get('/ws/chat', { websocket: true }, (socket: WebSocket, _request: FastifyRequest) => {
    socket.on('message', (raw: Buffer) => {
      void handleMessage(socket, raw.toString(), sessionManager);
    });

    socket.on('close', () => {
      // Client disconnected — abort is handled per-session, not per-connection
    });
  });
}

async function handleMessage(
  ws: WebSocket,
  raw: string,
  sessionManager: SessionManager,
): Promise<void> {
  let msg;
  try {
    msg = parseClientMessage(raw);
  } catch (err) {
    send(ws, {
      type: 'error',
      message: err instanceof Error ? err.message : 'Invalid message',
    });
    return;
  }

  switch (msg.type) {
    case 'new_session':
      await handleNewSession(ws, msg.sessionName, msg.content, sessionManager);
      break;
    case 'message':
      await handleChatMessage(ws, msg.sessionId, msg.content, sessionManager);
      break;
    case 'abort':
      sessionManager.abort(msg.sessionId);
      break;
  }
}

async function handleNewSession(
  ws: WebSocket,
  sessionName: string,
  content: string | undefined,
  sessionManager: SessionManager,
): Promise<void> {
  const abortController = new AbortController();

  let handle;
  try {
    handle = startNewSession({
      prompt: content || '',
      sessionName,
      abortController,
    });
  } catch (err) {
    send(ws, {
      type: 'error',
      message: err instanceof Error ? err.message : 'Failed to create session',
    });
    return;
  }

  const { sessionId, generator } = handle;
  sessionManager.register(sessionId, abortController);

  send(ws, { type: 'session_start', sessionId, sessionName });

  await streamEvents(ws, sessionId, generator, sessionManager);
}

async function handleChatMessage(
  ws: WebSocket,
  sessionId: string,
  content: string,
  sessionManager: SessionManager,
): Promise<void> {
  if (sessionManager.isActive(sessionId)) {
    send(ws, {
      type: 'error',
      sessionId,
      message: 'A query is already running for this session. Send abort first.',
    });
    return;
  }

  const abortController = new AbortController();
  sessionManager.register(sessionId, abortController);

  const { generator } = resumeSession({
    prompt: content,
    sessionId,
    abortController,
  });

  await streamEvents(ws, sessionId, generator, sessionManager);
}

async function streamEvents(
  ws: WebSocket,
  sessionId: string,
  generator: AsyncGenerator<SDKMessage, void>,
  sessionManager: SessionManager,
): Promise<void> {
  try {
    for await (const event of generator) {
      send(ws, { type: 'sdk_event', sessionId, event });
    }
    send(ws, { type: 'done', sessionId });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      send(ws, { type: 'done', sessionId });
    } else {
      send(ws, {
        type: 'error',
        sessionId,
        message: err instanceof Error ? err.message : 'Query failed',
      });
    }
  } finally {
    sessionManager.unregister(sessionId);
  }
}
