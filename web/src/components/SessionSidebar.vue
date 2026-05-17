<template>
  <div class="sidebar" :class="{ collapsed: !open }">
    <div class="sidebar-header">
      <button class="btn-new" @click="promptNewSession">+ New Session</button>
    </div>
    <div class="sidebar-label">Sessions</div>
    <div class="session-list">
      <div
        v-for="session in sessions"
        :key="session.sessionName"
        class="session-item"
        :class="{ active: session.sessionName === currentSessionName }"
        @click="$emit('switch', session.sessionName)"
      >
        <div class="session-title">{{ session.sessionName }}</div>
        <div class="session-meta">{{ formatTime(session.createdAt) }}</div>
        <button
          class="session-delete"
          @click.stop="confirmDelete(session.sessionName)"
          title="Delete session"
        >×</button>
      </div>
      <div v-if="sessions.length === 0" class="session-empty">
        No sessions yet
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SessionInfo } from '../types/messages.js';

defineProps<{
  sessions: SessionInfo[];
  currentSessionName: string | null;
  open: boolean;
}>();

const emit = defineEmits<{
  switch: [sessionName: string];
  delete: [sessionName: string];
  'new-session': [sessionName: string];
}>();

function promptNewSession() {
  const sessionName = window.prompt('Session name:', '');
  if (!sessionName) return;
  emit('new-session', sessionName);
}

function confirmDelete(sessionName: string) {
  if (window.confirm('Delete this session?')) {
    emit('delete', sessionName);
  }
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(ts).toLocaleDateString();
}
</script>

<style scoped>
.sidebar {
  width: 240px;
  background: var(--bg-primary);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width 0.2s;
}

.sidebar.collapsed {
  width: 0;
  border-right: none;
}

.sidebar-header {
  padding: 12px;
}

.btn-new {
  width: 100%;
  padding: 8px 12px;
  background: var(--color-accent);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 12px;
}

.sidebar-label {
  padding: 0 12px 4px;
  font-size: 11px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.session-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px;
}

.session-item {
  padding: 8px 10px;
  border-radius: 4px;
  cursor: pointer;
  position: relative;
}

.session-item:hover {
  background: var(--bg-hover);
}

.session-item.active {
  background: var(--bg-hover);
  border-left: 2px solid var(--color-link);
}

.session-title {
  font-size: 12px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-right: 20px;
}

.session-item:not(.active) .session-title {
  color: var(--text-secondary);
}

.session-meta {
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 2px;
}

.session-delete {
  position: absolute;
  right: 8px;
  top: 8px;
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 16px;
  line-height: 1;
  padding: 0 4px;
  display: none;
}

.session-item:hover .session-delete {
  display: block;
}

.session-delete:hover {
  color: var(--color-error);
}

.session-empty {
  padding: 12px;
  color: var(--text-muted);
  font-size: 12px;
  text-align: center;
}

</style>
