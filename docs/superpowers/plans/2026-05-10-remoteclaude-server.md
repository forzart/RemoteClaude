# RemoteClaude Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node.js + TypeScript backend server that exposes Claude Code's full capabilities (tools, agent loop, system prompt, sessions) over WebSocket and REST, powered by the Claude Agent SDK.

**Architecture:** Fastify HTTP server with `@fastify/websocket` for bidirectional streaming. Each WebSocket message triggers a `query()` call via `@anthropic-ai/claude-agent-sdk`, streaming `SDKMessage` events back to the client. Session state is managed entirely by the Agent SDK's built-in disk persistence; the server tracks active queries and `AbortController` instances in memory.

**Tech Stack:** TypeScript, Node.js 18+, Fastify, @fastify/websocket, @anthropic-ai/claude-agent-sdk (0.2.x)

---

## File Structure

```
server/
├── package.json                    # Dependencies and scripts
├── tsconfig.json                   # TypeScript configuration
├── src/
│   ├── index.ts                    # Entry point: Fastify server setup, route registration, startup
│   ├── routes/
│   │   ├── ws.ts                   # WebSocket endpoint /ws/chat — parse client messages, dispatch to agent-query
│   │   └── sessions.ts            # REST endpoints: POST/GET/DELETE /api/sessions
│   ├── services/
│   │   ├── agent-query.ts          # Wraps Agent SDK query() — creates Query, streams SDKMessage
│   │   └── session-manager.ts     # Tracks active queries per session, AbortController lifecycle
│   └── types/
│       └── events.ts              # Client↔Server WebSocket message type definitions
```

Each file has one clear responsibility:
- **`events.ts`** — shared type definitions for all WebSocket messages (client→server and server→client)
- **`session-manager.ts`** — in-memory registry of active sessions and their AbortControllers
- **`agent-query.ts`** — thin wrapper around the Agent SDK `query()` call, converts SDK events to WebSocket messages
- **`ws.ts`** — WebSocket connection handler, parses incoming messages, dispatches to agent-query, forwards events
- **`sessions.ts`** — REST API for listing/deleting sessions via Agent SDK's `listSessions`/`deleteSession`
- **`index.ts`** — server bootstrap, registers routes, starts listening

---

### Task 1: Project Scaffolding

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "remoteclaude-server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Install dependencies**

```bash
cd server
npm install fastify @fastify/websocket @anthropic-ai/claude-agent-sdk
npm install -D typescript tsx @types/node
```

- [ ] **Step 4: Create src directory structure**

```bash
mkdir -p src/routes src/services src/types
```

- [ ] **Step 5: Verify project compiles**

Create a minimal `src/index.ts`:

```typescript
console.log('RemoteClaude server starting...');
```

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add server/
git commit -m "chore: scaffold RemoteClaude server project"
```

---

### Task 2: WebSocket Message Type Definitions

**Files:**
- Create: `server/src/types/events.ts`

- [ ] **Step 1: Write the type definitions**

```typescript
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';

// --- Client → Server messages ---

export type ClientMessage =
  | NewSessionMessage
  | ChatMessage
  | AbortMessage;

export interface NewSessionMessage {
  type: 'new_session';
  cwd: string;
}

export interface ChatMessage {
  type: 'message';
  sessionId: string;
  content: string;
}

export interface AbortMessage {
  type: 'abort';
  sessionId: string;
}

// --- Server → Client messages ---

export type ServerMessage =
  | SessionStartMessage
  | SDKEventMessage
  | DoneMessage
  | ErrorMessage;

export interface SessionStartMessage {
  type: 'session_start';
  sessionId: string;
}

