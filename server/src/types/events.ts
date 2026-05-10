import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';

// --- Client → Server messages ---

export type ClientMessage =
  | NewSessionMessage
  | ChatMessage
  | AbortMessage;

export interface NewSessionMessage {
  type: 'new_session';
  cwd: string;
}

export interface ChatMessage {
  type: 'message';
  sessionId: string;
  content: string;
}

export interface AbortMessage {
  type: 'abort';
  sessionId: string;
}

// --- Server → Client messages ---

export type ServerMessage =
  | SessionStartMessage
  | SDKEventMessage
  | DoneMessage
  | ErrorMessage;

export interface SessionStartMessage {
  type: 'session_start';
  sessionId: string;
}

export interface SDKEventMessage {
  type: 'sdk_event';
  sessionId: string;
  event: SDKMessage;
}

export interface DoneMessage {
  type: 'done';
  sessionId: string;
}

export interface ErrorMessage {
  type: 'error';
  sessionId?: string;
  message: string;
}

export function parseClientMessage(raw: string): ClientMessage {
  const data = JSON.parse(raw);
  if (!data || typeof data !== 'object' || !('type' in data)) {
    throw new Error('Invalid message: missing type field');
  }
  switch (data.type) {
    case 'new_session':
      if (typeof data.cwd !== 'string' || data.cwd.length === 0) {
        throw new Error('new_session: cwd must be a non-empty string');
      }
      return data as NewSessionMessage;
    case 'message':
      if (typeof data.sessionId !== 'string' || typeof data.content !== 'string') {
        throw new Error('message: sessionId and content are required strings');
      }
      return data as ChatMessage;
    case 'abort':
      if (typeof data.sessionId !== 'string') {
        throw new Error('abort: sessionId is required');
      }
      return data as AbortMessage;
    default:
      throw new Error(`Unknown message type: ${data.type}`);
  }
}
