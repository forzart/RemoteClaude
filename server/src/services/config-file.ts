import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { z } from 'zod';

const telegramConfigSchema = z.object({
  botToken: z.string().min(1),
  allowedUserId: z.number().int().positive(),
  sessionName: z.string().min(1).default('telegram'),
  cwd: z.string().optional(),
});

const configSchema = z.object({
  telegram: telegramConfigSchema.optional(),
});

export type TelegramConfig = z.infer<typeof telegramConfigSchema>;
export type ServerConfig = z.infer<typeof configSchema>;

const CONFIG_PATH = resolve(process.cwd(), 'config.json');

export function loadConfig(): ServerConfig {
  if (!existsSync(CONFIG_PATH)) return {};
  const raw = readFileSync(CONFIG_PATH, 'utf-8');
  const parsed: unknown = JSON.parse(raw);
  return configSchema.parse(parsed);
}
