# RemoteClaude Web Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Vue 3 web client with terminal-style dark UI that connects to the RemoteClaude backend via WebSocket, rendering streaming conversations with tool call cards and syntax-highlighted code blocks.

**Architecture:** Vue 3 + Vite SPA in `web/` directory. Composables handle WebSocket connection, chat message parsing, and session management. Components render the terminal-style UI. Build output served by the existing Fastify server via `@fastify/static`. Server also gets `@fastify/cors` for development.

**Tech Stack:** Vue 3 (Composition API), Vite, TypeScript, Shiki (code highlighting), markdown-it (Markdown rendering), @fastify/static, @fastify/cors

---

## File Structure

```
web/
├── package.json                    # Dependencies and scripts
├── vite.config.ts                  # Vite config with dev proxy to backend
├── tsconfig.json                   # TypeScript config for Vue
├── index.html                      # Vite entry HTML
├── src/
│   ├── main.ts                     # Vue app creation + mount
│   ├── App.vue                     # Root layout: sidebar + chat area
│   ├── types/
│   │   └── messages.ts             # Display message types, server event types
│   ├── composables/
│   │   ├── useWebSocket.ts         # WebSocket connection + reconnect
│   │   ├── useChat.ts              # SDKMessage parsing + message state
│   │   └── useSessions.ts          # Session CRUD (REST + WS)
│   ├── components/
│   │   ├── SessionSidebar.vue      # Session list sidebar
│   │   ├── ChatView.vue            # Message list + auto-scroll
│   │   ├── MessageBubble.vue       # User/assistant message rendering
│   │   ├── ToolCallCard.vue        # Collapsible tool call display
│   │   ├── CodeBlock.vue           # Shiki code block + copy button
│   │   ├── InputBar.vue            # Message input + send/abort
│   │   └── SettingsModal.vue       # Server URL + cwd settings
│   └── styles/
│       └── global.css              # Global terminal theme (GitHub Dark)
└── public/
    └── favicon.ico

server/
├── src/
│   └── index.ts                    # Modified: add @fastify/static + @fastify/cors
└── package.json                    # Modified: add new dependencies
```

---

### Task 1: Web Project Scaffolding

**Files:**
- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/vite.config.ts`
- Create: `web/index.html`
- Create: `web/src/main.ts`
- Create: `web/src/App.vue`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "remoteclaude-web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc --noEmit && vite build",
    "preview": "vite preview"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "jsx": "preserve",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.vue"]
}
```

- [ ] **Step 3: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
      '/api': {
        target: 'http://localhost:3000',
      },
      '/health': {
        target: 'http://localhost:3000',
      },
    },
  },
});
```

- [ ] **Step 4: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>RemoteClaude</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 5: Create src/main.ts**

```typescript
import { createApp } from 'vue';
import App from './App.vue';
import './styles/global.css';

createApp(App).mount('#app');
```

- [ ] **Step 6: Create a placeholder App.vue**

```vue
<template>
  <div class="app">
    <h1>RemoteClaude</h1>
    <p>Web client loading...</p>
  </div>
</template>

<script setup lang="ts">
</script>
```

- [ ] **Step 7: Create src/styles/global.css**

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

:root {
  --bg-primary: #0d1117;
  --bg-surface: #161b22;
  --bg-hover: #1c2128;
  --border: #30363d;
  --border-light: #21262d;
  --text-primary: #e6edf3;
  --text-secondary: #8b949e;
  --text-muted: #484f58;
  --color-user: #79c0ff;
  --color-prompt: #3fb950;
  --color-tool: #d2a8ff;
  --color-success: #3fb950;
  --color-error: #f85149;
  --color-link: #58a6ff;
  --color-accent: #1f6feb;
  --font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
}

html, body {
  height: 100%;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.6;
}

#app {
  height: 100%;
}

button {
  font-family: var(--font-mono);
  cursor: pointer;
}

input, textarea {
  font-family: var(--font-mono);
}
```

- [ ] **Step 8: Install dependencies**

```bash
cd web
npm install vue
npm install -D vite @vitejs/plugin-vue vue-tsc typescript
```

- [ ] **Step 9: Create directory structure**

```bash
mkdir -p web/src/types web/src/composables web/src/components web/src/styles web/public
```

- [ ] **Step 10: Verify dev server starts**

```bash
cd web && npx vite --host 127.0.0.1 &
sleep 3
curl -s http://127.0.0.1:5173/ | head -5
kill %1
```

Expected: HTML response containing `<div id="app">`

- [ ] **Step 11: Commit**

```bash
git add web/
git commit -m "chore: scaffold Vue 3 + Vite web client project"
```

