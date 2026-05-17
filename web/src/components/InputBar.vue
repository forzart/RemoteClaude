<template>
  <div class="input-wrapper">
    <div class="input-bar">
      <textarea
        ref="inputRef"
        v-model="text"
        class="input-field"
        placeholder="Type message..."
        :disabled="disabled"
        rows="1"
        @keydown="handleKeydown"
        @input="autoResize"
      />
      <button
        v-if="isStreaming"
        class="btn-abort"
        @click="$emit('abort')"
      >
        ■ Stop
      </button>
      <button
        v-else
        class="btn-send"
        :disabled="disabled || !text.trim()"
        @click="send"
      >
        Send ▶
      </button>
    </div>
    <div class="input-actions">
      <button class="btn-action" @click="$emit('config', 'mcp')">MCP</button>
      <button class="btn-action" @click="$emit('config', 'skills')">Skills</button>
      <button class="btn-action" @click="$emit('config', 'config')">Config</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue';

defineProps<{
  disabled: boolean;
  isStreaming: boolean;
}>();

const emit = defineEmits<{
  send: [content: string];
  abort: [];
  config: [tab: string];
}>();

const text = ref('');
const inputRef = ref<HTMLTextAreaElement | null>(null);

function send() {
  const content = text.value.trim();
  if (!content) return;
  emit('send', content);
  text.value = '';
  void nextTick(() => autoResize());
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    send();
  }
}

function autoResize() {
  const el = inputRef.value;
  if (el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 150) + 'px';
  }
}
</script>

<style scoped>
.input-wrapper {
  background: var(--bg-surface);
  border-top: 1px solid var(--border);
}

.input-bar {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  padding: 12px 16px 4px;
}

.input-actions {
  display: flex;
  gap: 6px;
  padding: 4px 16px 8px;
}

.btn-action {
  background: none;
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
}

.btn-action:hover {
  color: var(--text-primary);
  border-color: var(--text-secondary);
}

.input-field {
  flex: 1;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px 14px;
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.4;
  resize: none;
  outline: none;
  min-height: 40px;
  max-height: 150px;
}

.input-field:focus {
  border-color: var(--color-accent);
}

.input-field::placeholder {
  color: var(--text-muted);
}

.input-field:disabled {
  opacity: 0.5;
}

.btn-send, .btn-abort {
  border: none;
  border-radius: 6px;
  padding: 10px 16px;
  font-size: 13px;
  white-space: nowrap;
}

.btn-send {
  background: var(--color-accent);
  color: white;
}

.btn-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-abort {
  background: var(--color-error);
  color: white;
}
</style>
