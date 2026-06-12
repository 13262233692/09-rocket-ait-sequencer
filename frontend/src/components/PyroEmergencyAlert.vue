<template>
  <Teleport to="body">
    <Transition name="pyro-alert">
      <div v-if="visible" class="pyro-emergency-overlay">
        <div class="pyro-alert-border-top"></div>
        <div class="pyro-alert-border-right"></div>
        <div class="pyro-alert-border-bottom"></div>
        <div class="pyro-alert-border-left"></div>

        <div class="pyro-alert-corner tl"></div>
        <div class="pyro-alert-corner tr"></div>
        <div class="pyro-alert-corner bl"></div>
        <div class="pyro-alert-corner br"></div>

        <div class="pyro-alert-content">
          <div class="pyro-alert-icon">
            <el-icon :size="120"><WarningFilled /></el-icon>
          </div>

          <h1 class="pyro-alert-title">
            🚨 火工品紧急关断 🚨
          </h1>

          <div class="pyro-alert-reason">
            {{ event?.reason || '检测到危险工况' }}
          </div>

          <div class="pyro-alert-time">
            触发时间: {{ formatTime(event?.timestamp) }}
          </div>

          <div v-if="event?.pyroId" class="pyro-alert-id">
            火工品编号: {{ event.pyroId }}
          </div>

          <div v-if="event?.sensorData" class="pyro-sensor-panel">
            <div class="sensor-title">⚠️ 实时传感器数据</div>
            <div class="sensor-grid">
              <div class="sensor-item danger">
                <span class="sensor-label">当前电阻</span>
                <span class="sensor-value">{{ formatNumber(event.sensorData.resistanceOhms) }} Ω</span>
              </div>
              <div class="sensor-item">
                <span class="sensor-label">名义电阻</span>
                <span class="sensor-value">{{ formatNumber(event.sensorData.nominalResistance) }} Ω</span>
              </div>
              <div class="sensor-item danger">
                <span class="sensor-label">测试电流</span>
                <span class="sensor-value">{{ formatNumber(event.sensorData.currentMa) }} mA</span>
              </div>
              <div class="sensor-item">
                <span class="sensor-label">安全电流</span>
                <span class="sensor-value">{{ formatNumber(event.sensorData.safeCurrentMa) }} mA</span>
              </div>
              <div class="sensor-item danger">
                <span class="sensor-label">击穿阈值</span>
                <span class="sensor-value">{{ formatNumber(event.sensorData.breakdownThreshold) }} Ω</span>
              </div>
              <div class="sensor-item">
                <span class="sensor-label">安全电阻下限</span>
                <span class="sensor-value">{{ formatNumber(event.sensorData.safeResistanceMin) }} Ω</span>
              </div>
            </div>
          </div>

          <div v-if="event?.shutdownResult" class="pyro-shutdown-status">
            <div class="shutdown-title">🔌 仪器紧急关断结果</div>
            <div class="shutdown-stats">
              <span class="success-count">✓ 成功: {{ event.shutdownResult.successCount }}</span>
              <span class="fail-count" v-if="event.shutdownResult.failedCount > 0">
                ✗ 失败: {{ event.shutdownResult.failedCount }}
              </span>
              <span class="total-count">总计: {{ event.shutdownResult.totalCount }}</span>
            </div>
            <div class="shutdown-time">
              关断耗时: {{ event.shutdownResult.latencyMs }} ms
            </div>
          </div>

          <div class="pyro-alert-actions">
            <el-button
              type="danger"
              size="large"
              @click="handleAcknowledge"
              :loading="acknowledging"
              class="ack-btn"
            >
              我已确认，解除警报
            </el-button>
          </div>

          <div class="pyro-alert-footer">
            <span class="blink-text">⚠️ 危险！请立即检查现场安全 ⚠️</span>
          </div>
        </div>

        <div class="scanline"></div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { WarningFilled } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useAppStore } from '../stores/app';

const store = useAppStore();
const acknowledging = ref(false);
let audioContext: AudioContext | null = null;
let alertInterval: number | null = null;

const visible = computed(() => store.pyroEmergencyActive && !store.pyroAlertAcknowledged);
const event = computed(() => store.pyroEmergencyEvent);

