import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  FlowGraph,
  FlowNode,
  FlowExecutionState,
  NodeExecutionResult,
  NodeExecutionStatus,
} from '../common/types/flow.types';
import { TopologyService, TopologyInfo } from './topology.service';
import { NodeExecutorService } from './node-executor.service';
import { Subject, Observable } from 'rxjs';

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

@Injectable()
export class FlowEngineService implements OnModuleDestroy {
  private readonly logger = new Logger(FlowEngineService.name);
  private executions = new Map<string, FlowExecutionState>();
  private topologies = new Map<string, TopologyInfo>();
  private eventSubject = new Subject<EngineEvent>();
  private abortSignals = new Map<string, boolean>();

  constructor(
    private readonly topologyService: TopologyService,
    private readonly nodeExecutor: NodeExecutorService,
  ) {}

  onModuleDestroy() {
    this.executions.forEach((_, id) => this.stopExecution(id));
    this.eventSubject.complete();
  }

  getEvents(): Observable<EngineEvent> {
    return this.eventSubject.asObservable();
  }

  validateFlow(graph: FlowGraph): { valid: boolean; errors: string[] } {
    return this.topologyService.validate(graph);
  }

  async startExecution(graph: FlowGraph): Promise<FlowExecutionState> {
    const validation = this.validateFlow(graph);
    if (!validation.valid) {
      throw new Error(`流程图验证失败: ${validation.errors.join('; ')}`);
    }

    const executionId = uuidv4();
    const topology = this.topologyService.analyze(graph);
    this.topologies.set(executionId, topology);

    const results = new Map<string, NodeExecutionResult>();
    graph.nodes.forEach((n) => {
      results.set(n.id, {
        nodeId: n.id,
        status: NodeExecutionStatus.PENDING,
        startTime: 0,
      });
    });

    const state: FlowExecutionState = {
      executionId,
      flowId: graph.id,
      status: 'running',
      results,
      variables: new Map<string, any>(),
      startTime: Date.now(),
    };

    this.executions.set(executionId, state);
    this.abortSignals.set(executionId, false);

    this.logger.log(`[流程引擎] 启动执行 ${executionId} (流程: ${graph.name})`);
    this.emitEvent({
      type: 'flow_started',
      executionId,
      flowId: graph.id,
      timestamp: Date.now(),
      message: `测试流程 "${graph.name}" 已启动`,
    });

    this.runExecution(graph, state, topology).catch((err) => {
      this.logger.error(`[流程引擎] 执行异常: ${err}`);
    });

    return state;
  }

  private async runExecution(
    graph: FlowGraph,
    state: FlowExecutionState,
    topology: TopologyInfo,
  ): Promise<void> {
    const nodeMap = new Map(graph.nodes.map((n) => [n.id, n]));
    const edgeMap = new Map(graph.edges.map((e) => [e.id, e]));

    for (const nodeId of topology.topoOrder) {
      if (this.abortSignals.get(state.executionId)) {
        state.status = 'stopped';
        state.endTime = Date.now();
        this.emitEvent({
          type: 'flow_stopped',
          executionId: state.executionId,
          flowId: state.flowId,
          timestamp: Date.now(),
          message: '测试流程已被停止',
        });
        return;
      }

      const node = nodeMap.get(nodeId);
      if (!node) continue;

      state.currentNodeId = nodeId;

      const parents = topology.reverseAdjacency.get(nodeId) || [];
      for (const parentId of parents) {
        const parentResult = state.results.get(parentId);
        if (parentResult && parentResult.status !== NodeExecutionStatus.PASSED) {
          state.results.get(nodeId)!.status = NodeExecutionStatus.SKIPPED;
          this.logger.warn(`[流程引擎] 跳过节点 ${node.label}：父节点 ${parentId} 未通过`);
          continue;
        }
      }

      this.emitEvent({
        type: 'node_started',
        executionId: state.executionId,
        flowId: state.flowId,
        nodeId,
        timestamp: Date.now(),
        message: `节点开始执行: ${node.label}`,
      });

      const result = await this.nodeExecutor.execute(node, state.variables);
      state.results.set(nodeId, result);

      for (const edge of graph.edges.filter((e) => e.source === nodeId)) {
        this.emitEvent({
          type: 'edge_active',
          executionId: state.executionId,
          flowId: state.flowId,
          edgeId: edge.id,
          timestamp: Date.now(),
        });
      }

      if (result.status === NodeExecutionStatus.FAILED) {
        this.emitEvent({
          type: 'node_failed',
          executionId: state.executionId,
          flowId: state.flowId,
          nodeId,
          timestamp: Date.now(),
          result,
          message: `节点执行失败: ${node.label} - ${result.error || result.output?.message}`,
        });

        state.status = 'failed';
        state.error = result.error || result.output?.message;
        state.endTime = Date.now();
        this.emitEvent({
          type: 'flow_failed',
          executionId: state.executionId,
          flowId: state.flowId,
          timestamp: Date.now(),
          message: `测试流程在节点 "${node.label}" 失败`,
        });
        return;
      }

      this.emitEvent({
        type: 'node_completed',
        executionId: state.executionId,
        flowId: state.flowId,
        nodeId,
        timestamp: Date.now(),
        result,
        message: `节点执行完成: ${node.label}`,
      });
    }

    state.status = 'completed';
    state.endTime = Date.now();
    this.emitEvent({
      type: 'flow_completed',
      executionId: state.executionId,
      flowId: state.flowId,
      timestamp: Date.now(),
      message: '测试流程执行完成',
    });
    this.logger.log(`[流程引擎] 执行 ${state.executionId} 完成，耗时 ${state.endTime - state.startTime!}ms`);
  }

  stopExecution(executionId: string): boolean {
    const state = this.executions.get(executionId);
    if (!state) return false;

    if (state.status === 'running') {
      this.abortSignals.set(executionId, true);
      this.logger.log(`[流程引擎] 请求停止执行 ${executionId}`);
      return true;
    }
    return false;
  }

  getExecution(executionId: string): FlowExecutionState | undefined {
    const state = this.executions.get(executionId);
    if (!state) return undefined;
    return {
      ...state,
      results: new Map(state.results),
      variables: new Map(state.variables),
    };
  }

  getExecutionSerializable(executionId: string): any {
    const state = this.executions.get(executionId);
    if (!state) return undefined;
    return {
      ...state,
      results: Object.fromEntries(state.results),
      variables: Object.fromEntries(state.variables),
    };
  }

  getAllExecutions(): FlowExecutionState[] {
    return Array.from(this.executions.values()).map((s) => ({
      ...s,
      results: new Map(s.results),
      variables: new Map(s.variables),
    }));
  }

  getAllExecutionsSerializable(): any[] {
    return Array.from(this.executions.values()).map((s) => ({
      ...s,
      results: Object.fromEntries(s.results),
      variables: Object.fromEntries(s.variables),
    }));
  }

  private emitEvent(event: EngineEvent) {
    try {
      this.eventSubject.next(event);
    } catch (err) {
      this.logger.error(`事件发送失败: ${err}`);
    }
  }
}
