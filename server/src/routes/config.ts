import type { FastifyInstance } from 'fastify';
import { resolveSettings } from '@anthropic-ai/claude-agent-sdk';
import type { ConfigCache } from '../services/config-cache.js';

export function registerConfigRoutes(app: FastifyInstance, configCache: ConfigCache): void {
  app.get('/api/config/mcp', async (_request, reply) => {
    const cached = configCache.get();
    if (cached && cached.mcpServers.length > 0) {
      return reply.send({ mcpServers: cached.mcpServers });
    }
    try {
      const { effective } = await resolveSettings();
      const raw = (effective.mcpServers ?? {}) as Record<string, unknown>;
      const servers = Object.entries(raw).map(([name, config]) => ({
        name,
        status: 'unknown',
        config,
      }));
      return reply.send({ mcpServers: servers });
    } catch {
      return reply.send({ mcpServers: [] });
    }
  });

  app.get('/api/config/skills', async (_request, reply) => {
    const cached = configCache.get();
    if (cached && cached.commands.length > 0) {
      return reply.send({
        commands: cached.commands,
        agents: cached.agents,
      });
    }
    return reply.send({ commands: [], agents: [] });
  });

  app.get('/api/config/overview', async (_request, reply) => {
    const cached = configCache.get();
    try {
      const { effective } = await resolveSettings();
      return reply.send({
        model: effective.model ?? null,
        hooks: Object.keys(((effective as Record<string, unknown>).hooks ?? {}) as Record<string, unknown>),
        hasMcp: cached
          ? cached.mcpServers.length > 0
          : !!effective.mcpServers && Object.keys(effective.mcpServers as Record<string, unknown>).length > 0,
        commandCount: cached?.commands.length ?? 0,
        agentCount: cached?.agents.length ?? 0,
        models: cached?.models ?? [],
      });
    } catch {
      return reply.send({
        model: null,
        hooks: [],
        hasMcp: cached ? cached.mcpServers.length > 0 : false,
        commandCount: cached?.commands.length ?? 0,
        agentCount: cached?.agents.length ?? 0,
        models: cached?.models ?? [],
      });
    }
  });
}
