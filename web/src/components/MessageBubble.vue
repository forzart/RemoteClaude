<template>
  <div class="message" :class="'message-' + message.role">
    <template v-if="message.role === 'user'">
      <span class="user-prompt">&gt; </span>
      <span class="user-text">{{ userText }}</span>
    </template>
    <template v-else>
      <div v-for="(block, index) in message.blocks" :key="index">
        <div v-if="block.type === 'text'" class="assistant-text" v-html="renderMarkdown(block.text)"></div>
        <ToolCallCard
          v-else-if="block.type === 'tool_use'"
          :name="block.name"
          :input="block.input"
          :status="block.status"
          :output="block.output"
        />
        <CodeBlock
          v-else-if="block.type === 'code'"
          :code="block.code"
          :language="block.language"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import MarkdownIt from 'markdown-it';
import type { DisplayMessage } from '../types/messages.js';
import ToolCallCard from './ToolCallCard.vue';
import CodeBlock from './CodeBlock.vue';

const props = defineProps<{
  message: DisplayMessage;
}>();

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
});

// Override fence renderer to style code blocks with language label and copy button
md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx];
  const lang = token.info.trim() || 'text';
  const escaped = md.utils.escapeHtml(token.content);
  return `<div class="md-code-block"><div class="md-code-header"><span class="md-code-lang">${md.utils.escapeHtml(lang)}</span></div><pre><code>${escaped}</code></pre></div>`;
};

const userText = computed(() => {
  const textBlock = props.message.blocks.find(b => b.type === 'text');
  return textBlock && textBlock.type === 'text' ? textBlock.text : '';
});

function renderMarkdown(text: string): string {
  return md.render(text);
}
</script>

<style scoped>
.message {
  margin: 4px 0;
}

.message-user {
  color: var(--color-user);
}

.user-prompt {
  color: var(--color-prompt);
  font-weight: 600;
}

.user-text {
  color: var(--color-user);
}

.assistant-text {
  color: var(--text-primary);
  line-height: 1.6;
}

.assistant-text :deep(p) {
  margin: 0.4em 0;
}

.assistant-text :deep(a) {
  color: var(--color-link);
}

.assistant-text :deep(strong) {
  color: var(--text-primary);
  font-weight: 600;
}

.assistant-text :deep(code) {
  background: var(--bg-surface);
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 12px;
}

.assistant-text :deep(pre) {
  background: var(--bg-primary);
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
}

.assistant-text :deep(.md-code-block) {
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  margin: 8px 0;
}

.assistant-text :deep(.md-code-header) {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-light);
}

.assistant-text :deep(.md-code-lang) {
  font-size: 11px;
  color: var(--text-secondary);
}

.assistant-text :deep(ul),
.assistant-text :deep(ol) {
  margin: 0.4em 0;
  padding-left: 1.5em;
}
</style>
