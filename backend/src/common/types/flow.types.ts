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
  results: Map<string, NodeExecutionResult>;
  variables: Map<string, any>;
  startTime?: number;
  endTime?: number;
  error?: string;
}

export interface JudgeResult {
  passed: boolean;
  actualValue: number;
  expectedValue?: number;
  minValue?: number;
  maxValue?: number;
  message: string;
}
