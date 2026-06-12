<template>
  <div class="instrument-monitor">
    <div class="page-header">
      <div class="header-title">
        <el-icon :size="22" color="#409EFF"><Monitor /></el-icon>
        <h2>仪器监控面板</h2>
      </div>
      <div class="header-actions">
        <el-button @click="store.fetchInstruments">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
        <el-button type="primary" @click="connectAll" :loading="connectingAll">
          <el-icon><Link /></el-icon>
          一键连接全部仪器
        </el-button>
      </div>
    </div>

    <div class="stats-row">
      <div class="stat-card total">
        <div class="stat-icon">
          <el-icon :size="28"><Cpu /></el-icon>
        </div>
        <div class="stat-content">
          <div class="stat-value">{{ store.instruments.length }}</div>
          <div class="stat-label">仪器总数</div>
        </div>
      </div>
      <div class="stat-card online">
        <div class="stat-icon">
          <el-icon :size="28"><CircleCheck /></el-icon>
        </div>
        <div class="stat-content">
          <div class="stat-value">{{ onlineCount }}</div>
          <div class="stat-label">在线仪器</div>
        </div>
      </div>
      <div class="stat-card offline">
        <div class="stat-icon">
          <el-icon :size="28"><CircleClose /></el-icon>
        </div>
        <div class="stat-content">
          <div class="stat-value">{{ offlineCount }}</div>
          <div class="stat-label">离线仪器</div>
        </div>
      </div>
      <div class="stat-card error">
        <div class="stat-icon">
          <el-icon :size="28"><Warning /></el-icon>
        </div>
        <div class="stat-content">
          <div class="stat-value">{{ errorCount }}</div>
          <div class="stat-label">异常仪器</div>
        </div>
      </div>
    </div>

    <div class="instrument-grid">
      <div
        v-for="inst in store.instruments"
        :key="inst.config.id"
        class="instrument-card"
        :class="`status-${inst.status}`"
      >
        <div class="card-header">
          <div class="instrument-icon" :style="{ background: typeColor(inst.config.type) }">
            <el-icon :size="20">
              <component :is="typeIcon(inst.config.type)" />
            </el-icon>
          </div>
          <div class="instrument-title">
            <div class="instrument-name">{{ inst.config.name }}</div>
            <div class="instrument-type">{{ instrumentTypeLabels[inst.config.type] }}</div>
          </div>
          <el-tag
            :type="statusTagType(inst.status)"
            effect="dark"
            size="small"
            round
          >
            <span class="status-dot" :style="{ background: instrumentStatusColors[inst.status] }" />
            {{ instrumentStatusLabels[inst.status] }}
          </el-tag>
        </div>

        <div class="card-body">
          <div class="info-row">
            <span class="info-label">仪器ID:</span>
            <span class="info-value code">{{ inst.config.id }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">通信协议:</span>
            <span class="info-value">{{ inst.config.protocol }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">网络地址:</span>
            <span class="info-value code">{{ inst.config.host }}:{{ inst.config.port }}</span>
          </div>
          <div v-if="inst.identity" class="info-row">
            <span class="info-label">设备标识:</span>
            <span class="info-value code identity">{{ inst.identity }}</span>
          </div>
          <div v-if="inst.config.description" class="info-row description">
            <span class="info-label">描述:</span>
            <span class="info-value">{{ inst.config.description }}</span>
          </div>
          <div v-if="inst.errorMessage" class="info-row error">
            <el-icon color="#F56C6C"><WarningFilled /></el-icon>
            <span class="error-text">{{ inst.errorMessage }}</span>
          </div>
        </div>

        <div class="card-footer">
          <el-button
            v-if="inst.status === 'offline' || inst.status === 'error'"
            type="primary"
            size="small"
            :loading="connectingMap[inst.config.id]"
            @click="connectInstrument(inst.config.id)"
          >
            <el-icon><Link /></el-icon>
            连接
          </el-button>
          <el-button
            v-else
            size="small"
            @click="disconnectInstrument(inst.config.id)"
            :loading="connectingMap[inst.config.id]"
          >
            <el-icon><Close /></el-icon>
            断开
          </el-button>
          <el-button
            size="small"
            :disabled="inst.status !== 'online'"
            @click="readMeasurement(inst)"
          >
            <el-icon><DataAnalysis /></el-icon>
            测试测量
          </el-button>
        </div>

        <div v-if="measurementResults[inst.config.id]" class="measurement-panel">
          <div class="measurement-title">最近测量数据</div>
          <div class="measurement-grid">
            <div v-for="(val, key) in measurementResults[inst.config.id]" :key="key" class="meas-item">
              <span class="meas-label">{{ measurementLabel(key as string) }}</span>
              <span class="meas-value">{{ Number(val).toFixed(4) }} {{ measurementUnit(key as string) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import axios from 'axios';
import { useAppStore } from '../stores/app';
import {
  Monitor, Refresh, Link, Cpu, CircleCheck, CircleClose, Warning,
  WarningFilled, Close, DataAnalysis,
  Lightning, Histogram, Aim, SwitchButton,
} from '@element-plus/icons-vue';
import {
  InstrumentStatus, InstrumentType, instrumentStatusColors,
  instrumentStatusLabels, instrumentTypeLabels,
} from '../types/instrument';
import type { InstrumentState } from '../types/instrument';

const store = useAppStore();

const connectingAll = ref(false);
const connectingMap = reactive<Record<string, boolean>>({});
const measurementResults = reactive<Record<string, Record<string, number>>>({});

const onlineCount = computed(() =>
  store.instruments.filter((i) => i.status === InstrumentStatus.ONLINE).length,
);
const offlineCount = computed(() =>
  store.instruments.filter((i) => i.status === InstrumentStatus.OFFLINE).length,
);
const errorCount = computed(() =>
  store.instruments.filter((i) => i.status === InstrumentStatus.ERROR).length,
);

function statusTagType(status: InstrumentStatus): string {
  const map: Record<InstrumentStatus, string> = {
    [InstrumentStatus.ONLINE]: 'success',
    [InstrumentStatus.OFFLINE]: 'info',
    [InstrumentStatus.CONNECTING]: 'warning',
    [InstrumentStatus.BUSY]: '',
    [InstrumentStatus.ERROR]: 'danger',
  };
  return map[status];
}

function typeIcon(type: InstrumentType) {
  const map: Record<InstrumentType, any> = {
    [InstrumentType.POWER_SUPPLY]: Lightning,
    [InstrumentType.MULTIMETER]: DataAnalysis,
    [InstrumentType.OSCILLOSCOPE]: Histogram,
    [InstrumentType.DATA_ACQUISITION]: Cpu,
    [InstrumentType.RELAY]: Aim,
  };
  return map[type] || Cpu;
}

function typeColor(type: InstrumentType): string {
  const map: Record<InstrumentType, string> = {
    [InstrumentType.POWER_SUPPLY]: 'linear-gradient(135deg, #409EFF 0%, #66b1ff 100%)',
    [InstrumentType.MULTIMETER]: 'linear-gradient(135deg, #67C23A 0%, #85ce61 100%)',
    [InstrumentType.OSCILLOSCOPE]: 'linear-gradient(135deg, #9B59B6 0%, #a582b5 100%)',
    [InstrumentType.DATA_ACQUISITION]: 'linear-gradient(135deg, #E6A23C 0%, #ebb563 100%)',
    [InstrumentType.RELAY]: 'linear-gradient(135deg, #909399 0%, #a6a9ad 100%)',
  };
  return map[type] || '#909399';
}

async function connectInstrument(id: string) {
  connectingMap[id] = true;
  try {
    await store.connectInstrument(id);
    ElMessage.success('仪器连接成功');
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '连接失败');
  } finally {
    connectingMap[id] = false;
  }
}

async function disconnectInstrument(id: string) {
  connectingMap[id] = true;
  try {
    await store.disconnectInstrument(id);
    ElMessage.success('仪器已断开');
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.message || '断开失败');
  } finally {
    connectingMap[id] = false;
  }
}

async function connectAll() {
  connectingAll.value = true;
  try {
    await store.connectAllInstruments();
    ElMessage.success('批量连接完成');
  } catch (err) {
    ElMessage.error('批量连接失败');
  } finally {
    connectingAll.value = false;
  }
}

async function readMeasurement(inst: InstrumentState) {
  try {
    const results: Record<string, number> = {};

    if (inst.config.type === InstrumentType.MULTIMETER || inst.config.type === InstrumentType.DATA_ACQUISITION) {
      const [volt, curr, imp] = await Promise.all([
        axios.post(`/api/instruments/${inst.config.id}/read-voltage`).then((r) => r.data.value).catch(() => null),
        axios.post(`/api/instruments/${inst.config.id}/read-current`).then((r) => r.data.value).catch(() => null),
        axios.post(`/api/instruments/${inst.config.id}/read-impedance`).then((r) => r.data.value).catch(() => null),
      ]);
      if (volt !== null) results.voltage = volt;
      if (curr !== null) results.current = curr;
      if (imp !== null) results.impedance = imp;
    } else if (inst.config.type === InstrumentType.POWER_SUPPLY) {
      const [volt, curr] = await Promise.all([
        axios.post(`/api/instruments/${inst.config.id}/read-voltage`).then((r) => r.data.value).catch(() => null),
        axios.post(`/api/instruments/${inst.config.id}/read-current`).then((r) => r.data.value).catch(() => null),
      ]);
      if (volt !== null) results.voltage = volt;
      if (curr !== null) results.current = curr;
    } else {
      const volt = await axios.post(`/api/instruments/${inst.config.id}/read-voltage`).then((r) => r.data.value).catch(() => null);
      if (volt !== null) results.voltage = volt;
    }

    if (Object.keys(results).length > 0) {
      measurementResults[inst.config.id] = results;
      ElMessage.success('测量完成');
    } else {
      ElMessage.warning('未能获取有效测量数据');
    }
  } catch (err) {
    ElMessage.error('测量失败');
  }
}

function measurementLabel(key: string): string {
  const map: Record<string, string> = {
    voltage: '电压',
    current: '电流',
    impedance: '阻抗',
    temperature: '温度',
  };
  return map[key] || key;
}

function measurementUnit(key: string): string {
  const map: Record<string, string> = {
    voltage: 'V',
    current: 'A',
    impedance: 'Ω',
    temperature: '°C',
  };
  return map[key] || '';
}

onMounted(() => {
  if (store.instruments.length === 0) {
    store.fetchInstruments();
  }
});
</script>

<style scoped>
.instrument-monitor {
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

.header-actions {
  display: flex;
  gap: 10px;
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}

.stat-card {
  background: #ffffff;
  border-radius: 8px;
  padding: 16px 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  border-left: 4px solid;
}

.stat-card.total {
  border-left-color: #409EFF;
}
.stat-card.online {
  border-left-color: #67C23A;
}
.stat-card.offline {
  border-left-color: #909399;
}
.stat-card.error {
  border-left-color: #F56C6C;
}

.stat-icon {
  width: 52px;
  height: 52px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f0f7ff;
  color: #409EFF;
}

.stat-card.online .stat-icon {
  background: #f0f9eb;
  color: #67C23A;
}
.stat-card.offline .stat-icon {
  background: #f4f4f5;
  color: #909399;
}
.stat-card.error .stat-icon {
  background: #fef0f0;
  color: #F56C6C;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  color: #303133;
  line-height: 1;
}

.stat-label {
  font-size: 13px;
  color: #909399;
  margin-top: 6px;
}

.instrument-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 16px;
}

.instrument-card {
  background: #ffffff;
  border-radius: 10px;
  border: 1px solid #ebeef5;
  overflow: hidden;
  transition: all 0.3s;
}

.instrument-card:hover {
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  transform: translateY(-2px);
}

.instrument-card.status-online {
  border-color: #e1f3d8;
}
.instrument-card.status-error {
  border-color: #fbc4c4;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 18px;
  background: #fafbfc;
  border-bottom: 1px solid #f0f0f0;
}

.instrument-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
}

.instrument-title {
  flex: 1;
}

.instrument-name {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.instrument-type {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
}

.status-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-right: 4px;
  vertical-align: middle;
}

.card-body {
  padding: 14px 18px;
}

.info-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 4px 0;
  font-size: 13px;
}

