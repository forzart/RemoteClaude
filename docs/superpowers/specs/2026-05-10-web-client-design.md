# RemoteClaude Web Client - Design Spec

## Overview

A Vue 3 web client that provides a Claude Code CLI-like terminal experience in the browser. Connects to the existing RemoteClaude Node.js backend via WebSocket for real-time streaming, with REST fallback for session management. Built with Vite, styled with a GitHub Dark terminal theme, and served as static files from the Fastify backend via `@fastify/static`.

## Architecture

### High-Level

```
┌──────────────────────────────┐
│  Browser (Vue 3 SPA)         │
│                              │
│  WebSocket ←→ /ws/chat       │
│  REST      ←→ /api/sessions  │
│  Static    ←  /  (index.html)│
└──────────────────────────────┘
        │
        ▼
┌──────────────────────────────┐
│  Fastify Server              │
│                              │
│  @fastify/static → web/dist/ │
│  @fastify/websocket → ws.ts  │
│  REST routes → sessions.ts   │
│  Agent SDK → query()         │
└──────────────────────────────┘
```

### Data Flow

1. **New session**: User enters cwd + first message → WebSocket `new_session` → server creates session via Agent SDK → streams `SDKMessage` events back
2. **Subsequent messages**: User types message → WebSocket `message` with sessionId → server resumes session → streams events
3. **Abort**: User clicks abort → WebSocket `abort` → server calls AbortController
4. **Session list**: On app load → REST `GET /api/sessions` → populate sidebar
5. **Delete session**: User deletes session → REST `DELETE /api/sessions/:id` → remove from sidebar

### State Management

All state is reactive Vue refs/reactive objects — no Vuex/Pinia needed for this scope.

- **Connection state**: WebSocket readyState, reconnect status
- **Session state**: current sessionId, session list (from REST API)
- **Message state**: array of parsed display messages per session (in-memory only, not persisted)
- **UI state**: sidebar open/closed, settings modal, streaming indicator

### SDKMessage → Display Message Mapping

The server wraps each `SDKMessage` in an `SDKEventMessage`:
```json
{"type": "sdk_event", "sessionId": "...", "event": <SDKMessage>}
```

Key `SDKMessage` types to render:

| SDKMessage type | Display as |
|----------------|-----------|
| `assistant` (type: 'assistant') | Assistant text block — extract text from `message.content` array |
| `stream_event` (type: 'stream_event') | Streaming partial text — append to current assistant message |
| `result` (type: 'result') | Query complete — finalize current message, show cost/usage if desired |
| `tool_progress` (type: 'tool_progress') | Tool running indicator — show spinner on tool card |
| `system` (type: 'system', subtype: 'init') | Session initialized — store available tools list |
| All other types | Ignore silently for MVP |

**Extracting tool calls from assistant messages**: The `assistant` message contains a `message.content` array. Each element is either a `text` block or a `tool_use` block. Tool use blocks have `{ type: 'tool_use', id, name, input }`. Tool results arrive as separate `assistant` messages with `tool_result` content blocks.

**Streaming text assembly**: `stream_event` messages contain `event` which is a `BetaRawMessageStreamEvent`. Key event types:
- `content_block_start` — new text or tool_use block starting
- `content_block_delta` — incremental text delta (append to current block)
- `content_block_stop` — block complete
- `message_stop` — full message complete

## Component Architecture

```
App.vue
├── SessionSidebar.vue          # Session list + new/delete
├── ChatView.vue                # Main chat area
│   ├── MessageBubble.vue       # User or assistant message
│   │   ├── ToolCallCard.vue    # Collapsible tool call display
│   │   └── CodeBlock.vue       # Syntax-highlighted code block
│   └── InputBar.vue            # Text input + send/abort
└── SettingsModal.vue           # Server URL + default cwd
```

### Component Responsibilities

**App.vue**: Root layout — sidebar on left, chat on right. Manages global state: current session, WebSocket connection, settings.

**SessionSidebar.vue**: Displays session list from REST API. Create new session (prompts for cwd). Switch between sessions. Delete sessions with confirmation. Shows active session highlight.

**ChatView.vue**: Renders message list for current session. Auto-scrolls to bottom on new messages. Shows connection status banner. Shows "streaming..." indicator during active query.

**MessageBubble.vue**: Renders a single display message. User messages: `>` prefix, cyan text. Assistant messages: white text with Markdown rendering via markdown-it (bold, italic, lists, links, code blocks). Parses content array to render text blocks, tool_use blocks (delegates to ToolCallCard), and code blocks (delegates to CodeBlock).

**ToolCallCard.vue**: Collapsible card showing tool name, input summary, and output. States: 🔄 running (spinner), ✓ success (green), ✗ error (red). Click to expand/collapse full input/output details.

**CodeBlock.vue**: Renders fenced code blocks with Shiki syntax highlighting. Shows language label top-left, copy button top-right. Dark theme matching overall UI.

**InputBar.vue**: Text input field (Enter to send, Shift+Enter for newline). Send button (disabled during streaming). Abort button (visible only during streaming). Disabled state when no session selected.

**SettingsModal.vue**: Server WebSocket URL (for cases where frontend is served separately during dev). Default working directory (cwd) for new sessions. Stored in localStorage.

## Composables

### useWebSocket(url)

```typescript
// Manages WebSocket connection lifecycle
const { status, send, lastMessage, connect, disconnect } = useWebSocket(url)

// status: 'connecting' | 'connected' | 'disconnected' | 'error'
// send(msg: object): void — JSON.stringify and send
// lastMessage: Ref<ServerMessage | null> — latest received message
// connect(): void — establish connection
// disconnect(): void — close connection
```

