import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { z } from 'zod';
import { telegramConfigSchema } from '../channels/telegram/schema.js';

const configSchema = z.object({
  telegram: telegramConfigSchema.optional(),
});

export type ServerConfig = z.infer<typeof configSchema>;

const CONFIG_PATH = resolve(process.cwd(), 'config.json');

export function loadConfig(): ServerConfig {
  if (!existsSync(CONFIG_PATH)) return {};
  const raw = readFileSync(CONFIG_PATH, 'utf-8');
  const parsed: unknown = JSON.parse(raw);
  return configSchema.parse(parsed);
}
