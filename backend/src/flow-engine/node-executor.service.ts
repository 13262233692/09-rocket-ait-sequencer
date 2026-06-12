import { Injectable, Logger } from '@nestjs/common';
import {
  FlowNode,
  FlowNodeConfig,
  NodeExecutionResult,
  NodeExecutionStatus,
  NodeType,
  JudgeResult,
} from '../common/types/flow.types';
import { InstrumentService } from '../instrument/instrument.service';

@Injectable()
export class NodeExecutorService {
  private readonly logger = new Logger(NodeExecutorService.name);

  constructor(private readonly instrumentService: InstrumentService) {}

  async execute(
    node: FlowNode,
    variables: Map<string, any>,
  ): Promise<NodeExecutionResult> {
    const startTime = Date.now();
    const result: NodeExecutionResult = {
      nodeId: node.id,
      status: NodeExecutionStatus.RUNNING,
      startTime,
    };

    this.logger.log(`[节点执行] ${node.type} - ${node.label} (${node.id})`);

    try {
      const output = await this.dispatchNode(node, variables);

      result.status = output.passed ? NodeExecutionStatus.PASSED : NodeExecutionStatus.FAILED;
      result.endTime = Date.now();
      result.output = output;
      result.measurements = output.measurements;

      if (output.passed) {
        this.logger.log(`[节点通过] ${node.label} - ${output.message || 'OK'}`);
      } else {
        this.logger.warn(`[节点失败] ${node.label} - ${output.message || 'FAIL'}`);
      }
    } catch (error) {
      result.status = NodeExecutionStatus.FAILED;
      result.endTime = Date.now();
      result.error = error instanceof Error ? error.message : String(error);
      this.logger.error(`[节点错误] ${node.label} - ${result.error}`);
    }

    return result;
  }

  private async dispatchNode(
    node: FlowNode,
    variables: Map<string, any>,
  ): Promise<{ passed: boolean; message: string; measurements?: Record<string, number> }> {
    const config = node.config || {};

    switch (node.type) {
      case NodeType.START:
        return { passed: true, message: '测试流程启动' };

      case NodeType.END:
        return { passed: true, message: '测试流程结束' };

      case NodeType.POWER_ON:
        return this.executePowerOn(config);

      case NodeType.POWER_OFF:
        return this.executePowerOff(config);

      case NodeType.SET_VOLTAGE:
        return this.executeSetVoltage(config);

      case NodeType.SET_CURRENT:
        return this.executeSetCurrent(config);

      case NodeType.READ_VOLTAGE:
        return this.executeReadVoltage(config, variables);

      case NodeType.READ_CURRENT:
        return this.executeReadCurrent(config, variables);

      case NodeType.READ_IMPEDANCE:
        return this.executeReadImpedance(config, variables);

      case NodeType.DELAY:
        return this.executeDelay(config);

      case NodeType.RELAY_CLOSE:
        return this.executeRelay(config, true);

      case NodeType.RELAY_OPEN:
        return this.executeRelay(config, false);

      case NodeType.JUDGE:
        return this.executeJudge(config, variables);

      case NodeType.SCPI_RAW:
        return this.executeScpiRaw(config);

      case NodeType.LOG_MESSAGE:
        return this.executeLogMessage(config, variables);

      case NodeType.BRANCH:
        return this.executeBranch(config, variables);

      case NodeType.LOOP_START:
      case NodeType.LOOP_END:
        return { passed: true, message: '循环节点标记' };

      default:
        return { passed: true, message: `未知节点类型 ${node.type}，跳过执行` };
    }
  }

  private async executePowerOn(config: FlowNodeConfig): Promise<{ passed: boolean; message: string }> {
    if (!config.instrumentId) {
      throw new Error('未指定电源仪器ID');
    }
    await this.instrumentService.setPowerOutput(config.instrumentId, true);
    return { passed: true, message: `电源已开启 [${config.instrumentId}]` };
  }

  private async executePowerOff(config: FlowNodeConfig): Promise<{ passed: boolean; message: string }> {
    if (!config.instrumentId) {
      throw new Error('未指定电源仪器ID');
    }
    await this.instrumentService.setPowerOutput(config.instrumentId, false);
    return { passed: true, message: `电源已关闭 [${config.instrumentId}]` };
  }

  private async executeSetVoltage(config: FlowNodeConfig): Promise<{ passed: boolean; message: string }> {
    if (!config.instrumentId) throw new Error('未指定电源仪器ID');
    if (config.voltage === undefined) throw new Error('未设置电压值');
    await this.instrumentService.setVoltage(config.instrumentId, config.voltage);
    return { passed: true, message: `电压设置为 ${config.voltage}V [${config.instrumentId}]` };
  }

  private async executeSetCurrent(config: FlowNodeConfig): Promise<{ passed: boolean; message: string }> {
    if (!config.instrumentId) throw new Error('未指定电源仪器ID');
    if (config.current === undefined) throw new Error('未设置电流值');
    await this.instrumentService.setCurrent(config.instrumentId, config.current);
    return { passed: true, message: `电流设置为 ${config.current}A [${config.instrumentId}]` };
  }

  private async executeReadVoltage(
    config: FlowNodeConfig,
    variables: Map<string, any>,
  ): Promise<{ passed: boolean; message: string; measurements?: Record<string, number> }> {
    if (!config.instrumentId) throw new Error('未指定测量仪器ID');
    const value = await this.instrumentService.readVoltage(config.instrumentId);
    variables.set(`last_voltage_${config.instrumentId}`, value);
    return {
      passed: true,
      message: `电压读数: ${value.toFixed(6)} V`,
      measurements: { voltage: value },
    };
  }

