<template>
  <div v-if="open" class="modal-overlay" @click.self="$emit('close')">
    <div class="modal">
      <div class="modal-header">
        <h3>Settings</h3>
        <button class="modal-close" @click="$emit('close')">×</button>
      </div>
      <div class="modal-body">
        <div class="field">
          <label class="field-label">WebSocket URL</label>
          <input
            v-model="wsUrl"
            class="field-input"
            placeholder="ws://localhost:3000/ws/chat"
          />
          <p class="field-hint">Only needed when running frontend separately from server</p>
        </div>
        <div class="field">
          <label class="field-label">Default Working Directory</label>
          <input
            v-model="defaultCwd"
            class="field-input"
            placeholder="/home/user/project"
          />
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-save" @click="save">Save</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{
  close: [];
  save: [settings: { wsUrl: string; defaultCwd: string }];
}>();

const wsUrl = ref(localStorage.getItem('rc_ws_url') || '');
const defaultCwd = ref(localStorage.getItem('rc_default_cwd') || '/home/user/project');

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    wsUrl.value = localStorage.getItem('rc_ws_url') || '';
    defaultCwd.value = localStorage.getItem('rc_default_cwd') || '/home/user/project';
  }
});

function save() {
  localStorage.setItem('rc_ws_url', wsUrl.value);
  localStorage.setItem('rc_default_cwd', defaultCwd.value);
  emit('save', { wsUrl: wsUrl.value, defaultCwd: defaultCwd.value });
  emit('close');
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  width: 400px;
  max-width: 90vw;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.modal-header h3 {
  font-size: 14px;
  font-weight: 600;
}

.modal-close {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 20px;
  padding: 0 4px;
}

.modal-body {
  padding: 16px;
}

.field {
  margin-bottom: 16px;
}

.field-label {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.field-input {
  width: 100%;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 8px 10px;
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
}

.field-input:focus {
  border-color: var(--color-accent);
}

.field-hint {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 4px;
}

.modal-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  text-align: right;
}

.btn-save {
  background: var(--color-accent);
  color: white;
  border: none;
  border-radius: 6px;
  padding: 8px 20px;
  font-size: 13px;
}
</style>
