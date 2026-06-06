# Telegram Client Design

## Goal

Add a Telegram bot as an alternative client to the RemoteClaude server, so users can interact with Claude from any mobile device without building a native app.

## Non-Goals

- Multi-user support (single owner only, identified by `user_id` whitelist)
- Multi-session UI (one global session shared across all Telegram interactions)
- Tool result display (only tool invocations are pushed, matching web client behavior)
- Webhook deployment (long polling only — no public HTTPS required)
- Rich UI (no inline keyboards, no buttons; pure text + commands)

## Architecture

```
                                      ┌──▶ Browser (Vue 3)
Telegram ──long poll──▶ Fastify ──SDK ┤
                                      └──▶ Telegram Bot
                                              ▲
                                      session storage shared
                                      (~/.remoteclaude/cwd/telegram/)
```

The Telegram bot is a Fastify plugin that runs alongside the existing WebSocket and REST routes. It reuses `SessionManager` and `agent-query.ts` — only the input/output transport differs.

## Config

New file: `server/config.json` (optional — server starts without Telegram if absent).

```json
{
  "telegram": {
    "botToken": "1234567890:AAAA...",
    "allowedUserId": 12345678,
    "sessionName": "telegram",
    "cwd": "/path/to/project"
  }
}
```

| Field | Required | Default | Description |
|---|---|---|---|
| `botToken` | yes | — | Token from @BotFather |
| `allowedUserId` | yes | — | Single Telegram numeric user_id; messages from others are silently dropped |
| `sessionName` | no | `"telegram"` | Session name used in `~/.remoteclaude/cwd/{name}` |
| `cwd` | no | session default | Override working directory for this session |

Config file is gitignored (contains secrets). A `server/config.example.json` is committed as template.

## Commands

| Command | Behavior |
|---|---|
| `/start` | Greeting + show /help |
| `/help` | List available commands |
| `/status` | Show whether Claude is currently running, session name, last activity timestamp |
| `/abort` | Abort the current running query (no-op if idle) |
| `/reset` | Reset session context (deletes the session directory and recreates it) |
| `<any text>` | Send as prompt to Claude |

If a query is already running and a new text message arrives, reply with `"Claude is busy. /abort to cancel, or wait for completion."` and ignore it.

## Streaming Strategy

Each significant event becomes a **new Telegram message** (not edits). The 1 msg/sec rate limit applies per-chat, so we buffer events through a queue:

- **Text from Claude:** sent as a new message. If text exceeds 4096 chars, split at paragraph boundaries.
- **Tool invocation:** sent as `⚒ {ToolName}: {short summary}` — e.g. `⚒ Read: server/src/index.ts`. Summary is built per-tool (Read shows file_path, Bash shows command, etc.).
- **Tool result:** not sent (matches web client behavior).
- **Query done:** if no text was sent (only tools), reply with `✓ Done.`
- **Error:** sent as `❌ Error: {message}`.

Buffer rule: at most 1 outbound message per second per chat. If multiple events queue up, batch consecutive tool invocations into one message (`⚒ Read: a.ts\n⚒ Read: b.ts`).

## Sub-Implementation

New module: `server/src/services/telegram-bot.ts`

- Uses [`grammy`](https://grammy.dev/) library (lightweight, TypeScript-native)
- Started from `server/src/index.ts` if config has `telegram` section
- Reads `server/config.json` at startup; logs warning and skips if missing
- Wires into existing `SessionManager` and `agent-query.ts`
- Internal message queue + 1s/msg pacing
- Graceful shutdown on SIGINT/SIGTERM (stops polling, drains queue)

No changes required to existing web routes — the bot is purely additive.

## Verification

1. Start server with valid `config.json` containing telegram section → log shows `"Telegram bot started, polling for updates"`
2. Send `/start` from authorized account → receive greeting
3. Send `/start` from unauthorized account → no response
4. Send `"list files in cwd"` → receive tool invocation message(s) + final text response
5. Send long prompt that triggers many tools → messages arrive at most 1/sec, no rate-limit errors
6. While query is running, send `/abort` → query stops, receive `"Aborted."`
7. Send `/reset` → session directory recreated, next prompt starts fresh
8. Start server without `config.json` → no error, Telegram simply not started
