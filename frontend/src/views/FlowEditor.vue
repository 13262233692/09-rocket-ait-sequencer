<template>
  <div class="flow-editor">
    <div class="editor-toolbar">
      <div class="toolbar-left">
        <el-input
          v-model="flowName"
          class="flow-name-input"
          placeholder="输入测试流程名称"
          @change="updateFlowName"
        />
        <el-tag type="primary" effect="plain">节点: {{ store.flowGraph.nodes.length }}</el-tag>
        <el-tag type="info" effect="plain">连线: {{ store.flowGraph.edges.length }}</el-tag>
      </div>

      <div class="toolbar-right">
        <el-tooltip content="新建流程">
          <el-button @click="clearFlow">
            <el-icon><DocumentAdd /></el-icon>
            新建
          </el-button>
        </el-tooltip>
        <el-tooltip content="导入示例流程">
          <el-button @click="loadDemoFlow">
            <el-icon><Upload /></el-icon>
            示例
          </el-button>
        </el-tooltip>
        <el-divider direction="vertical" />
        <el-tooltip content="验证流程">
          <el-button type="info" @click="validateCurrentFlow">
            <el-icon><CircleCheck /></el-icon>
            验证
          </el-button>
        </el-tooltip>
        <el-tooltip :content="store.isExecuting ? '停止执行' : '执行流程'">
          <el-button
            :type="store.isExecuting ? 'danger' : 'success'"
            @click="store.isExecuting ? stopFlow() : executeFlow()"
            :loading="executingLoading"
          >
            <el-icon>
              <VideoPause v-if="store.isExecuting" />
              <VideoPlay v-else />
            </el-icon>
            {{ store.isExecuting ? '停止' : '执行' }}
          </el-button>
        </el-tooltip>
      </div>
    </div>

    <div class="editor-body">
      <NodePalette @drag-start="onPaletteDragStart" />

      <div
        class="flow-canvas-wrapper"
        @dragover.prevent="onDragOver"
        @drop="onDrop"
      >
        <VueFlow
          v-model:nodes="vueFlowNodes"
          v-model:edges="vueFlowEdges"
          :node-types="nodeTypes"
          @node-click="onNodeClick"
          @edge-click="onEdgeClick"
          @pane-click="onPaneClick"
          @connect="onConnect"
          @delete="onDelete"
          class="vue-flow-canvas"
          fit-view-on-init
          :min-zoom="0.2"
          :max-zoom="2"
          :default-edge-options="{
            type: 'smoothstep',
            animated: false,
            style: { stroke: '#a8abb2', strokeWidth: 2 },
          }"
        >
          <Background pattern-color="#e4e7ed" :gap="20" />
          <Controls :show-fit-view="true" :show-interactive="true" />
          <MiniMap pannable zoomable :node-color="miniMapNodeColor" />
        </VueFlow>

        <div v-if="executionStatusBar" class="execution-status-bar">
          <div class="status-info">
            <el-icon :color="statusBarColor">
              <Loading v-if="store.executionState?.status === 'running'" />
              <CircleCheck v-else-if="store.executionState?.status === 'completed'" />
              <CircleClose v-else-if="store.executionState?.status === 'failed'" />
              <VideoPause v-else />
            </el-icon>
            <span class="status-text">{{ statusText }}</span>
            <span class="status-detail">
              {{ passedCount }} / {{ store.flowGraph.nodes.length }} 节点通过
            </span>
          </div>
          <div class="status-progress">
            <el-progress
              :percentage="progressPercentage"
              :color="statusBarColor"
              :show-text="false"
              :stroke-width="6"
            />
          </div>
          <el-button size="small" text type="primary" @click="store.resetExecutionState">
            清除状态
          </el-button>
        </div>
      </div>

      <PropertiesPanel />
    </div>

    <div class="event-log-panel">
      <div class="log-header">
        <el-icon :size="16"><Tickets /></el-icon>
        <span>执行日志</span>
        <el-button size="small" text type="primary" @click="store.engineEvents = []">
          清空
        </el-button>
      </div>
      <div class="log-content">
        <div
          v-for="(event, idx) in reversedEvents"
          :key="idx"
          class="log-item"
          :class="`log-${event.type}`"
        >
          <span class="log-time">{{ formatTime(event.timestamp) }}</span>
          <el-tag :type="eventTagType(event.type)" size="small" effect="dark">
            {{ eventLabel(event.type) }}
          </el-tag>
          <span class="log-message">{{ event.message }}</span>
        </div>
        <el-empty v-if="store.engineEvents.length === 0" description="暂无执行日志" :image-size="60" />
      </div>
    </div>

    <PyroEmergencyAlert />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, markRaw } from 'vue';
