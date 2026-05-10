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
        <button class="btn-icon" @click="settingsOpen = true">⚙</button>
      </div>
    </div>
    <div class="main">
      <SessionSidebar
        :sessions="sessionStore.sessions.value"
        :current-session-id="sessionStore.currentSessionId.value"
        :open="sidebarOpen"
        @switch="handleSwitchSession"
        @delete="handleDeleteSession"
        @settings="settingsOpen = true"
        @new-session="handleNewSession"
      />
      <ChatView
        :messages="chat.messages.value"
        :is-streaming="chat.isStreaming.value"
        :has-session="!!sessionStore.currentSessionId.value"
        @send="handleSend"
        @abort="handleAbort"
      />
    </div>
    <SettingsModal
      :open="settingsOpen"
      @close="settingsOpen = false"
      @save="handleSettingsSave"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useWebSocket } from './composables/useWebSocket.js';
import { useChat } from './composables/useChat.js';
import { useSessions } from './composables/useSessions.js';
import SessionSidebar from './components/SessionSidebar.vue';
import ChatView from './components/ChatView.vue';
import SettingsModal from './components/SettingsModal.vue';

const sidebarOpen = ref(true);
const settingsOpen = ref(false);

function getWsUrl(): string {
  const saved = localStorage.getItem('rc_ws_url');
  if (saved) return saved;
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

function handleNewSession(cwd: string, content?: string) {
  chat.clearMessages();
  chat.createSession(cwd, content);
}

function handleSwitchSession(id: string) {
  sessionStore.switchSession(id);
  chat.clearMessages();
}

async function handleDeleteSession(id: string) {
  await sessionStore.deleteSession(id);
}

function handleSend(content: string) {
  const sessionId = sessionStore.currentSessionId.value;
  if (sessionId) {
    chat.sendMessage(sessionId, content);
  }
}

function handleAbort() {
  const sessionId = sessionStore.currentSessionId.value;
  if (sessionId) {
    chat.abort(sessionId);
  }
}

function handleSettingsSave(_settings: { wsUrl: string; defaultCwd: string }) {
  location.reload();
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

.btn-icon {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 16px;
  padding: 4px;
}

.main {
  flex: 1;
  display: flex;
  overflow: hidden;
}
</style>
