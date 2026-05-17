<template>
  <div class="chat-view">
    <div class="chat-messages" ref="messagesRef">
      <div v-if="messages.length === 0" class="chat-empty">
        <p>Start a new conversation or select a session.</p>
      </div>
      <MessageBubble
        v-for="msg in messages"
        :key="msg.id"
        :message="msg"
      />
      <div v-if="isStreaming" class="streaming-indicator">
        <span class="dot-pulse"></span>
      </div>
    </div>
    <ConfigPanel
      :open="configOpen"
      :initial-tab="configTab"
      @close="configOpen = false"
    />
    <InputBar
      :disabled="!hasSession"
      :is-streaming="isStreaming"
      @send="onSend"
      @abort="onAbort"
      @config="onConfig"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import type { DisplayMessage } from '../types/messages.js';
import MessageBubble from './MessageBubble.vue';
import InputBar from './InputBar.vue';
import ConfigPanel from './ConfigPanel.vue';

const props = defineProps<{
  messages: DisplayMessage[];
  isStreaming: boolean;
  hasSession: boolean;
}>();

const emit = defineEmits<{
  send: [content: string];
  abort: [];
}>();

const messagesRef = ref<HTMLElement | null>(null);
const configOpen = ref(false);
const configTab = ref('mcp');

const interceptedCommands: Record<string, string> = {
  '/mcp': 'mcp',
  '/skills': 'skills',
  '/config': 'config',
  '/model': 'config',
  '/models': 'config',
};

watch(
  () => props.messages.length,
  () => {
    void nextTick(() => scrollToBottom());
  },
);

watch(
  () => {
    const last = props.messages[props.messages.length - 1];
    if (!last) return 0;
    return last.blocks.reduce((acc, b) => acc + (b.type === 'text' ? b.text.length : 0), 0);
  },
  () => {
    void nextTick(() => scrollToBottom());
  },
);

function scrollToBottom() {
  const el = messagesRef.value;
  if (el) {
    el.scrollTop = el.scrollHeight;
  }
}

function onSend(content: string) {
  const cmd = content.trim().split(/\s/)[0].toLowerCase();
  const tab = interceptedCommands[cmd];
  if (tab) {
    configTab.value = tab;
    configOpen.value = true;
    return;
  }
  emit('send', content);
}

function onAbort() {
  emit('abort');
}

function onConfig(tab: string) {
  configTab.value = tab;
  configOpen.value = !configOpen.value || configTab.value !== tab;
}
</script>

<style scoped>
.chat-view {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chat-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
}

.streaming-indicator {
  padding: 4px 0;
}

.dot-pulse {
  display: inline-block;
  width: 8px;
  height: 8px;
  background: var(--color-link);
  border-radius: 50%;
  animation: pulse 1s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}
</style>
