import { Bot, type Context } from 'grammy';
import { randomUUID } from 'crypto';
import { existsSync, statSync } from 'fs';
import { resolve, isAbsolute } from 'path';
import { homedir } from 'os';
import type { FastifyBaseLogger } from 'fastify';
import type { SessionManager } from '../../services/session-manager.js';
import { resumeSession, startNewSession } from '../../services/agent-query.js';
import {
  getCurrentSessionId,
  setCurrentSessionId,
  clearCurrentSessionId,
} from '../../services/session-state.js';
import {
  resolveSession,
  getLatestSession,
  listAllSessions,
  describeSession,
} from '../../services/session-resolver.js';
import { formatSdkEvent, splitForTelegram } from '../formatter.js';
import type { TelegramConfig } from './schema.js';

const SEND_INTERVAL_MS = 1100;
const SESSION_KEY = '_telegram';
const CHANNEL = 'telegram';

interface BotState {
  cwd: string;
  lastActivityAt: number;
}

interface SessionAlias {
  tag?: string;
  customTitle?: string;
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
    this.bot.command('attach', (ctx) => this.handleAttach(ctx));
    this.bot.command('list', (ctx) => this.handleList(ctx));
    this.bot.command('new', (ctx) => this.handleNew(ctx));
    this.bot.command('whoami', (ctx) => this.handleWhoami(ctx));
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
      '/whoami — show current session ID and alias',
      '/list — list sessions in current cwd',
      '/attach [id|alias] — attach to a session (latest if omitted)',
      '/new — start a new session in current cwd',
      '/status — show running status',
      '/abort — cancel the running query',
      '/reset — forget current session (next message starts fresh)',
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
    const current = getCurrentSessionId(CHANNEL, this.state.cwd);
    await this.reply(ctx, [
      `Cwd: ${this.state.cwd}`,
      `Session: ${current ? current.slice(0, 8) : '(none)'}`,
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
    const ensured = await this.ensureSessionForCwd(target);
    const status = ensured.created
      ? `(new session ${ensured.sessionId.slice(0, 8)})`
      : `(session ${ensured.sessionId.slice(0, 8)})`;
    await this.reply(ctx, `Switched to ${target} ${status}`);
  }

  private async handleAttach(ctx: Context): Promise<void> {
    if (this.sessionManager.isActive(SESSION_KEY)) {
      await this.reply(ctx, 'Cannot attach while a query is running. Use /abort first.');
      return;
    }
    const arg = ctx.message?.text?.split(/\s+/, 2)[1]?.trim();
    const cwd = this.state.cwd;

    if (!arg) {
      const latest = await getLatestSession(cwd);
      if (!latest) {
        await this.reply(ctx, 'No sessions found in this cwd. Send a message or use /new to start.');
        return;
      }
      setCurrentSessionId(CHANNEL, cwd, latest.sessionId);
      await this.reply(ctx, `Attached to latest: ${describeSession(latest)}`);
      return;
    }

    const resolved = await resolveSession(arg, cwd);
    if (!resolved) {
      await this.reply(ctx, `❌ No session matches "${arg}" in ${cwd}`);
      return;
    }
    setCurrentSessionId(CHANNEL, cwd, resolved.sessionId);
    await this.reply(ctx, `Attached via ${resolved.matched}: ${describeSession(resolved.info)}`);
  }

  private async handleList(ctx: Context): Promise<void> {
    const cwd = this.state.cwd;
    const sessions = await listAllSessions(cwd);
    if (sessions.length === 0) {
      await this.reply(ctx, `No sessions in ${cwd}`);
      return;
    }
    const current = getCurrentSessionId(CHANNEL, cwd);
    const lines = [`Sessions in ${cwd}:`];
    for (const s of sessions.slice(0, 10)) {
      const marker = s.sessionId === current ? '▸' : ' ';
      lines.push(`${marker} ${describeSession(s)}`);
    }
    if (sessions.length > 10) {
      lines.push(`... and ${sessions.length - 10} more`);
    }
    await this.reply(ctx, lines.join('\n'));
  }

  private async handleNew(ctx: Context): Promise<void> {
    if (this.sessionManager.isActive(SESSION_KEY)) {
      await this.reply(ctx, 'Cannot create new session while a query is running. Use /abort first.');
      return;
    }
    const newId = randomUUID();
    setCurrentSessionId(CHANNEL, this.state.cwd, newId);
    await this.reply(ctx, `New session ${newId.slice(0, 8)} ready. Send a message to start.`);
  }

  private async handleWhoami(ctx: Context): Promise<void> {
    const cwd = this.state.cwd;
    const current = getCurrentSessionId(CHANNEL, cwd);
    if (!current) {
      await this.reply(ctx, `Cwd: ${cwd}\nSession: (none — next message will create one)`);
      return;
    }
    const alias = await this.lookupAlias(current, cwd);
    const aliasStr = alias.tag
      ? ` [${alias.tag}]`
      : alias.customTitle
        ? ` "${alias.customTitle}"`
        : '';
    await this.reply(ctx, [
      `Cwd: ${cwd}`,
      `Session: ${current}${aliasStr}`,
    ].join('\n'));
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
    clearCurrentSessionId(CHANNEL, this.state.cwd);
    this.sessionManager.unregister(SESSION_KEY);
    await this.reply(ctx, '✅ Session forgotten. Next message starts fresh.');
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

    const ensured = await this.ensureSessionForCwd(cwd);
    const sessionId = ensured.sessionId;
    const isResume = !ensured.created;

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

  private async ensureSessionForCwd(cwd: string): Promise<{ sessionId: string; created: boolean }> {
    const existing = getCurrentSessionId(CHANNEL, cwd);
    if (existing) {
      return { sessionId: existing, created: false };
    }
    const newId = randomUUID();
    setCurrentSessionId(CHANNEL, cwd, newId);
    return { sessionId: newId, created: true };
  }

  private async lookupAlias(sessionId: string, cwd: string): Promise<SessionAlias> {
    try {
      const sessions = await listAllSessions(cwd);
      const info = sessions.find((s) => s.sessionId === sessionId);
      if (!info) return {};
      return { tag: info.tag, customTitle: info.customTitle };
    } catch {
      return {};
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
