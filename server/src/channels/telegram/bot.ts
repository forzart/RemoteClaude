import { Bot, type Context } from 'grammy';
import { randomUUID } from 'crypto';
import { existsSync, statSync } from 'fs';
import { resolve, isAbsolute } from 'path';
import { homedir } from 'os';
import { listSessions } from '@anthropic-ai/claude-agent-sdk';
import type { FastifyBaseLogger } from 'fastify';
import type { SessionManager } from '../../services/session-manager.js';
import { resumeSession, startNewSession } from '../../services/agent-query.js';
import { formatSdkEvent, splitForTelegram } from '../formatter.js';
import type { TelegramConfig } from './schema.js';

const SEND_INTERVAL_MS = 1100;
const SESSION_KEY = '_telegram';

interface BotState {
  cwd: string;
  lastActivityAt: number;
}

export class TelegramBot {
  private readonly bot: Bot;
  private readonly config: TelegramConfig;
  private readonly sessionManager: SessionManager;
  private readonly logger: FastifyBaseLogger;
  private readonly state: BotState;
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
    this.state = {
      cwd: resolveCwd(config.cwd),
      lastActivityAt: 0,
    };
    this.bot = new Bot(config.botToken);
    this.registerHandlers();
  }

  async start(): Promise<void> {
    this.bot.catch((err) => {
      this.logger.error({ err: err.error }, 'Telegram bot error');
    });
    void this.bot.start({
      onStart: (me) => {
        this.logger.info(
          `Telegram bot started as @${me.username}, polling for updates (cwd=${this.state.cwd})`,
        );
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
    this.bot.command('pwd', (ctx) => this.handlePwd(ctx));
    this.bot.command('cd', (ctx) => this.handleCd(ctx));
    this.bot.command('abort', (ctx) => this.handleAbort(ctx));
    this.bot.command('reset', (ctx) => this.handleReset(ctx));
    this.bot.on('message:text', (ctx) => this.handlePrompt(ctx));
  }

  private async handleStart(ctx: Context): Promise<void> {
    await this.reply(ctx, [
      '👋 RemoteClaude bot ready.',
      '',
      `Working directory: ${this.state.cwd}`,
      '',
      'Send any message to talk to Claude.',
      'Use /help to see available commands.',
    ].join('\n'));
  }

  private async handleHelp(ctx: Context): Promise<void> {
    await this.reply(ctx, [
      'Commands:',
      '/pwd — show current working directory',
      '/cd <path> — switch working directory',
      '/status — show running status',
      '/abort — cancel the running query',
      '/reset — clear conversation history',
      '/help — show this message',
      '',
      'Any other text is sent to Claude as a prompt.',
    ].join('\n'));
  }

  private async handleStatus(ctx: Context): Promise<void> {
    const isRunning = this.sessionManager.isActive(SESSION_KEY);
    const last = this.state.lastActivityAt
      ? new Date(this.state.lastActivityAt).toISOString()
      : 'never';
    await this.reply(ctx, [
      `Cwd: ${this.state.cwd}`,
      `Running: ${isRunning ? 'yes' : 'no'}`,
      `Last activity: ${last}`,
    ].join('\n'));
  }

  private async handlePwd(ctx: Context): Promise<void> {
    await this.reply(ctx, this.state.cwd);
  }

  private async handleCd(ctx: Context): Promise<void> {
    const arg = ctx.message?.text?.split(/\s+/, 2)[1]?.trim();
    if (!arg) {
      await this.reply(ctx, 'Usage: /cd <path>');
      return;
    }
    if (this.sessionManager.isActive(SESSION_KEY)) {
      await this.reply(ctx, 'Cannot change cwd while a query is running. Use /abort first.');
      return;
    }
    let target: string;
    try {
      target = resolveCwd(arg);
    } catch (err: unknown) {
      await this.reply(ctx, `❌ ${getErrorMessage(err)}`);
      return;
    }
    this.state.cwd = target;
    await this.reply(ctx, `Switched to ${target}`);
  }

  private async handleAbort(ctx: Context): Promise<void> {
    if (!this.sessionManager.isActive(SESSION_KEY)) {
      await this.reply(ctx, 'Nothing to abort.');
      return;
    }
    this.sessionManager.abort(SESSION_KEY);
    await this.reply(ctx, '🛑 Aborted.');
  }

  private async handleReset(ctx: Context): Promise<void> {
    if (this.sessionManager.isActive(SESSION_KEY)) {
      await this.reply(ctx, 'Cannot reset while a query is running. Use /abort first.');
      return;
    }
    this.sessionManager.unregister(SESSION_KEY);
    await this.reply(ctx, '✅ Session reset. Next message starts fresh.');
  }

  private async handlePrompt(ctx: Context): Promise<void> {
    const prompt = ctx.message?.text;
    if (!prompt || prompt.startsWith('/')) return;

    if (this.sessionManager.isActive(SESSION_KEY)) {
      await this.reply(ctx, 'Claude is busy. /abort to cancel, or wait for completion.');
      return;
    }

    this.state.lastActivityAt = Date.now();
    const cwd = this.state.cwd;

    let sessionId: string;
    let isResume = false;
    try {
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
    this.sessionManager.register(SESSION_KEY, sessionId, abortController);

    const handle = isResume
      ? resumeSession({ prompt, sessionId, cwd, abortController })
      : startNewSession({ prompt, sessionId, cwd, abortController });

    const stopTyping = this.startTyping(ctx);
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
      stopTyping();
      this.sessionManager.unregister(SESSION_KEY);
      this.state.lastActivityAt = Date.now();
    }
  }

  private startTyping(ctx: Context): () => void {
    const send = (): void => {
      void ctx.replyWithChatAction('typing').catch((err: unknown) => {
        this.logger.debug({ err }, 'sendChatAction failed');
      });
    };
    send();
    const handle = setInterval(send, 4000);
    return () => clearInterval(handle);
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

function resolveCwd(input: string): string {
  let path = input;
  if (path === '~' || path.startsWith('~/') || path.startsWith('~\\')) {
    path = resolve(homedir(), path.slice(2) || '.');
  } else if (!isAbsolute(path)) {
    throw new Error(`Path must be absolute or start with ~/: ${input}`);
  }
  const normalized = resolve(path);
  if (!existsSync(normalized)) {
    throw new Error(`Directory does not exist: ${normalized}`);
  }
  if (!statSync(normalized).isDirectory()) {
    throw new Error(`Not a directory: ${normalized}`);
  }
  return normalized;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Unknown error';
}
