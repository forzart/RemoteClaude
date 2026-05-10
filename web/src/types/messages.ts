export interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  blocks: ContentBlock[];
  timestamp: number;
}

export type ContentBlock =
  | TextBlock
  | CodeBlock
  | ToolUseBlock
  | ToolResultBlock;

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface CodeBlock {
  type: 'code';
  language: string;
  code: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  toolUseId: string;
  name: string;
  input: Record<string, unknown>;
  status: 'running' | 'success' | 'error';
  output?: string;
}

export interface ToolResultBlock {
  type: 'tool_result';
  toolUseId: string;
  output: string;
  isError: boolean;
}

export interface SessionInfo {
  sessionName: string;
  createdAt: number;
}

// --- Server → Client messages (mirrors server/src/types/events.ts) ---

export interface SessionStartMessage {
  type: 'session_start';
  sessionId: string;
  sessionName: string;
}

export interface SDKEventMessage {
  type: 'sdk_event';
  sessionId: string;
  event: SDKEvent;
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

export type ServerMessage =
  | SessionStartMessage
  | SDKEventMessage
  | DoneMessage
  | ErrorMessage;

// Minimal SDKEvent types needed for rendering (subset of full SDKMessage)
export interface SDKEvent {
  type: string;
  [key: string]: unknown;
}
