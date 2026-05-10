import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { registerWsRoute } from './routes/ws.js';
import { registerSessionRoutes } from './routes/sessions.js';
import { SessionManager } from './services/session-manager.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function main(): Promise<void> {
  const app = Fastify({ logger: true });
  const sessionManager = new SessionManager();

  await app.register(websocket);

  registerWsRoute(app, sessionManager);
  registerSessionRoutes(app);

  app.get('/health', async () => ({ status: 'ok' }));

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down...`);
    sessionManager.abortAll();
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: PORT, host: HOST });
  app.log.info(`RemoteClaude server listening on ${HOST}:${PORT}`);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