Features:
- Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s, max 30s)
- Connection status tracking
- Heartbeat/ping to detect stale connections

### useChat(websocket)

```typescript
// Manages chat messages and SDKMessage parsing
const { messages, sendMessage, abort, isStreaming } = useChat(ws)

// messages: Ref<DisplayMessage[]> — parsed messages for current session
// sendMessage(content: string): void — send user message
// abort(): void — abort current streaming response
// isStreaming: Ref<boolean> — whether a response is in progress
```

Responsibilities:
- Parse incoming `sdk_event` messages into display messages
- Aggregate streaming partial text into coherent blocks
- Track tool call states (running → success/error)
- Add user messages to the list on send

### useSessions(websocket)

```typescript
// Manages session lifecycle
const { sessions, currentSession, createSession, switchSession, deleteSession, loadSessions } = useSessions(ws)

// sessions: Ref<Session[]> — session list from REST API
// currentSession: Ref<string | null> — active session ID
// createSession(cwd: string, content?: string): void — via WebSocket new_session
// switchSession(id: string): void — change active session
// deleteSession(id: string): void — via REST DELETE
// loadSessions(): void — fetch session list via REST GET
```

## Visual Design

### Color Palette (GitHub Dark)

| Element | Color |
|---------|-------|
| Background | `#0d1117` |
| Surface/cards | `#161b22` |
| Border | `#30363d` |
| Text primary | `#e6edf3` |
| Text secondary | `#8b949e` |
| User message | `#79c0ff` (cyan) |
| User prefix `>` | `#3fb950` (green) |
| Tool name | `#d2a8ff` (purple) |
| Success | `#3fb950` (green) |
| Error | `#f85149` (red) |
| Link/action | `#58a6ff` (blue) |
| Code keyword | `#ff7b72` (red) |

### Typography

- Primary font: `'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace`
- Base size: 13px
- Line height: 1.6

### Layout

- Sidebar: 240px fixed width, collapsible on mobile
- Chat area: flex-1, fills remaining space
- Input bar: fixed at bottom, 48px height
- Top bar: 44px height with app name + connection status

## Technology Stack

| Category | Choice | Rationale |
|----------|--------|-----------|
| Framework | Vue 3 (Composition API) | Lightweight, reactive, fast setup |
| Build | Vite | Fast dev server, optimized builds |
| Language | TypeScript | Type safety, matches server types |
| Code Highlighting | Shiki | Tree-shakeable, accurate highlighting |
| Markdown | markdown-it | Lightweight, extensible, Vue-friendly |
| Styling | Plain CSS (scoped) | No extra dependency, sufficient for terminal theme |
| Hosting | @fastify/static | Build output served from Fastify, single deployment |

## Project Structure

```
web/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── index.html                    # Vite entry HTML
├── src/
│   ├── main.ts                   # Vue app creation + mount
│   ├── App.vue                   # Root layout
│   ├── types/
│   │   └── messages.ts           # Display message types, server message types
│   ├── composables/
│   │   ├── useWebSocket.ts       # WebSocket connection management
│   │   ├── useChat.ts            # Message parsing + state
│   │   └── useSessions.ts        # Session CRUD
│   ├── components/
│   │   ├── SessionSidebar.vue    # Session list sidebar
│   │   ├── ChatView.vue          # Message list + auto-scroll
│   │   ├── MessageBubble.vue     # Single message rendering
│   │   ├── ToolCallCard.vue      # Tool call card with expand/collapse
│   │   ├── CodeBlock.vue         # Shiki code block + copy
│   │   ├── InputBar.vue          # Message input + send/abort
│   │   └── SettingsModal.vue     # Settings dialog
│   └── styles/
│       └── global.css            # Global terminal theme styles
└── public/
    └── favicon.ico
```

## Server Changes Required

### Add @fastify/static to serve web client

In `server/src/index.ts`, register `@fastify/static` to serve `web/dist/`:

```typescript
import fastifyStatic from '@fastify/static';
import { resolve } from 'path';

await app.register(fastifyStatic, {
  root: resolve(import.meta.dirname, '../../web/dist'),
  prefix: '/',
});
```

### Add CORS headers for development

During development with Vite dev server, the server needs CORS:

```typescript
import cors from '@fastify/cors';

await app.register(cors, { origin: true });
```

This is only needed during development. In production, everything is same-origin via `@fastify/static`.

## Build & Deploy

### Development

```bash
# Terminal 1: Start backend
cd server && npm run dev

# Terminal 2: Start Vite dev server with proxy
cd web && npm run dev
```

Vite dev server proxies `/ws/chat` and `/api/*` to the backend.

### Production

```bash
cd web && npm run build          # Output to web/dist/
cd server && npm run build       # Output to server/dist/
cd server && npm start           # Serves everything on port 3000
```

## Scope Boundaries

### In scope
- WebSocket connection with auto-reconnect
- Multi-turn conversation with streaming text display
- SDKMessage event parsing (assistant text, tool calls, results)
- Collapsible tool call cards with status indicators
- Code blocks with Shiki syntax highlighting + copy
- Basic Markdown rendering (bold, italic, lists, links, headings) via markdown-it
- Session create/switch/delete via sidebar
- Settings: server URL + default cwd (localStorage)
- Terminal dark theme (GitHub Dark palette)
- Responsive: sidebar collapsible
- Abort/cancel ongoing responses

### Out of scope
- Message persistence (in-memory only; server has authoritative history)
- Authentication/login
- Image/file rendering from tool results
- Advanced Markdown features (LaTeX math, Mermaid diagrams, tables)
- Mobile-optimized layout
- Keyboard shortcuts beyond Enter/Shift+Enter
- Export/share conversations
