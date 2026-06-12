import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import { createRouter, createWebHashHistory } from 'vue-router';
import VueFlow from '@vue-flow/core';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import '@vue-flow/controls/dist/style.css';
import '@vue-flow/minimap/dist/style.css';

import App from './App.vue';
import FlowEditor from './views/FlowEditor.vue';
import InstrumentMonitor from './views/InstrumentMonitor.vue';
import ExecutionHistory from './views/ExecutionHistory.vue';

const app = createApp(App);

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component);
}

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/flow' },
    { path: '/flow', component: FlowEditor, name: '流程编排' },
    { path: '/instruments', component: InstrumentMonitor, name: '仪器监控' },
    { path: '/history', component: ExecutionHistory, name: '执行历史' },
  ],
});

app.use(createPinia());
app.use(ElementPlus);
app.use(router);
app.component('VueFlow', VueFlow);

app.mount('#app');
