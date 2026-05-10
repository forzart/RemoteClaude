import { ref, type Ref } from 'vue';
import type { SessionInfo, ServerMessage } from '../types/messages.js';
import type { UseWebSocketReturn } from './useWebSocket.js';

export interface UseSessionsReturn {
  sessions: Ref<SessionInfo[]>;
  currentSessionId: Ref<string | null>;
  currentSessionName: Ref<string | null>;
  loadSessions: () => Promise<void>;
  switchSession: (sessionName: string) => void;
  deleteSession: (sessionName: string) => Promise<void>;
  onSessionCreated: (handler: (sessionId: string) => void) => void;
}

export function useSessions(ws: UseWebSocketReturn): UseSessionsReturn {
  const sessions = ref<SessionInfo[]>([]);
  const currentSessionId = ref<string | null>(null);
  const currentSessionName = ref<string | null>(null);
  const sessionCreatedHandlers: Array<(sessionId: string) => void> = [];

  ws.onMessage((msg: ServerMessage) => {
    if (msg.type === 'session_start') {
      currentSessionId.value = msg.sessionId;
      currentSessionName.value = msg.sessionName;
      for (const handler of sessionCreatedHandlers) {
        handler(msg.sessionId);
      }
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
      // silently fail — sidebar will show empty list
    }
  }

  function switchSession(sessionName: string) {
    currentSessionName.value = sessionName;
    currentSessionId.value = null;
  }

  async function deleteSession(sessionName: string): Promise<void> {
    try {
      await fetch(`/api/sessions/${encodeURIComponent(sessionName)}`, { method: 'DELETE' });
      sessions.value = sessions.value.filter(s => s.sessionName !== sessionName);
      if (currentSessionName.value === sessionName) {
        currentSessionId.value = null;
        currentSessionName.value = null;
      }
    } catch {
      // silently fail
    }
  }

  function onSessionCreated(handler: (sessionId: string) => void) {
    sessionCreatedHandlers.push(handler);
  }

  return { sessions, currentSessionId, currentSessionName, loadSessions, switchSession, deleteSession, onSessionCreated };
}
