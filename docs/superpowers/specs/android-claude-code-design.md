# RemoteClaude - Design Spec

## Overview

A native Android app (**RemoteClaude**) that provides a Claude Code CLI-like experience on mobile. The app connects to a **Node.js backend service** on a remote server that uses the **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`) to programmatically invoke Claude Code's capabilities. This gives the app full access to Claude Code's system prompt, tools (Read, Write, Edit, Bash, Grep, Glob, etc.), agent loop, and skills — all executing on the server. The server can use any Claude Code-supported authentication: official Anthropic API key, Claude subscription, or a custom `ANTHROPIC_BASE_URL` for third-party proxies.

## Architecture

### High-Level

```
┌──────────────┐     HTTP/WebSocket     ┌─────────────────────────────────┐
│  Android App │ ←────────────────────→ │  Node.js Server (Remote)        │
│  (Pure UI)   │                        │                                 │
└──────────────┘                        │  Claude Agent SDK               │
                                        │  query({                        │
                                        │    prompt: "user message",      │
                                        │    options: {                   │
                                        │      resume: "<session-id>",    │
                                        │      tools: { preset:           │
                                        │        'claude_code' },         │
                                        │      permissionMode:            │
                                        │        'bypassPermissions'      │
                                        │    }                            │
                                        │  })                             │
                                        │                                 │
                                        │  Auth: Anthropic API key,       │
                                        │    Claude subscription, or      │
                                        │    custom ANTHROPIC_BASE_URL    │
                                        └─────────────────────────────────┘
```

### Why This Architecture

- **Full Claude Code capabilities**: system prompt, tools, agent loop, skills — all provided by the Agent SDK
- **Tool execution on server**: Bash, file R/W, Git, Grep, Glob all run on the server's file system
- **Native TypeScript API**: `query()` returns `AsyncGenerator<SDKMessage>`, no subprocess management needed
- **Fine-grained control**: `AbortController` for cancellation, `canUseTool` callback for permissions, programmatic hooks
- **Session persistence**: Agent SDK handles session storage to disk, enabling resume across app restarts
- **Flexible auth**: Works with official Anthropic API key, Claude subscription, or custom API endpoint via `ANTHROPIC_BASE_URL`

### Context Management

Conversation context (message history) is maintained **on the server side** by the Claude Agent SDK's built-in session persistence. The app does **not** send full message history with each request.

- **Server (authoritative)**: The Agent SDK stores the complete conversation on disk (including all tool_use/tool_result exchanges). When `resume: "<session-id>"` is passed in `query()` options, the SDK loads the full context, handles compression/truncation as needed, and sends it to the API. The app only sends the new user message.
- **App (display cache)**: Room DB on Android stores messages received from the WebSocket stream. This is purely for UI rendering and offline browsing — not used for context assembly.

### Session-to-Request Mapping

Each client request is associated with a server-side session via the **session ID** passed in the WebSocket message:

```
1. Create session:
   App  → Server:  {"type": "new_session", "cwd": "/home/user/project"}
   Server:         calls query({ prompt, options: { cwd, sessionId: <uuid> } })
   Server → App:   {"type": "session_start", "sessionId": "abc-123"}
   App:            stores sessionId="abc-123" in local Room DB

2. Subsequent messages:
   App  → Server:  {"type": "message", "sessionId": "abc-123", "content": "写个排序"}
   Server:         calls query({ prompt: "写个排序", options: { resume: "abc-123" } })
                   SDK loads full abc-123 history from disk, processes, streams response
   Server → App:   SDKMessage events via WebSocket
```

### Component Layers

**Android App (Kotlin + Compose):**
```
UI (Compose) → ViewModel (State) → Repository (Data)
                                        │
                                   ┌────┴────┐
                                   │         │
                                Room DB   WebSocket/HTTP Client
                               (Sessions)  (OkHttp)
                                              │
                                      Node.js Backend