function formatNumber(n: number | undefined): string {
  if (n === undefined || n === null) return '--';
  return n.toFixed(4);
}

function formatTime(ts: number | undefined): string {
  if (!ts) return '--';
  const d = new Date(ts);
  return d.toLocaleString('zh-CN', { hour12: false });
}

function playAlertSound() {
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
    oscillator.frequency.setValueAtTime(440, audioContext.currentTime + 0.2);
    gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.4);
  } catch (e) {
    console.warn('播放警报音失败:', e);
  }
}

async function handleAcknowledge() {
  acknowledging.value = true;
  try {
    await store.acknowledgePyroAlert();
    ElMessage.success('紧急警报已确认解除');
  } catch (e) {
    ElMessage.error('解除警报失败');
  } finally {
    acknowledging.value = false;
  }
}

watch(visible, (newVal) => {
  if (newVal) {
    playAlertSound();
    alertInterval = window.setInterval(() => {
      playAlertSound();
    }, 1500);
    document.body.style.overflow = 'hidden';
  } else {
    if (alertInterval) {
      clearInterval(alertInterval);
      alertInterval = null;
    }
    document.body.style.overflow = '';
  }
});

onMounted(() => {
  if (visible.value) {
    playAlertSound();
    alertInterval = window.setInterval(() => {
      playAlertSound();
    }, 1500);
    document.body.style.overflow = 'hidden';
  }
});

onUnmounted(() => {
  if (alertInterval) {
    clearInterval(alertInterval);
  }
  document.body.style.overflow = '';
});
</script>

<style scoped>
.pyro-emergency-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: #8B0000;
  z-index: 999999;
  overflow: hidden;
  animation: bgFlash 0.6s ease-in-out infinite alternate;
}