import { useVueFlow } from '@vue-flow/core';
import Background from '@vue-flow/background';
import Controls from '@vue-flow/controls';
import MiniMap from '@vue-flow/minimap';
import {
  VideoPlay, VideoPause, DocumentAdd, Upload, CircleCheck, CircleClose,
  Tickets, Loading,
} from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { v4 as uuidv4 } from 'uuid';
import { useAppStore } from '../stores/app';
import NodePalette from '../components/NodePalette.vue';
import PropertiesPanel from '../components/PropertiesPanel.vue';
import CustomNode from '../components/CustomNode.vue';
import PyroEmergencyAlert from '../components/PyroEmergencyAlert.vue';
import {
  FlowNode, FlowEdge, FlowGraph, NodeType,
  NodeExecutionStatus as Status, nodeTypeDefinitions,
  type NodeTypeDefinition,
} from '../types/flow';

const store = useAppStore();
const { onConnect: addEdge, addNodes, addEdges, project } = useVueFlow();

const executingLoading = ref(false);

const nodeTypes = markRaw({
  custom: CustomNode,
});

const flowName = ref(store.flowGraph.name);

const vueFlowNodes = computed({
  get: () => {
    return store.flowGraph.nodes.map((node) => {
      const result = store.executionState?.results[node.id];
      return {
        id: node.id,
        type: 'custom',
        position: node.position,
        data: {
          label: node.label,
          type: node.type,
          config: node.config,
          executionStatus: result?.status,
          result: result,
        },
        selected: store.selectedNodeId === node.id,
      };
    });
  },
  set: (nodes: any[]) => {
    store.flowGraph.nodes = nodes.map((n) => ({
      id: n.id,
      type: n.data.type,
      label: n.data.label,
      position: n.position,
      config: n.data.config,
    }));
  },
});

const vueFlowEdges = computed({
  get: () => {
    return store.flowGraph.edges.map((edge) => {
      const isPassed = store.passedEdges.has(edge.id);
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        label: edge.label,
        animated: isPassed,
        style: isPassed
          ? { stroke: '#67C23A', strokeWidth: 3, filter: 'drop-shadow(0 0 6px rgba(103, 194, 58, 0.5))' }
          : { stroke: '#a8abb2', strokeWidth: 2 },
      };
    });
  },
  set: (edges: any[]) => {
    store.flowGraph.edges = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      label: e.label,
    }));
  },
});

const executionStatusBar = computed(() => !!store.executionState);

const statusBarColor = computed(() => {
  const s = store.executionState?.status;
  if (s === 'running') return '#E6A23C';
  if (s === 'completed') return '#67C23A';
  if (s === 'failed') return '#F56C6C';
  if (s === 'stopped') return '#909399';
  return '#409EFF';
});

const statusText = computed(() => {
  const s = store.executionState?.status;
  const map: Record<string, string> = {
    running: '流程执行中...',
    completed: '流程执行完成',
    failed: '流程执行失败',
    stopped: '流程已停止',
    paused: '流程已暂停',
    idle: '等待执行',
  };
  return map[s || ''] || '';
});

const passedCount = computed(() => {
  if (!store.executionState) return 0;
  return Object.values(store.executionState.results).filter(
    (r) => r.status === Status.PASSED,
  ).length;
});

const progressPercentage = computed(() => {
  const total = store.flowGraph.nodes.length;
  if (total === 0) return 0;
  return Math.round((passedCount.value / total) * 100);
});

const reversedEvents = computed(() => [...store.engineEvents].reverse());

function miniMapNodeColor(node: any): string {
  if (node.data?.executionStatus === Status.PASSED) return '#67C23A';
  if (node.data?.executionStatus === Status.RUNNING) return '#E6A23C';
  if (node.data?.executionStatus === Status.FAILED) return '#F56C6C';
  const def = nodeTypeDefinitions.find((d) => d.type === node.data?.type);
  return def?.color || '#909399';
}

function onPaletteDragStart(def: NodeTypeDefinition) {
  // 拖拽开始时的处理
}

function onDragOver(event: DragEvent) {
  event.dataTransfer!.dropEffect = 'copy';
}

