import { ref, type Ref } from 'vue';
import type { SessionInfo, ServerMessage } from '../types/messages.js';
import type { UseWebSocketReturn } from './useWebSocket.js';

export interface UseSessionsReturn {
  sessions: Ref<SessionInfo[]>;
  currentSessionId: Ref<string | null>;
  loadSessions: () => Promise<void>;
  switchSession: (id: string) => void;
  deleteSession: (id: string) => Promise<void>;
  onSessionCreated: (handler: (sessionId: string) => void) => void;
}

export function useSessions(ws: UseWebSocketReturn): UseSessionsReturn {
  const sessions = ref<SessionInfo[]>([]);
  const currentSessionId = ref<string | null>(null);
  const sessionCreatedHandlers: Array<(sessionId: string) => void> = [];

  ws.onMessage((msg: ServerMessage) => {
    if (msg.type === 'session_start') {
      currentSessionId.value = msg.sessionId;
      for (const handler of sessionCreatedHandlers) {
        handler(msg.sessionId);
      }
      // Refresh session list after creation
      void loadSessions();
    }
  });

  async function loadSessions(): Promise<void> {
    try {
      const response = await fetch('/api/sessions');
      if (response.ok) {
        const data = await response.json();
        sessions.value = (data as Array<{ sessionId: string; summary: string; lastModified: number }>).map(s => ({
          sessionId: s.sessionId,
          summary: s.summary || 'Untitled',
          lastModified: s.lastModified,
        }));
      }
    } catch {
      // silently fail — sidebar will show empty list
    }
  }

  function switchSession(id: string) {
    currentSessionId.value = id;
  }

  async function deleteSession(id: string): Promise<void> {
    try {
      await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
      sessions.value = sessions.value.filter(s => s.sessionId !== id);
      if (currentSessionId.value === id) {
        currentSessionId.value = null;
      }
    } catch {
      // silently fail
    }
  }

  function onSessionCreated(handler: (sessionId: string) => void) {
    sessionCreatedHandlers.push(handler);
  }

  return { sessions, currentSessionId, loadSessions, switchSession, deleteSession, onSessionCreated };
}
