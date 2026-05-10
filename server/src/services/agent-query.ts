import { query, type SDKMessage, type Query } from '@anthropic-ai/claude-agent-sdk';
import { randomUUID } from 'crypto';
import { resolve } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';

function findClaudeExecutable(): string | undefined {
  const candidates = [
    process.env.CLAUDE_CODE_PATH,
    resolve(process.env.LOCALAPPDATA || '', 'AnthropicClaude/app-0.13.11/claude.exe'),
    resolve(process.env.LOCALAPPDATA || '', 'AnthropicClaude/claude.exe'),
  ];
  for (const p of candidates) {
    if (p && existsSync(p)) return p;
  }
  return undefined;
}

const claudePath = findClaudeExecutable();

export const SESSIONS_ROOT = resolve(homedir(), '.remote-claude', 'sessions');

export function sessionCwd(sessionName: string): string {
  return resolve(SESSIONS_ROOT, sessionName);
}

export interface NewSessionParams {
  prompt: string;
  sessionName: string;
  abortController: AbortController;
}

export interface ResumeSessionParams {
  prompt: string;
  sessionId: string;
  abortController: AbortController;
}

export interface QueryHandle {
  sessionId: string;
  generator: Query;
}

export function startNewSession(params: NewSessionParams): QueryHandle {
  const sessionId = randomUUID();
  const cwd = sessionCwd(params.sessionName);
  mkdirSync(cwd, { recursive: true });
  const generator = query({
    prompt: params.prompt,
    options: {
      cwd,
      sessionId,
      tools: { type: 'preset', preset: 'claude_code' },
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      abortController: params.abortController,
      includePartialMessages: true,
      ...(claudePath && { pathToClaudeCodeExecutable: claudePath }),
    },
  });
  return { sessionId, generator };
}

export function resumeSession(params: ResumeSessionParams): QueryHandle {
  const generator = query({
    prompt: params.prompt,
    options: {
      resume: params.sessionId,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      abortController: params.abortController,
      includePartialMessages: true,
      ...(claudePath && { pathToClaudeCodeExecutable: claudePath }),
    },
  });
  return { sessionId: params.sessionId, generator };
}
