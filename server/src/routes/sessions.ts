import type { FastifyInstance } from 'fastify';
import { listSessions, deleteSession } from '@anthropic-ai/claude-agent-sdk';

export function registerSessionRoutes(app: FastifyInstance): void {
  app.get('/api/sessions', async (_request, reply) => {
    const sessions = await listSessions();
    return reply.send(sessions);
  });

  app.delete<{ Params: { id: string } }>(
    '/api/sessions/:id',
    async (request, reply) => {
      const { id } = request.params;
      try {
        await deleteSession(id);
        return reply.code(204).send();
      } catch (err) {
        return reply.code(404).send({
          error: err instanceof Error ? err.message : 'Session not found',
        });
      }
    },
  );
}
