<template>
  <div class="execution-history">
    <div class="page-header">
      <div class="header-title">
        <el-icon :size="22" color="#409EFF"><Tickets /></el-icon>
        <h2>执行历史记录</h2>
      </div>
      <div class="header-actions">
        <el-button @click="refreshHistory">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
      </div>
    </div>

    <div v-if="store.engineEvents.length === 0" class="empty-history">
      <el-empty
        description="暂无执行历史记录，前往「流程编排」页面创建并执行测试流程"
        :image-size="120"
      />
    </div>

    <div v-else class="history-content">
      <div class="timeline-panel">
        <el-timeline>
          <el-timeline-item
            v-for="(event, idx) in store.engineEvents"
            :key="idx"
            :timestamp="formatTime(event.timestamp)"
            :type="eventTimelineType(event.type)"
            :color="eventTimelineColor(event.type)"
            :icon="eventIcon(event.type)"
            size="large"
          >
            <div class="event-card" :class="`event-${event.type}`">
              <div class="event-header">
                <el-tag :type="eventTagType(event.type)" size="small" effect="dark">
                  {{ eventLabel(event.type) }}
                </el-tag>
                <span class="event-id">#{{ event.executionId.slice(0, 8) }}</span>
              </div>
              <div class="event-message">{{ event.message }}</div>
              <div v-if="event.nodeId" class="event-detail">
                <span>节点ID: </span>
                <code>{{ event.nodeId }}</code>
              </div>
              <div v-if="event.result?.measurements" class="event-measurements">
                <div
                  v-for="(val, key) in event.result.measurements"
                  :key="key"
                  class="meas-chip"
                >
                  <span class="chip-label">{{ measurementLabel(key as string) }}:</span>
                  <span class="chip-value">{{ Number(val).toFixed(4) }} {{ measurementUnit(key as string) }}</span>
                </div>
              </div>
            </div>
          </el-timeline-item>
        </el-timeline>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import {
  Tickets, Refresh, VideoPlay, VideoPause, CircleCheck, CircleClose,
  Warning, ArrowRight,
} from '@element-plus/icons-vue';
import { useAppStore } from '../stores/app';
import type { EngineEventType } from '../types/flow';

const store = useAppStore();

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

function eventLabel(type: EngineEventType): string {
  const map: Record<EngineEventType, string> = {
    flow_started: '流程启动',
    flow_completed: '流程完成',
    flow_failed: '流程失败',
    flow_stopped: '流程停止',
    flow_paused: '流程暂停',
    node_started: '节点启动',
    node_completed: '节点完成',
    node_failed: '节点失败',
    edge_active: '连线激活',
  };
  return map[type] || type;
}

function eventTagType(type: EngineEventType): string {
  if (type.includes('completed') || type === 'edge_active') return 'success';
  if (type.includes('failed')) return 'danger';
  if (type.includes('started')) return 'warning';
  if (type.includes('stopped') || type.includes('paused')) return 'info';
  return '';
}

function eventTimelineType(type: EngineEventType): string {
  if (type.includes('completed') || type === 'edge_active') return 'success';
  if (type.includes('failed')) return 'danger';
  if (type.includes('started')) return 'warning';
  return 'primary';
}

function eventTimelineColor(type: EngineEventType): string {
  if (type.includes('completed') || type === 'edge_active') return '#67C23A';
  if (type.includes('failed')) return '#F56C6C';
  if (type.includes('started')) return '#E6A23C';
  if (type.includes('stopped')) return '#909399';
  return '#409EFF';
}

function eventIcon(type: EngineEventType): any {
  if (type === 'flow_started' || type === 'node_started') return VideoPlay;
  if (type === 'flow_completed' || type === 'node_completed') return CircleCheck;
  if (type === 'flow_failed' || type === 'node_failed') return CircleClose;
  if (type === 'flow_stopped') return VideoPause;
  if (type === 'edge_active') return ArrowRight;
  return Warning;
}

function measurementLabel(key: string): string {
  const map: Record<string, string> = {
    voltage: '电压',
    current: '电流',
    impedance: '阻抗',
    actualValue: '实测值',
  };
  return map[key] || key;
}

function measurementUnit(key: string): string {
  const map: Record<string, string> = {
    voltage: 'V',
    current: 'A',
    impedance: 'Ω',
    actualValue: '',
  };
  return map[key] || '';
}

function refreshHistory() {
  ElMessage.info('历史记录已刷新');
}

onMounted(() => {
  // 页面加载时可以执行的操作
});
</script>

<style scoped>
.execution-history {
  height: 100%;
  overflow-y: auto;
  padding: 4px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-title h2 {
  font-size: 20px;
  color: #303133;
  margin: 0;
}

.empty-history {
  height: 60vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ffffff;
  border-radius: 8px;
}

.history-content {
  background: #ffffff;
  border-radius: 8px;
  padding: 24px 32px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}

.timeline-panel {
  max-height: calc(100vh - 200px);
  overflow-y: auto;
  padding-right: 16px;
}

.event-card {
  background: #fafbfc;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 12px 16px;
  margin-bottom: 4px;
  transition: all 0.2s;
}

.event-card:hover {
  background: #f5f7fa;
}

.event-card.event-node_completed,
.event-card.event-flow_completed {
  border-color: #e1f3d8;
  background: #f0f9eb;
}

.event-card.event-node_failed,
.event-card.event-flow_failed {
  border-color: #fbc4c4;
  background: #fef0f0;
}

.event-card.event-node_started,
.event-card.event-flow_started {
  border-color: #faecd8;
  background: #fdf6ec;
}

.event-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.event-id {
  font-family: monospace;
  font-size: 11px;
  color: #909399;
}

.event-message {
  font-size: 14px;
  color: #303133;
  line-height: 1.5;
  font-weight: 500;
}

.event-detail {
  margin-top: 8px;
  font-size: 12px;
  color: #909399;
}

.event-detail code {
  background: #ffffff;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: monospace;
  color: #409EFF;
  font-size: 11px;
}

.event-measurements {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.meas-chip {
  background: #ffffff;
  border: 1px solid #e1f3d8;
  border-radius: 4px;
  padding: 4px 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.chip-label {
  color: #909399;
}

.chip-value {
  color: #67C23A;
  font-weight: 700;
  font-family: 'Consolas', monospace;
}

:deep(.el-timeline-item__tail) {
  border-left: 2px solid #e4e7ed;
}

:deep(.el-timeline-item__node) {
  width: 14px;
  height: 14px;
  left: -7px;
}
</style>
