<template>
  <div class="properties-panel">
    <div class="panel-header">
      <el-icon :size="16" color="#409EFF"><Setting /></el-icon>
      <span>属性配置</span>
    </div>

    <div v-if="!selectedNode" class="empty-state">
      <el-empty description="请选择一个节点以编辑属性" :image-size="80" />
    </div>

    <div v-else class="panel-content">
      <div class="node-info">
        <el-tag :color="nodeColor" effect="dark" size="small">
          {{ nodeTypeLabel }}
        </el-tag>
        <span class="node-id">#{{ selectedNode.id }}</span>
      </div>

      <el-form
        ref="formRef"
        :model="formData"
        label-width="100px"
        label-position="left"
        size="default"
        class="config-form"
      >
        <el-form-item label="节点名称">
          <el-input
            v-model="formData.label"
            placeholder="输入节点名称"
            @change="handleLabelChange"
          />
        </el-form-item>

        <template v-if="showInstrumentSelect">
          <el-form-item label="目标仪器">
            <el-select
              v-model="formData.config.instrumentId"
              placeholder="选择仪器"
              filterable
              clearable
              @change="handleConfigChange"
            >
              <el-option
                v-for="inst in availableInstruments"
                :key="inst.config.id"
                :label="inst.config.name"
                :value="inst.config.id"
              >
                <span>{{ inst.config.name }}</span>
                <el-tag
                  :type="inst.status === 'online' ? 'success' : 'info'"
                  size="small"
                  style="margin-left: 8px"
                >
                  {{ inst.status === 'online' ? '在线' : '离线' }}
                </el-tag>
              </el-option>
            </el-select>
          </el-form-item>
        </template>

        <template v-if="isPowerControl">
          <el-form-item label="电压值 (V)">
            <el-input-number
              v-model="formData.config.voltage"
              :min="0"
              :max="1000"
              :step="0.1"
              :precision="3"
              controls-position="right"
              style="width: 100%"
              @change="handleConfigChange"
            />
          </el-form-item>
          <el-form-item label="电流值 (A)">
            <el-input-number
              v-model="formData.config.current"
              :min="0"
              :max="100"
              :step="0.1"
              :precision="3"
              controls-position="right"
              style="width: 100%"
              @change="handleConfigChange"
            />
          </el-form-item>
        </template>

        <template v-if="isDelay">
          <el-form-item label="延时 (ms)">
            <el-input-number
              v-model="formData.config.delayMs"
              :min="0"
              :max="600000"
              :step="100"
              controls-position="right"
              style="width: 100%"
              @change="handleConfigChange"
            />
          </el-form-item>
        </template>

        <template v-if="isRelay">
          <el-form-item label="继电器通道">
            <el-input
              v-model="formData.config.relayChannel"
              placeholder="如: 1 或 101,102,103"
              @change="handleConfigChange"
            />
          </el-form-item>
        </template>

        <template v-if="isJudge">
          <el-form-item label="最小值">
            <el-input-number
              v-model="formData.config.minValue"
              :precision="6"
              controls-position="right"
              style="width: 100%"
              @change="handleConfigChange"
            />
          </el-form-item>
          <el-form-item label="最大值">
            <el-input-number
              v-model="formData.config.maxValue"
              :precision="6"
              controls-position="right"
              style="width: 100%"
              @change="handleConfigChange"
            />
          </el-form-item>
          <el-form-item label="目标值">
            <el-input-number
              v-model="formData.config.targetValue"
              :precision="6"
              controls-position="right"
              style="width: 100%"
              @change="handleConfigChange"
            />
          </el-form-item>
          <el-form-item label="容差范围">
            <el-input-number
              v-model="formData.config.tolerance"
              :min="0"
              :precision="6"
              controls-position="right"
              style="width: 100%"
              @change="handleConfigChange"
            />
          </el-form-item>
        </template>

        <template v-if="isScpiRaw">
          <el-form-item label="SCPI命令">
            <el-input
              v-model="formData.config.scpiCommand"
              type="textarea"
              :rows="3"
              placeholder="如: *IDN?"
              @change="handleConfigChange"
            />
          </el-form-item>
          <el-form-item label="期望响应">
            <el-switch
              v-model="formData.config.expectResponse"
              @change="handleConfigChange"
            />
          </el-form-item>
        </template>

        <template v-if="isLogMessage">
          <el-form-item label="日志消息">
            <el-input
              v-model="formData.config.message"
              type="textarea"
              :rows="3"
              placeholder="输入要输出的日志消息"
              @change="handleConfigChange"
            />
          </el-form-item>
        </template>

        <el-form-item v-if="hasResult" label="执行结果">
          <div class="result-display">
            <el-tag v-if="nodeResult" :type="resultTagType" effect="dark">
              {{ resultLabel }}
            </el-tag>
            <div v-if="nodeResult?.output?.message" class="result-message">
              {{ nodeResult.output.message }}
            </div>
            <div v-if="nodeResult?.measurements" class="result-measurements">
              <div v-for="(value, key) in nodeResult.measurements" :key="key" class="meas-item">
                <span class="meas-label">{{ measurementLabel(key as string) }}:</span>
                <span class="meas-value">{{ Number(value).toFixed(6) }} {{ measurementUnit(key as string) }}</span>
              </div>
            </div>
            <div v-if="nodeResult?.error" class="result-error">
              <el-icon color="#F56C6C"><WarningFilled /></el-icon>
              {{ nodeResult.error }}
            </div>
          </div>
        </el-form-item>
      </el-form>

      <div class="panel-actions">
        <el-button type="danger" size="small" @click="handleDelete">
          <el-icon><Delete /></el-icon>
          删除节点
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useAppStore } from '../stores/app';
import {
  nodeTypeDefinitions,
  NodeType,
  type FlowNode,
  type FlowNodeConfig,
  NodeExecutionStatus,
} from '../types/flow';
import { Setting, Delete, WarningFilled } from '@element-plus/icons-vue';

