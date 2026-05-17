import { ref, type Ref } from 'vue';
import type {
  DisplayMessage,
  ContentBlock,
  ToolUseBlock,
  ServerMessage,
} from '../types/messages.js';
import type { UseWebSocketReturn } from './useWebSocket.js';
import type { HistoryMessage } from './useSessions.js';

export interface UseChatReturn {
  messages: Ref<DisplayMessage[]>;
  isStreaming: Ref<boolean>;
  sendMessage: (sessionName: string, content: string) => void;
  createSession: (sessionName: string) => void;
  loadFromHistory: (historyMessages: HistoryMessage[]) => void;
  abort: (sessionName: string) => void;
  clearMessages: () => void;
}

let nextId = 0;
function genId(): string {
  return `msg-${++nextId}`;
}

export function useChat(ws: UseWebSocketReturn): UseChatReturn {
  const messages = ref<DisplayMessage[]>([]);
  const isStreaming = ref(false);
  let currentAssistantId: string | null = null;
  let streamingText = '';
  let toolInputJson = '';

  ws.onMessage((msg: ServerMessage) => {
    switch (msg.type) {
      case 'session_start':
        break;
      case 'sdk_event':
        handleSDKEvent(msg.event);
        break;
      case 'done':
        finalizeStreaming();
        break;
      case 'error':
        handleError(msg.message);
        break;
    }
  });

  function getCurrentAssistant(): DisplayMessage | undefined {
    if (!currentAssistantId) return undefined;
    return messages.value.find(m => m.id === currentAssistantId);
  }

  function handleSDKEvent(event: { type: string; [key: string]: unknown }) {
    switch (event.type) {
      case 'assistant':
        handleAssistantMessage(event);
        break;
      case 'stream_event':
        handleStreamEvent(event);
        break;
      case 'tool_progress':
        break;
      case 'result':
        finalizeStreaming();
        break;
    }
  }

  function handleAssistantMessage(event: Record<string, unknown>) {
    const message = event.message as {
      content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
    } | undefined;
    if (!message?.content) return;

    ensureAssistantMessage();
    const assistant = getCurrentAssistant();
    if (!assistant) return;

    for (const block of message.content) {
      if (block.type === 'text' && block.text) {
        pushTextBlock(block.text);
      } else if (block.type === 'tool_use' && block.name) {
        const toolBlock: ToolUseBlock = {
          type: 'tool_use',
          toolUseId: block.id || '',
          name: block.name,
          input: block.input || {},
          status: 'running',
        };
        assistant.blocks.push(toolBlock);
      } else if (block.type === 'tool_result') {
        const content = (block as Record<string, unknown>).content;
        const toolUseId = (block as Record<string, unknown>).tool_use_id as string;
        const isError = (block as Record<string, unknown>).is_error as boolean;
        const output = typeof content === 'string'
          ? content
          : Array.isArray(content)
            ? (content as Array<{ text?: string }>).map(c => c.text || '').join('')
            : '';
        const toolBlock = assistant.blocks.find(
          (b): b is ToolUseBlock => b.type === 'tool_use' && b.toolUseId === toolUseId
        );
        if (toolBlock) {
          toolBlock.status = isError ? 'error' : 'success';
          toolBlock.output = output;
        }
      }
    }
    replaceMessages();
  }

  function handleStreamEvent(event: Record<string, unknown>) {
    const streamEvent = event.event as { type: string; delta?: { type: string; text?: string }; content_block?: { type: string; id?: string; name?: string } } | undefined;
    if (!streamEvent) return;

    isStreaming.value = true;

    switch (streamEvent.type) {
      case 'content_block_start': {
        const block = streamEvent.content_block;
        if (block?.type === 'tool_use') {
          ensureAssistantMessage();
          const assistant = getCurrentAssistant();
          if (!assistant) break;
          toolInputJson = '';
          const toolBlock: ToolUseBlock = {
            type: 'tool_use',
            toolUseId: (block as Record<string, unknown>).id as string || '',
            name: block.name || '',
            input: {},
            status: 'running',
          };
          assistant.blocks.push(toolBlock);
          replaceMessages();
        } else if (block?.type === 'text') {
          ensureAssistantMessage();
          streamingText = '';
        }
        break;
      }
      case 'content_block_delta': {
        const delta = streamEvent.delta;
        if (delta?.type === 'text_delta' && delta.text) {
          ensureAssistantMessage();
          streamingText += delta.text;
          updateOrPushStreamingText();
        } else if (delta?.type === 'input_json_delta') {
          const partial = (delta as Record<string, unknown>).partial_json as string;
          if (partial) {
            toolInputJson += partial;
          }
        }
        break;
      }
      case 'content_block_stop': {
        const assistant = getCurrentAssistant();
        if (toolInputJson && assistant) {
          const lastTool = [...assistant.blocks].reverse().find(
            (b): b is ToolUseBlock => b.type === 'tool_use'
          );
          if (lastTool) {
            try {
              lastTool.input = JSON.parse(toolInputJson);
            } catch {
              // malformed JSON
            }
            replaceMessages();
          }
          toolInputJson = '';
        }
        streamingText = '';
        break;
      }
      case 'message_stop':
        break;
    }
  }

  function handleError(errorMessage: string) {
    ensureAssistantMessage();
    pushTextBlock(`Error: ${errorMessage}`);
    finalizeStreaming();
  }

  function ensureAssistantMessage() {
    if (!currentAssistantId) {
      const id = genId();
      currentAssistantId = id;
      messages.value = [...messages.value, {
        id,
        role: 'assistant',
        blocks: [],
        timestamp: Date.now(),
      }];
    }
  }

  function pushTextBlock(text: string) {
    const assistant = getCurrentAssistant();
    if (!assistant) return;
    const lastBlock = assistant.blocks[assistant.blocks.length - 1];
    if (lastBlock && lastBlock.type === 'text') {
      lastBlock.text = text;
    } else {
      assistant.blocks.push({ type: 'text', text });
    }
    replaceMessages();
  }

  function updateOrPushStreamingText() {
    const assistant = getCurrentAssistant();
    if (!assistant) return;
    const lastBlock = assistant.blocks[assistant.blocks.length - 1];
    if (lastBlock && lastBlock.type === 'text') {
      lastBlock.text = streamingText;
    } else {
      assistant.blocks.push({ type: 'text', text: streamingText });
    }
    replaceMessages();
  }

  function replaceMessages() {
    messages.value = messages.value.map(msg =>
      msg.id === currentAssistantId
        ? { ...msg, blocks: [...msg.blocks] }
        : msg
    );
  }

  function finalizeStreaming() {
    isStreaming.value = false;
    const assistant = getCurrentAssistant();
    if (assistant) {
      for (const block of assistant.blocks) {
        if (block.type === 'tool_use' && block.status === 'running') {
          block.status = 'success';
        }
      }
      replaceMessages();
    }
    currentAssistantId = null;
    streamingText = '';
  }

  function sendMessage(sessionName: string, content: string) {
    const userMsg: DisplayMessage = {
      id: genId(),
      role: 'user',
      blocks: [{ type: 'text', text: content }],
      timestamp: Date.now(),
    };
    messages.value = [...messages.value, userMsg];
    isStreaming.value = true;
    ws.send({ type: 'message', sessionName, content });
  }

  function createSession(sessionName: string) {
    ws.send({ type: 'new_session', sessionName });
  }

  function loadFromHistory(historyMessages: HistoryMessage[]) {
    const displayMsgs: DisplayMessage[] = [];
    for (const hm of historyMessages) {
      const content = hm.message?.content;
      if (!Array.isArray(content)) continue;
      const blocks: ContentBlock[] = [];
      for (const block of content) {
        if (block.type === 'text' && block.text) {
          blocks.push({ type: 'text', text: block.text });
        } else if (block.type === 'tool_use' && block.name) {
          blocks.push({
            type: 'tool_use',
            toolUseId: block.id || '',
            name: block.name,
            input: block.input || {},
            status: 'success',
          });
        }
      }
      if (blocks.length > 0) {
        displayMsgs.push({
          id: genId(),
          role: hm.type as 'user' | 'assistant',
          blocks,
          timestamp: Date.now(),
        });
      }
    }
    messages.value = displayMsgs;
    currentAssistantId = null;
    streamingText = '';
    toolInputJson = '';
    isStreaming.value = false;
  }

  function abort(sessionName: string) {
    ws.send({ type: 'abort', sessionName });
  }

  function clearMessages() {
    messages.value = [];
    currentAssistantId = null;
    streamingText = '';
    toolInputJson = '';
    isStreaming.value = false;
  }

  return { messages, isStreaming, sendMessage, createSession, loadFromHistory, abort, clearMessages };
}
