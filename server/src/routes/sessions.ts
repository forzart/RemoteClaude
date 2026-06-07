import type { FastifyInstance } from 'fastify';
import { readdirSync, statSync, rmSync, readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';
import { SESSIONS_ROOT, sessionCwd } from '../services/session-paths.js';
import { listSessions } from '@anthropic-ai/claude-agent-sdk';
import { globSync } from 'glob';

interface SessionEntry {
  sessionName: string;
  createdAt: number;
}

interface HistoryMessage {
  type: 'user' | 'assistant';
  message: unknown;
}

function listRemoteSessions(): SessionEntry[] {
  try {
    const entries = readdirSync(SESSIONS_ROOT, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory())
      .map(e => {
        const dirPath = resolve(SESSIONS_ROOT, e.name);
        const stat = statSync(dirPath);
        return { sessionName: e.name, createdAt: stat.birthtimeMs };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

function findJsonlPath(sessionId: string): string | undefined {
  const projectsDir = resolve(homedir(), '.claude', 'projects');
  if (!existsSync(projectsDir)) return undefined;
  const matches = globSync(`*/${sessionId}.jsonl`, { cwd: projectsDir });
  if (matches.length === 0) return undefined;
  return resolve(projectsDir, matches[0]);
}

interface JournalEntry {
  uuid: string;
  parentUuid?: string | null;
  logicalParentUuid?: string;
  type: string;
  subtype?: string;
  isSidechain?: boolean;
  isMeta?: boolean;
  message?: Record<string, unknown>;
}

interface ContentBlock {
  type: string;
  text: string;
}

function extractUserText(content: unknown): string | undefined {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const textBlock = (content as ContentBlock[]).find(b => b.type === 'text');
    return textBlock?.text;
  }
  return undefined;
}

const COMPACTION_ARTIFACT_PREFIXES = [
  '<command-name>',
  '<local-command-stdout>',
  '<local-command-caveat>',
  'Continue from where you left off',
  'This session is being continued from a previous conversation',
];

function isCompactionArtifact(text: string): boolean {
  return COMPACTION_ARTIFACT_PREFIXES.some(p => text.startsWith(p));
}

function parseJournal(jsonlPath: string): Map<string, JournalEntry> {
  const lines = readFileSync(jsonlPath, 'utf-8').split('\n').filter(Boolean);
  const byUuid = new Map<string, JournalEntry>();

  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as JournalEntry;
      if (!entry.uuid) continue;
      const { type } = entry;
      const chainTypes = ['user', 'assistant', 'system', 'attachment', 'progress'];
      if (!chainTypes.includes(type)) continue;
      byUuid.set(entry.uuid, entry);
    } catch {
      // skip unparseable
    }
  }

  return byUuid;
}

function findChainHead(byUuid: Map<string, JournalEntry>): JournalEntry | undefined {
  const referenced = new Set<string>();
  for (const e of byUuid.values()) {
    if (e.parentUuid) referenced.add(e.parentUuid);
  }

  const leaves = [...byUuid.values()].filter(e => !referenced.has(e.uuid));

  const candidates: JournalEntry[] = [];
  for (const leaf of leaves) {
    let cur: JournalEntry | undefined = leaf;
    const seen = new Set<string>();
    while (cur) {
      if (seen.has(cur.uuid)) break;
      seen.add(cur.uuid);
      if (cur.type === 'user' || cur.type === 'assistant') {
        candidates.push(cur);
        break;
      }
      cur = cur.parentUuid ? byUuid.get(cur.parentUuid) : undefined;
    }
  }

  if (candidates.length === 0) return undefined;

  const mainCandidates = candidates.filter(c => !c.isSidechain && !c.isMeta);
  const pool = mainCandidates.length > 0 ? mainCandidates : candidates;

  const fileOrder = new Map<string, number>();
  let idx = 0;
  for (const uuid of byUuid.keys()) fileOrder.set(uuid, idx++);

  return pool.reduce((best, c) =>
    (fileOrder.get(c.uuid) ?? -1) > (fileOrder.get(best.uuid) ?? -1) ? c : best,
  );
}

function walkChain(head: JournalEntry, byUuid: Map<string, JournalEntry>): JournalEntry[] {
  const chain: JournalEntry[] = [];
  const visited = new Set<string>();
  let cur: JournalEntry | undefined = head;

  while (cur) {
    if (visited.has(cur.uuid)) break;
    visited.add(cur.uuid);
    chain.push(cur);

    if (cur.parentUuid) {
      cur = byUuid.get(cur.parentUuid);
    } else if (
      cur.type === 'system' &&
      cur.subtype === 'compact_boundary' &&
      cur.logicalParentUuid
    ) {
      cur = byUuid.get(cur.logicalParentUuid);
    } else {
      break;
    }
  }

  chain.reverse();
  return chain;
}

function readFullHistory(sessionId: string): HistoryMessage[] {
  const jsonlPath = findJsonlPath(sessionId);
  if (!jsonlPath) return [];

  const byUuid = parseJournal(jsonlPath);
  const head = findChainHead(byUuid);
  if (!head) return [];

  const chain = walkChain(head, byUuid);
  const messages: HistoryMessage[] = [];

  for (const entry of chain) {
    if (entry.type !== 'user' && entry.type !== 'assistant') continue;

    const msg = entry.message;
    if (!msg) continue;
    if (msg.model === '<synthetic>') continue;

    if (entry.type === 'user') {
      const text = extractUserText(msg.content);
      if (text !== undefined && isCompactionArtifact(text)) continue;
    }

    messages.push({ type: entry.type as 'user' | 'assistant', message: msg });
  }

  return messages;
}

export function registerSessionRoutes(app: FastifyInstance): void {
  app.get('/api/sessions', async (_request, reply) => {
    const sessions = listRemoteSessions();
    return reply.send(sessions);
  });

  app.get<{ Params: { name: string } }>(
    '/api/sessions/:name/history',
    async (request, reply) => {
      const { name } = request.params;
      const dir = sessionCwd(name);
      try {
        const sessions = await listSessions({ dir });
        if (sessions.length === 0) {
          return reply.send({ messages: [] });
        }
        const latest = sessions.sort((a, b) => b.lastModified - a.lastModified)[0];
        const messages = readFullHistory(latest.sessionId);
        return reply.send({ messages });
      } catch {
        return reply.send({ messages: [] });
      }
    },
  );

  app.delete<{ Params: { name: string } }>(
    '/api/sessions/:name',
    async (request, reply) => {
      const { name } = request.params;
      const dir = resolve(SESSIONS_ROOT, name);
      try {
        statSync(dir);
      } catch {
        return reply.code(404).send({ error: 'Session not found' });
      }
      rmSync(dir, { recursive: true, force: true });
      return reply.code(204).send();
    },
  );
}