const store = useAppStore();

const formRef = ref();

interface FormData {
  label: string;
  config: FlowNodeConfig;
}

const formData = ref<FormData>({
  label: '',
  config: {},
});

const selectedNode = computed<FlowNode | null>(() => {
  if (!store.selectedNodeId) return null;
  return store.flowGraph.nodes.find((n) => n.id === store.selectedNodeId) || null;
});

const nodeDef = computed(() =>
  nodeTypeDefinitions.find((d) => d.type === selectedNode.value?.type),
);

const nodeTypeLabel = computed(() => nodeDef.value?.label || selectedNode.value?.type);
const nodeColor = computed(() => nodeDef.value?.color || '#909399');

const availableInstruments = computed(() => store.instruments);

const isPowerControl = computed(() =>
  [NodeType.SET_VOLTAGE, NodeType.SET_CURRENT].includes(selectedNode.value?.type as NodeType),
);

const showInstrumentSelect = computed(() => {
  const typesWithInstrument = [
    NodeType.POWER_ON, NodeType.POWER_OFF,
    NodeType.SET_VOLTAGE, NodeType.SET_CURRENT,
    NodeType.READ_VOLTAGE, NodeType.READ_CURRENT, NodeType.READ_IMPEDANCE,
    NodeType.RELAY_CLOSE, NodeType.RELAY_OPEN,
    NodeType.SCPI_RAW,
  ];
  return typesWithInstrument.includes(selectedNode.value?.type as NodeType);
});

const isDelay = computed(() => selectedNode.value?.type === NodeType.DELAY);
const isRelay = computed(() =>
  [NodeType.RELAY_CLOSE, NodeType.RELAY_OPEN].includes(selectedNode.value?.type as NodeType),
);
const isJudge = computed(() => selectedNode.value?.type === NodeType.JUDGE);
const isScpiRaw = computed(() => selectedNode.value?.type === NodeType.SCPI_RAW);
const isLogMessage = computed(() => selectedNode.value?.type === NodeType.LOG_MESSAGE);

const nodeResult = computed(() => {
  if (!store.executionState || !selectedNode.value) return null;
  return store.executionState.results[selectedNode.value.id];
});

const hasResult = computed(() => !!nodeResult.value && nodeResult.value.status !== NodeExecutionStatus.PENDING);

const resultTagType = computed(() => {
  const status = nodeResult.value?.status;
  if (status === NodeExecutionStatus.PASSED) return 'success';
  if (status === NodeExecutionStatus.FAILED) return 'danger';
  if (status === NodeExecutionStatus.RUNNING) return 'warning';
  return 'info';
});

const resultLabel = computed(() => {
  const map: Record<string, string> = {
    pending: '待执行',
    running: '执行中',
    passed: '通过',
    failed: '失败',
    skipped: '跳过',
    timeout: '超时',
  };
  return map[nodeResult.value?.status || ''] || '';
});

watch(selectedNode, (node) => {
  if (node) {
    formData.value = {
      label: node.label,
      config: { ...node.config },
    };
  }
}, { immediate: true, deep: true });

function handleLabelChange(value: string) {
  if (!selectedNode.value) return;
  const idx = store.flowGraph.nodes.findIndex((n) => n.id === selectedNode.value!.id);
  if (idx >= 0) {
    store.flowGraph.nodes[idx].label = value;
  }
}

function handleConfigChange() {
  if (!selectedNode.value) return;
  const idx = store.flowGraph.nodes.findIndex((n) => n.id === selectedNode.value!.id);
  if (idx >= 0) {
    store.flowGraph.nodes[idx].config = { ...formData.value.config };
  }
}

function handleDelete() {
  if (!selectedNode.value) return;
  const nodeId = selectedNode.value.id;
  store.flowGraph.nodes = store.flowGraph.nodes.filter((n) => n.id !== nodeId);
  store.flowGraph.edges = store.flowGraph.edges.filter(
    (e) => e.source !== nodeId && e.target !== nodeId,
  );
  store.clearSelection();
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

const emit = defineEmits<{
  (e: 'node-updated'): void;
}>();
</script>

<style scoped>
.properties-panel {
  width: 320px;
  height: 100%;
  background: #ffffff;
  border-left: 1px solid #e4e7ed;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  padding: 12px 16px;
  font-weight: 600;
  color: #303133;
  border-bottom: 1px solid #ebeef5;
  display: flex;
  align-items: center;
  gap: 8px;
  background: #fafbfc;
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.node-info {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #ebeef5;
}

.node-id {
  color: #909399;
  font-family: monospace;
  font-size: 12px;
}

.config-form {
  margin-top: 8px;
}

:deep(.el-form-item) {
  margin-bottom: 16px;
}

:deep(.el-form-item__label) {
  font-size: 13px;
  color: #606266;
}

.result-display {
  background: #f5f7fa;
  border-radius: 6px;
  padding: 12px;
  width: 100%;
}

.result-message {
  margin-top: 8px;
  font-size: 12px;
  color: #606266;
  line-height: 1.5;
}

.result-measurements {
  margin-top: 10px;
}

.meas-item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.meas-label {
  color: #909399;
  font-size: 12px;
  min-width: 60px;
}

.meas-value {
  color: #67C23A;
  font-weight: 700;
  font-family: 'Consolas', monospace;
}

.result-error {
  margin-top: 8px;
  color: #F56C6C;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.panel-actions {
  padding: 12px 16px;
  border-top: 1px solid #ebeef5;
  background: #fafbfc;
}
</style>
