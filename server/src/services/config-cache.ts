export interface CachedCommand {
  name: string;
  description: string;
  argumentHint?: string;
  aliases?: string[];
}

export interface CachedMcpServer {
  name: string;
  status: string;
  serverInfo?: { name: string; version: string };
  error?: string;
  tools?: Array<{ name: string; description?: string }>;
  scope?: string;
}

export interface CachedModel {
  value: string;
  displayName: string;
  description: string;
}

export interface CachedAgent {
  name: string;
  description: string;
  model?: string;
}

export interface CachedConfig {
  commands: CachedCommand[];
  models: CachedModel[];
  agents: CachedAgent[];
  mcpServers: CachedMcpServer[];
  updatedAt: number;
}

export class ConfigCache {
  private cache: CachedConfig | null = null;

  update(data: Partial<Omit<CachedConfig, 'updatedAt'>>): void {
    this.cache = {
      commands: data.commands ?? this.cache?.commands ?? [],
      models: data.models ?? this.cache?.models ?? [],
      agents: data.agents ?? this.cache?.agents ?? [],
      mcpServers: data.mcpServers ?? this.cache?.mcpServers ?? [],
      updatedAt: Date.now(),
    };
  }

  get(): CachedConfig | null {
    return this.cache;
  }
}

export interface ConfigProbe {
  initializationResult(): Promise<InitResult>;
  mcpServerStatus(): Promise<McpStatusResult[]>;
}

export function updateCacheFromQuery(
  generator: ConfigProbe,
  configCache: ConfigCache,
): Promise<void> {
  return Promise.all([
    generator.initializationResult(),
    generator.mcpServerStatus(),
  ]).then(([initResult, mcpStatus]) => {
    configCache.update({
      commands: initResult.commands.map((c) => ({
        name: c.name,
        description: c.description,
        argumentHint: c.argumentHint,
        aliases: c.aliases,
      })),
      models: initResult.models.map((m) => ({
        value: m.value,
        displayName: m.displayName,
        description: m.description,
      })),
      agents: initResult.agents.map((a) => ({
        name: a.name,
        description: a.description,
        model: a.model,
      })),
      mcpServers: mcpStatus.map((s) => ({
        name: s.name,
        status: s.status,
        serverInfo: s.serverInfo,
        error: s.error,
        tools: s.tools?.map((t) => ({ name: t.name, description: t.description })),
        scope: s.scope,
      })),
    });
  }).catch(() => {
    // best-effort
  });
}

interface InitResult {
  commands: Array<{ name: string; description: string; argumentHint?: string; aliases?: string[] }>;
  models: Array<{ value: string; displayName: string; description: string }>;
  agents: Array<{ name: string; description: string; model?: string }>;
}

interface McpStatusResult {
  name: string;
  status: string;
  serverInfo?: { name: string; version: string };
  error?: string;
  tools?: Array<{ name: string; description?: string }>;
  scope?: string;
}
