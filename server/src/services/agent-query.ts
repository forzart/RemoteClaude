import { query, type SDKMessage, type Query } from '@anthropic-ai/claude-agent-sdk';
import { randomUUID } from 'crypto';

export interface NewSessionParams {
  prompt: string;
  cwd: string;
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
  const generator = query({
    prompt: params.prompt,
    options: {
      cwd: params.cwd,
      sessionId,
      tools: { type: 'preset', preset: 'claude_code' },
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      abortController: params.abortController,
      includePartialMessages: true,
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
    },
  });
  return { sessionId: params.sessionId, generator };
}
