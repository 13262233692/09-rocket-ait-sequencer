import { FlowGraph, FlowNode, FlowEdge, NodeType } from '../common/types/flow.types';
import { Injectable, Logger } from '@nestjs/common';

export interface TopologyInfo {
  startNodes: string[];
  endNodes: string[];
  adjacencyList: Map<string, string[]>;
  reverseAdjacency: Map<string, string[]>;
  inDegree: Map<string, number>;
  outDegree: Map<string, number>;
  topoOrder: string[];
  hasCycle: boolean;
  cyclePath?: string[];
  levelMap: Map<string, number>;
}

@Injectable()
export class TopologyService {
  private readonly logger = new Logger(TopologyService.name);

  analyze(graph: FlowGraph): TopologyInfo {
    const nodes = graph.nodes;
    const edges = graph.edges;

    const adjacencyList = new Map<string, string[]>();
    const reverseAdjacency = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    const outDegree = new Map<string, number>();
    const levelMap = new Map<string, number>();

    nodes.forEach((n) => {
      adjacencyList.set(n.id, []);
      reverseAdjacency.set(n.id, []);
      inDegree.set(n.id, 0);
      outDegree.set(n.id, 0);
      levelMap.set(n.id, 0);
    });

    edges.forEach((edge) => {
      const source = edge.source;
      const target = edge.target;

      if (adjacencyList.has(source) && adjacencyList.has(target)) {
        adjacencyList.get(source)!.push(target);
        reverseAdjacency.get(target)!.push(source);
        inDegree.set(target, (inDegree.get(target) || 0) + 1);
        outDegree.set(source, (outDegree.get(source) || 0) + 1);
      }
    });

    const startNodes = nodes
      .filter((n) => (inDegree.get(n.id) || 0) === 0)
      .map((n) => n.id);

    const endNodes = nodes
      .filter((n) => (outDegree.get(n.id) || 0) === 0)
      .map((n) => n.id);

    const order = this.kahnTopoSort(nodes, adjacencyList, inDegree);
    const hasCycle = order.length !== nodes.length;

    if (!hasCycle) {
      order.forEach((nodeId) => {
        const parents = reverseAdjacency.get(nodeId) || [];
        if (parents.length === 0) {
          levelMap.set(nodeId, 0);
        } else {
          const maxParentLevel = Math.max(...parents.map((p) => levelMap.get(p) || 0));
          levelMap.set(nodeId, maxParentLevel + 1);
        }
      });
    }

    this.logger.log(
      `拓扑分析完成: ${nodes.length} 节点, ${edges.length} 连线, ${startNodes.length} 起始, ${endNodes.length} 结束, 环=${hasCycle}`,
    );

    return {
      startNodes,
      endNodes,
      adjacencyList,
      reverseAdjacency,
      inDegree,
      outDegree,
      topoOrder: order,
      hasCycle,
      levelMap,
    };
  }

  private kahnTopoSort(
    nodes: FlowNode[],
    adjacencyList: Map<string, string[]>,
    inDegree: Map<string, number>,
  ): string[] {
    const result: string[] = [];
    const tempInDegree = new Map<string, number>();
    nodes.forEach((n) => {
      tempInDegree.set(n.id, inDegree.get(n.id) || 0);
    });
    const queue: string[] = [];

    nodes.forEach((n) => {
      if ((tempInDegree.get(n.id) || 0) === 0) {
        queue.push(n.id);
      }
    });

    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);

      const neighbors = adjacencyList.get(current) || [];
      neighbors.forEach((neighbor) => {
        const newDegree = (tempInDegree.get(neighbor) || 0) - 1;
        tempInDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      });
    }

    return result;
  }

  validate(graph: FlowGraph): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (graph.nodes.length === 0) {
      errors.push('流程图中没有节点');
    }

    const nodeIds = new Set(graph.nodes.map((n) => n.id));
    const duplicates = graph.nodes.filter(
      (n, i, arr) => arr.findIndex((x) => x.id === n.id) !== i,
    );
    if (duplicates.length > 0) {
      errors.push(`存在重复节点ID: ${duplicates.map((d) => d.id).join(', ')}`);
    }

    graph.edges.forEach((edge, idx) => {
      if (!nodeIds.has(edge.source)) {
        errors.push(`连线[${idx}]的源节点不存在: ${edge.source}`);
      }
      if (!nodeIds.has(edge.target)) {
        errors.push(`连线[${idx}]的目标节点不存在: ${edge.target}`);
      }
      if (edge.source === edge.target) {
        errors.push(`连线[${idx}]存在自环: ${edge.source}`);
      }
    });

    const topology = this.analyze(graph);
    if (topology.hasCycle) {
      errors.push('流程图中存在环路 (DAG不允许有环)');
    }

    const hasStart = graph.nodes.some((n) => n.type === NodeType.START);
    if (!hasStart && topology.startNodes.length === 0) {
      errors.push('流程图缺少起始节点');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