---

### Task 2: Display Message Types

**Files:**
- Create: `web/src/types/messages.ts`

- [ ] **Step 1: Write the type definitions**

```typescript
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
  sessionId: string;
  summary: string;
  lastModified: number;
}

// --- Server → Client messages (mirrors server/src/types/events.ts) ---

export interface SessionStartMessage {
  type: 'session_start';
  sessionId: string;
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
```

- [ ] **Step 2: Verify it compiles**

Run: `cd web && npx vue-tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add web/src/types/messages.ts
git commit -m "feat: add display message and server event type definitions"
```

---

### Task 3: useWebSocket Composable

**Files:**
- Create: `web/src/composables/useWebSocket.ts`

- [ ] **Step 1: Write the implementation**

```typescript
import { ref, type Ref } from 'vue';
import type { ServerMessage } from '../types/messages.js';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface UseWebSocketReturn {
  status: Ref<ConnectionStatus>;
  send: (msg: object) => void;
  onMessage: (handler: (msg: ServerMessage) => void) => void;
  connect: () => void;
  disconnect: () => void;
}

export function useWebSocket(url: Ref<string> | string): UseWebSocketReturn {
  const status = ref<ConnectionStatus>('disconnected');
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = 1000;
  const maxReconnectDelay = 30000;
  const handlers: Array<(msg: ServerMessage) => void> = [];

  function onMessage(handler: (msg: ServerMessage) => void) {
    handlers.push(handler);
  }

  function send(msg: object) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  function connect() {
    if (ws) {
      ws.close();
    }

    const wsUrl = typeof url === 'string' ? url : url.value;
    status.value = 'connecting';
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      status.value = 'connected';
      reconnectDelay = 1000;
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ServerMessage;
        for (const handler of handlers) {
          handler(msg);
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      status.value = 'disconnected';
      ws = null;
      scheduleReconnect();
    };

    ws.onerror = () => {
      status.value = 'error';
    };
  }

  function disconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      ws.close();
      ws = null;
    }
    status.value = 'disconnected';
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
      reconnectDelay = Math.min(reconnectDelay * 2, maxReconnectDelay);
    }, reconnectDelay);
  }

  return { status, send, onMessage, connect, disconnect };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd web && npx vue-tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add web/src/composables/useWebSocket.ts
git commit -m "feat: add useWebSocket composable with auto-reconnect"
```

---

### Task 4: useChat Composable

**Files:**
- Create: `web/src/composables/useChat.ts`

This is the most complex composable — it parses incoming SDKMessage events into display messages, handling streaming text assembly and tool call state tracking.

- [ ] **Step 1: Write the implementation**

```typescript
import { ref, type Ref } from 'vue';
import type {
  DisplayMessage,
  ContentBlock,
  TextBlock,
  ToolUseBlock,
  ServerMessage,
} from '../types/messages.js';
import type { UseWebSocketReturn } from './useWebSocket.js';

export interface UseChatReturn {
  messages: Ref<DisplayMessage[]>;
  isStreaming: Ref<boolean>;
  sendMessage: (sessionId: string, content: string) => void;
  createSession: (cwd: string, content?: string) => void;
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
          // Tool input streaming — accumulate JSON
          const text = (delta as Record<string, unknown>).partial_json as string;
          if (text && currentAssistant) {
            const lastTool = [...currentAssistant.blocks].reverse().find(
              (b): b is ToolUseBlock => b.type === 'tool_use'
            );
            if (lastTool) {
              // We'll parse the complete input from the assistant message later
            }
          }
        }
        break;
      }
      case 'content_block_stop':
        streamingText = '';
        break;
      case 'message_stop':
        break;
    }
  }

  function handleToolProgress(event: Record<string, unknown>) {
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

  function createSession(cwd: string, content?: string) {
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
    ws.send({ type: 'new_session', cwd, content });
  }

  function abort(sessionId: string) {
    ws.send({ type: 'abort', sessionId });
  }

  function clearMessages() {
    messages.value = [];
    currentAssistant = null;
    streamingText = '';
    isStreaming.value = false;
  }

  return { messages, isStreaming, sendMessage, createSession, abort, clearMessages };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd web && npx vue-tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add web/src/composables/useChat.ts
git commit -m "feat: add useChat composable with SDKMessage parsing and streaming"
```

---

### Task 5: useSessions Composable

**Files:**
- Create: `web/src/composables/useSessions.ts`

- [ ] **Step 1: Write the implementation**

