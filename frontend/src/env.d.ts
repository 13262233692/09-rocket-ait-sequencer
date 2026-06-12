declare module '*.vue' {
  import { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

declare module '@vue-flow/core';
declare module '@vue-flow/background';
declare module '@vue-flow/controls';
declare module '@vue-flow/minimap';
declare module '@vue-flow/additional-components';
