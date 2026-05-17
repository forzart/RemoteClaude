import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import cors from '@fastify/cors';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { registerWsRoute } from './routes/ws.js';
import { registerSessionRoutes } from './routes/sessions.js';
import { registerConfigRoutes } from './routes/config.js';
import { SessionManager } from './services/session-manager.js';
import { ConfigCache } from './services/config-cache.js';
import { probeConfig } from './services/agent-query.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function main(): Promise<void> {
  const app = Fastify({ logger: true });
  const sessionManager = new SessionManager();
  const configCache = new ConfigCache();

  await app.register(cors, { origin: true });
  await app.register(websocket);

  registerWsRoute(app, sessionManager, configCache);
  registerSessionRoutes(app);
  registerConfigRoutes(app, configCache);

  app.get('/health', async () => ({ status: 'ok' }));

  // Serve web client static files (after API routes so they take priority)
  const webDistPath = resolve(__dirname, '../../web/dist');
  await app.register(fastifyStatic, {
    root: webDistPath,
    prefix: '/',
  });

  // SPA fallback: serve index.html for non-file routes
  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith('/api/') || request.url.startsWith('/ws/')) {
      return reply.code(404).send({ error: 'Not found' });
    }
    return reply.sendFile('index.html', webDistPath);
  });

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

  void probeConfig(configCache).then(() => {
    app.log.info('Config cache populated from probe query');
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