```typescript
import { ref, type Ref } from 'vue';
import type { SessionInfo, ServerMessage } from '../types/messages.js';
import type { UseWebSocketReturn } from './useWebSocket.js';

export interface UseSessionsReturn {
  sessions: Ref<SessionInfo[]>;
  currentSessionId: Ref<string | null>;
  loadSessions: () => Promise<void>;
  switchSession: (id: string) => void;
  deleteSession: (id: string) => Promise<void>;
  onSessionCreated: (handler: (sessionId: string) => void) => void;
}

export function useSessions(ws: UseWebSocketReturn): UseSessionsReturn {
  const sessions = ref<SessionInfo[]>([]);
  const currentSessionId = ref<string | null>(null);
  const sessionCreatedHandlers: Array<(sessionId: string) => void> = [];

  ws.onMessage((msg: ServerMessage) => {
    if (msg.type === 'session_start') {
      currentSessionId.value = msg.sessionId;
      for (const handler of sessionCreatedHandlers) {
        handler(msg.sessionId);
      }
      // Refresh session list after creation
      void loadSessions();
    }
  });

  async function loadSessions(): Promise<void> {
    try {
      const response = await fetch('/api/sessions');
      if (response.ok) {
        const data = await response.json();
        sessions.value = (data as Array<{ sessionId: string; summary: string; lastModified: number }>).map(s => ({
          sessionId: s.sessionId,
          summary: s.summary || 'Untitled',
          lastModified: s.lastModified,
        }));
      }
    } catch {
      // silently fail — sidebar will show empty list
    }
  }

  function switchSession(id: string) {
    currentSessionId.value = id;
  }

  async function deleteSession(id: string): Promise<void> {
    try {
      await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
      sessions.value = sessions.value.filter(s => s.sessionId !== id);
      if (currentSessionId.value === id) {
        currentSessionId.value = null;
      }
    } catch {
      // silently fail
    }
  }

  function onSessionCreated(handler: (sessionId: string) => void) {
    sessionCreatedHandlers.push(handler);
  }

  return { sessions, currentSessionId, loadSessions, switchSession, deleteSession, onSessionCreated };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd web && npx vue-tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add web/src/composables/useSessions.ts
git commit -m "feat: add useSessions composable for session CRUD"
```

---

### Task 6: CodeBlock Component

**Files:**
- Create: `web/src/components/CodeBlock.vue`

- [ ] **Step 1: Install shiki**

```bash
cd web && npm install shiki
```

- [ ] **Step 2: Write the component**

```vue
<template>
  <div class="code-block">
    <div class="code-header">
      <span class="code-language">{{ language }}</span>
      <button class="code-copy" @click="copyCode">
        {{ copied ? '✓ Copied' : '📋 Copy' }}
      </button>
    </div>
    <div class="code-body" v-html="highlightedCode"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, watchEffect } from 'vue';
import { codeToHtml } from 'shiki';

const props = defineProps<{
  code: string;
  language: string;
}>();

const highlightedCode = ref('');
const copied = ref(false);

watchEffect(async () => {
  try {
    highlightedCode.value = await codeToHtml(props.code, {
      lang: props.language || 'text',
      theme: 'github-dark',
    });
  } catch {
    // Fallback: render as plain text if language not supported
    highlightedCode.value = `<pre><code>${escapeHtml(props.code)}</code></pre>`;
  }
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function copyCode() {
  try {
    await navigator.clipboard.writeText(props.code);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  } catch {
    // clipboard API not available
  }
}
</script>

<style scoped>
.code-block {
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  margin: 8px 0;
}

.code-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-light);
}

.code-language {
  font-size: 11px;
  color: var(--text-secondary);
}

.code-copy {
  font-size: 11px;
  color: var(--color-link);
  background: none;
  border: none;
  padding: 2px 6px;
}

.code-copy:hover {
  text-decoration: underline;
}

.code-body {
  padding: 0;
  overflow-x: auto;
}

.code-body :deep(pre) {
  margin: 0;
  padding: 12px;
  background: var(--bg-primary) !important;
  font-size: 12px;
  line-height: 1.5;
}

.code-body :deep(code) {
  font-family: var(--font-mono);
}
</style>
```

- [ ] **Step 3: Verify it compiles**

Run: `cd web && npx vue-tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add web/src/components/CodeBlock.vue web/package.json web/package-lock.json
git commit -m "feat: add CodeBlock component with Shiki syntax highlighting"
```

---

### Task 7: ToolCallCard Component

**Files:**
- Create: `web/src/components/ToolCallCard.vue`

- [ ] **Step 1: Write the component**