function onDrop(event: DragEvent) {
  const nodeType = event.dataTransfer?.getData('application/node-type') as NodeType;
  if (!nodeType) return;

  const def = nodeTypeDefinitions.find((d) => d.type === nodeType);
  if (!def) return;

  const position = project({
    x: event.clientX,
    y: event.clientY,
  });

  const newNode: FlowNode = {
    id: `node_${uuidv4().slice(0, 8)}`,
    type: nodeType,
    label: def.label,
    position,
    config: { ...def.defaultConfig },
  };

  store.flowGraph.nodes.push(newNode);
  store.selectNode(newNode.id);
  ElMessage.success(`已添加节点: ${def.label}`);
}

function onNodeClick(event: any) {
  store.selectNode(event.id);
}

function onEdgeClick(event: any) {
  store.selectEdge(event.id);
}

function onPaneClick() {
  store.clearSelection();
}

function onConnect(params: any) {
  const newEdge: FlowEdge = {
    id: `edge_${uuidv4().slice(0, 8)}`,
    source: params.source,
    target: params.target,
    sourceHandle: params.sourceHandle,
    targetHandle: params.targetHandle,
  };
  store.flowGraph.edges.push(newEdge);
}

function onDelete(params: any) {
  const { nodes, edges } = params;
  if (nodes) {
    store.flowGraph.nodes = store.flowGraph.nodes.filter(
      (n) => !nodes.some((nd: any) => nd.id === n.id),
    );
  }
  if (edges) {
    store.flowGraph.edges = store.flowGraph.edges.filter(
      (e) => !edges.some((ed: any) => ed.id === e.id),
    );
  }
  store.clearSelection();
}

function updateFlowName() {
  store.flowGraph.name = flowName.value;
}

function clearFlow() {
  ElMessageBox.confirm('确定要清空当前流程吗？所有节点和连线将被删除。', '确认', {
    type: 'warning',
  }).then(() => {
    store.flowGraph.nodes = [];
    store.flowGraph.edges = [];
    store.resetExecutionState();
    store.clearSelection();
    ElMessage.success('流程已清空');
  }).catch(() => {});
}

function loadDemoFlow() {
  const demoGraph: FlowGraph = {
    id: 'demo-flow',
    name: '箭体通电测试流程',
    nodes: [
      { id: 'n1', type: NodeType.START, label: '开始', position: { x: 300, y: 50 }, config: {} },
      { id: 'n2', type: NodeType.POWER_ON, label: '主电源开启', position: { x: 260, y: 150 }, config: { instrumentId: 'ps-001' } },
      { id: 'n3', type: NodeType.SET_VOLTAGE, label: '设置母线电压 28V', position: { x: 240, y: 250 }, config: { instrumentId: 'ps-001', voltage: 28.0 } },
      { id: 'n4', type: NodeType.DELAY, label: '等待500ms', position: { x: 270, y: 350 }, config: { delayMs: 500 } },
      { id: 'n5', type: NodeType.READ_VOLTAGE, label: '读取母线电压', position: { x: 250, y: 450 }, config: { instrumentId: 'dmm-001' } },
      { id: 'n6', type: NodeType.JUDGE, label: '电压合格判定', position: { x: 260, y: 550 }, config: { minValue: 26.5, maxValue: 29.5 } },
      { id: 'n7', type: NodeType.RELAY_CLOSE, label: '继电器 CH101 闭合', position: { x: 240, y: 650 }, config: { instrumentId: 'relay-001', relayChannel: 101 } },
      { id: 'n8', type: NodeType.READ_CURRENT, label: '读取工作电流', position: { x: 250, y: 750 }, config: { instrumentId: 'dmm-001' } },
      { id: 'n9', type: NodeType.JUDGE, label: '电流合格判定', position: { x: 260, y: 850 }, config: { minValue: 0.5, maxValue: 8.0 } },
      { id: 'n10', type: NodeType.POWER_OFF, label: '主电源关闭', position: { x: 260, y: 950 }, config: { instrumentId: 'ps-001' } },
      { id: 'n11', type: NodeType.END, label: '结束', position: { x: 300, y: 1050 }, config: {} },
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
      { id: 'e3', source: 'n3', target: 'n4' },
      { id: 'e4', source: 'n4', target: 'n5' },
      { id: 'e5', source: 'n5', target: 'n6' },
      { id: 'e6', source: 'n6', target: 'n7' },
      { id: 'e7', source: 'n7', target: 'n8' },
      { id: 'e8', source: 'n8', target: 'n9' },
      { id: 'e9', source: 'n9', target: 'n10' },
      { id: 'e10', source: 'n10', target: 'n11' },
    ],
    description: '箭体通电测试典型流程：通电 -> 稳压 -> 读压 -> 判定 -> 继电器切换 -> 读流 -> 判定 -> 断电',
  };

  store.flowGraph = demoGraph;
  flowName.value = demoGraph.name;
  store.resetExecutionState();
  store.clearSelection();
  ElMessage.success('已加载示例流程');
}

