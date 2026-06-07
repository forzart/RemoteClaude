import { query, type SDKMessage, type Query } from '@anthropic-ai/claude-agent-sdk';
import { resolve } from 'path';
import { mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { ConfigCache, updateCacheFromQuery } from './config-cache.js';

export interface NewSessionParams {
  prompt: string;
  sessionId: string;
  cwd: string;
  abortController: AbortController;
}

export interface ResumeSessionParams {
  prompt: string;
  sessionId: string;
  cwd: string;
  abortController: AbortController;
}

export interface QueryHandle {
  sessionId: string;
  generator: Query;
}

function buildCommonOptions(abortController: AbortController): Record<string, unknown> {
  return {
    tools: { type: 'preset', preset: 'claude_code' },
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    abortController,
    includePartialMessages: true,
  };
}

export function startNewSession(params: NewSessionParams): QueryHandle {
  mkdirSync(params.cwd, { recursive: true });
  const generator = query({
    prompt: params.prompt,
    options: {
      cwd: params.cwd,
      sessionId: params.sessionId,
      ...buildCommonOptions(params.abortController),
    },
  });
  return { sessionId: params.sessionId, generator };
}

export function resumeSession(params: ResumeSessionParams): QueryHandle {
  const generator = query({
    prompt: params.prompt,
    options: {
      cwd: params.cwd,
      resume: params.sessionId,
      ...buildCommonOptions(params.abortController),
    },
  });
  return { sessionId: params.sessionId, generator };
}

export async function probeConfig(configCache: ConfigCache): Promise<void> {
  const probeCwd = resolve(tmpdir(), 'remoteclaude-config-probe');
  mkdirSync(probeCwd, { recursive: true });
  const controller = new AbortController();
  const generator = query({
    prompt: 'hi',
    options: {
      cwd: probeCwd,
      ...buildCommonOptions(controller),
    },
  });
  try {
    await updateCacheFromQuery(generator, configCache);
  } finally {
    controller.abort();
    setTimeout(() => {
      try { rmSync(probeCwd, { recursive: true, force: true }); } catch {}
    }, 3000);
  }
}
