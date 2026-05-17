<template>
  <div v-if="open" class="config-panel">
    <div class="config-header">
      <div class="config-tabs">
        <button
          v-for="t in tabs"
          :key="t.id"
          class="config-tab"
          :class="{ active: tab === t.id }"
          @click="tab = t.id"
        >{{ t.label }}</button>
      </div>
      <button class="config-close" @click="$emit('close')">×</button>
    </div>
    <div class="config-body">
      <div v-if="loading" class="config-loading">Loading...</div>
      <template v-else>
        <div v-if="tab === 'mcp'" class="config-content">
          <div v-if="mcpServers.length === 0" class="config-empty">No MCP servers configured. Send a message first to load live data.</div>
          <div v-for="server in mcpServers" :key="server.name" class="config-item">
            <div class="item-left">
              <div class="item-name">{{ server.name }}</div>
              <div v-if="server.tools && server.tools.length > 0" class="item-tools">
                {{ server.tools.length }} tool{{ server.tools.length === 1 ? '' : 's' }}
              </div>
            </div>
            <div class="item-right">
              <span class="status-badge" :class="server.status">{{ server.status }}</span>
              <span v-if="server.scope" class="item-scope">{{ server.scope }}</span>
            </div>
          </div>
        </div>
        <div v-if="tab === 'skills'" class="config-content">
          <div v-if="commands.length === 0 && agents.length === 0" class="config-empty">
            No skills loaded yet. Send a message first to load live data.
          </div>
          <template v-if="commands.length > 0">
            <div class="section-label">Commands ({{ commands.length }})</div>
            <div v-for="cmd in commands" :key="cmd.name" class="config-item">
              <div class="item-left">
                <div class="item-name">/{{ cmd.name }}</div>
                <div class="item-desc">{{ cmd.description }}</div>
              </div>
            </div>
          </template>
          <template v-if="agents.length > 0">
            <div class="section-label">Agents ({{ agents.length }})</div>
            <div v-for="agent in agents" :key="agent.name" class="config-item">
              <div class="item-left">
                <div class="item-name">{{ agent.name }}</div>
                <div class="item-desc">{{ agent.description }}</div>
              </div>
              <div v-if="agent.model" class="item-right">
                <span class="item-scope">{{ agent.model }}</span>
              </div>
            </div>
          </template>
        </div>
        <div v-if="tab === 'config'" class="config-content">
          <div v-if="overview" class="config-overview">
            <div class="config-item">
              <div class="item-name">Model</div>
              <div class="item-detail">{{ overview.model || 'default' }}</div>
            </div>
            <div class="config-item">
              <div class="item-name">MCP Servers</div>
              <div class="item-detail">{{ overview.hasMcp ? 'configured' : 'none' }}</div>
            </div>
            <div class="config-item">
              <div class="item-name">Hooks</div>
              <div class="item-detail">{{ overview.hooks.length > 0 ? overview.hooks.join(', ') : 'none' }}</div>
            </div>
            <div class="config-item">
              <div class="item-name">Commands</div>
              <div class="item-detail">{{ overview.commandCount }}</div>
            </div>
            <div class="config-item">
              <div class="item-name">Agents</div>
              <div class="item-detail">{{ overview.agentCount }}</div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

interface McpServer {
  name: string;
  status: string;
  serverInfo?: { name: string; version: string };
  error?: string;
  tools?: Array<{ name: string; description?: string }>;
  scope?: string;
}

interface Command {
  name: string;
  description: string;
  argumentHint?: string;
  aliases?: string[];
}

interface AgentInfo {
  name: string;
  description: string;
  model?: string;
}

interface Overview {
  model: string;
  hooks: string[];
  hasMcp: boolean;
  commandCount: number;
  agentCount: number;
}

const props = defineProps<{ open: boolean; initialTab?: string }>();
defineEmits<{ close: [] }>();

const tabs = [
  { id: 'mcp', label: 'MCP' },
  { id: 'skills', label: 'Skills' },
  { id: 'config', label: 'Config' },
];

const tab = ref(props.initialTab || 'mcp');
const loading = ref(false);
const mcpServers = ref<McpServer[]>([]);
const commands = ref<Command[]>([]);
const agents = ref<AgentInfo[]>([]);
const overview = ref<Overview | null>(null);

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    if (props.initialTab) tab.value = props.initialTab;
    void loadData();
  }
});

watch(tab, () => {
  if (props.open) void loadData();
});

async function loadData() {
  loading.value = true;
  try {
    if (tab.value === 'mcp') {
      const res = await fetch('/api/config/mcp');
      const data = await res.json();
      mcpServers.value = data.mcpServers;
    } else if (tab.value === 'skills') {
      const res = await fetch('/api/config/skills');
      const data = await res.json();
      commands.value = data.commands;
      agents.value = data.agents;
    } else if (tab.value === 'config') {
      const res = await fetch('/api/config/overview');
      overview.value = await res.json();
    }
  } catch {
    // silently fail
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.config-panel {
  border-top: 1px solid var(--border);
  background: var(--bg-primary);
  max-height: 280px;
  display: flex;
  flex-direction: column;
}

.config-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.config-tabs {
  display: flex;
  gap: 4px;
}

.config-tab {
  background: none;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 4px 10px;
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
}

.config-tab.active {
  background: var(--bg-hover);
  color: var(--text-primary);
  border-color: var(--border);
}

.config-close {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 16px;
  padding: 0 4px;
  cursor: pointer;
}

.config-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
}

.config-loading {
  color: var(--text-muted);
  font-size: 12px;
  padding: 12px 0;
}

.config-empty {
  color: var(--text-muted);
  font-size: 12px;
  padding: 12px 0;
}

.section-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 8px 0 4px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 2px;
}

.config-item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 5px 0;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  gap: 8px;
}

.config-item:last-child {
  border-bottom: none;
}

.item-left {
  flex: 1;
  min-width: 0;
}

.item-right {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-shrink: 0;
}

.item-name {
  color: var(--text-primary);
  font-weight: 500;
}

.item-desc {
  color: var(--text-muted);
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-tools {
  color: var(--text-muted);
  font-size: 11px;
}

.item-detail {
  color: var(--text-secondary);
  font-family: monospace;
  font-size: 11px;
  max-width: 60%;
  text-align: right;
  word-break: break-all;
}

.status-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  font-weight: 500;
}

.status-badge.connected {
  background: rgba(46, 160, 67, 0.15);
  color: var(--color-success);
}

.status-badge.failed {
  background: rgba(248, 81, 73, 0.15);
  color: var(--color-error);
}

.status-badge.pending {
  background: rgba(210, 153, 34, 0.15);
  color: var(--color-warning, #d29922);
}

.status-badge.disabled {
  background: rgba(139, 148, 158, 0.15);
  color: var(--text-muted);
}

.status-badge.unknown {
  background: rgba(139, 148, 158, 0.15);
  color: var(--text-muted);
}

.item-scope {
  font-size: 10px;
  color: var(--text-muted);
  font-style: italic;
}
</style>
