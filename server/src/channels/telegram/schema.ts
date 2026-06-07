import { z } from 'zod';

export const telegramConfigSchema = z.object({
  botToken: z.string().min(1),
  allowedUserId: z.number().int().positive(),
  cwd: z.string().min(1),
});

export type TelegramConfig = z.infer<typeof telegramConfigSchema>;