@keyframes bgFlash {
  0% { background: #8B0000; }
  100% { background: #FF0000; }
}

.pyro-alert-border-top,
.pyro-alert-border-bottom {
  position: absolute;
  left: 0;
  right: 0;
  height: 8px;
  background: repeating-linear-gradient(
    90deg,
    #FFFF00 0px,
    #FFFF00 30px,
    #000000 30px,
    #000000 60px
  );
  animation: borderScroll 0.8s linear infinite;
}

.pyro-alert-border-top { top: 0; }
.pyro-alert-border-bottom { bottom: 0; }

.pyro-alert-border-left,
.pyro-alert-border-right {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 8px;
  background: repeating-linear-gradient(
    0deg,
    #FFFF00 0px,
    #FFFF00 30px,
    #000000 30px,
    #000000 60px
  );
  animation: borderScrollV 0.8s linear infinite;
}

.pyro-alert-border-left { left: 0; }
.pyro-alert-border-right { right: 0; }

@keyframes borderScroll {
  0% { background-position: 0 0; }
  100% { background-position: 60px 0; }
}

@keyframes borderScrollV {
  0% { background-position: 0 0; }
  100% { background-position: 0 60px; }
}

.pyro-alert-corner {
  position: absolute;
  width: 60px;
  height: 60px;
  border: 6px solid #FFFF00;
}

.pyro-alert-corner.tl { top: 20px; left: 20px; border-right: none; border-bottom: none; }
.pyro-alert-corner.tr { top: 20px; right: 20px; border-left: none; border-bottom: none; }
.pyro-alert-corner.bl { bottom: 20px; left: 20px; border-right: none; border-top: none; }
.pyro-alert-corner.br { bottom: 20px; right: 20px; border-left: none; border-top: none; }

.pyro-alert-content {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: #FFFFFF;
  width: 90%;
  max-width: 800px;
  padding: 40px;
  background: rgba(0, 0, 0, 0.7);
  border: 4px solid #FFFF00;
  border-radius: 16px;
  box-shadow: 0 0 60px rgba(255, 0, 0, 0.8);
  animation: contentPulse 1s ease-in-out infinite alternate;
}

@keyframes contentPulse {
  0% { box-shadow: 0 0 60px rgba(255, 0, 0, 0.8); }
  100% { box-shadow: 0 0 100px rgba(255, 255, 0, 0.9); }
}

.pyro-alert-icon {
  color: #FFFF00;
  animation: iconShake 0.3s ease-in-out infinite alternate;
  margin-bottom: 20px;
}

@keyframes iconShake {
  0% { transform: rotate(-8deg) scale(1); }
  100% { transform: rotate(8deg) scale(1.1); }
}

.pyro-alert-title {
  font-size: 48px;
  font-weight: 900;
  margin: 0 0 20px 0;
  color: #FFFFFF;
  text-shadow:
    0 0 10px #FF0000,
    0 0 20px #FF0000,
    0 0 30px #FF0000,
    0 0 40px #FF0000;
  animation: titleFlash 0.4s ease-in-out infinite alternate;
  letter-spacing: 4px;
}

@keyframes titleFlash {
  0% { opacity: 0.8; }
  100% { opacity: 1; }
}

.pyro-alert-reason {
  font-size: 28px;
  font-weight: 700;
  color: #FFD700;
  margin-bottom: 12px;
  padding: 12px;
  background: rgba(255, 0, 0, 0.5);
  border-radius: 8px;
  border-left: 6px solid #FFFF00;
  border-right: 6px solid #FFFF00;
}

.pyro-alert-time,
.pyro-alert-id {
  font-size: 18px;
  color: #FFE4B5;
  margin-bottom: 8px;
}

.pyro-sensor-panel {
  margin: 24px 0;
  padding: 20px;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 12px;
  border: 2px solid #FF6347;
}

.sensor-title {
  font-size: 20px;
  font-weight: 700;
  color: #FF6347;
  margin-bottom: 16px;
}

.sensor-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.sensor-item {
  background: rgba(255, 255, 255, 0.1);
  padding: 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.sensor-item.danger {
  background: rgba(255, 99, 71, 0.3);
  border: 2px solid #FF6347;
  animation: sensorDanger 0.5s ease-in-out infinite alternate;
}

@keyframes sensorDanger {
  0% { background: rgba(255, 99, 71, 0.3); }
  100% { background: rgba(255, 99, 71, 0.5); }
}

.sensor-label {
  display: block;
  font-size: 14px;
  color: #B0C4DE;
  margin-bottom: 6px;
}

.sensor-value {
  display: block;
  font-size: 22px;
  font-weight: 700;
  font-family: 'Courier New', monospace;
  color: #00FF00;
}

.pyro-shutdown-status {
  margin: 20px 0;
  padding: 16px;
  background: rgba(0, 100, 0, 0.4);
  border-radius: 8px;
  border: 2px solid #00FF00;
}

.shutdown-title {
  font-size: 18px;
  font-weight: 700;
  color: #00FF00;
  margin-bottom: 12px;
}

.shutdown-stats {
  display: flex;
  justify-content: center;
  gap: 32px;
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 8px;
}

.success-count { color: #00FF00; }
.fail-count { color: #FF0000; }
.total-count { color: #FFFFFF; }

.shutdown-time {
  font-size: 16px;
  color: #98FB98;
}

.pyro-alert-actions {
  margin: 24px 0 16px 0;
}

.ack-btn {
  font-size: 20px;
  font-weight: 700;
  padding: 16px 48px;
  height: auto;
  animation: btnPulse 0.6s ease-in-out infinite alternate;
}

@keyframes btnPulse {
  0% { transform: scale(1); }
  100% { transform: scale(1.05); }
}

.pyro-alert-footer {
  margin-top: 16px;
}

.blink-text {
  font-size: 18px;
  font-weight: 700;
  color: #FFFF00;
  animation: blinkText 0.5s step-start infinite;
}

@keyframes blinkText {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

.scanline {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 4px;
  background: linear-gradient(
    to bottom,
    transparent,
    rgba(255, 255, 255, 0.3),
    transparent
  );
  animation: scanline 2s linear infinite;
  pointer-events: none;
}

@keyframes scanline {
  0% { top: 0; }
  100% { top: 100%; }
}

.pyro-alert-enter-active,
.pyro-alert-leave-active {
  transition: all 0.3s ease;
}

.pyro-alert-enter-from,
.pyro-alert-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
