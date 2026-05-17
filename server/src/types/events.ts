import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';

// --- Client → Server messages ---

export type ClientMessage =
  | NewSessionMessage
  | ChatMessage
  | AbortMessage;

export interface NewSessionMessage {
  type: 'new_session';
  sessionName: string;
}

export interface ChatMessage {
  type: 'message';
  sessionName: string;
  content: string;
}

export interface AbortMessage {
  type: 'abort';
  sessionName: string;
}

// --- Server → Client messages ---

export type ServerMessage =
  | SessionStartMessage
  | SDKEventMessage
  | DoneMessage
  | ErrorMessage;

export interface SessionStartMessage {
  type: 'session_start';
  sessionName: string;
}

export interface SDKEventMessage {
  type: 'sdk_event';
  sessionName: string;
  event: SDKMessage;
}

export interface DoneMessage {
  type: 'done';
  sessionName: string;
}

export interface ErrorMessage {
  type: 'error';
  sessionName?: string;
  message: string;
}

export function parseClientMessage(raw: string): ClientMessage {
  const data = JSON.parse(raw);
  if (!data || typeof data !== 'object' || !('type' in data)) {
    throw new Error('Invalid message: missing type field');
  }
  switch (data.type) {
    case 'new_session':
      if (typeof data.sessionName !== 'string' || data.sessionName.length === 0) {
        throw new Error('new_session: sessionName must be a non-empty string');
      }
      return { type: 'new_session', sessionName: data.sessionName } as NewSessionMessage;
    case 'message':
      if (typeof data.sessionName !== 'string' || typeof data.content !== 'string') {
        throw new Error('message: sessionName and content are required strings');
      }
      return data as ChatMessage;
    case 'abort':
      if (typeof data.sessionName !== 'string') {
        throw new Error('abort: sessionName is required');
      }
      return data as AbortMessage;
    default:
      throw new Error(`Unknown message type: ${data.type}`);
  }
}
