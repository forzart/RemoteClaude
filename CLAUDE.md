# CLAUDE.md

Project-specific instructions for Claude when working in this codebase.

## Project Overview

RemoteClaude — a web-based interface for Claude Code, powered by the Claude Agent SDK. Vue 3 web client + Fastify server with WebSocket streaming.

## Tech Stack

- **Server:** TypeScript, Fastify, `@anthropic-ai/claude-agent-sdk`, WebSocket
- **Web:** Vue 3 (Composition API), Vite, TypeScript, markdown-it, Shiki
- **Monorepo:** npm workspaces (`server/`, `web/`)
- **Node:** >= 18

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

## Key Modules

**Server:**
- `server/src/routes/ws.ts` — WebSocket `/ws/chat`, message protocol
- `server/src/routes/sessions.ts` — REST: list/history/delete; reads JSONL with **parentUuid chain traversal**, crosses compact boundary via `logicalParentUuid`
- `server/src/routes/config.ts` — REST: `/api/config/mcp|skills|overview`
- `server/src/services/agent-query.ts` — SDK `query()` integration, session lifecycle
- `server/src/services/session-manager.ts` — Active session + AbortController tracking
- `server/src/services/config-cache.ts` — Cached config from SDK init probe

**Web:**
- `web/src/composables/useWebSocket.ts` — auto-reconnect WebSocket
- `web/src/composables/useChat.ts` — message state + streaming, merges `tool_result` back into matching `tool_use` blocks
- `web/src/composables/useSessions.ts` — session CRUD via REST
- `web/src/components/ChatView.vue` — intercepts `/mcp`, `/skills`, `/config` slash commands (Agent SDK doesn't support interactive slash commands in headless mode)
- `web/src/components/ToolCallCard.vue` — collapsible tool input/output card

## Important Constraints

- **Agent SDK runs Claude Code as a subprocess.** Users must have `@anthropic-ai/claude-code` installed globally and authenticated (`claude login`).
- **Permission mode is `bypassPermissions`** — server executes all tool operations without prompting. Only suitable for local/trusted networks.
- **Slash commands** — most interactive commands (`/mcp`, `/skills`, `/model`, etc.) don't work via the SDK in headless mode. We intercept them client-side and show data from `/api/config/*` instead.

## Plans & Specs

Project planning documents live in `docs/superpowers/plans/` and `docs/superpowers/specs/`. Reference these when continuing existing feature work.
