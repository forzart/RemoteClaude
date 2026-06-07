# RemoteClaude

Run [Claude Code](https://docs.anthropic.com/en/docs/claude-code) from your phone via Telegram. Talk to Claude, watch tool calls stream in real time, switch project directories — all without opening a laptop. A web client is also bundled for desktop use.

Powered by the [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk).

## Architecture

```
                                       ┌──▶ Telegram Bot   (mobile, primary)
Browser / Telegram ──▶ Fastify Server ─┤
                          + SDK        └──▶ Web Client     (desktop, secondary)
                            │
                            ▼
                       Claude Code CLI (subprocess)
                            │
                            ▼
                       Anthropic API
```

The server spawns Claude Code as a subprocess via the Agent SDK. SDK events (text, tool calls, progress) are streamed back to whichever channel sent the prompt.

## Features

### Telegram (primary)

- **Phone-first** — single-user bot, long polling (no public HTTPS or webhook needed)
- **Project switching** — `/cd <path>` and `/pwd` to navigate between project directories
- **Tool call streaming** — each tool invocation appears as a separate message (`⚒ Read: file.ts`)
- **Typing indicator** — "is typing…" stays visible while Claude is working
- **Whitelist auth** — only your Telegram user ID can talk to the bot
- **Commands** — `/help`, `/pwd`, `/cd`, `/status`, `/abort`, `/reset`

### Web (secondary)

- **Multi-session chat** — create, switch, resume, delete named sessions in a sidebar
- **Code highlighting** — syntax highlighting via [Shiki](https://shiki.matsu.io/) + Markdown rendering
- **Tool call cards** — collapsible cards with input and output
- **Full conversation history** — reads Claude journal files (JSONL) including messages before `/compact`
- **Config discovery** — view MCP servers, skills, models, agents via `/mcp`, `/skills`, `/config` slash commands

## Prerequisites

- **Node.js** >= 18
- **Claude Code CLI** installed and authenticated:
  ```bash
  npm install -g @anthropic-ai/claude-code
  claude login
  ```

> The Agent SDK does not include the CLI itself — it spawns the CLI as a subprocess.

## Quick Start

```bash
git clone https://github.com/forzart/RemoteClaude.git
cd RemoteClaude
npm install
npm run build
npm start
```

Web UI: http://localhost:3000

## Telegram Setup

The Telegram bot is the primary client. Without `server/config.json` the server still runs (web only) but the bot won't start.

1. Create a bot with [@BotFather](https://t.me/BotFather), copy the token
2. Get your numeric user ID from [@userinfobot](https://t.me/userinfobot)
3. Copy `server/config.example.json` to `server/config.json`:

```json
{
  "telegram": {
    "botToken": "1234567890:AAAA...",
    "allowedUserId": 12345678,
    "cwd": "~"
  }
}
```

| Field | Required | Description |
|---|---|---|
| `botToken` | yes | Token from @BotFather |
| `allowedUserId` | yes | Your numeric Telegram user ID (single-user whitelist) |
| `cwd` | yes | Default working directory (`~` is allowed; must be absolute and exist) |

4. Restart the server. Send any message to the bot — it talks to Claude in the configured `cwd`.

**Commands:**

| Command | Behavior |
|---|---|
| `/pwd` | Show current working directory |
| `/cd <path>` | Switch working directory (`~/projects/foo` or absolute paths) |
| `/status` | Show cwd, running state, last activity |
| `/abort` | Cancel the running query |
| `/reset` | Clear conversation history (next message starts fresh) |
| `/help` | List commands |

## Development

```bash
npm run dev:server   # server hot reload on :3000
npm run dev:web      # Vite dev server on :5173 (proxies API/WS to :3000)
```

## Project Structure

```
RemoteClaude/
├── server/                                  # Fastify backend
│   ├── src/
│   │   ├── index.ts                         # Entry point: routes + channels
│   │   ├── routes/                          # HTTP/WebSocket routes (used by web)
│   │   │   ├── ws.ts                        # WebSocket /ws/chat
│   │   │   ├── sessions.ts                  # REST: list/history/delete sessions
│   │   │   └── config.ts                    # REST: /api/config/mcp|skills|overview
│   │   ├── channels/                        # Non-web clients (mobile/IM)
│   │   │   ├── formatter.ts                 # Shared: SDK event → plain text
│   │   │   └── telegram/
│   │   │       ├── bot.ts                   # grammy bot, commands, rate-limited queue
│   │   │       └── schema.ts                # Telegram zod config schema
│   │   └── services/
│   │       ├── agent-query.ts               # SDK query() integration
│   │       ├── session-manager.ts           # Active session + AbortController tracking
│   │       ├── session-paths.ts             # ~/.remoteclaude/cwd path helpers
│   │       ├── config-cache.ts              # Cached SDK probe results
│   │       └── config-file.ts               # Loads server/config.json (zod-validated)
│   ├── config.example.json                  # Config template (committed)
│   └── config.json                          # Actual config (gitignored)
│
├── web/                                     # Vue 3 + Vite frontend
│   └── src/
│       ├── App.vue                          # Root layout, WebSocket lifecycle
│       ├── components/
│       │   ├── ChatView.vue                 # Messages + slash command interception
│       │   ├── InputBar.vue                 # Text input + config buttons
│       │   ├── SessionSidebar.vue           # Session list
│       │   ├── MessageBubble.vue            # Message rendering
│       │   ├── CodeBlock.vue                # Syntax-highlighted code (Shiki)
│       │   ├── ToolCallCard.vue             # Tool input/output card
│       │   └── ConfigPanel.vue              # MCP / Skills / Config tabs
│       ├── composables/
│       │   ├── useWebSocket.ts              # Auto-reconnect WebSocket
│       │   ├── useChat.ts                   # Message state + streaming
│       │   └── useSessions.ts               # Session CRUD
│       └── types/
│           └── messages.ts                  # Protocol + display types
│
└── docs/superpowers/
    ├── plans/                               # Implementation plans
    └── specs/                               # Design documents
```

### Adding a new channel (Discord, Feishu, Slack, etc.)

1. Create `server/src/channels/<name>/{bot.ts,schema.ts}`
2. Import the new schema into `services/config-file.ts` and add to `configSchema`
3. Read `config.<name>` in `index.ts` and instantiate the bot if present
4. Reuse `channels/formatter.ts` for SDK event formatting

## API (used by web client)

### WebSocket — `/ws/chat`

Client sends:
```json
{ "type": "new_session", "sessionName": "my-project" }
{ "type": "message", "sessionName": "my-project", "content": "..." }
{ "type": "abort", "sessionName": "my-project" }
```

Server sends:
```json
{ "type": "session_start", "sessionName": "my-project" }
{ "type": "sdk_event", "sessionName": "my-project", "event": { ... } }
{ "type": "done", "sessionName": "my-project" }
{ "type": "error", "sessionName": "my-project", "message": "..." }
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

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Server bind address |

Web sessions are stored in `~/.remoteclaude/cwd/{sessionName}/`. Telegram uses the `cwd` from `config.json` directly. Claude journal files (JSONL) are read from `~/.claude/projects/`.

## Tech Stack

- **Server:** Fastify, TypeScript, Claude Agent SDK, `grammy` (Telegram), `zod`
- **Web:** Vue 3 (Composition API), Vite, TypeScript, markdown-it, Shiki
- **Monorepo:** npm workspaces (`server/`, `web/`)

## License

MIT
