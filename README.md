# RemoteClaude

A web-based interface for [Claude Code](https://docs.anthropic.com/en/docs/claude-code), powered by the [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk). Run agentic coding tasks from any browser with real-time streaming, tool execution display, multi-session management, and full conversation history.

## Architecture

```
Browser (Vue 3)  ──WebSocket──▶  Fastify Server  ──SDK──▶  Claude Code CLI
     :5173                           :3000                   (subprocess)
```

The server spawns Claude Code as a subprocess via the Agent SDK. User messages are forwarded as prompts; SDK events (text, tool calls, progress) are streamed back over WebSocket in real time.

## Features

- **Multi-session chat** — create, switch, resume, and delete named sessions
- **Real-time streaming** — text and tool execution events streamed over WebSocket
- **Tool call display** — collapsible cards showing tool name, input, and output
- **Code highlighting** — syntax highlighting via [Shiki](https://shiki.matsu.io/) + Markdown rendering
- **Full conversation history** — reads Claude journal files (JSONL) with parentUuid chain traversal, including messages before `/compact`
- **Config discovery** — view MCP servers, skills, models, and agents via `/mcp`, `/skills`, `/config` commands
- **Auto-reconnect** — WebSocket reconnects automatically on disconnect

## Prerequisites

- **Node.js** >= 18
- **Claude Code CLI** installed and authenticated (`npm install -g @anthropic-ai/claude-code`)

## Quick Start

```bash
# Clone
git clone https://github.com/forzart/RemoteClaude.git
cd RemoteClaude

# Install dependencies
cd server && npm install && cd ..
cd web && npm install && cd ..

# Start server (port 3000)
cd server && npm run build && npm start

# In another terminal — start web dev server (port 5173)
cd web && npm run dev
```

Open http://localhost:5173 in your browser.

### Production Build

```bash
# Build web client
cd web && npm run build

# The server serves web/dist as static files
cd server && npm run build && npm start
```

Open http://localhost:3000 — the server serves both the API and the web client.

## Project Structure

```
RemoteClaude/
├── server/                         # Fastify backend
│   └── src/
│       ├── index.ts                # Entry point, registers routes
│       ├── routes/
│       │   ├── ws.ts               # WebSocket /ws/chat endpoint
│       │   ├── sessions.ts         # REST: list, history, delete sessions
│       │   └── config.ts           # REST: MCP, skills, overview
│       └── services/
│           ├── agent-query.ts      # Claude Agent SDK integration
│           ├── session-manager.ts  # Active session lifecycle
│           └── config-cache.ts     # Cached config from SDK probe
│
└── web/                            # Vue 3 + Vite frontend
    └── src/
        ├── App.vue                 # Root layout + WebSocket lifecycle
        ├── components/
        │   ├── ChatView.vue        # Message list + slash command interception
        │   ├── InputBar.vue        # Text input + config buttons
        │   ├── SessionSidebar.vue  # Session list
        │   ├── MessageBubble.vue   # Message rendering
        │   ├── CodeBlock.vue       # Syntax-highlighted code
        │   ├── ToolCallCard.vue    # Tool execution display
        │   └── ConfigPanel.vue     # MCP / Skills / Config panel
        ├── composables/
        │   ├── useWebSocket.ts     # WebSocket with auto-reconnect
        │   ├── useChat.ts          # Message state + streaming
        │   └── useSessions.ts      # Session CRUD
        └── types/
            └── messages.ts         # Protocol and display types
```

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Server bind address |

Sessions are stored in `~/.remoteclaude/cwd/{sessionName}/`. Claude journal files (JSONL) are read from `~/.claude/projects/`.

## API

### WebSocket — `/ws/chat`

Client sends:
```json
{ "type": "new_session", "sessionName": "my-project" }
{ "type": "message", "sessionName": "my-project", "content": "fix the bug in auth.ts" }
{ "type": "abort", "sessionName": "my-project" }
```

Server sends:
```json
{ "type": "session_start", "sessionName": "my-project", "sessionId": "uuid" }
{ "type": "sdk_event", "sessionName": "my-project", "event": { ... } }
{ "type": "done", "sessionName": "my-project" }
{ "type": "error", "sessionName": "my-project", "error": "message" }
```

### REST

| Endpoint | Description |
|---|---|
| `GET /api/sessions` | List all sessions |
| `GET /api/sessions/:name/history` | Get conversation history |
| `DELETE /api/sessions/:name` | Delete a session |
| `GET /api/config/mcp` | List MCP servers |
| `GET /api/config/skills` | List commands and agents |
| `GET /api/config/overview` | System overview |
| `GET /health` | Health check |

## Tech Stack

**Server:** Fastify, TypeScript, Claude Agent SDK, WebSocket

**Web:** Vue 3 (Composition API), Vite, TypeScript, markdown-it, Shiki

## License

MIT