```vue
<template>
  <div class="tool-card" :class="'tool-' + status">
    <div class="tool-header" @click="expanded = !expanded">
      <span class="tool-status">
        <span v-if="status === 'running'" class="spinner">⟳</span>
        <span v-else-if="status === 'success'">✓</span>
        <span v-else>✗</span>
      </span>
      <span class="tool-name">{{ name }}</span>
      <span class="tool-summary">{{ inputSummary }}</span>
      <span class="tool-expand">{{ expanded ? '▾' : '▸' }}</span>
    </div>
    <div v-if="expanded" class="tool-body">
      <div class="tool-section">
        <div class="tool-label">Input</div>
        <pre class="tool-content">{{ JSON.stringify(input, null, 2) }}</pre>
      </div>
      <div v-if="output" class="tool-section">
        <div class="tool-label">Output</div>
        <pre class="tool-content">{{ output }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

const props = defineProps<{
  name: string;
  input: Record<string, unknown>;
  status: 'running' | 'success' | 'error';
  output?: string;
}>();

const expanded = ref(false);

const inputSummary = computed(() => {
  if (props.name === 'Read' || props.name === 'Write' || props.name === 'Edit') {
    return (props.input.file_path as string) || '';
  }
  if (props.name === 'Bash') {
    const cmd = (props.input.command as string) || '';
    return cmd.length > 60 ? cmd.slice(0, 60) + '...' : cmd;
  }
  if (props.name === 'Grep') {
    return (props.input.pattern as string) || '';
  }
  if (props.name === 'Glob') {
    return (props.input.pattern as string) || '';
  }
  return '';
});
</script>

<style scoped>
.tool-card {
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  margin: 8px 0;
}

.tool-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-surface);
  cursor: pointer;
  user-select: none;
}

.tool-header:hover {
  background: var(--bg-hover);
}

.tool-status {
  font-size: 14px;
}

.tool-success .tool-status { color: var(--color-success); }
.tool-error .tool-status { color: var(--color-error); }
.tool-running .tool-status { color: var(--text-secondary); }

.spinner {
  display: inline-block;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.tool-name {
  color: var(--color-tool);
  font-weight: 600;
}

.tool-summary {
  color: var(--text-secondary);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-expand {
  color: var(--text-muted);
  font-size: 11px;
}

.tool-body {
  border-top: 1px solid var(--border-light);
  background: var(--bg-primary);
}

.tool-section {
  padding: 8px 12px;
}

.tool-section + .tool-section {
  border-top: 1px solid var(--border-light);
}

.tool-label {
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.tool-content {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 300px;
  overflow-y: auto;
  margin: 0;
}
</style>
```

- [ ] **Step 2: Verify it compiles**

Run: `cd web && npx vue-tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add web/src/components/ToolCallCard.vue
git commit -m "feat: add ToolCallCard component with expand/collapse"
```

---

### Task 8: MessageBubble Component

**Files:**
- Create: `web/src/components/MessageBubble.vue`

- [ ] **Step 1: Install markdown-it**

```bash
cd web && npm install markdown-it
npm install -D @types/markdown-it
```

- [ ] **Step 2: Write the component**

```vue
<template>
  <div class="message" :class="'message-' + message.role">
    <template v-if="message.role === 'user'">
      <span class="user-prompt">&gt; </span>
      <span class="user-text">{{ userText }}</span>
    </template>
    <template v-else>
      <div v-for="(block, index) in message.blocks" :key="index">
        <div v-if="block.type === 'text'" class="assistant-text" v-html="renderMarkdown(block.text)"></div>
        <ToolCallCard
          v-else-if="block.type === 'tool_use'"
          :name="block.name"
          :input="block.input"
          :status="block.status"
          :output="block.output"
        />
        <CodeBlock
          v-else-if="block.type === 'code'"
          :code="block.code"
          :language="block.language"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import MarkdownIt from 'markdown-it';
import type { DisplayMessage } from '../types/messages.js';
import ToolCallCard from './ToolCallCard.vue';
import CodeBlock from './CodeBlock.vue';

const props = defineProps<{
  message: DisplayMessage;
}>();

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
});

const userText = computed(() => {
  const textBlock = props.message.blocks.find(b => b.type === 'text');
  return textBlock && textBlock.type === 'text' ? textBlock.text : '';
});

function renderMarkdown(text: string): string {
  return md.render(text);
}
</script>

<style scoped>
.message {
  margin: 4px 0;
}

.message-user {
  color: var(--color-user);
}

.user-prompt {
  color: var(--color-prompt);
  font-weight: 600;
}

.user-text {
  color: var(--color-user);
}

.assistant-text {
  color: var(--text-primary);
  line-height: 1.6;
}

.assistant-text :deep(p) {
  margin: 0.4em 0;
}

.assistant-text :deep(a) {
  color: var(--color-link);
}

.assistant-text :deep(strong) {
  color: var(--text-primary);
  font-weight: 600;
}

.assistant-text :deep(code) {
  background: var(--bg-surface);
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 12px;
}

.assistant-text :deep(pre) {
  background: var(--bg-surface);
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 8px 0;
}

.assistant-text :deep(ul),
.assistant-text :deep(ol) {
  margin: 0.4em 0;
  padding-left: 1.5em;
}
</style>
```