```

**Node.js Backend (on server):**
```
Fastify Server
    │
    ├── WebSocket endpoint: /ws/chat
    │   └── Per-session: query() call via Agent SDK
    │       ├── prompt: user message
    │       ├── options: { resume, cwd, permissionMode, tools, ... }
    │       ├── AsyncGenerator<SDKMessage> → forward to WebSocket
    │       └── AbortController for cancellation
    │
    ├── REST endpoints:
    │   ├── POST /api/sessions — create new session
    │   ├── GET  /api/sessions — list sessions
    │   ├── DELETE /api/sessions/:id — delete session
    │   └── GET /api/sessions/:id/messages — get history
    │
    └── Session Manager
        ├── Track active query() generators per session
        ├── AbortController management
        └── Cleanup on disconnect
```

## MVP Features

1. **Multi-turn conversation with full Claude Code capabilities** (tools, agent loop, streaming)
2. **Rich event rendering** — show tool calls, tool results, text responses
3. **Code syntax highlighting** within Markdown rendering
4. **Session management** (create, switch, delete)

A minimal settings entry for backend server URL is included in MVP (stored in SharedPreferences).

## Communication Protocol

### WebSocket Messages (App → Server)

```json
// Start new session
{"type": "new_session", "cwd": "/home/user/project"}

// Send message to existing session
{"type": "message", "sessionId": "abc-123", "content": "help me write quicksort"}

// Abort current response
{"type": "abort", "sessionId": "abc-123"}
```

### WebSocket Messages (Server → App)

The server forwards Agent SDK's `SDKMessage` events. Key event types:

```json
// Assistant text (streaming partial)
{
  "type": "assistant",
  "subtype": "partial",
  "text": "I'll help you write..."
}

// Assistant text (complete message)
{
  "type": "assistant",
  "message": { "role": "assistant", "content": [...] }
}

// Tool use (Claude wants to call a tool)
{
  "type": "tool_use",
  "name": "Read",
  "input": {"file_path": "/home/user/project/main.py"}
}

// Tool result (tool execution completed)
{
  "type": "result",
  "subtype": "tool_result",
  "name": "Read",
  "output": "import os\n..."
}

// Tool progress (tool is executing)
{
  "type": "tool_progress",
  "name": "Bash",
  "status": "running"
}

// Session started
{
  "type": "session_start",
  "sessionId": "abc-123"
}

// Response complete (generator exhausted)
{
  "type": "done",
  "sessionId": "abc-123"
}

// Error
{
  "type": "error",
  "message": "API connection failed"
}
```

### Server-Side Query Invocation

For each user message, the server calls the Agent SDK:

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

// New session
const conversation = query({
  prompt: userMessage,
  options: {
    cwd: '/home/user/project',
    tools: { type: 'preset', preset: 'claude_code' },
    permissionMode: 'bypassPermissions',
    abortController: new AbortController(),
  }
});

// Resume existing session
const conversation = query({
  prompt: userMessage,
  options: {
    resume: sessionId,
    permissionMode: 'bypassPermissions',
    abortController: new AbortController(),
  }
});

// Stream SDKMessage events to WebSocket
for await (const message of conversation) {
  websocket.send(JSON.stringify(message));
}
```

Key options:
- `tools: { type: 'preset', preset: 'claude_code' }`: all built-in Claude Code tools
- `permissionMode: 'bypassPermissions'`: auto-accept tool calls (server is trusted)
- `resume: sessionId`: continue a previous session (loads full conversation context)
- `abortController`: cancel ongoing query when client sends abort

## UI Design

### Visual Style

