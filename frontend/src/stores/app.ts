import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { InstrumentState } from '../types/instrument';
import type {
  FlowGraph,
  FlowNode,
  FlowEdge,
  NodeExecutionStatus,
  FlowExecutionState,
  EngineEvent,
} from '../types/flow';
import { NodeExecutionStatus as Status } from '../types/flow';
import axios from 'axios';
import { io, Socket } from 'socket.io-client';

export const useAppStore = defineStore('app', () => {
  const instruments = ref<InstrumentState[]>([]);
  const socket = ref<Socket | null>(null);
  const socketConnected = ref(false);

  const flowGraph = ref<FlowGraph>({
    id: 'default-flow',
    name: '火箭总装测试流程',
    nodes: [],
    edges: [],
    version: '1.0.0',
    description: '',
  });

  const selectedNodeId = ref<string | null>(null);
  const selectedEdgeId = ref<string | null>(null);
  const executionState = ref<FlowExecutionState | null>(null);
  const engineEvents = ref<EngineEvent[]>([]);
  const isExecuting = ref(false);

  const activeNodeIds = computed(() => {
    if (!executionState.value) return new Set<string>();
    const ids = new Set<string>();
    Object.entries(executionState.value.results).forEach(([, r]) => {
      if (r.status === Status.RUNNING || r.status === Status.PASSED) {
        ids.push(r.nodeId);
      }
    });
    return ids;
  });

  const passedEdges = computed(() => {
    if (!executionState.value) return new Set<string>();
    const ids = new Set<string>();
    flowGraph.value.edges.forEach((edge) => {
      const sourceResult = executionState.value?.results[edge.source];
      if (sourceResult?.status === Status.PASSED) {
        ids.add(edge.id);
      }
    });
    return ids;
  });

  const getNodeStatus = (nodeId: string): NodeExecutionStatus | undefined => {
    return executionState.value?.results[nodeId]?.status;
  };

  function initSocket() {
    if (socket.value) return;
    socket.value = io('/engine', {
      transports: ['websocket', 'polling'],
    });

    socket.value.on('connect', () => {
      socketConnected.value = true;
      console.log('[WebSocket] 已连接');
    });

    socket.value.on('disconnect', () => {
      socketConnected.value = false;
      console.log('[WebSocket] 已断开');
    });

    socket.value.on('instruments', (data: InstrumentState[]) => {
      instruments.value = data;
    });

    socket.value.on('engine_event', (event: EngineEvent) => {
      handleEngineEvent(event);
    });

    socket.value.on('error', (err: any) => {
      console.error('[WebSocket] 错误:', err);
    });
  }

  function handleEngineEvent(event: EngineEvent) {
    engineEvents.value.push(event);
    if (engineEvents.value.length > 500) {
      engineEvents.value = engineEvents.value.slice(-500);
    }

    if (!executionState.value) return;

    if (event.type === 'node_started' && event.nodeId) {
      executionState.value.currentNodeId = event.nodeId;
      if (executionState.value.results[event.nodeId]) {
        executionState.value.results[event.nodeId].status = Status.RUNNING;
        executionState.value.results[event.nodeId].startTime = event.timestamp;
      }
    }

    if (event.type === 'node_completed' && event.nodeId && event.result) {
      executionState.value.results[event.nodeId] = event.result;
    }

    if (event.type === 'node_failed' && event.nodeId && event.result) {
      executionState.value.results[event.nodeId] = event.result;
    }

    if (event.type === 'flow_started') {
      isExecuting.value = true;
    }

    if (event.type === 'flow_completed' || event.type === 'flow_failed' || event.type === 'flow_stopped') {
      isExecuting.value = false;
      if (event.type === 'flow_completed') executionState.value!.status = 'completed';
      if (event.type === 'flow_failed') {
        executionState.value!.status = 'failed';
        executionState.value!.error = event.message;
      }
      if (event.type === 'flow_stopped') executionState.value!.status = 'stopped';
      executionState.value!.endTime = event.timestamp;
    }
  }

  async function fetchInstruments() {
    try {
      const res = await axios.get('/api/instruments');
      instruments.value = res.data;
    } catch (err) {
      console.error('获取仪器列表失败:', err);
    }
  }

  async function connectInstrument(id: string) {
    try {
      await axios.post(`/api/instruments/${id}/connect`);
      await fetchInstruments();
    } catch (err) {
      console.error('连接仪器失败:', err);
      throw err;
    }
  }

  async function disconnectInstrument(id: string) {
    try {
      await axios.post(`/api/instruments/${id}/disconnect`);
      await fetchInstruments();
    } catch (err) {
      console.error('断开仪器失败:', err);
      throw err;
    }
  }

  async function connectAllInstruments() {
    try {
      await axios.post('/api/instruments/connect-all');
      await fetchInstruments();
    } catch (err) {
      console.error('批量连接失败:', err);
    }
  }

  async function validateFlow(graph: FlowGraph) {
    try {
      const res = await axios.post('/api/flow/validate', graph);
      return res.data;
    } catch (err) {
      console.error('验证流程失败:', err);
      throw err;
    }
  }

  async function executeFlow(graph: FlowGraph) {
    try {
      const res = await axios.post('/api/flow/execute', graph);
      const { executionId } = res.data;
      executionState.value = {
        executionId,
        flowId: graph.id,
        status: 'running',
        currentNodeId: undefined,
        results: {},
        startTime: Date.now(),
      };
      graph.nodes.forEach((n) => {
        executionState.value!.results[n.id] = {
          nodeId: n.id,
          status: Status.PENDING,
          startTime: 0,
        };
      });
      return executionId;
    } catch (err) {
      console.error('执行流程失败:', err);
      throw err;
    }
  }

  async function stopExecution(executionId: string) {
    try {
      await axios.post(`/api/flow/${executionId}/stop`);
    } catch (err) {
      console.error('停止执行失败:', err);
    }
  }

  function resetExecutionState() {
    executionState.value = null;
    engineEvents.value = [];
    isExecuting.value = false;
  }

  function setFlowGraph(graph: FlowGraph) {
    flowGraph.value = graph;
  }

  function selectNode(nodeId: string | null) {
    selectedNodeId.value = nodeId;
    selectedEdgeId.value = null;
  }

  function selectEdge(edgeId: string | null) {
    selectedEdgeId.value = edgeId;
    selectedNodeId.value = null;
  }

  function clearSelection() {
    selectedNodeId.value = null;
    selectedEdgeId.value = null;
  }

  return {
    instruments,
    socket,
    socketConnected,
    flowGraph,
    selectedNodeId,
    selectedEdgeId,
    executionState,
    engineEvents,
    isExecuting,
    activeNodeIds,
    passedEdges,
    getNodeStatus,
    initSocket,
    fetchInstruments,
    connectInstrument,
    disconnectInstrument,
    connectAllInstruments,
    validateFlow,
    executeFlow,
    stopExecution,
    resetExecutionState,
    setFlowGraph,
    selectNode,
    selectEdge,
    clearSelection,
  };
});
