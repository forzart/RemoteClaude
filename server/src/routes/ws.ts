import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import { randomUUID } from 'crypto';
import { parseClientMessage, type ServerMessage } from '../types/events.js';
import { startNewSession, resumeSession, sessionCwd } from '../services/agent-query.js';
import { SessionManager } from '../services/session-manager.js';
import { ConfigCache, updateCacheFromQuery } from '../services/config-cache.js';
import { mkdirSync } from 'fs';
import { listSessions, type Query } from '@anthropic-ai/claude-agent-sdk';

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function registerWsRoute(app: FastifyInstance, sessionManager: SessionManager, configCache: ConfigCache): void {
  app.get('/ws/chat', { websocket: true }, (socket: WebSocket, _request: FastifyRequest) => {
    socket.on('message', (raw: Buffer) => {
      void handleMessage(socket, raw.toString(), sessionManager, configCache);
    });

    socket.on('close', () => {});
  });
}

async function handleMessage(
  ws: WebSocket,
  raw: string,
  sessionManager: SessionManager,
  configCache: ConfigCache,
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
      await handleNewSession(ws, msg.sessionName, sessionManager);
      break;
    case 'message':
      await handleChatMessage(ws, msg.sessionName, msg.content, sessionManager, configCache);
      break;
    case 'abort':
      sessionManager.abort(msg.sessionName);
      break;
  }
}

async function handleNewSession(
  ws: WebSocket,
  sessionName: string,
  sessionManager: SessionManager,
): Promise<void> {
  const cwd = sessionCwd(sessionName);
  mkdirSync(cwd, { recursive: true });

  let sessionId: string;
  let isResume = false;
  try {
    const sessions = await listSessions({ dir: cwd });
    if (sessions.length > 0) {
      const latest = sessions.sort((a, b) => b.lastModified - a.lastModified)[0];
      sessionId = latest.sessionId;
      isResume = true;
    } else {
      sessionId = randomUUID();
    }
  } catch {
    sessionId = randomUUID();
  }

  sessionManager.registerPending(sessionName, sessionId, isResume);
  send(ws, { type: 'session_start', sessionName });
}

async function handleChatMessage(
  ws: WebSocket,
  sessionName: string,
  content: string,
  sessionManager: SessionManager,
  configCache: ConfigCache,
): Promise<void> {
  if (sessionManager.isActive(sessionName)) {
    send(ws, {
      type: 'error',
      sessionName,
      message: 'A query is already running for this session. Send abort first.',
    });
    return;
  }

  const abortController = new AbortController();
  const pending = sessionManager.consumePending(sessionName);

  if (!pending) {
    send(ws, { type: 'error', sessionName, message: 'No pending session. Send new_session first.' });
    return;
  }

  const { sessionId, isResume } = pending;
  sessionManager.register(sessionName, sessionId, abortController);

  const handle = isResume
    ? resumeSession({ prompt: content, sessionId, sessionName, abortController })
    : startNewSession({ prompt: content, sessionId, sessionName, abortController });

  await streamEvents(ws, sessionName, sessionId, handle.generator, sessionManager, configCache);
}

async function streamEvents(
  ws: WebSocket,
  sessionName: string,
  sessionId: string,
  generator: Query,
  sessionManager: SessionManager,
  configCache: ConfigCache,
): Promise<void> {
  try {
    void updateCacheFromQuery(generator, configCache);

    for await (const event of generator) {
      send(ws, { type: 'sdk_event', sessionName, event });
    }
    send(ws, { type: 'done', sessionName });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      send(ws, { type: 'done', sessionName });
    } else {
      send(ws, {
        type: 'error',
        sessionName,
        message: err instanceof Error ? err.message : 'Query failed',
      });
    }
  } finally {
    sessionManager.unregister(sessionName);
    sessionManager.registerPending(sessionName, sessionId, true);
  }
}
