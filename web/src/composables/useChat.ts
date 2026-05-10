import { ref, type Ref } from 'vue';
import type {
  DisplayMessage,
  ToolUseBlock,
  ServerMessage,
} from '../types/messages.js';
import type { UseWebSocketReturn } from './useWebSocket.js';

export interface UseChatReturn {
  messages: Ref<DisplayMessage[]>;
  isStreaming: Ref<boolean>;
  sendMessage: (sessionId: string, content: string) => void;
  createSession: (sessionName: string, content?: string) => void;
  abort: (sessionId: string) => void;
  clearMessages: () => void;
}

let nextId = 0;
function genId(): string {
  return `msg-${++nextId}`;
}

export function useChat(ws: UseWebSocketReturn): UseChatReturn {
  const messages = ref<DisplayMessage[]>([]);
  const isStreaming = ref(false);
  let currentAssistant: DisplayMessage | null = null;
  let streamingText = '';
  let toolInputJson = '';

  ws.onMessage((msg: ServerMessage) => {
    switch (msg.type) {
      case 'session_start':
        // Session created, nothing to render yet
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

  function handleSDKEvent(event: { type: string; [key: string]: unknown }) {
    switch (event.type) {
      case 'assistant':
        handleAssistantMessage(event);
        break;
      case 'stream_event':
        handleStreamEvent(event);
        break;
      case 'tool_progress':
        handleToolProgress(event);
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
        currentAssistant!.blocks.push(toolBlock);
      } else if (block.type === 'tool_result') {
        const content = (block as Record<string, unknown>).content;
        const toolUseId = (block as Record<string, unknown>).tool_use_id as string;
        const isError = (block as Record<string, unknown>).is_error as boolean;
        const output = typeof content === 'string'
          ? content
          : Array.isArray(content)
            ? (content as Array<{ text?: string }>).map(c => c.text || '').join('')
            : '';
        // Find the matching tool_use block and update it
        if (currentAssistant) {
          const toolBlock = currentAssistant.blocks.find(
            (b): b is ToolUseBlock => b.type === 'tool_use' && b.toolUseId === toolUseId
          );
          if (toolBlock) {
            toolBlock.status = isError ? 'error' : 'success';
            toolBlock.output = output;
          }
        }
      }
    }
    triggerReactivity();
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
          toolInputJson = '';
          const toolBlock: ToolUseBlock = {
            type: 'tool_use',
            toolUseId: (block as Record<string, unknown>).id as string || '',
            name: block.name || '',
            input: {},
            status: 'running',
          };
          currentAssistant!.blocks.push(toolBlock);
          triggerReactivity();
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
      case 'content_block_stop':
        if (toolInputJson && currentAssistant) {
          const lastTool = [...currentAssistant.blocks].reverse().find(
            (b): b is ToolUseBlock => b.type === 'tool_use'
          );
          if (lastTool) {
            try {
              lastTool.input = JSON.parse(toolInputJson);
            } catch {
              // malformed JSON, keep empty input
            }
            triggerReactivity();
          }
          toolInputJson = '';
        }
        streamingText = '';
        break;
      case 'message_stop':
        break;
    }
  }

  function handleToolProgress(_event: Record<string, unknown>) {
    // tool_progress just confirms a tool is still running — no action needed
    // since we already set status to 'running' on tool_use start
  }

  function handleError(errorMessage: string) {
    ensureAssistantMessage();
    pushTextBlock(`Error: ${errorMessage}`);
    finalizeStreaming();
  }

  function ensureAssistantMessage() {
    if (!currentAssistant) {
      currentAssistant = {
        id: genId(),
        role: 'assistant',
        blocks: [],
        timestamp: Date.now(),
      };
      messages.value.push(currentAssistant);
    }
  }

  function pushTextBlock(text: string) {
    if (!currentAssistant) return;
    const lastBlock = currentAssistant.blocks[currentAssistant.blocks.length - 1];
    if (lastBlock && lastBlock.type === 'text') {
      lastBlock.text = text;
    } else {
      currentAssistant.blocks.push({ type: 'text', text });
    }
    triggerReactivity();
  }

  function updateOrPushStreamingText() {
    if (!currentAssistant) return;
    const lastBlock = currentAssistant.blocks[currentAssistant.blocks.length - 1];
    if (lastBlock && lastBlock.type === 'text') {
      lastBlock.text = streamingText;
    } else {
      currentAssistant.blocks.push({ type: 'text', text: streamingText });
    }
    triggerReactivity();
  }

  function finalizeStreaming() {
    isStreaming.value = false;
    // Mark any still-running tool blocks as success (server didn't report error)
    if (currentAssistant) {
      for (const block of currentAssistant.blocks) {
        if (block.type === 'tool_use' && block.status === 'running') {
          block.status = 'success';
        }
      }
    }
    currentAssistant = null;
    streamingText = '';
    triggerReactivity();
  }

  function triggerReactivity() {
    messages.value = [...messages.value];
  }

  function sendMessage(sessionId: string, content: string) {
    const userMsg: DisplayMessage = {
      id: genId(),
      role: 'user',
      blocks: [{ type: 'text', text: content }],
      timestamp: Date.now(),
    };
    messages.value.push(userMsg);
    isStreaming.value = true;
    ws.send({ type: 'message', sessionId, content });
  }

  function createSession(sessionName: string, content?: string) {
    if (content) {
      const userMsg: DisplayMessage = {
        id: genId(),
        role: 'user',
        blocks: [{ type: 'text', text: content }],
        timestamp: Date.now(),
      };
      messages.value.push(userMsg);
      isStreaming.value = true;
    }
    ws.send({ type: 'new_session', sessionName, content });
  }

  function abort(sessionId: string) {
    ws.send({ type: 'abort', sessionId });
  }

  function clearMessages() {
    messages.value = [];
    currentAssistant = null;
    streamingText = '';
    toolInputJson = '';
    isStreaming.value = false;
  }

  return { messages, isStreaming, sendMessage, createSession, abort, clearMessages };
}
