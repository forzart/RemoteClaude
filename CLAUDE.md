# CLAUDE.md

Project-specific instructions for Claude when working in this codebase.

## Project Overview

RemoteClaude — a web-based interface for Claude Code, powered by the Claude Agent SDK. Vue 3 web client + Fastify server with WebSocket streaming.

## Tech Stack

- **Server:** TypeScript, Fastify, `@anthropic-ai/claude-agent-sdk`, WebSocket
- **Web:** Vue 3 (Composition API), Vite, TypeScript, markdown-it, Shiki
- **Channels:** Telegram (grammy), extensible to Discord/Feishu/etc.
- **Monorepo:** npm workspaces (`server/`, `web/`)
- **Node:** >= 18

## Project Structure

```
RemoteClaude/
├── server/                              # Fastify backend
│   ├── src/
│   │   ├── index.ts                     # Entry point, registers routes + channels
│   │   ├── routes/
│   │   │   ├── ws.ts                    # WebSocket /ws/chat
│   │   │   ├── sessions.ts              # REST: list/history/delete sessions
│   │   │   └── config.ts                # REST: /api/config/mcp|skills|overview
│   │   ├── services/
│   │   │   ├── agent-query.ts           # Claude Agent SDK integration
│   │   │   ├── session-manager.ts       # Active session + AbortController tracking
│   │   │   ├── config-cache.ts          # Cached config from SDK probe
│   │   │   └── config-file.ts           # Loads server/config.json (zod-validated)
│   │   ├── channels/                    # Non-web clients (mobile/IM)
│   │   │   ├── formatter.ts             # Shared: SDK event → plain text chunks
│   │   │   └── telegram/
│   │   │       ├── bot.ts               # grammy bot, commands, rate-limited queue
│   │   │       └── schema.ts            # Telegram-specific zod config schema
│   │   └── types/
│   │       └── events.ts                # WebSocket protocol types
│   ├── config.example.json              # Config template (commit)
│   └── config.json                      # Actual config (gitignored)
│
├── web/                                 # Vue 3 + Vite frontend
│   └── src/
│       ├── App.vue                      # Root layout, WebSocket lifecycle
│       ├── components/
│       │   ├── ChatView.vue             # Messages + slash command interception
│       │   ├── InputBar.vue             # Text input + config buttons
│       │   ├── SessionSidebar.vue       # Session list
│       │   ├── MessageBubble.vue        # Message rendering
│       │   ├── CodeBlock.vue            # Syntax-highlighted code (Shiki)
│       │   ├── ToolCallCard.vue         # Tool input/output card
│       │   └── ConfigPanel.vue          # MCP / Skills / Config tabs
│       ├── composables/
│       │   ├── useWebSocket.ts          # Auto-reconnect WebSocket
│       │   ├── useChat.ts               # Message state + streaming
│       │   └── useSessions.ts           # Session CRUD via REST
│       └── types/
│           └── messages.ts              # Protocol + display types
│
└── docs/superpowers/
    ├── plans/                           # Implementation plans
    └── specs/                           # Design documents
```

### Adding a new channel (Discord, Feishu, Slack, etc.)

1. Create `server/src/channels/<name>/{bot.ts,schema.ts}`
2. Import the new schema into `services/config-file.ts` and add to `configSchema`
3. Read `config.<name>` in `index.ts` and instantiate the bot if present
4. Reuse `channels/formatter.ts` for SDK event formatting (channel-specific message splitting may go alongside)

## Development Rules

**ALWAYS follow these rules when writing code:**

- **TypeScript code style:** `~/.claude/rules/everything-claude-code/typescript/coding-style.md`
- **TypeScript testing:** `~/.claude/rules/everything-claude-code/typescript/testing.md`
- **TypeScript security:** `~/.claude/rules/everything-claude-code/typescript/security.md`
- **TypeScript patterns:** `~/.claude/rules/everything-claude-code/typescript/patterns.md`
- **Common coding style:** `~/.claude/rules/everything-claude-code/common/coding-style.md`
- **Common security:** `~/.claude/rules/everything-claude-code/common/security.md`
- **Common testing:** `~/.claude/rules/everything-claude-code/common/testing.md`
- **Code review:** `~/.claude/rules/everything-claude-code/common/code-review.md`
- **Git workflow:** `~/.claude/rules/everything-claude-code/common/git-workflow.md`

Apply these rules **proactively** — do not wait for user correction. Both `server/` and `web/` are TypeScript projects.

## Common Commands

```bash
npm install         # install all workspace deps
npm run build       # build server + web
npm start           # start server (serves API + web/dist on :3000)
npm run dev:server  # server hot reload (:3000)
npm run dev:web     # Vite dev server (:5173, proxies to :3000)
```

Tests: `cd server && npx vitest run`

Type check: `cd server && npx tsc --noEmit` / `cd web && npx vue-tsc --noEmit`

## Architecture

```
Browser (Vue 3)  ──WebSocket──▶  Fastify Server  ──SDK──▶  Claude Code CLI subprocess
     :5173                           :3000
```

- Sessions stored in `~/.remoteclaude/cwd/{sessionName}/`
- Conversation history read from Claude journal files at `~/.claude/projects/<projectKey>/<sessionId>.jsonl`
- Config (MCP servers, skills, models) cached at startup via probe query

## Key Behaviors to Know

- **Session history (`routes/sessions.ts`)** — reads JSONL via **parentUuid chain traversal**, crosses compact boundary via `logicalParentUuid`. Don't switch back to sequential scanning; it would break sidechain filtering and compact-crossing.
- **Tool result rendering** — both web and Telegram show tool invocation only (e.g. `⚒ Read: file.ts`), never the tool result body. This is intentional; results are noisy on review and the assistant's next text already summarizes them.
- **Slash command interception** — `web/src/components/ChatView.vue` intercepts `/mcp`, `/skills`, `/config` client-side. The Agent SDK doesn't support interactive slash commands in headless mode, so we serve the data from `/api/config/*` instead.
- **`useChat.ts`** merges `tool_result` blocks back into the matching `tool_use` block by `toolUseId` so they render as one collapsible card.

## Important Constraints

- **Agent SDK runs Claude Code as a subprocess.** Users must have `@anthropic-ai/claude-code` installed globally and authenticated (`claude login`).
- **Permission mode is `bypassPermissions`** — server executes all tool operations without prompting. Only suitable for local/trusted networks.
- **Slash commands** — most interactive commands (`/mcp`, `/skills`, `/model`, etc.) don't work via the SDK in headless mode. We intercept them client-side and show data from `/api/config/*` instead.

## Plans & Specs

Project planning documents live in `docs/superpowers/plans/` and `docs/superpowers/specs/`. Reference these when continuing existing feature work.