- [ ] **Step 3: Verify it compiles**

Run: `cd web && npx vue-tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add web/src/components/MessageBubble.vue web/package.json web/package-lock.json
git commit -m "feat: add MessageBubble component with markdown rendering"
```

---

### Task 9: InputBar Component

**Files:**
- Create: `web/src/components/InputBar.vue`

- [ ] **Step 1: Write the component**

```vue
<template>
  <div class="input-bar">
    <textarea
      ref="inputRef"
      v-model="text"
      class="input-field"
      placeholder="Type message..."
      :disabled="disabled"
      rows="1"
      @keydown="handleKeydown"
      @input="autoResize"
    />
    <button
      v-if="isStreaming"
      class="btn-abort"
      @click="$emit('abort')"
    >
      ■ Stop
    </button>
    <button
      v-else
      class="btn-send"
      :disabled="disabled || !text.trim()"
      @click="send"
    >
      Send ▶
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue';

defineProps<{
  disabled: boolean;
  isStreaming: boolean;
}>();

const emit = defineEmits<{
  send: [content: string];
  abort: [];
}>();

const text = ref('');
const inputRef = ref<HTMLTextAreaElement | null>(null);

function send() {
  const content = text.value.trim();
  if (!content) return;
  emit('send', content);
  text.value = '';
  void nextTick(() => autoResize());
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    send();
  }
}

function autoResize() {
  const el = inputRef.value;
  if (el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 150) + 'px';
  }
}
</script>

<style scoped>
.input-bar {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  padding: 12px 16px;
  background: var(--bg-surface);
  border-top: 1px solid var(--border);
}

.input-field {
  flex: 1;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px 14px;
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.4;
  resize: none;
  outline: none;
  min-height: 40px;
  max-height: 150px;
}

.input-field:focus {
  border-color: var(--color-accent);
}

.input-field::placeholder {
  color: var(--text-muted);
}

.input-field:disabled {
  opacity: 0.5;
}

.btn-send, .btn-abort {
  border: none;
  border-radius: 6px;
  padding: 10px 16px;
  font-size: 13px;
  white-space: nowrap;
}

.btn-send {
  background: var(--color-accent);
  color: white;
}

.btn-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-abort {
  background: var(--color-error);
  color: white;
}
</style>
```

- [ ] **Step 2: Verify it compiles**

Run: `cd web && npx vue-tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add web/src/components/InputBar.vue
git commit -m "feat: add InputBar component with send/abort and auto-resize"
```

---

### Task 10: ChatView Component

**Files:**
- Create: `web/src/components/ChatView.vue`

- [ ] **Step 1: Write the component**

```vue
<template>
  <div class="chat-view">
    <div class="chat-messages" ref="messagesRef">
      <div v-if="messages.length === 0" class="chat-empty">
        <p>Start a new conversation or select a session.</p>
      </div>
      <MessageBubble
        v-for="msg in messages"
        :key="msg.id"
        :message="msg"
      />
      <div v-if="isStreaming" class="streaming-indicator">
        <span class="dot-pulse"></span>
      </div>
    </div>
    <InputBar
      :disabled="!hasSession"
      :is-streaming="isStreaming"
      @send="onSend"
      @abort="onAbort"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import type { DisplayMessage } from '../types/messages.js';
import MessageBubble from './MessageBubble.vue';
import InputBar from './InputBar.vue';

const props = defineProps<{
  messages: DisplayMessage[];
  isStreaming: boolean;
  hasSession: boolean;
}>();

const emit = defineEmits<{
  send: [content: string];
  abort: [];
}>();

const messagesRef = ref<HTMLElement | null>(null);

watch(
  () => props.messages.length,
  () => {
    void nextTick(() => scrollToBottom());
  },
);

watch(
  () => {
    const last = props.messages[props.messages.length - 1];
    if (!last) return 0;
    return last.blocks.reduce((acc, b) => acc + (b.type === 'text' ? b.text.length : 0), 0);
  },
  () => {
    void nextTick(() => scrollToBottom());
  },
);

function scrollToBottom() {
  const el = messagesRef.value;
  if (el) {
    el.scrollTop = el.scrollHeight;
  }
}

function onSend(content: string) {
  emit('send', content);
}

function onAbort() {
  emit('abort');
}
</script>

<style scoped>
.chat-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chat-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
}

.streaming-indicator {
  padding: 4px 0;
}

.dot-pulse {
  display: inline-block;
  width: 8px;
  height: 8px;
  background: var(--color-link);
  border-radius: 50%;
  animation: pulse 1s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}
</style>
```

