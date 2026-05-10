<template>
  <div class="tool-card" :class="'tool-' + status">
    <div class="tool-header" @click="expanded = !expanded">
      <span class="tool-status">
        <span v-if="status === 'running'" class="spinner">⟳</span>
        <span v-else-if="status === 'success'">✓</span>
        <span v-else>✗</span>
      </span>
      <span class="tool-name">{{ name }}</span>
      <span class="tool-summary">{{ inputSummary }}</span>
      <span class="tool-expand">{{ expanded ? '▾' : '▸' }}</span>
    </div>
    <div v-if="expanded" class="tool-body">
      <div class="tool-section">
        <div class="tool-label">Input</div>
        <pre class="tool-content">{{ JSON.stringify(input, null, 2) }}</pre>
      </div>
      <div v-if="output" class="tool-section">
        <div class="tool-label">Output</div>
        <pre class="tool-content">{{ output }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

const props = defineProps<{
  name: string;
  input: Record<string, unknown>;
  status: 'running' | 'success' | 'error';
  output?: string;
}>();

const expanded = ref(false);

const inputSummary = computed(() => {
  if (props.name === 'Read' || props.name === 'Write' || props.name === 'Edit') {
    return (props.input.file_path as string) || '';
  }
  if (props.name === 'Bash') {
    const cmd = (props.input.command as string) || '';
    return cmd.length > 60 ? cmd.slice(0, 60) + '...' : cmd;
  }
  if (props.name === 'Grep') {
    return (props.input.pattern as string) || '';
  }
  if (props.name === 'Glob') {
    return (props.input.pattern as string) || '';
  }
  return '';
});
</script>

<style scoped>
.tool-card {
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  margin: 8px 0;
}

.tool-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-surface);
  cursor: pointer;
  user-select: none;
}

.tool-header:hover {
  background: var(--bg-hover);
}

.tool-status {
  font-size: 14px;
}

.tool-success .tool-status { color: var(--color-success); }
.tool-error .tool-status { color: var(--color-error); }
.tool-running .tool-status { color: var(--text-secondary); }

.spinner {
  display: inline-block;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.tool-name {
  color: var(--color-tool);
  font-weight: 600;
}

.tool-summary {
  color: var(--text-secondary);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-expand {
  color: var(--text-muted);
  font-size: 11px;
}

.tool-body {
  border-top: 1px solid var(--border-light);
  background: var(--bg-primary);
}

.tool-section {
  padding: 8px 12px;
}

.tool-section + .tool-section {
  border-top: 1px solid var(--border-light);
}

.tool-label {
  font-size: 10px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.tool-content {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 300px;
  overflow-y: auto;
  margin: 0;
}
</style>
