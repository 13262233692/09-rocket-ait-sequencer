export enum NodeType {
  POWER_ON = 'power_on',
  POWER_OFF = 'power_off',
  SET_VOLTAGE = 'set_voltage',
  SET_CURRENT = 'set_current',
  READ_VOLTAGE = 'read_voltage',
  READ_CURRENT = 'read_current',
  READ_IMPEDANCE = 'read_impedance',
  DELAY = 'delay',
  RELAY_CLOSE = 'relay_close',
  RELAY_OPEN = 'relay_open',
  JUDGE = 'judge',
  SCPI_RAW = 'scpi_raw',
  LOG_MESSAGE = 'log_message',
  LOOP_START = 'loop_start',
  LOOP_END = 'loop_end',
  BRANCH = 'branch',
  START = 'start',
  END = 'end',
}

export enum NodeExecutionStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  PASSED = 'passed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
  TIMEOUT = 'timeout',
}

export interface FlowNodePosition {
  x: number;
  y: number;
}

export interface FlowNodeConfig {
  instrumentId?: string;
  voltage?: number;
  current?: number;
  delayMs?: number;
  relayChannel?: number | string;
  expression?: string;
  minValue?: number;
  maxValue?: number;
  targetValue?: number;
  tolerance?: number;
  unit?: string;
  message?: string;
  scpiCommand?: string;
  expectResponse?: boolean;
  loopCount?: number;
  branchCondition?: string;
}

export interface FlowNodeData {
  label: string;
  type: NodeType;
  config: FlowNodeConfig;
  executionStatus?: NodeExecutionStatus;
  result?: any;
}

export interface FlowNode {
  id: string;
  type: NodeType;
  label: string;
  position: FlowNodePosition;
  config: FlowNodeConfig;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
  animated?: boolean;
  style?: Record<string, any>;
}

export interface FlowGraph {
  id: string;
  name: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  version?: string;
  description?: string;
}

export interface NodeExecutionResult {
  nodeId: string;
  status: NodeExecutionStatus;
  startTime: number;
  endTime?: number;
  output?: any;
  error?: string;
  measurements?: Record<string, number>;
}

export interface FlowExecutionState {
  executionId: string;
  flowId: string;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'stopped';
  currentNodeId?: string;
  results: Record<string, NodeExecutionResult>;
  startTime?: number;
  endTime?: number;
  error?: string;
}

export type EngineEventType =
  | 'flow_started'
  | 'flow_completed'
  | 'flow_failed'
  | 'flow_stopped'
  | 'flow_paused'
  | 'node_started'
  | 'node_completed'
  | 'node_failed'
  | 'edge_active';

export interface EngineEvent {
  type: EngineEventType;
  executionId: string;
  flowId: string;
  timestamp: number;
  nodeId?: string;
  edgeId?: string;
  result?: NodeExecutionResult;
  message?: string;
}

export interface NodeTypeDefinition {
  type: NodeType;
  label: string;
  category: string;
  icon: string;
  color: string;
  description: string;
  defaultConfig: FlowNodeConfig;
}