- [ ] **Step 2: Verify it compiles**

Run: `cd web && npx vue-tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add web/src/components/ChatView.vue
git commit -m "feat: add ChatView component with auto-scroll and streaming indicator"
```

---

### Task 11: SessionSidebar Component

**Files:**
- Create: `web/src/components/SessionSidebar.vue`

- [ ] **Step 1: Write the component**

```vue
<template>
  <div class="sidebar" :class="{ collapsed: !open }">
    <div class="sidebar-header">
      <button class="btn-new" @click="promptNewSession">+ New Session</button>
    </div>
    <div class="sidebar-label">Sessions</div>
    <div class="session-list">
      <div
        v-for="session in sessions"
        :key="session.sessionId"
        class="session-item"
        :class="{ active: session.sessionId === currentSessionId }"
        @click="$emit('switch', session.sessionId)"
      >
        <div class="session-title">{{ session.summary }}</div>
        <div class="session-meta">{{ formatTime(session.lastModified) }}</div>
        <button
          class="session-delete"
          @click.stop="$emit('delete', session.sessionId)"
          title="Delete session"
        >×</button>
      </div>
      <div v-if="sessions.length === 0" class="session-empty">
        No sessions yet
      </div>
    </div>
    <div class="sidebar-footer">
      <button class="btn-settings" @click="$emit('settings')">⚙ Settings</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SessionInfo } from '../types/messages.js';

defineProps<{
  sessions: SessionInfo[];
  currentSessionId: string | null;
  open: boolean;
}>();

const emit = defineEmits<{
  switch: [id: string];
  delete: [id: string];
  settings: [];
  'new-session': [cwd: string, content?: string];
}>();

function promptNewSession() {
  const cwd = window.prompt('Working directory (cwd):', '/home/user/project');
  if (!cwd) return;
  const content = window.prompt('Initial message (optional):', '');
  emit('new-session', cwd, content || undefined);
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(ts).toLocaleDateString();
}
</script>

<style scoped>
.sidebar {
  width: 240px;
  background: var(--bg-primary);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width 0.2s;
}

.sidebar.collapsed {
  width: 0;
  border-right: none;
}

.sidebar-header {
  padding: 12px;
}

.btn-new {
  width: 100%;
  padding: 8px 12px;
  background: var(--color-accent);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 12px;
}

.sidebar-label {
  padding: 0 12px 4px;
  font-size: 11px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.session-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px;
}

.session-item {
  padding: 8px 10px;
  border-radius: 4px;
  cursor: pointer;
  position: relative;
}

.session-item:hover {
  background: var(--bg-hover);
}

.session-item.active {
  background: var(--bg-hover);
  border-left: 2px solid var(--color-link);
}

.session-title {
  font-size: 12px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-right: 20px;
}

.session-item:not(.active) .session-title {
  color: var(--text-secondary);
}

.session-meta {
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 2px;
}

.session-delete {
  position: absolute;
  right: 8px;
  top: 8px;
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 16px;
  line-height: 1;
  padding: 0 4px;
  display: none;
}

.session-item:hover .session-delete {
  display: block;
}

.session-delete:hover {
  color: var(--color-error);
}

.session-empty {
  padding: 12px;
  color: var(--text-muted);
  font-size: 12px;
  text-align: center;
}

.sidebar-footer {
  padding: 8px 12px;
  border-top: 1px solid var(--border);
}

.btn-settings {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 11px;
  padding: 4px 0;
}

.btn-settings:hover {
  color: var(--text-primary);
}
</style>
```

- [ ] **Step 2: Verify it compiles**

Run: `cd web && npx vue-tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add web/src/components/SessionSidebar.vue
git commit -m "feat: add SessionSidebar component with session management"
```

---

### Task 12: SettingsModal Component

**Files:**
- Create: `web/src/components/SettingsModal.vue`

- [ ] **Step 1: Write the component**

