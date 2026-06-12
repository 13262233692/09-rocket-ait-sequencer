<template>
  <el-container class="app-container">
    <el-header class="app-header">
      <div class="header-left">
        <el-icon :size="28" color="#409EFF"><Rocket /></el-icon>
        <div class="title">
          <h1>火箭发射场总装厂房自动化测试流控平台</h1>
          <span class="subtitle">Rocket AIT Sequencer Control System v1.0</span>
        </div>
      </div>
      <div class="header-right">
        <el-tag :type="store.socketConnected ? 'success' : 'danger'" effect="dark">
          {{ store.socketConnected ? '● 实时连接' : '○ 未连接' }}
        </el-tag>
        <el-tag type="info" effect="plain">
          在线仪器: {{ onlineInstrumentCount }} / {{ store.instruments.length }}
        </el-tag>
      </div>
    </el-header>

    <el-container>
      <el-aside width="200px" class="app-aside">
        <el-menu
          :default-active="activeMenu"
          class="side-menu"
          @select="handleMenuSelect"
          background-color="#001529"
          text-color="#b9c5d1"
          active-text-color="#ffffff"
        >
          <el-menu-item index="/flow">
            <el-icon><Share /></el-icon>
            <span>流程编排</span>
          </el-menu-item>
          <el-menu-item index="/instruments">
            <el-icon><Monitor /></el-icon>
            <span>仪器监控</span>
          </el-menu-item>
          <el-menu-item index="/history">
            <el-icon><Tickets /></el-icon>
            <span>执行历史</span>
          </el-menu-item>
        </el-menu>
      </el-aside>

      <el-main class="app-main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAppStore } from './stores/app';
import { InstrumentStatus } from './types/instrument';

const store = useAppStore();
const router = useRouter();
const route = useRoute();

const activeMenu = computed(() => route.path);

const onlineInstrumentCount = computed(() =>
  store.instruments.filter((i) => i.status === InstrumentStatus.ONLINE).length,
);

function handleMenuSelect(index: string) {
  router.push(index);
}

onMounted(() => {
  store.initSocket();
  store.fetchInstruments();
});
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #app {
  height: 100%;
  width: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
}
</style>

<style scoped>
.app-container {
  height: 100vh;
}

.app-header {
  background: linear-gradient(135deg, #001529 0%, #003a8c 100%);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  border-bottom: 2px solid #409EFF;
  height: 70px !important;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.title h1 {
  color: #ffffff;
  font-size: 20px;
  font-weight: 600;
  letter-spacing: 1px;
}

.title .subtitle {
  color: #8cc5ff;
  font-size: 12px;
}

.header-right {
  display: flex;
  gap: 12px;
  align-items: center;
}

.app-aside {
  background: #001529;
  height: calc(100vh - 70px);
}

.side-menu {
  border-right: none;
  height: 100%;
}

:deep(.el-menu-item) {
  height: 56px;
  line-height: 56px;
  border-left: 3px solid transparent;
}

:deep(.el-menu-item.is-active) {
  background: #1890ff !important;
  border-left-color: #69c0ff;
}

:deep(.el-menu-item:hover) {
  background: #003a8c !important;
}

.app-main {
  background: #f0f2f5;
  padding: 16px;
  height: calc(100vh - 70px);
  overflow: hidden;
}
</style>