.info-label {
  color: #909399;
  min-width: 80px;
  flex-shrink: 0;
}

.info-value {
  color: #606266;
  flex: 1;
  word-break: break-all;
}

.info-value.code {
  font-family: 'Consolas', monospace;
  font-size: 12px;
}

.info-value.identity {
  color: #409EFF;
}

.info-row.description .info-value {
  font-size: 12px;
  color: #909399;
}

.info-row.error {
  background: #fef0f0;
  padding: 8px 10px;
  border-radius: 4px;
  margin-top: 8px;
  gap: 6px;
}

.error-text {
  color: #F56C6C;
  font-size: 12px;
}

.card-footer {
  display: flex;
  gap: 10px;
  padding: 12px 18px;
  border-top: 1px solid #f0f0f0;
  background: #fafbfc;
}

.measurement-panel {
  padding: 12px 18px;
  border-top: 1px solid #e1f3d8;
  background: #f0f9eb;
}

.measurement-title {
  font-size: 12px;
  color: #67C23A;
  font-weight: 600;
  margin-bottom: 8px;
}

.measurement-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.meas-item {
  background: #ffffff;
  border-radius: 6px;
  padding: 8px 10px;
  text-align: center;
}

.meas-label {
  display: block;
  font-size: 11px;
  color: #909399;
  margin-bottom: 4px;
}

.meas-value {
  font-family: 'Consolas', monospace;
  font-size: 15px;
  font-weight: 700;
  color: #67C23A;
}
</style>
