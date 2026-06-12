<template>
  <div class="node-palette">
    <div class="palette-header">
      <el-icon :size="16" color="#409EFF"><Grid /></el-icon>
      <span>节点面板</span>
    </div>

    <div
      v-for="(nodes, category) in groupedNodes"
      :key="category"
      class="category"
    >
      <div class="category-title">{{ category }}</div>
      <div class="category-nodes">
        <div
          v-for="def in nodes"
          :key="def.type"
          class="palette-node"
          draggable="true"
          @dragstart="handleDragStart($event, def)"
          :style="{ borderLeftColor: def.color }"
        >
          <el-icon :size="14" :color="def.color">
            <component :is="getIcon(def.icon)" />
          </el-icon>
          <span class="node-name">{{ def.label }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  VideoPlay, VideoPause, Lightning, SwitchButton, Cpu, Connection,
  DataAnalysis, TrendCharts, Histogram, Timer, Aim, Finished, Document,
  ChatDotRound, Grid,
} from '@element-plus/icons-vue';
import { nodeTypeDefinitions, type NodeTypeDefinition } from '../types/flow';

const emit = defineEmits<{
  (e: 'drag-start', def: NodeTypeDefinition): void;
}>();

const iconMap: Record<string, any> = {
  VideoPlay, VideoPause, Lightning, SwitchButton, Cpu, Connection,
  DataAnalysis, TrendCharts, Histogram, Timer, Aim, Finished, Document,
  ChatDotRound,
};

function getIcon(name: string) {
  return iconMap[name] || Document;
}

const groupedNodes = computed(() => {
  const groups: Record<string, NodeTypeDefinition[]> = {};
  nodeTypeDefinitions.forEach((def) => {
    if (!groups[def.category]) {
      groups[def.category] = [];
    }
    groups[def.category].push(def);
  });
  return groups;
});

function handleDragStart(event: DragEvent, def: NodeTypeDefinition) {
  if (event.dataTransfer) {
    event.dataTransfer.setData('application/node-type', def.type);
    event.dataTransfer.effectAllowed = 'copy';
  }
  emit('drag-start', def);
}
</script>

<style scoped>
.node-palette {
  width: 220px;
  height: 100%;
  background: #ffffff;
  border-right: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.palette-header {
  padding: 12px 16px;
  font-weight: 600;
  color: #303133;
  border-bottom: 1px solid #ebeef5;
  display: flex;
  align-items: center;
  gap: 8px;
  background: #fafbfc;
}

.category {
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}

.category-title {
  padding: 4px 16px 8px;
  font-size: 11px;
  color: #909399;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
}

.category-nodes {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 8px;
}

.palette-node {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-left: 3px solid #dcdfe6;
  border-radius: 4px;
  background: #ffffff;
  cursor: grab;
  transition: all 0.2s;
  font-size: 13px;
  color: #606266;
}

.palette-node:hover {
  background: #ecf5ff;
  transform: translateX(2px);
  color: #409EFF;
}

.palette-node:active {
  cursor: grabbing;
}

.node-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
