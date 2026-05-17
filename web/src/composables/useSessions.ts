import { ref, type Ref } from 'vue';
import type { SessionInfo, ServerMessage } from '../types/messages.js';
import type { UseWebSocketReturn } from './useWebSocket.js';

export interface HistoryMessage {
  type: 'user' | 'assistant';
  message: {
    role: string;
    content: Array<{
      type: string;
      text?: string;
      id?: string;
      name?: string;
      input?: Record<string, unknown>;
      tool_use_id?: string;
      content?: unknown;
      is_error?: boolean;
    }>;
  };
}

export interface SessionHistory {
  messages: HistoryMessage[];
}

export interface UseSessionsReturn {
  sessions: Ref<SessionInfo[]>;
  currentSessionName: Ref<string | null>;
  loadSessions: () => Promise<void>;
  loadHistory: (sessionName: string) => Promise<SessionHistory>;
  switchSession: (sessionName: string) => void;
  deleteSession: (sessionName: string) => Promise<void>;
}

export function useSessions(ws: UseWebSocketReturn): UseSessionsReturn {
  const sessions = ref<SessionInfo[]>([]);
  const currentSessionName = ref<string | null>(null);

  ws.onMessage((msg: ServerMessage) => {
    if (msg.type === 'session_start') {
      currentSessionName.value = msg.sessionName;
      void loadSessions();
    }
  });

  async function loadSessions(): Promise<void> {
    try {
      const response = await fetch('/api/sessions');
      if (response.ok) {
        const data = await response.json();
        sessions.value = (data as Array<{ sessionName: string; createdAt: number }>).map(s => ({
          sessionName: s.sessionName,
          createdAt: s.createdAt,
        }));
      }
    } catch {
      // sidebar will show empty list
    }
  }

  async function loadHistory(sessionName: string): Promise<SessionHistory> {
    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(sessionName)}/history`);
      if (response.ok) {
        return await response.json() as SessionHistory;
      }
    } catch {
      // fall through
    }
    return { messages: [] };
  }

  function switchSession(sessionName: string) {
    currentSessionName.value = sessionName;
  }

  async function deleteSession(sessionName: string): Promise<void> {
    try {
      await fetch(`/api/sessions/${encodeURIComponent(sessionName)}`, { method: 'DELETE' });
      sessions.value = sessions.value.filter(s => s.sessionName !== sessionName);
      if (currentSessionName.value === sessionName) {
        currentSessionName.value = null;
      }
    } catch {
      // silently fail
    }
  }

  return { sessions, currentSessionName, loadSessions, loadHistory, switchSession, deleteSession };
}
