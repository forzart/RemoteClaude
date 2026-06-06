import { Bot, type Context } from 'grammy';
import { randomUUID } from 'crypto';
import { rmSync } from 'fs';
import { listSessions } from '@anthropic-ai/claude-agent-sdk';
import type { FastifyBaseLogger } from 'fastify';
import type { SessionManager } from './session-manager.js';
import { resumeSession, sessionCwd, startNewSession } from './agent-query.js';
import { formatSdkEvent, splitForTelegram } from './sdk-event-formatter.js';
import type { TelegramConfig } from './config-file.js';

const SEND_INTERVAL_MS = 1100;

interface BotState {
  lastActivityAt: number;
}

export class TelegramBot {
  private readonly bot: Bot;
  private readonly config: TelegramConfig;
  private readonly sessionManager: SessionManager;
  private readonly logger: FastifyBaseLogger;
  private readonly state: BotState = { lastActivityAt: 0 };
  private outboundQueue: Promise<unknown> = Promise.resolve();
  private lastSentAt = 0;

  constructor(
    config: TelegramConfig,
    sessionManager: SessionManager,
    logger: FastifyBaseLogger,
  ) {
    this.config = config;
    this.sessionManager = sessionManager;
    this.logger = logger;
    this.bot = new Bot(config.botToken);
    this.registerHandlers();
  }

  async start(): Promise<void> {
    this.bot.catch((err) => {
      this.logger.error({ err: err.error }, 'Telegram bot error');
    });
    void this.bot.start({
      onStart: (me) => {
        this.logger.info(`Telegram bot started as @${me.username}, polling for updates`);
      },
    });
  }

  async stop(): Promise<void> {
    await this.bot.stop();
  }

  private registerHandlers(): void {
    this.bot.use(async (ctx, next) => {
      if (ctx.from?.id !== this.config.allowedUserId) {
        this.logger.warn(
          { userId: ctx.from?.id },
          'Rejected Telegram message from unauthorized user',
        );
        return;
      }
      await next();
    });

    this.bot.command('start', (ctx) => this.handleStart(ctx));
    this.bot.command('help', (ctx) => this.handleHelp(ctx));
    this.bot.command('status', (ctx) => this.handleStatus(ctx));
    this.bot.command('abort', (ctx) => this.handleAbort(ctx));
    this.bot.command('reset', (ctx) => this.handleReset(ctx));
    this.bot.on('message:text', (ctx) => this.handlePrompt(ctx));
  }

  private async handleStart(ctx: Context): Promise<void> {
    await this.reply(ctx, [
      '👋 RemoteClaude bot ready.',
      '',
      'Send any message to talk to Claude.',
      'Use /help to see available commands.',
    ].join('\n'));
  }

  private async handleHelp(ctx: Context): Promise<void> {
    await this.reply(ctx, [
      'Commands:',
      '/status — show current session status',
      '/abort — cancel the running query',
      '/reset — clear session history',
      '/help — show this message',
      '',
      'Any other text is sent to Claude as a prompt.',
    ].join('\n'));
  }

  private async handleStatus(ctx: Context): Promise<void> {
    const sessionName = this.config.sessionName;
    const isRunning = this.sessionManager.isActive(sessionName);
    const last = this.state.lastActivityAt
      ? new Date(this.state.lastActivityAt).toISOString()
      : 'never';
    await this.reply(ctx, [
      `Session: ${sessionName}`,
      `Running: ${isRunning ? 'yes' : 'no'}`,
      `Last activity: ${last}`,
    ].join('\n'));
  }

  private async handleAbort(ctx: Context): Promise<void> {
    const sessionName = this.config.sessionName;
    if (!this.sessionManager.isActive(sessionName)) {
      await this.reply(ctx, 'Nothing to abort.');
      return;
    }
    this.sessionManager.abort(sessionName);
    await this.reply(ctx, '🛑 Aborted.');
  }

  private async handleReset(ctx: Context): Promise<void> {
    const sessionName = this.config.sessionName;
    if (this.sessionManager.isActive(sessionName)) {
      await this.reply(ctx, 'Cannot reset while a query is running. Use /abort first.');
      return;
    }
    const dir = sessionCwd(sessionName);
    try {
      rmSync(dir, { recursive: true, force: true });
      await this.reply(ctx, '✅ Session reset.');
    } catch (err: unknown) {
      this.logger.error({ err }, 'Failed to reset Telegram session');
      await this.reply(ctx, `❌ Reset failed: ${getErrorMessage(err)}`);
    }
  }

  private async handlePrompt(ctx: Context): Promise<void> {
    const prompt = ctx.message?.text;
    if (!prompt || prompt.startsWith('/')) return;

    const sessionName = this.config.sessionName;
    if (this.sessionManager.isActive(sessionName)) {
      await this.reply(ctx, 'Claude is busy. /abort to cancel, or wait for completion.');
      return;
    }

    this.state.lastActivityAt = Date.now();

    let sessionId: string;
    let isResume = false;
    try {
      const cwd = sessionCwd(sessionName);
      const existing = await listSessions({ dir: cwd });
      if (existing.length > 0) {
        sessionId = existing.sort((a, b) => b.lastModified - a.lastModified)[0].sessionId;
        isResume = true;
      } else {
        sessionId = randomUUID();
      }
    } catch {
      sessionId = randomUUID();
    }

    const abortController = new AbortController();
    this.sessionManager.register(sessionName, sessionId, abortController);

    const handle = isResume
      ? resumeSession({ prompt, sessionId, sessionName, abortController })
      : startNewSession({ prompt, sessionId, sessionName, abortController });

    let producedText = false;
    try {
      for await (const event of handle.generator) {
        const chunks = formatSdkEvent(event);
        for (const chunk of chunks) {
          if (chunk.kind === 'text') producedText = true;
          await this.enqueueSend(ctx, chunk.text);
        }
      }
      if (!producedText) {
        await this.enqueueSend(ctx, '✓ Done.');
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        // already acknowledged in /abort
      } else {
        this.logger.error({ err }, 'Telegram query failed');
        await this.enqueueSend(ctx, `❌ Error: ${getErrorMessage(err)}`);
      }
    } finally {
      this.sessionManager.unregister(sessionName);
      this.state.lastActivityAt = Date.now();
    }
  }

  private async reply(ctx: Context, text: string): Promise<void> {
    await this.enqueueSend(ctx, text);
  }

  private enqueueSend(ctx: Context, text: string): Promise<void> {
    const send = async (): Promise<void> => {
      for (const part of splitForTelegram(text)) {
        const elapsed = Date.now() - this.lastSentAt;
        if (elapsed < SEND_INTERVAL_MS) {
          await sleep(SEND_INTERVAL_MS - elapsed);
        }
        try {
          await ctx.reply(part);
        } catch (err: unknown) {
          this.logger.error({ err }, 'Telegram sendMessage failed');
        }
        this.lastSentAt = Date.now();
      }
    };
    this.outboundQueue = this.outboundQueue.then(send, send);
    return this.outboundQueue as Promise<void>;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Unknown error';
}