async function validateCurrentFlow() {
  try {
    const result = await store.validateFlow(store.flowGraph);
    if (result.valid) {
      ElMessage.success('流程验证通过');
    } else {
      ElMessage.error(`流程验证失败:\n${result.errors.join('\n')}`);
    }
  } catch (err) {
    ElMessage.error('验证请求失败');
  }
}

async function executeFlow() {
  if (store.flowGraph.nodes.length === 0) {
    ElMessage.warning('请先创建测试流程');
    return;
  }

  try {
    const validation = await store.validateFlow(store.flowGraph);
    if (!validation.valid) {
      ElMessage.error(`流程验证失败: ${validation.errors.join('; ')}`);
      return;
    }

    executingLoading.value = true;
    await store.executeFlow(store.flowGraph);
    executingLoading.value = false;
    ElMessage.success('流程已启动执行');
  } catch (err: any) {
    executingLoading.value = false;
    ElMessage.error(err?.response?.data?.message || err.message || '启动执行失败');
  }
}

async function stopFlow() {
  if (!store.executionState?.executionId) return;
  try {
    await store.stopExecution(store.executionState.executionId);
    ElMessage.info('已请求停止执行');
  } catch (err) {
    ElMessage.error('停止失败');
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function eventLabel(type: string): string {
  const map: Record<string, string> = {
    flow_started: '流程启动',
    flow_completed: '流程完成',
    flow_failed: '流程失败',
    flow_stopped: '流程停止',
    node_started: '节点启动',
    node_completed: '节点完成',
    node_failed: '节点失败',
    edge_active: '连线激活',
    pyro_event: '火工品事件',
  };
  return map[type] || type;
}

function eventTagType(type: string): string {
  if (type.includes('completed') || type === 'edge_active') return 'success';
  if (type.includes('failed')) return 'danger';
  if (type.includes('started')) return 'warning';
  if (type.includes('stopped')) return 'info';
  if (type === 'pyro_event') return 'danger';
  return '';
}

onMounted(() => {
  if (store.flowGraph.nodes.length === 0) {
    loadDemoFlow();
  }
});
</script>

<style scoped>
.flow-editor {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}

.editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: #fafbfc;
  border-bottom: 1px solid #ebeef5;
  min-height: 56px;
}

.toolbar-left, .toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.flow-name-input {
  width: 280px;
}

.editor-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
}

.flow-canvas-wrapper {
  flex: 1;
  position: relative;
  background: #f5f7fa;
  min-height: 0;
}

.vue-flow-canvas {
  width: 100%;
  height: 100%;
}

:deep(.vue-flow__background) {
  background-color: #f5f7fa;
}

:deep(.vue-flow__edge-path) {
  transition: all 0.3s ease;
}

:deep(.vue-flow__controls) {
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  border-radius: 6px;
  overflow: hidden;
}

:deep(.vue-flow__minimap) {
  background: #ffffff;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.execution-status-bar {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  background: #ffffff;
  border-radius: 8px;
  padding: 10px 18px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 420px;
  z-index: 5;
  border: 1px solid #ebeef5;
}

.status-info {
  display: flex;
  align-items: center;
  gap: 10px;
  white-space: nowrap;
}

.status-text {
  font-weight: 600;
  color: #303133;
  font-size: 14px;
}

.status-detail {
  color: #909399;
  font-size: 12px;
}

.status-progress {
  flex: 1;
  min-width: 150px;
}

.event-log-panel {
  height: 200px;
  border-top: 1px solid #ebeef5;
  display: flex;
  flex-direction: column;
  background: #fafbfc;
}

.log-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid #ebeef5;
  font-weight: 600;
  color: #303133;
  font-size: 13px;
  background: #ffffff;
}

.log-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px 16px;
}

.log-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 0;
  font-size: 12px;
  border-bottom: 1px solid #f0f0f0;
}

.log-item:last-child {
  border-bottom: none;
}

.log-time {
  color: #c0c4cc;
  font-family: monospace;
  min-width: 70px;
}

.log-message {
  color: #606266;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.log-node_completed .log-message,
.log-flow_completed .log-message {
  color: #67C23A;
}

.log-node_failed .log-message,
.log-flow_failed .log-message {
  color: #F56C6C;
}

.log-node_started .log-message,
.log-flow_started .log-message {
  color: #E6A23C;
}
</style>