export const nodeTypeDefinitions: NodeTypeDefinition[] = [
  {
    type: NodeType.START,
    label: '开始',
    category: '流程控制',
    icon: 'VideoPlay',
    color: '#67C23A',
    description: '测试流程起始节点',
    defaultConfig: {},
  },
  {
    type: NodeType.END,
    label: '结束',
    category: '流程控制',
    icon: 'VideoPause',
    color: '#F56C6C',
    description: '测试流程结束节点',
    defaultConfig: {},
  },
  {
    type: NodeType.POWER_ON,
    label: '电源开启',
    category: '电源控制',
    icon: 'Lightning',
    color: '#409EFF',
    description: '打开指定程控电源输出',
    defaultConfig: { instrumentId: '' },
  },
  {
    type: NodeType.POWER_OFF,
    label: '电源关闭',
    category: '电源控制',
    icon: 'SwitchButton',
    color: '#409EFF',
    description: '关闭指定程控电源输出',
    defaultConfig: { instrumentId: '' },
  },
  {
    type: NodeType.SET_VOLTAGE,
    label: '设置电压',
    category: '电源控制',
    icon: 'Cpu',
    color: '#409EFF',
    description: '设置程控电源输出电压值',
    defaultConfig: { instrumentId: '', voltage: 28.0, unit: 'V' },
  },
  {
    type: NodeType.SET_CURRENT,
    label: '设置电流',
    category: '电源控制',
    icon: 'Connection',
    color: '#409EFF',
    description: '设置程控电源限流值',
    defaultConfig: { instrumentId: '', current: 5.0, unit: 'A' },
  },
  {
    type: NodeType.READ_VOLTAGE,
    label: '读取电压',
    category: '数据采集',
    icon: 'DataAnalysis',
    color: '#67C23A',
    description: '从指定仪器读取直流电压',
    defaultConfig: { instrumentId: '', unit: 'V' },
  },
  {
    type: NodeType.READ_CURRENT,
    label: '读取电流',
    category: '数据采集',
    icon: 'TrendCharts',
    color: '#67C23A',
    description: '从指定仪器读取直流电流',
    defaultConfig: { instrumentId: '', unit: 'A' },
  },
  {
    type: NodeType.READ_IMPEDANCE,
    label: '读取阻抗',
    category: '数据采集',
    icon: 'Histogram',
    color: '#67C23A',
    description: '从指定仪器读取阻抗值',
    defaultConfig: { instrumentId: '', unit: 'Ω' },
  },
  {
    type: NodeType.DELAY,
    label: '延时等待',
    category: '流程控制',
    icon: 'Timer',
    color: '#E6A23C',
    description: '延时等待指定毫秒数',
    defaultConfig: { delayMs: 1000 },
  },
  {
    type: NodeType.RELAY_CLOSE,
    label: '继电器闭合',
    category: '通路切换',
    icon: 'Connection',
    color: '#909399',
    description: '闭合指定继电器通道',
    defaultConfig: { instrumentId: '', relayChannel: 1 },
  },
  {
    type: NodeType.RELAY_OPEN,
    label: '继电器断开',
    category: '通路切换',
    icon: 'Aim',
    color: '#909399',
    description: '断开指定继电器通道',
    defaultConfig: { instrumentId: '', relayChannel: 1 },
  },
  {
    type: NodeType.JUDGE,
    label: '合格判定',
    category: '判定逻辑',
    icon: 'Finished',
    color: '#9B59B6',
    description: '判断上一次测量值是否在合格范围内',
    defaultConfig: { minValue: 0, maxValue: 100 },
  },
  {
    type: NodeType.SCPI_RAW,
    label: 'SCPI命令',
    category: '高级',
    icon: 'Document',
    color: '#1890FF',
    description: '发送原始SCPI命令到仪器',
    defaultConfig: { instrumentId: '', scpiCommand: '*IDN?', expectResponse: true },
  },
  {
    type: NodeType.LOG_MESSAGE,
    label: '日志输出',
    category: '调试',
    icon: 'ChatDotRound',
    color: '#13C2C2',
    description: '输出自定义日志消息',
    defaultConfig: { message: '' },
  },
];

export const nodeStatusColors: Record<NodeExecutionStatus, string> = {
  [NodeExecutionStatus.PENDING]: '#909399',
  [NodeExecutionStatus.RUNNING]: '#E6A23C',
  [NodeExecutionStatus.PASSED]: '#67C23A',
  [NodeExecutionStatus.FAILED]: '#F56C6C',
  [NodeExecutionStatus.SKIPPED]: '#C0C4CC',
  [NodeExecutionStatus.TIMEOUT]: '#F56C6C',
};

export const nodeStatusLabels: Record<NodeExecutionStatus, string> = {
  [NodeExecutionStatus.PENDING]: '待执行',
  [NodeExecutionStatus.RUNNING]: '执行中',
  [NodeExecutionStatus.PASSED]: '通过',
  [NodeExecutionStatus.FAILED]: '失败',
  [NodeExecutionStatus.SKIPPED]: '跳过',
  [NodeExecutionStatus.TIMEOUT]: '超时',
};