export interface SDKEventMessage {
  type: 'sdk_event';
  sessionId: string;
  event: SDKMessage;
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

export function parseClientMessage(raw: string): ClientMessage {
  const data = JSON.parse(raw);
  if (!data || typeof data !== 'object' || !('type' in data)) {
    throw new Error('Invalid message: missing type field');
  }
  switch (data.type) {
    case 'new_session':
      if (typeof data.cwd !== 'string' || data.cwd.length === 0) {
        throw new Error('new_session: cwd must be a non-empty string');
      }
      return data as NewSessionMessage;
    case 'message':
      if (typeof data.sessionId !== 'string' || typeof data.content !== 'string') {
        throw new Error('message: sessionId and content are required strings');
      }
      return data as ChatMessage;
    case 'abort':
      if (typeof data.sessionId !== 'string') {
        throw new Error('abort: sessionId is required');
      }
      return data as AbortMessage;
    default:
      throw new Error(`Unknown message type: ${data.type}`);
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add server/src/types/events.ts
git commit -m "feat: add WebSocket message type definitions"
```

---

### Task 3: Session Manager

**Files:**
- Create: `server/src/services/session-manager.ts`
- Test: `server/src/services/session-manager.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from './session-manager.js';

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager();
  });

  it('registers a session with an AbortController', () => {
    const controller = new AbortController();
    manager.register('session-1', controller);
    expect(manager.isActive('session-1')).toBe(true);
  });

  it('returns false for unknown sessions', () => {
    expect(manager.isActive('unknown')).toBe(false);
  });

  it('aborts and removes a session', () => {
    const controller = new AbortController();
    manager.register('session-1', controller);
    manager.abort('session-1');
    expect(controller.signal.aborted).toBe(true);
    expect(manager.isActive('session-1')).toBe(false);
  });

  it('unregisters a session without aborting', () => {
    const controller = new AbortController();
    manager.register('session-1', controller);
    manager.unregister('session-1');
    expect(controller.signal.aborted).toBe(false);
    expect(manager.isActive('session-1')).toBe(false);
  });

  it('abort is a no-op for unknown sessions', () => {
    expect(() => manager.abort('unknown')).not.toThrow();
  });

  it('aborts all active sessions', () => {
    const c1 = new AbortController();
    const c2 = new AbortController();
    manager.register('s1', c1);
    manager.register('s2', c2);
    manager.abortAll();
    expect(c1.signal.aborted).toBe(true);
    expect(c2.signal.aborted).toBe(true);
    expect(manager.isActive('s1')).toBe(false);
    expect(manager.isActive('s2')).toBe(false);
  });
});
```

- [ ] **Step 2: Install vitest and run test to verify it fails**

```bash
cd server
npm install -D vitest
npx vitest run src/services/session-manager.test.ts
```

Expected: FAIL — cannot find `./session-manager.js`

- [ ] **Step 3: Write the implementation**

```typescript
export class SessionManager {
  private active = new Map<string, AbortController>();

  register(sessionId: string, controller: AbortController): void {
    const existing = this.active.get(sessionId);
    if (existing) {
      existing.abort();
    }
    this.active.set(sessionId, controller);
  }

  isActive(sessionId: string): boolean {
    return this.active.has(sessionId);
  }

  abort(sessionId: string): void {
    const controller = this.active.get(sessionId);
    if (controller) {
      controller.abort();
      this.active.delete(sessionId);
    }
  }

  unregister(sessionId: string): void {
    this.active.delete(sessionId);
  }