- Dark background (#1a1a2e or pure black)
- Monospace font (JetBrains Mono or Fira Code)
- User messages: `>` prefix in cyan/green
- AI responses: white text with Markdown rendering
- Code blocks: dark card with syntax highlighting + language label + copy button
- **Tool calls**: collapsible cards showing tool name, input, and output
- Streaming: text appears incrementally, simulating terminal typing

### Screen Layout

**Main Chat Screen:**
```
┌────────────────────────────────────────────┐
│ ☰  Claude Code               ⚙️           │  TopBar
├────────────────────────────────────────────┤
│                                            │
│ > help me write quicksort                  │  User (cyan)
│                                            │
│ I'll write a quicksort implementation.     │  Assistant (white)
│ Let me create the file.                    │
│                                            │
│ ┌─ 📄 Write: quicksort.py ──────────────┐ │
│ │ ✓ Created quicksort.py (15 lines)     │ │  Tool call (collapsible)
│ └────────────────────────────────────────┘ │
│                                            │
│ ┌─ ▶ Bash: python quicksort.py ─────────┐ │
│ │ [1, 2, 3, 4, 5, 6, 7, 8, 9]          │ │  Tool call (collapsible)
│ └────────────────────────────────────────┘ │
│                                            │
│ The quicksort is working correctly.        │  Assistant (white)
│ ┌────────────────────────── python ──┐     │
│ │ def quicksort(arr):               │     │  Code block
│ │     if len(arr) <= 1:             │     │
│ │         return arr                │     │
│ └──────────────────────── 📋 Copy ──┘     │
│                                            │
├────────────────────────────────────────────┤
│ [Type message...]                [Send ▶] │  InputBar
└────────────────────────────────────────────┘
```

**Tool Call Card States:**
- 🔄 Running: spinner + tool name + "executing..."
- ✓ Success: green checkmark + tool name + summary
- ✗ Error: red X + tool name + error message
- Tap to expand: shows full input/output details

**Side Drawer (Session List):**
```
┌──────────────────┐
│ + New Session     │
│                  │
│ □ Session 1      │
│ □ Session 2      │
│ □ Session 3      │
│                  │
│ ─────────────    │
│ ⚙ Settings       │
│   - Server URL   │
└──────────────────┘
```

### Interactions

- Code block: copy button (top-right) + language label
- Tool call cards: tap to expand/collapse details
- Long press message: copy full text
- Pull down: load older messages
- Drawer: session list with create/switch/delete
- Abort button: appears during streaming, sends abort signal

## Data Model

### Local (Room DB on Android)

```kotlin
@Entity(tableName = "sessions")
data class Session(
    @PrimaryKey val id: String,           // maps to Agent SDK session ID
    val title: String,
    val serverUrl: String,                // backend server URL
    val cwd: String,                      // working directory on server
    val createdAt: Long,
    val updatedAt: Long
)

@Entity(
    tableName = "messages",
    foreignKeys = [ForeignKey(
        entity = Session::class,
        parentColumns = ["id"],
        childColumns = ["sessionId"],
        onDelete = ForeignKey.CASCADE
    )]
)
data class Message(
    @PrimaryKey val id: String,
    val sessionId: String,
    val role: String,                     // "user" | "assistant" | "tool_use" | "tool_result"
    val content: String,                  // text content or JSON for tool events
    val toolName: String? = null,         // tool name (for tool_use/tool_result)
    val createdAt: Long
)
```

### Server-Side Session State

Sessions are managed entirely by the Claude Agent SDK's built-in session persistence on the server. The session ID used by the app maps directly to the Agent SDK session ID (passed via `sessionId` on creation and `resume` on subsequent messages). No additional database or session-to-request mapping layer is needed on the server — the SDK's disk-based session storage is the single source of truth.

## Technology Stack

### Android App

| Category | Choice | Rationale |
|----------|--------|-----------|
| Language | Kotlin | Official Android language, concise, coroutine-native |
| UI | Jetpack Compose + Material 3 | Modern declarative UI, strong dark theme support |
| Network | OkHttp + WebSocket | Native WebSocket support for bidirectional streaming |
| Serialization | Kotlinx Serialization | Kotlin-native, clean JSON parsing for stream events |
| Database | Room | Official Android ORM, session/message persistence |
| Markdown | Markwon (with extensions) | Mature Android-native Markdown library |
| Code Highlighting | Custom Compose syntax highlighter | Pure Compose, no WebView overhead |
| DI | Hilt | Android standard DI |
| Async | Kotlin Coroutines + Flow | Natural fit for WebSocket streaming data |

### Node.js Backend

| Category | Choice | Rationale |
|----------|--------|-----------|
| Language | TypeScript | Type safety, Agent SDK provides full type definitions |
| Agent Engine | @anthropic-ai/claude-agent-sdk | Programmatic access to Claude Code's full capabilities (tools, system prompt, agent loop, sessions) |
| Framework | Fastify | Lightweight, fast, good WebSocket support |
| WebSocket | @fastify/websocket | Native integration with Fastify |
| Session Storage | Agent SDK built-in persistence | SDK handles session storage to disk, no external DB needed |

## Project Structure

### Android App
```
app/src/main/java/com/remoteclaude/app/
├── RemoteClaudeApp.kt
├── MainActivity.kt
├── data/
│   ├── local/
│   │   ├── AppDatabase.kt
│   │   ├── SessionDao.kt
│   │   └── MessageDao.kt
│   ├── remote/
│   │   ├── WebSocketClient.kt          # WebSocket connection management
│   │   ├── StreamEventParser.kt        # Parse SDKMessage events
│   │   └── models/
│   │       ├── WsMessage.kt            # WebSocket message types
│   │       └── SDKEvent.kt             # Agent SDK event types
│   └── repository/
│       ├── ChatRepository.kt
│       └── SessionRepository.kt
├── domain/
│   └── model/
│       ├── Session.kt
│       ├── Message.kt
│       └── ToolCall.kt                 # Tool call data model
├── ui/
│   ├── theme/
│   │   ├── Theme.kt
│   │   ├── Color.kt
│   │   └── Type.kt
│   ├── chat/
│   │   ├── ChatScreen.kt
│   │   ├── ChatViewModel.kt
│   │   ├── MessageItem.kt             # Renders user/assistant messages
│   │   ├── ToolCallCard.kt            # Renders tool call events
│   │   ├── CodeBlock.kt
│   │   └── InputBar.kt
│   ├── session/
│   │   ├── SessionListDrawer.kt
│   │   └── SessionViewModel.kt
│   └── settings/
│       └── SettingsScreen.kt
└── di/
    └── AppModule.kt
```

### Node.js Backend
```
server/
├── package.json
├── src/
│   ├── index.ts                        # Entry point, Fastify setup
│   ├── routes/
│   │   ├── sessions.ts                 # REST session management
│   │   └── ws.ts                       # WebSocket chat handler
│   ├── services/
│   │   ├── agent-query.ts              # Wrap Agent SDK query() calls
│   │   └── session-manager.ts          # Track active queries & AbortControllers
│   └── types/
│       └── events.ts                   # SDKMessage → WebSocket event mapping
└── tsconfig.json
```

## Build Configuration

### Android
- minSdk: 26 (Android 8.0)
- targetSdk: 34
- Kotlin 1.9+
- Compose BOM latest

### Node.js Backend
- Node.js 18+
- TypeScript
- `@anthropic-ai/claude-agent-sdk` (npm dependency)
- Claude authentication configured on the server (API key, subscription, or custom endpoint)

## Error Handling

- **Network disconnected**: red error banner, auto-reconnect WebSocket with exponential backoff
- **Query failure**: Agent SDK throws error, server catches and forwards to app
- **API unavailable**: Agent SDK will report API error, server forwards to app
- **Stream interrupted**: preserve received content, offer retry
- **WebSocket disconnect during streaming**: abort active query via AbortController, cleanup

## Scope Boundaries

### In scope (MVP)
- Node.js backend using Claude Agent SDK with WebSocket streaming
- Android app with terminal-style UI rendering SDKMessage events
- Tool call visualization (collapsible cards with status)
- Markdown + code syntax highlighting
- Session create/switch/delete (leveraging Agent SDK's built-in session persistence)
- Configurable backend server URL
- Abort/cancel ongoing responses via AbortController
- Dark terminal theme

### Out of scope (MVP)
- Authentication/authorization on the backend (trusted local network assumed)
- Multiple working directories per session
- Custom system prompt configuration
- Image/file upload from phone
- Export/share conversations
- Push notifications
- Working directory browser/picker (hardcoded or simple text input for now)
