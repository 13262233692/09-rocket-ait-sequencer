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
import { PyroSafetyService } from '../safety/pyro-safety.service';
import { PyroTestConfig, PyroTestSession } from '../safety/pyro-safety.service';

@Injectable()
export class NodeExecutorService {
  private readonly logger = new Logger(NodeExecutorService.name);
  private activePyroSessions = new Map<string, PyroTestSession>();

  constructor(
    private readonly instrumentService: InstrumentService,
    private readonly pyroSafetyService: PyroSafetyService,
  ) {}

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

      case NodeType.PYRO_RESISTANCE_TEST:
        return this.executePyroResistanceTest(config, variables, node.id);

      case NodeType.PYRO_SAFETY_STOP:
        return this.executePyroSafetyStop(config, variables, node.id);

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

  private async executePyroResistanceTest(
    config: FlowNodeConfig,
    variables: Map<string, any>,
    nodeId: string,
  ): Promise<{ passed: boolean; message: string; measurements?: Record<string, number> }> {
    const pyroId = config.pyroId || `pyro-${nodeId}`;
    const sourceInstrumentId = config.instrumentId;
    const nominalResistance = config.nominalResistance || 2.0;
    const safeCurrentMa = config.safeCurrentMa || 5;
    const testVoltageV = config.testVoltageV || 0.01;
    const testDurationMs = config.testDurationMs || 3000;
    const breakdownThresholdRatio = config.breakdownThresholdRatio || 0.3;

    if (!sourceInstrumentId) {
      throw new Error('火工品测试必须指定源表仪器ID');
    }

    this.logger.warn(
      `🔥 [火工品测试] 节点=${nodeId} 火工品=${pyroId} 开始电阻测试 (安全电流=${safeCurrentMa}mA, 测试电压=${testVoltageV}V, 名义电阻=${nominalResistance}Ω)`,
    );

    const pyroConfig: PyroTestConfig = {
      pyroId,
      pyroName: config.pyroName || `火工品-${pyroId}`,
      sourceInstrumentId,
      nominalResistance,
      safeCurrentMa,
      testVoltageV,
      breakdownThresholdRatio,
      sampleRateMs: 10,
      filterWindowSize: 5,
      criticalDropSamples: 3,
    };

    const session = this.pyroSafetyService.createSession(pyroConfig);
    this.activePyroSessions.set(nodeId, session);

    variables.set(`pyro_session_${nodeId}`, session.sessionId);

    await this.pyroSafetyService.startSession(session.sessionId);

    this.logger.warn(
      `🔥 [火工品测试] 节点=${nodeId} 安全监控已启动，正在采样监控 ${testDurationMs}ms...`,
    );

    const startTime = Date.now();
    const checkInterval = setInterval(() => {
      const current = this.pyroSafetyService.getSession(session.sessionId);
      if (current && current.status === 'emergency_stopped') {
        clearInterval(checkInterval);
      }
    }, 50);

    await new Promise<void>((resolve) => {
      const durationCheck = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const currentSession = this.pyroSafetyService.getSession(session.sessionId);

        if (currentSession?.status === 'emergency_stopped') {
          clearInterval(durationCheck);
          clearInterval(checkInterval);
          resolve();
          return;
        }

        if (elapsed >= testDurationMs) {
          clearInterval(durationCheck);
          clearInterval(checkInterval);
          resolve();
        }
      }, 10);
    });

    const finalSession = this.pyroSafetyService.getSession(session.sessionId);

    if (finalSession?.status === 'emergency_stopped') {
      const errorMsg =
        finalSession.emergencyEvent?.reason || '火工品触发紧急关断';
      this.logger.fatal(
        `🔥 [火工品测试] 节点=${nodeId} 紧急关断! 原因: ${errorMsg}`,
      );
      return {
        passed: false,
        message: `火工品测试紧急终止: ${errorMsg}`,
        measurements: {
          pyro_resistance:
            finalSession.monitorStatus?.latestResistance ?? 0,
          pyro_emergency: 1,
        },
      };
    }

    await this.pyroSafetyService.stopSession(session.sessionId, true);
    this.activePyroSessions.delete(nodeId);

    const latestResistance =
      finalSession?.monitorStatus?.latestResistance ?? nominalResistance;
    const sampleCount = finalSession?.monitorStatus?.sampleCount ?? 0;

    variables.set(`last_pyro_resistance_${pyroId}`, latestResistance);

    this.logger.log(
      `🔥 [火工品测试] 节点=${nodeId} 测试通过! 电阻=${latestResistance.toFixed(4)}Ω, 采样数=${sampleCount}`,
    );

    return {
      passed: true,
      message: `火工品电阻测试通过: ${latestResistance.toFixed(4)} Ω (采样 ${sampleCount} 次)`,
      measurements: {
        pyro_resistance: latestResistance,
        pyro_sample_count: sampleCount,
      },
    };
  }

  private async executePyroSafetyStop(
    config: FlowNodeConfig,
    variables: Map<string, any>,
    nodeId: string,
  ): Promise<{ passed: boolean; message: string }> {
    let stoppedCount = 0;

    for (const [activeNodeId, session] of this.activePyroSessions.entries()) {
      try {
        await this.pyroSafetyService.stopSession(session.sessionId, true);
        stoppedCount++;
        this.logger.warn(
          `🔥 [火工品测试] 节点=${nodeId} 主动停止会话: ${session.sessionId.slice(0, 8)}`,
        );
      } catch (error) {
        this.logger.warn(
          `🔥 [火工品测试] 节点=${nodeId} 停止会话失败: ${error}`,
        );
      }
    }

    this.activePyroSessions.clear();

    this.pyroSafetyService.resetEmergencyState();

    return {
      passed: true,
      message: `已安全停止 ${stoppedCount} 个火工品测试会话，紧急状态已重置`,
    };
  }
}