  private async executeReadCurrent(
    config: FlowNodeConfig,
    variables: Map<string, any>,
  ): Promise<{ passed: boolean; message: string; measurements?: Record<string, number> }> {
    if (!config.instrumentId) throw new Error('未指定测量仪器ID');
    const value = await this.instrumentService.readCurrent(config.instrumentId);
    variables.set(`last_current_${config.instrumentId}`, value);
    return {
      passed: true,
      message: `电流读数: ${value.toFixed(6)} A`,
      measurements: { current: value },
    };
  }

  private async executeReadImpedance(
    config: FlowNodeConfig,
    variables: Map<string, any>,
  ): Promise<{ passed: boolean; message: string; measurements?: Record<string, number> }> {
    if (!config.instrumentId) throw new Error('未指定测量仪器ID');
    const value = await this.instrumentService.readImpedance(config.instrumentId);
    variables.set(`last_impedance_${config.instrumentId}`, value);
    return {
      passed: true,
      message: `阻抗读数: ${value.toFixed(4)} Ω`,
      measurements: { impedance: value },
    };
  }

  private async executeDelay(config: FlowNodeConfig): Promise<{ passed: boolean; message: string }> {
    const delayMs = config.delayMs || 1000;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return { passed: true, message: `延时 ${delayMs}ms 完成` };
  }

  private async executeRelay(
    config: FlowNodeConfig,
    closed: boolean,
  ): Promise<{ passed: boolean; message: string }> {
    if (!config.instrumentId) throw new Error('未指定继电器矩阵ID');
    if (!config.relayChannel) throw new Error('未指定继电器通道');
    await this.instrumentService.setRelay(config.instrumentId, config.relayChannel, closed);
    return {
      passed: true,
      message: `继电器通道 ${config.relayChannel} ${closed ? '闭合' : '断开'} [${config.instrumentId}]`,
    };
  }

  private executeJudge(
    config: FlowNodeConfig,
    variables: Map<string, any>,
  ): { passed: boolean; message: string; measurements?: Record<string, number> } {
    const expression = config.expression;
    let actualValue: number | undefined;

    const voltageKeys = Array.from(variables.keys()).filter((k) => k.startsWith('last_voltage_'));
    const currentKeys = Array.from(variables.keys()).filter((k) => k.startsWith('last_current_'));
    const impedanceKeys = Array.from(variables.keys()).filter((k) => k.startsWith('last_impedance_'));

    if (voltageKeys.length > 0) {
      actualValue = variables.get(voltageKeys[voltageKeys.length - 1]);
    } else if (currentKeys.length > 0) {
      actualValue = variables.get(currentKeys[currentKeys.length - 1]);
    } else if (impedanceKeys.length > 0) {
      actualValue = variables.get(impedanceKeys[impedanceKeys.length - 1]);
    }

    if (actualValue === undefined) {
      return { passed: false, message: '判定失败: 没有找到上一次测量值' };
    }

    const judgeResult: JudgeResult = {
      passed: true,
      actualValue,
      minValue: config.minValue,
      maxValue: config.maxValue,
      message: '',
    };

    if (config.minValue !== undefined && actualValue < config.minValue) {
      judgeResult.passed = false;
      judgeResult.message = `数值 ${actualValue} 低于下限 ${config.minValue}`;
    } else if (config.maxValue !== undefined && actualValue > config.maxValue) {
      judgeResult.passed = false;
      judgeResult.message = `数值 ${actualValue} 高于上限 ${config.maxValue}`;
    } else if (config.targetValue !== undefined && config.tolerance !== undefined) {
      const diff = Math.abs(actualValue - config.targetValue);
      if (diff > config.tolerance) {
        judgeResult.passed = false;
        judgeResult.message = `数值 ${actualValue} 偏离目标值 ${config.targetValue} 超过容差 ${config.tolerance}`;
      }
    }

    if (judgeResult.passed) {
      judgeResult.message = `判定通过: 测量值 ${actualValue} 在合格范围内`;
    }

    return {
      passed: judgeResult.passed,
      message: judgeResult.message,
      measurements: { actualValue },
    };
  }

  private async executeScpiRaw(config: FlowNodeConfig): Promise<{ passed: boolean; message: string }> {
    if (!config.instrumentId) throw new Error('未指定仪器ID');
    if (!config.scpiCommand) throw new Error('未指定SCPI命令');

    const response = await this.instrumentService.sendRawCommand(
      config.instrumentId,
      config.scpiCommand,
      config.expectResponse || false,
    );

    if (!response.success) {
      return { passed: false, message: `SCPI命令执行失败: ${response.error}` };
    }

    const dataStr = response.data ? `，返回: ${response.data}` : '';
    return { passed: true, message: `SCPI命令执行成功: ${config.scpiCommand}${dataStr}` };
  }

  private executeLogMessage(
    config: FlowNodeConfig,
    variables: Map<string, any>,
  ): { passed: boolean; message: string } {
    const msg = config.message || '(无消息)';
    this.logger.log(`[测试日志] ${msg}`);
    return { passed: true, message: `日志输出: ${msg}` };
  }

  private executeBranch(
    config: FlowNodeConfig,
    variables: Map<string, any>,
  ): { passed: boolean; message: string } {
    return { passed: true, message: `分支条件: ${config.branchCondition || 'default'}` };
  }
}
