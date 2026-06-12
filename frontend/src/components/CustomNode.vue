<template>
  <div
    class="custom-node"
    :class="[`node-${data.type}`, statusClass, { selected: selected }]"
    :style="nodeStyle"
  >
    <Handle
      v-if="data.type !== 'start'"
      type="target"
      position="top"
      :style="{ width: 10, height: 10, background: '#909399', border: '2px solid #fff' }"
    />

    <div class="node-header">
      <el-icon :size="16">
        <component :is="nodeIcon" />
      </el-icon>
      <span class="node-label">{{ data.label }}</span>
    </div>

    <div v-if="showStatus" class="node-status">
      <el-icon :size="12" :color="statusColor">
        <CircleCheck v-if="status === 'passed'" />
        <CircleClose v-else-if="status === 'failed'" />
        <Loading v-else-if="status === 'running'" />
        <Minus v-else />
      </el-icon>
      <span :style="{ color: statusColor }">{{ statusLabel }}</span>
    </div>

    <div v-if="data.result" class="node-result">
      <template v-if="data.result.measurements">
        <div v-for="(value, key) in data.result.measurements" :key="key" class="measurement">
          <span class="meas-label">{{ measurementLabel(key as string) }}</span>
          <span class="meas-value">{{ Number(value).toFixed(4) }}</span>
          <span class="meas-unit">{{ measurementUnit(key as string) }}</span>
        </div>
      </template>
    </div>

    <Handle
      v-if="data.type !== 'end'"
      type="source"
      position="bottom"
      :style="{ width: 10, height: 10, background: '#909399', border: '2px solid #fff' }"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import type { NodeProps } from '@vue-flow/core';
import {
  VideoPlay, VideoPause, Lightning, SwitchButton, Cpu, Connection,
  DataAnalysis, TrendCharts, Histogram, Timer, Aim, Finished, Document,
  ChatDotRound, CircleCheck, CircleClose, Loading, Minus,
} from '@element-plus/icons-vue';
import type { FlowNodeData, NodeExecutionStatus, NodeType } from '../types/flow';
import { NodeExecutionStatus as Status, nodeStatusColors, nodeStatusLabels } from '../types/flow';

const props = defineProps<NodeProps<FlowNodeData>>();

const iconMap: Record<string, any> = {
  VideoPlay, VideoPause, Lightning, SwitchButton, Cpu, Connection,
  DataAnalysis, TrendCharts, Histogram, Timer, Aim, Finished, Document,
  ChatDotRound,
};

const nodeIconMap: Record<NodeType, string> = {
  start: 'VideoPlay',
  end: 'VideoPause',
  power_on: 'Lightning',
  power_off: 'SwitchButton',
  set_voltage: 'Cpu',
  set_current: 'Connection',
  read_voltage: 'DataAnalysis',
  read_current: 'TrendCharts',
  read_impedance: 'Histogram',
  delay: 'Timer',
  relay_close: 'Connection',
  relay_open: 'Aim',
  judge: 'Finished',
  scpi_raw: 'Document',
  log_message: 'ChatDotRound',
  loop_start: 'Timer',
  loop_end: 'Timer',
  branch: 'Connection',
};

const nodeColorMap: Record<NodeType, string> = {
  start: '#67C23A',
  end: '#F56C6C',
  power_on: '#409EFF',
  power_off: '#409EFF',
  set_voltage: '#409EFF',
  set_current: '#409EFF',
  read_voltage: '#67C23A',
  read_current: '#67C23A',
  read_impedance: '#67C23A',
  delay: '#E6A23C',
  relay_close: '#909399',
  relay_open: '#909399',
  judge: '#9B59B6',
  scpi_raw: '#1890FF',
  log_message: '#13C2C2',
  loop_start: '#E6A23C',
  loop_end: '#E6A23C',
  branch: '#722ED1',
};

const nodeIcon = computed(() => iconMap[nodeIconMap[props.data.type]] || Document);
const nodeColor = computed(() => nodeColorMap[props.data.type] || '#909399');

const status = computed<NodeExecutionStatus | undefined>(() => props.data.executionStatus);
const showStatus = computed(() => !!status.value);
const statusColor = computed(() => status.value ? nodeStatusColors[status.value] : '#909399');
const statusLabel = computed(() => status.value ? nodeStatusLabels[status.value] : '');

const statusClass = computed(() => {
  if (!status.value) return '';
  return `status-${status.value}`;
});

const nodeStyle = computed(() => ({
  borderColor: nodeColor.value,
  '--node-accent-color': nodeColor.value,
}));

function measurementLabel(key: string): string {
  const map: Record<string, string> = {
    voltage: '电压',
    current: '电流',
    impedance: '阻抗',
    actualValue: '实测值',
    temperature: '温度',
  };
  return map[key] || key;
}

function measurementUnit(key: string): string {
  const map: Record<string, string> = {
    voltage: 'V',
    current: 'A',
    impedance: 'Ω',
    actualValue: '',
    temperature: '°C',
  };
  return map[key] || '';
}
</script>

<style scoped>
.custom-node {
  min-width: 160px;
  background: #ffffff;
  border: 2px solid #dcdfe6;
  border-radius: 8px;
  padding: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  font-size: 13px;
  position: relative;
  overflow: hidden;
}

.custom-node.selected {
  box-shadow: 0 0 0 3px rgba(64, 158, 255, 0.25), 0 4px 16px rgba(0, 0, 0, 0.12);
  transform: translateY(-1px);
}

.custom-node::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: var(--node-accent-color);
}

.node-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px 10px 18px;
  font-weight: 600;
  color: #303133;
  border-bottom: 1px solid #f0f0f0;
}

.node-label {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.node-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px 6px 18px;
  font-size: 12px;
  border-bottom: 1px solid #f5f5f5;
}

.node-result {
  padding: 8px 14px 10px 18px;
  background: #fafbfc;
}

.measurement {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-top: 4px;
}

.meas-label {
  color: #909399;
  font-size: 11px;
  min-width: 48px;
}

.meas-value {
  color: #67C23A;
  font-weight: 700;
  font-family: 'Consolas', monospace;
  font-size: 15px;
}

.meas-unit {
  color: #606266;
  font-size: 11px;
}

.custom-node.status-passed {
  border-color: #67C23A;
  box-shadow: 0 0 18px rgba(103, 194, 58, 0.35), 0 2px 8px rgba(0, 0, 0, 0.08);
}

.custom-node.status-running {
  border-color: #E6A23C;
  box-shadow: 0 0 18px rgba(230, 162, 60, 0.35), 0 2px 8px rgba(0, 0, 0, 0.08);
  animation: pulse 1.5s ease-in-out infinite;
}

.custom-node.status-failed {
  border-color: #F56C6C;
  box-shadow: 0 0 18px rgba(245, 108, 108, 0.35), 0 2px 8px rgba(0, 0, 0, 0.08);
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 18px rgba(230, 162, 60, 0.35), 0 2px 8px rgba(0, 0, 0, 0.08); }
  50% { box-shadow: 0 0 28px rgba(230, 162, 60, 0.6), 0 2px 8px rgba(0, 0, 0, 0.08); }
}
</style>
