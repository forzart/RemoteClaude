import { ref, type Ref } from 'vue';
import type { ServerMessage } from '../types/messages.js';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface UseWebSocketReturn {
  status: Ref<ConnectionStatus>;
  send: (msg: object) => void;
  onMessage: (handler: (msg: ServerMessage) => void) => void;
  connect: () => void;
  disconnect: () => void;
}

export function useWebSocket(url: Ref<string> | string): UseWebSocketReturn {
  const status = ref<ConnectionStatus>('disconnected');
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = 1000;
  const maxReconnectDelay = 30000;
  let manualDisconnect = false;
  const handlers: Array<(msg: ServerMessage) => void> = [];

  function onMessage(handler: (msg: ServerMessage) => void) {
    handlers.push(handler);
  }

  function send(msg: object) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  function connect() {
    if (ws) {
      ws.close();
    }

    manualDisconnect = false;
    const wsUrl = typeof url === 'string' ? url : url.value;
    status.value = 'connecting';
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      status.value = 'connected';
      reconnectDelay = 1000;
    };

    ws.onmessage = (event) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data) as ServerMessage;
      } catch {
        return;
      }
      for (const handler of handlers) {
        handler(msg);
      }
    };

    ws.onclose = () => {
      status.value = 'disconnected';
      ws = null;
      if (!manualDisconnect) {
        scheduleReconnect();
      }
    };

    ws.onerror = () => {
      status.value = 'error';
    };
  }

  function disconnect() {
    manualDisconnect = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      ws.close();
      ws = null;
    }
    status.value = 'disconnected';
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
      reconnectDelay = Math.min(reconnectDelay * 2, maxReconnectDelay);
    }, reconnectDelay);
  }

  return { status, send, onMessage, connect, disconnect };
}
