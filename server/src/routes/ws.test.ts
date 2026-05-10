import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import WebSocket from 'ws';
import { registerWsRoute } from './ws.js';
import { SessionManager } from '../services/session-manager.js';

describe('WebSocket /ws/chat', () => {
  let app: FastifyInstance;
  let address: string;

  beforeAll(async () => {
    app = Fastify();
    const sessionManager = new SessionManager();
    await app.register(websocket);
    registerWsRoute(app, sessionManager);
    address = await app.listen({ port: 0, host: '127.0.0.1' });
  });

  afterAll(async () => {
    await app.close();
  });

  function connectWs(): Promise<WebSocket> {
    const wsUrl = address.replace('http', 'ws') + '/ws/chat';
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      ws.on('open', () => resolve(ws));
      ws.on('error', reject);
    });
  }

  function receiveMessage(ws: WebSocket): Promise<Record<string, unknown>> {
    return new Promise((resolve) => {
      ws.once('message', (data) => {
        resolve(JSON.parse(data.toString()));
      });
    });
  }

  it('returns error for invalid JSON', async () => {
    const ws = await connectWs();
    ws.send('not json');
    const response = await receiveMessage(ws);
    expect(response.type).toBe('error');
    ws.close();
  });

  it('returns error for unknown message type', async () => {
    const ws = await connectWs();
    ws.send(JSON.stringify({ type: 'unknown' }));
    const response = await receiveMessage(ws);
    expect(response.type).toBe('error');
    expect(response.message).toContain('Unknown message type');
    ws.close();
  });

  it('returns error for new_session without cwd', async () => {
    const ws = await connectWs();
    ws.send(JSON.stringify({ type: 'new_session' }));
    const response = await receiveMessage(ws);
    expect(response.type).toBe('error');
    expect(response.message).toContain('cwd');
    ws.close();
  });

  it('returns error for message without sessionId', async () => {
    const ws = await connectWs();
    ws.send(JSON.stringify({ type: 'message', content: 'hello' }));
    const response = await receiveMessage(ws);
    expect(response.type).toBe('error');
    expect(response.message).toContain('sessionId');
    ws.close();
  });
});
