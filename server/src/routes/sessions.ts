import type { FastifyInstance } from 'fastify';
import { readdirSync, statSync, rmSync } from 'fs';
import { resolve } from 'path';
import { SESSIONS_ROOT } from '../services/agent-query.js';

interface SessionEntry {
  sessionName: string;
  createdAt: number;
}

function listRemoteSessions(): SessionEntry[] {
  try {
    const entries = readdirSync(SESSIONS_ROOT, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory())
      .map(e => {
        const dirPath = resolve(SESSIONS_ROOT, e.name);
        const stat = statSync(dirPath);
        return { sessionName: e.name, createdAt: stat.birthtimeMs };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export function registerSessionRoutes(app: FastifyInstance): void {
  app.get('/api/sessions', async (_request, reply) => {
    const sessions = listRemoteSessions();
    return reply.send(sessions);
  });

  app.delete<{ Params: { name: string } }>(
    '/api/sessions/:name',
    async (request, reply) => {
      const { name } = request.params;
      const sessionDir = resolve(SESSIONS_ROOT, name);
      try {
        statSync(sessionDir);
      } catch {
        return reply.code(404).send({ error: 'Session not found' });
      }
      rmSync(sessionDir, { recursive: true, force: true });
      return reply.code(204).send();
    },
  );
}
