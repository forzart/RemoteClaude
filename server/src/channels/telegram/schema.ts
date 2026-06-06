import { z } from 'zod';

export const telegramConfigSchema = z.object({
  botToken: z.string().min(1),
  allowedUserId: z.number().int().positive(),
  sessionName: z.string().min(1).default('telegram'),
  cwd: z.string().optional(),
});

export type TelegramConfig = z.infer<typeof telegramConfigSchema>;
