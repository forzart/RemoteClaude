<template>
  <div class="code-block">
    <div class="code-header">
      <span class="code-language">{{ language }}</span>
      <button class="code-copy" @click="copyCode">
        {{ copied ? '✓ Copied' : '📋 Copy' }}
      </button>
    </div>
    <div class="code-body" v-html="highlightedCode"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, watchEffect } from 'vue';
import { codeToHtml } from 'shiki';

const props = defineProps<{
  code: string;
  language: string;
}>();

const highlightedCode = ref('');
const copied = ref(false);

watchEffect(async () => {
  try {
    highlightedCode.value = await codeToHtml(props.code, {
      lang: props.language || 'text',
      theme: 'github-dark',
    });
  } catch {
    // Fallback: render as plain text if language not supported
    highlightedCode.value = `<pre><code>${escapeHtml(props.code)}</code></pre>`;
  }
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function copyCode() {
  try {
    await navigator.clipboard.writeText(props.code);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  } catch {
    // clipboard API not available
  }
}
</script>

<style scoped>
.code-block {
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  margin: 8px 0;
}

.code-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border-light);
}

.code-language {
  font-size: 11px;
  color: var(--text-secondary);
}

.code-copy {
  font-size: 11px;
  color: var(--color-link);
  background: none;
  border: none;
  padding: 2px 6px;
}

.code-copy:hover {
  text-decoration: underline;
}

.code-body {
  padding: 0;
  overflow-x: auto;
}

.code-body :deep(pre) {
  margin: 0;
  padding: 12px;
  background: var(--bg-primary) !important;
  font-size: 12px;
  line-height: 1.5;
}

.code-body :deep(code) {
  font-family: var(--font-mono);
}
</style>