```vue
<template>
  <div v-if="open" class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <div class="modal-header">
        <h3>Settings</h3>
        <button class="modal-close" @click="$emit('close')">×</button>
      </div>
      <div class="modal-body">
        <div class="field">
          <label class="field-label">WebSocket URL</label>
          <input
            v-model="wsUrl"
            class="field-input"
            placeholder="ws://localhost:3000/ws/chat"
          />
          <p class="field-hint">Only needed when running frontend separately from server</p>
        </div>
        <div class="field">
          <label class="field-label">Default Working Directory</label>
          <input
            v-model="defaultCwd"
            class="field-input"
            placeholder="/home/user/project"
          />
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-save" @click="save">Save</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{
  close: [];
  save: [settings: { wsUrl: string; defaultCwd: string }];
}>();

const wsUrl = ref(localStorage.getItem('rc_ws_url') || '');
const defaultCwd = ref(localStorage.getItem('rc_default_cwd') || '/home/user/project');

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    wsUrl.value = localStorage.getItem('rc_ws_url') || '';
    defaultCwd.value = localStorage.getItem('rc_default_cwd') || '/home/user/project';
  }
});

function save() {
  localStorage.setItem('rc_ws_url', wsUrl.value);
  localStorage.setItem('rc_default_cwd', defaultCwd.value);
  emit('save', { wsUrl: wsUrl.value, defaultCwd: defaultCwd.value });
  emit('close');
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  width: 400px;
  max-width: 90vw;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.modal-header h3 {
  font-size: 14px;
  font-weight: 600;
}

.modal-close {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 20px;
  padding: 0 4px;
}

.modal-body {
  padding: 16px;
}

.field {
  margin-bottom: 16px;
}

.field-label {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.field-input {
  width: 100%;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 8px 10px;
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
}

.field-input:focus {
  border-color: var(--color-accent);
}

.field-hint {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 4px;
}

.modal-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  text-align: right;
}

.btn-save {
  background: var(--color-accent);
  color: white;
  border: none;
  border-radius: 6px;
  padding: 8px 20px;
  font-size: 13px;
}
</style>
```

- [ ] **Step 2: Verify it compiles**

Run: `cd web && npx vue-tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add web/src/components/SettingsModal.vue
git commit -m "feat: add SettingsModal component for server URL and cwd"
```

---

### Task 13: App.vue — Wire Everything Together

**Files:**
- Modify: `web/src/App.vue`

- [ ] **Step 1: Write the full App.vue**

Replace the placeholder with the complete root component:

```vue
<template>
  <div class="app">
    <div class="topbar">
      <div class="topbar-left">
        <button class="btn-menu" @click="sidebarOpen = !sidebarOpen">☰</button>
        <span class="app-title">RemoteClaude</span>
      </div>
      <div class="topbar-right">
        <span class="connection-status" :class="wsStatus">
          {{ statusText }}
        </span>
        <button class="btn-icon" @click="settingsOpen = true">⚙</button>
      </div>
    </div>
    <div class="main">
      <SessionSidebar
        :sessions="sessionStore.sessions.value"
        :current-session-id="sessionStore.currentSessionId.value"
        :open="sidebarOpen"
        @switch="handleSwitchSession"
        @delete="handleDeleteSession"
        @settings="settingsOpen = true"
        @new-session="handleNewSession"
      />
      <ChatView
        :messages="chat.messages.value"
        :is-streaming="chat.isStreaming.value"
        :has-session="!!sessionStore.currentSessionId.value"
        @send="handleSend"
        @abort="handleAbort"
      />
    </div>
    <SettingsModal
      :open="settingsOpen"
      @close="settingsOpen = false"
      @save="handleSettingsSave"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useWebSocket } from './composables/useWebSocket.js';
import { useChat } from './composables/useChat.js';
import { useSessions } from './composables/useSessions.js';
import SessionSidebar from './components/SessionSidebar.vue';
import ChatView from './components/ChatView.vue';
import SettingsModal from './components/SettingsModal.vue';

const sidebarOpen = ref(true);
const settingsOpen = ref(false);

function getWsUrl(): string {
  const saved = localStorage.getItem('rc_ws_url');
  if (saved) return saved;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws/chat`;
}

const ws = useWebSocket(getWsUrl());
const chat = useChat(ws);
const sessionStore = useSessions(ws);

const wsStatus = computed(() => ws.status.value);
const statusText = computed(() => {
  switch (ws.status.value) {
    case 'connected': return '● Connected';
    case 'connecting': return '○ Connecting...';
    case 'disconnected': return '○ Disconnected';
    case 'error': return '● Error';
  }
});

onMounted(() => {
  ws.connect();
  void sessionStore.loadSessions();
});

onUnmounted(() => {
  ws.disconnect();
});

function handleNewSession(cwd: string, content?: string) {
  chat.clearMessages();
  chat.createSession(cwd, content);
}

function handleSwitchSession(id: string) {
  sessionStore.switchSession(id);
  chat.clearMessages();
}

