<template>
  <div class="app">
    <div class="topbar">
      <div class="topbar-left">
        <button class="btn-menu" @click="sidebarOpen = !sidebarOpen">☰</button>
        <span class="app-title">RemoteClaude</span>
      </div>
      <div class="topbar-right">
        <span class="connection-status" :class="wsStatus">
          {{ statusText }}
        </span>
      </div>
    </div>
    <div class="main">
      <SessionSidebar
        :sessions="sessionStore.sessions.value"
        :current-session-name="sessionStore.currentSessionName.value"
        :open="sidebarOpen"
        @switch="handleSwitchSession"
        @delete="handleDeleteSession"
        @new-session="handleNewSession"
      />
      <ChatView
        :messages="chat.messages.value"
        :is-streaming="chat.isStreaming.value"
        :has-session="!!sessionStore.currentSessionName.value"
        @send="handleSend"
        @abort="handleAbort"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useWebSocket } from './composables/useWebSocket.js';
import { useChat } from './composables/useChat.js';
import { useSessions } from './composables/useSessions.js';
import SessionSidebar from './components/SessionSidebar.vue';
import ChatView from './components/ChatView.vue';

const sidebarOpen = ref(true);

function getWsUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws/chat`;
}

const ws = useWebSocket(getWsUrl());
const chat = useChat(ws);
const sessionStore = useSessions(ws);

const wsStatus = computed(() => ws.status.value);
const statusText = computed(() => {
  switch (ws.status.value) {
    case 'connected': return '● Connected';
    case 'connecting': return '○ Connecting...';
    case 'disconnected': return '○ Disconnected';
    case 'error': return '● Error';
  }
});

onMounted(() => {
  ws.connect();
  void sessionStore.loadSessions();
});

onUnmounted(() => {
  ws.disconnect();
});

function handleNewSession(sessionName: string) {
  chat.clearMessages();
  chat.createSession(sessionName);
}

async function handleSwitchSession(sessionName: string) {
  chat.clearMessages();
  const history = await sessionStore.loadHistory(sessionName);
  if (history.messages.length > 0) {
    chat.loadFromHistory(history.messages);
  }
  chat.createSession(sessionName);
}

async function handleDeleteSession(sessionName: string) {
  await sessionStore.deleteSession(sessionName);
}

function handleSend(content: string) {
  const sessionName = sessionStore.currentSessionName.value;
  if (sessionName) {
    chat.sendMessage(sessionName, content);
  }
}

function handleAbort() {
  const sessionName = sessionStore.currentSessionName.value;
  if (sessionName) {
    chat.abort(sessionName);
  }
}

</script>

<style scoped>
.app {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  height: 44px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.btn-menu {
  background: none;
  border: none;
  color: var(--text-primary);
  font-size: 18px;
  padding: 4px;
}

.app-title {
  font-weight: 600;
  color: var(--color-link);
}

.connection-status {
  font-size: 11px;
}

.connection-status.connected { color: var(--color-success); }
.connection-status.connecting { color: var(--text-secondary); }
.connection-status.disconnected { color: var(--text-muted); }
.connection-status.error { color: var(--color-error); }

.main {
  flex: 1;
  display: flex;
  overflow: hidden;
}
</style>