  abortAll(): void {
    for (const [id, controller] of this.active) {
      controller.abort();
    }
    this.active.clear();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/services/session-manager.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/services/session-manager.ts server/src/services/session-manager.test.ts
git commit -m "feat: add SessionManager for tracking active queries"
```

---

### Task 4: Agent Query Service

**Files:**
- Create: `server/src/services/agent-query.ts`

This file wraps the Agent SDK `query()` function. It creates a new session or resumes an existing one, then yields `SDKMessage` events.

- [ ] **Step 1: Write the implementation**

```typescript
import { query, type SDKMessage, type Query } from '@anthropic-ai/claude-agent-sdk';
import { randomUUID } from 'crypto';

export interface NewSessionParams {
  prompt: string;
  cwd: string;
  abortController: AbortController;
}

export interface ResumeSessionParams {
  prompt: string;
  sessionId: string;
  abortController: AbortController;
}

export interface QueryHandle {
  sessionId: string;
  generator: Query;
}

export function startNewSession(params: NewSessionParams): QueryHandle {
  const sessionId = randomUUID();
  const generator = query({
    prompt: params.prompt,
    options: {
      cwd: params.cwd,
      sessionId,
      tools: { type: 'preset', preset: 'claude_code' },
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      abortController: params.abortController,
      includePartialMessages: true,
    },
  });
  return { sessionId, generator };
}

export function resumeSession(params: ResumeSessionParams): QueryHandle {
  const generator = query({
    prompt: params.prompt,
    options: {
      resume: params.sessionId,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      abortController: params.abortController,
      includePartialMessages: true,
    },
  });
  return { sessionId: params.sessionId, generator };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add server/src/services/agent-query.ts
git commit -m "feat: add agent-query service wrapping Claude Agent SDK"
```

---

### Task 5: WebSocket Route Handler

**Files:**
- Create: `server/src/routes/ws.ts`

This is the core handler: it receives WebSocket messages, dispatches to agent-query, and streams SDK events back.

- [ ] **Step 1: Write the implementation**

```typescript
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import { parseClientMessage, type ServerMessage } from '../types/events.js';
import { startNewSession, resumeSession } from '../services/agent-query.js';
import { SessionManager } from '../services/session-manager.js';

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function registerWsRoute(app: FastifyInstance, sessionManager: SessionManager): void {
  app.get('/ws/chat', { websocket: true }, (socket) => {
    socket.on('message', (raw) => {
      void handleMessage(socket, raw.toString(), sessionManager);
    });

    socket.on('close', () => {
      // Client disconnected — abort is handled per-session, not per-connection
      // The session manager holds AbortControllers keyed by sessionId
    });
  });
}

async function handleMessage(
  ws: WebSocket,
  raw: string,
  sessionManager: SessionManager,
): Promise<void> {
  let msg;
  try {
    msg = parseClientMessage(raw);
  } catch (err) {
    send(ws, {
      type: 'error',
      message: err instanceof Error ? err.message : 'Invalid message',
    });
    return;
  }

  switch (msg.type) {
    case 'new_session':
      await handleNewSession(ws, msg.cwd, sessionManager);
      break;
    case 'message':
      await handleChatMessage(ws, msg.sessionId, msg.content, sessionManager);
      break;
    case 'abort':
      sessionManager.abort(msg.sessionId);
      break;
  }
}

async function handleNewSession(
  ws: WebSocket,
  cwd: string,
  sessionManager: SessionManager,
): Promise<void> {
  const abortController = new AbortController();

  let handle;
  try {
    handle = startNewSession({
      prompt: '',
      cwd,
      abortController,
    });
  } catch (err) {
    send(ws, {
      type: 'error',
      message: err instanceof Error ? err.message : 'Failed to create session',
    });
    return;
  }

  const { sessionId, generator } = handle;
  sessionManager.register(sessionId, abortController);

  send(ws, { type: 'session_start', sessionId });

  await streamEvents(ws, sessionId, generator, sessionManager);
}

async function handleChatMessage(
  ws: WebSocket,
  sessionId: string,
  content: string,
  sessionManager: SessionManager,
): Promise<void> {
  if (sessionManager.isActive(sessionId)) {
    send(ws, {
      type: 'error',
      sessionId,
      message: 'A query is already running for this session. Send abort first.',
    });
    return;
  }

  const abortController = new AbortController();
  sessionManager.register(sessionId, abortController);

  const { generator } = resumeSession({
    prompt: content,
    sessionId,
    abortController,
  });

  await streamEvents(ws, sessionId, generator, sessionManager);
}

async function streamEvents(
  ws: WebSocket,
  sessionId: string,
  generator: AsyncGenerator<import('@anthropic-ai/claude-agent-sdk').SDKMessage, void>,
  sessionManager: SessionManager,
): Promise<void> {
  try {
    for await (const event of generator) {
      send(ws, { type: 'sdk_event', sessionId, event });
    }
    send(ws, { type: 'done', sessionId });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      send(ws, { type: 'done', sessionId });
    } else {
      send(ws, {
        type: 'error',
        sessionId,
        message: err instanceof Error ? err.message : 'Query failed',
      });
    }
  } finally {
    sessionManager.unregister(sessionId);
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/ws.ts
git commit -m "feat: add WebSocket route handler for chat streaming"
```

---

### Task 6: REST Session Routes

**Files:**
- Create: `server/src/routes/sessions.ts`

REST endpoints for listing and deleting sessions, using the Agent SDK's built-in `listSessions` and `deleteSession` functions.

- [ ] **Step 1: Write the implementation**

```typescript
import type { FastifyInstance } from 'fastify';
import { listSessions, deleteSession } from '@anthropic-ai/claude-agent-sdk';

export function registerSessionRoutes(app: FastifyInstance): void {
  app.get('/api/sessions', async (_request, reply) => {
    const sessions = await listSessions();
    return reply.send(sessions);
  });

  app.delete<{ Params: { id: string } }>(
    '/api/sessions/:id',
    async (request, reply) => {
      const { id } = request.params;
      try {
        await deleteSession(id);
        return reply.code(204).send();
      } catch (err) {
        return reply.code(404).send({
          error: err instanceof Error ? err.message : 'Session not found',
        });
      }
    },
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/sessions.ts
git commit -m "feat: add REST endpoints for session list and delete"
```

---

### Task 7: Server Entry Point

**Files:**
- Create: `server/src/index.ts`

Wires everything together: Fastify instance, WebSocket plugin, route registration, graceful shutdown.

- [ ] **Step 1: Write the implementation**

```typescript
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { registerWsRoute } from './routes/ws.js';
import { registerSessionRoutes } from './routes/sessions.js';
import { SessionManager } from './services/session-manager.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function main(): Promise<void> {
  const app = Fastify({ logger: true });
  const sessionManager = new SessionManager();

  await app.register(websocket);

  registerWsRoute(app, sessionManager);
  registerSessionRoutes(app);

  app.get('/health', async () => ({ status: 'ok' }));

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

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add server/src/index.ts
git commit -m "feat: add server entry point with Fastify setup and graceful shutdown"
```

---

### Task 8: Build and Smoke Test

**Files:**
- Modify: `server/package.json` (add vitest config if needed)

- [ ] **Step 1: Run the full test suite**

```bash
cd server
npx vitest run
```

Expected: All tests pass (SessionManager tests from Task 3)

- [ ] **Step 2: Build the project**

```bash
cd server
npm run build
```

Expected: TypeScript compiles without errors, output in `dist/`

- [ ] **Step 3: Smoke test the server**

Start the server:
```bash
cd server
npm run dev
```

In another terminal, test the health endpoint:
```bash
curl http://localhost:3000/health
```

Expected: `{"status":"ok"}`

Test the sessions endpoint:
```bash
curl http://localhost:3000/api/sessions
```

Expected: `[]` (empty array, or existing sessions if Agent SDK has prior data)

- [ ] **Step 4: Commit final state**

```bash
git add -A server/
git commit -m "chore: verify build and smoke test pass"
```

---

### Task 9: WebSocket Integration Test

**Files:**
- Create: `server/src/routes/ws.test.ts`

End-to-end test using Fastify's injection + a real WebSocket connection.

- [ ] **Step 1: Install ws for test client**

```bash
cd server
npm install -D ws @types/ws
```

- [ ] **Step 2: Write the integration test**

This test verifies the WebSocket protocol by connecting to the server and sending messages. Since the Agent SDK requires an actual API key to run `query()`, this test focuses on protocol validation — message parsing, error handling, and the abort flow.

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import WebSocket from 'ws';
import { registerWsRoute } from './ws.js';
import { SessionManager } from '../services/session-manager.js';

describe('WebSocket /ws/chat', () => {
  let app: FastifyInstance;
  let address: string;

  beforeAll(async () => {
    app = Fastify();
    const sessionManager = new SessionManager();
    await app.register(websocket);
    registerWsRoute(app, sessionManager);
    address = await app.listen({ port: 0, host: '127.0.0.1' });
  });

  afterAll(async () => {
    await app.close();
  });

  function connectWs(): Promise<WebSocket> {
    const wsUrl = address.replace('http', 'ws') + '/ws/chat';
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      ws.on('open', () => resolve(ws));
      ws.on('error', reject);
    });
  }

  function receiveMessage(ws: WebSocket): Promise<Record<string, unknown>> {
    return new Promise((resolve) => {
      ws.once('message', (data) => {
        resolve(JSON.parse(data.toString()));
      });
    });
  }

  it('returns error for invalid JSON', async () => {
    const ws = await connectWs();
    ws.send('not json');
    const response = await receiveMessage(ws);
    expect(response.type).toBe('error');
    ws.close();
  });

  it('returns error for unknown message type', async () => {
    const ws = await connectWs();
    ws.send(JSON.stringify({ type: 'unknown' }));
    const response = await receiveMessage(ws);
    expect(response.type).toBe('error');
    expect(response.message).toContain('Unknown message type');
    ws.close();
  });

  it('returns error for new_session without cwd', async () => {
    const ws = await connectWs();
    ws.send(JSON.stringify({ type: 'new_session' }));
    const response = await receiveMessage(ws);
    expect(response.type).toBe('error');
    expect(response.message).toContain('cwd');
    ws.close();
  });

  it('returns error for message without sessionId', async () => {
    const ws = await connectWs();
    ws.send(JSON.stringify({ type: 'message', content: 'hello' }));
    const response = await receiveMessage(ws);
    expect(response.type).toBe('error');
    expect(response.message).toContain('sessionId');
    ws.close();
  });
});
```

- [ ] **Step 3: Run the integration test**

Run: `npx vitest run src/routes/ws.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/ws.test.ts server/package.json
git commit -m "test: add WebSocket protocol integration tests"
```

---

### Task 10: Handle new_session with Initial Prompt

**Files:**
- Modify: `server/src/types/events.ts`
- Modify: `server/src/routes/ws.ts`

The current `new_session` message creates a session but sends an empty prompt. The client should be able to send an initial prompt with the session creation request.

- [ ] **Step 1: Update NewSessionMessage type**

In `server/src/types/events.ts`, update the interface:

```typescript
export interface NewSessionMessage {
  type: 'new_session';
  cwd: string;
  content?: string;
}
```

- [ ] **Step 2: Update parseClientMessage for new_session**

In `server/src/types/events.ts`, the `new_session` case remains the same (cwd validation), since `content` is optional.

- [ ] **Step 3: Update handleNewSession in ws.ts**

In `server/src/routes/ws.ts`, update the `handleNewSession` function to pass `content` to the query:

Change the call from:
```typescript
handle = startNewSession({
  prompt: '',
  cwd,
  abortController,
});
```

To accept and forward the content:
```typescript
async function handleNewSession(
  ws: WebSocket,
  cwd: string,
  content: string | undefined,
  sessionManager: SessionManager,
): Promise<void> {
```

And update the dispatch in `handleMessage`:
```typescript
case 'new_session':
  await handleNewSession(ws, msg.cwd, msg.content, sessionManager);
  break;
```

And the `startNewSession` call:
```typescript
handle = startNewSession({
  prompt: content || '',
  cwd,
  abortController,
});
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add server/src/types/events.ts server/src/routes/ws.ts
git commit -m "feat: support initial prompt in new_session message"
```