async function handleDeleteSession(id: string) {
  await sessionStore.deleteSession(id);
}

function handleSend(content: string) {
  const sessionId = sessionStore.currentSessionId.value;
  if (sessionId) {
    chat.sendMessage(sessionId, content);
  }
}

function handleAbort() {
  const sessionId = sessionStore.currentSessionId.value;
  if (sessionId) {
    chat.abort(sessionId);
  }
}

function handleSettingsSave(_settings: { wsUrl: string; defaultCwd: string }) {
  // Reconnect with new URL if changed
  ws.disconnect();
  const newWs = getWsUrl();
  // For simplicity, reload the page to apply new WebSocket URL
  if (_settings.wsUrl) {
    location.reload();
  }
}
</script>

<style scoped>
.app {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  height: 44px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.btn-menu {
  background: none;
  border: none;
  color: var(--text-primary);
  font-size: 18px;
  padding: 4px;
}

.app-title {
  font-weight: 600;
  color: var(--color-link);
}

.connection-status {
  font-size: 11px;
}

.connection-status.connected { color: var(--color-success); }
.connection-status.connecting { color: var(--text-secondary); }
.connection-status.disconnected { color: var(--text-muted); }
.connection-status.error { color: var(--color-error); }

.btn-icon {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 16px;
  padding: 4px;
}

.main {
  flex: 1;
  display: flex;
  overflow: hidden;
}
</style>
```

- [ ] **Step 2: Verify it compiles**

Run: `cd web && npx vue-tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add web/src/App.vue
git commit -m "feat: wire up App.vue with all components and composables"
```

---

### Task 14: Server Changes — Static File Serving + CORS

**Files:**
- Modify: `server/src/index.ts`
- Modify: `server/package.json` (add dependencies)

- [ ] **Step 1: Install server dependencies**

```bash
cd server
npm install @fastify/static @fastify/cors
```

- [ ] **Step 2: Update server/src/index.ts**

Add static file serving and CORS to the existing server. The changes are:

1. Add imports for `@fastify/static`, `@fastify/cors`, and `path`/`url` for dirname resolution
2. Register CORS plugin
3. Register static file serving plugin (pointing to `../../web/dist`)
4. Add a wildcard route to serve `index.html` for client-side routing

Updated `index.ts`:

```typescript
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import cors from '@fastify/cors';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { registerWsRoute } from './routes/ws.js';
import { registerSessionRoutes } from './routes/sessions.js';
import { SessionManager } from './services/session-manager.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function main(): Promise<void> {
  const app = Fastify({ logger: true });
  const sessionManager = new SessionManager();

  await app.register(cors, { origin: true });
  await app.register(websocket);

  registerWsRoute(app, sessionManager);
  registerSessionRoutes(app);

  app.get('/health', async () => ({ status: 'ok' }));

  // Serve web client static files (after API routes so they take priority)
  const webDistPath = resolve(__dirname, '../../web/dist');
  await app.register(fastifyStatic, {
    root: webDistPath,
    prefix: '/',
    wildcard: false,
  });

  // SPA fallback: serve index.html for unmatched routes
  app.setNotFoundHandler(async (_request, reply) => {
    return reply.sendFile('index.html', webDistPath);
  });

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down...`);
    sessionManager.abortAll();
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: PORT, host: HOST });
  app.log.info(`RemoteClaude server listening on ${HOST}:${PORT}`);
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
```

- [ ] **Step 3: Verify server compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Run server tests**

Run: `cd server && npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add server/src/index.ts server/package.json server/package-lock.json
git commit -m "feat: add @fastify/static and @fastify/cors to server"
```

---

### Task 15: Build Web Client and End-to-End Smoke Test

**Files:**
- No new files — integration test

- [ ] **Step 1: Build the web client**

```bash
cd web && npm run build
```

Expected: Build succeeds, output in `web/dist/`

- [ ] **Step 2: Build the server**

```bash
cd server && npm run build
```

Expected: No errors

- [ ] **Step 3: Start the server and test**

```bash
cd server && node dist/index.js &
SERVER_PID=$!
sleep 3
```

Test health:
```bash
curl http://localhost:3000/health
```
Expected: `{"status":"ok"}`

Test web client is served:
```bash
curl -s http://localhost:3000/ | head -5
```
Expected: HTML containing `<div id="app">`

Test sessions API:
```bash
curl http://localhost:3000/api/sessions
```
Expected: JSON array

Kill server:
```bash
kill $SERVER_PID
```

- [ ] **Step 4: Commit if any fixes needed**

```bash
git add -A
git commit -m "chore: verify end-to-end build and smoke test"
```
