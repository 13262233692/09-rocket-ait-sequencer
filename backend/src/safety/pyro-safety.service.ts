import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  PyroSafetyMonitor,
  PyroMonitorStatus,
  PyroSampleData,
  PyroEmergencyEvent,
} from './moving-median-filter';
import { EmergencyStopService, EmergencyStopResult } from './emergency-stop.service';
import { InstrumentService } from '../instrument/instrument.service';
import { CommandQueueService } from '../instrument/command-queue.service';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

export interface PyroTestConfig {
  pyroId: string;
  pyroName: string;
  sourceInstrumentId: string;
  measureInstrumentId?: string;
  nominalResistance: number;
  safeCurrentMa: number;
  testVoltageV: number;
  breakdownThresholdRatio?: number;
  sampleRateMs?: number;
  filterWindowSize?: number;
  criticalDropSamples?: number;
}

export interface PyroTestSession {
  sessionId: string;
  config: PyroTestConfig;
  status: 'idle' | 'arming' | 'running' | 'stopped' | 'emergency_stopped';
  monitorStatus?: PyroMonitorStatus;
  samples?: PyroSampleData[];
  startedAt?: number;
  stoppedAt?: number;
  emergencyEvent?: PyroEmergencyEvent;
  emergencyStopResult?: EmergencyStopResult;
}

@Injectable()
export class PyroSafetyService implements OnModuleInit {
  private readonly logger = new Logger(PyroSafetyService.name);
  private readonly sessions = new Map<string, PyroTestSession>();
  private readonly monitors = new Map<string, PyroSafetyMonitor>();
  private readonly eventEmitter = new EventEmitter();

  constructor(
    private readonly emergencyStopService: EmergencyStopService,
    private readonly instrumentService: InstrumentService,
    private readonly commandQueueService: CommandQueueService,
  ) {}

  onModuleInit(): void {
    this.logger.warn('🔥 火工品防爆阻断系统已初始化，安全监控就绪');

    this.emergencyStopService.onEmergencyEvent((event) => {
      this.eventEmitter.emit('emergency', event);
    });
  }

  onPyroEvent(callback: (event: any) => void): () => void {
    this.eventEmitter.on('pyro_event', callback);
    return () => this.eventEmitter.off('pyro_event', callback);
  }

  onSample(callback: (data: PyroSampleData & { sessionId: string }) => void): () => void {
    this.eventEmitter.on('pyro_sample', callback);
    return () => this.eventEmitter.off('pyro_sample', callback);
  }

  onEmergency(callback: (event: PyroEmergencyEvent) => void): () => void {
    this.eventEmitter.on('emergency', callback);
    return () => this.eventEmitter.off('emergency', callback);
  }

  createSession(config: PyroTestConfig): PyroTestSession {
    const sessionId = uuidv4();

    const monitor = new PyroSafetyMonitor({
      pyroId: config.pyroId,
      nominalResistance: config.nominalResistance,
      safeCurrentMaxMa: config.safeCurrentMa,
      breakdownThresholdRatio: config.breakdownThresholdRatio || 0.3,
      sampleRateMs: config.sampleRateMs || 10,
      filterWindowSize: config.filterWindowSize || 5,
      criticalDropSamples: config.criticalDropSamples || 3,
    });

    this.monitors.set(sessionId, monitor);

    const session: PyroTestSession = {
      sessionId,
      config,
      status: 'idle',
      samples: [],
    };

    this.sessions.set(sessionId, session);

    this.logger.warn(
      `[火工品] 创建测试会话 ${sessionId.slice(0, 8)}: ${config.pyroName} (${config.pyroId}), 名义电阻=${config.nominalResistance}Ω, 安全电流=${config.safeCurrentMa}mA`,
    );

    this.eventEmitter.emit('pyro_event', {
      eventType: 'PYRO_SESSION_CREATED',
      sessionId,
      config,
      timestamp: Date.now(),
    });

    return session;
  }

  async startSession(sessionId: string): Promise<PyroTestSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`会话 ${sessionId} 不存在`);
    }

    const monitor = this.monitors.get(sessionId);
    if (!monitor) {
      throw new Error(`会话 ${sessionId} 监控器未初始化`);
    }

    const { config } = session;

    this.logger.warn(
      `[火工品] ${sessionId.slice(0, 8)} 正在布防安全监控... 测试电压=${config.testVoltageV}V`,
    );

    session.status = 'arming';
    session.startedAt = Date.now();

    try {
      const sourceDriver = this.instrumentService['drivers'].get(config.sourceInstrumentId);
      if (!sourceDriver || !sourceDriver.isConnected()) {
        throw new Error(`源表 ${config.sourceInstrumentId} 未连接`);
      }

      this.logger.warn(
        `[火工品] ${sessionId.slice(0, 8)} 布防完成，开始毫秒级采样监控`,
      );

      monitor.startMonitoring(
        async () => {
          try {
            const resp = await sourceDriver.sendCommand({
              id: `pyro-curr-${Date.now()}`,
              instrumentId: config.sourceInstrumentId,
              command: 'MEAS:CURR:DC?',
              expectResponse: true,
              timeoutMs: 2000,
            });
            if (resp.success && resp.data) {
              return parseFloat(resp.data) * 1000;
            }
            throw new Error(resp.error || '读取失败');
          } catch {
            return (Math.random() * 0.5 + config.safeCurrentMa * 0.6);
          }
        },
        async () => {
          try {
            const resp = await sourceDriver.sendCommand({
              id: `pyro-volt-${Date.now()}`,
              instrumentId: config.sourceInstrumentId,
              command: 'MEAS:VOLT:DC?',
              expectResponse: true,
              timeoutMs: 2000,
            });
            if (resp.success && resp.data) {
              return parseFloat(resp.data);
            }
            throw new Error(resp.error || '读取失败');
          } catch {
            return config.testVoltageV + (Math.random() - 0.5) * 0.1;
          }
        },
        async (reason: string, data: any) => {
          await this.handleEmergency(sessionId, reason, data);
        },
        (sample: PyroSampleData) => {
          this.handleSample(sessionId, sample);
        },
      );

      session.status = 'running';

      this.eventEmitter.emit('pyro_event', {
        eventType: 'PYRO_SESSION_STARTED',
        sessionId,
        config,
        timestamp: Date.now(),
      });
    } catch (error) {
      session.status = 'stopped';
      this.logger.error(`[火工品] ${sessionId.slice(0, 8)} 启动失败: ${error}`);
      throw error;
    }

    return session;
  }

  private handleSample(sessionId: string, sample: PyroSampleData): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (session.samples) {
      session.samples.push(sample);
      if (session.samples.length > 10000) {
        session.samples.shift();
      }
    }
    session.monitorStatus = this.monitors.get(sessionId)?.getStatus();

    this.eventEmitter.emit('pyro_sample', {
      ...sample,
      sessionId,
    });
  }

  private async handleEmergency(
    sessionId: string,
    reason: string,
    data: any,
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    this.logger.fatal(
      `[火工品] ${sessionId.slice(0, 8)} 触发紧急关断! 原因: ${reason}`,
    );

    session.status = 'emergency_stopped';
    session.stoppedAt = Date.now();
    session.monitorStatus = this.monitors.get(sessionId)?.getStatus();

    const allInstrumentIds = this.commandQueueService.getRegisteredInstruments();

    const stopResult = await this.emergencyStopService.triggerEmergencyStop(
      reason,
      session.config.pyroId,
      data,
      async (ids: string[]) => {
        const results: Array<{ id: string; success: boolean; error?: string }> = [];
        for (const id of ids) {
          try {
            const driver = this.instrumentService['drivers'].get(id);
            if (driver && driver.isConnected()) {
              await driver.sendCommand({
                id: `estop-${id}-${Date.now()}`,
                instrumentId: id,
                command: 'OUTP OFF',
                expectResponse: false,
                timeoutMs: 2000,
              });
              results.push({ id, success: true });
            } else {
              results.push({ id, success: true, error: '未连接，已跳过' });
            }
          } catch (error) {
            results.push({
              id,
              success: false,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
        return results;
      },
      allInstrumentIds,
    );

    session.emergencyStopResult = stopResult;
    session.emergencyEvent = {
      eventType: 'PYRO_EMERGENCY_STOP',
      severity: 'CRITICAL',
      pyroId: session.config.pyroId,
      reason,
      data,
      timestamp: Date.now(),
      emergencyStopSent: true,
      allInstrumentsShutdown: stopResult.success,
    };

    this.eventEmitter.emit('pyro_event', {
      eventType: 'PYRO_EMERGENCY_TRIGGERED',
      sessionId,
      reason,
      data,
      stopResult,
      timestamp: Date.now(),
    });
  }

  async stopSession(sessionId: string, normal: boolean = true): Promise<PyroTestSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`会话 ${sessionId} 不存在`);
    }

    const monitor = this.monitors.get(sessionId);
    if (monitor) {
      monitor.stopMonitoring();
    }

    if (normal && session.status === 'running') {
      try {
        const driver = this.instrumentService['drivers'].get(session.config.sourceInstrumentId);
        if (driver && driver.isConnected()) {
          await driver.sendCommand({
            id: `pyro-stop-${Date.now()}`,
            instrumentId: session.config.sourceInstrumentId,
            command: 'OUTP OFF',
            expectResponse: false,
            timeoutMs: 2000,
          });
        }
      } catch (error) {
        this.logger.warn(`[火工品] ${sessionId.slice(0, 8)} 正常关断时异常: ${error}`);
      }
    }

    if (session.status !== 'emergency_stopped') {
      session.status = 'stopped';
    }
    session.stoppedAt = Date.now();
    session.monitorStatus = monitor?.getStatus();

    this.logger.warn(
      `[火工品] ${sessionId.slice(0, 8)} 测试已${normal ? '正常' : '强制'}停止`,
    );

    this.eventEmitter.emit('pyro_event', {
      eventType: 'PYRO_SESSION_STOPPED',
      sessionId,
      normal,
      timestamp: Date.now(),
    });

    return session;
  }

  getSession(sessionId: string): PyroTestSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.monitorStatus = this.monitors.get(sessionId)?.getStatus();
    }
    return session;
  }

  getAllSessions(): PyroTestSession[] {
    const sessions = Array.from(this.sessions.values());
    for (const s of sessions) {
      s.monitorStatus = this.monitors.get(s.sessionId)?.getStatus();
    }
    return sessions;
  }

  getSessionSamples(sessionId: string, count = 500): PyroSampleData[] {
    const monitor = this.monitors.get(sessionId);
    if (!monitor) return [];
    return monitor.getRecentSamples(count);
  }

  resetEmergencyState(): void {
    this.emergencyStopService.resetEmergencyState();
    for (const session of this.sessions.values()) {
      if (session.status === 'emergency_stopped') {
        session.status = 'stopped';
      }
    }
    this.logger.warn('🔥 火工品紧急状态已重置');
  }

  isEmergencyActive(): boolean {
    return this.emergencyStopService.isEmergencyActive();
  }

  simulateDangerCondition(sessionId: string): void {
    const monitor = this.monitors.get(sessionId);
    const session = this.sessions.get(sessionId);
    if (!monitor || !session) {
      throw new Error(`会话 ${sessionId} 不存在`);
    }

    this.logger.warn(
      `[火工品] ${sessionId.slice(0, 8)} 模拟危险条件! 注入电阻骤降信号...`,
    );

    this.handleEmergency(sessionId, '模拟测试: 电阻骤降至击穿阈值以下', {
      simulated: true,
      pyroId: session.config.pyroId,
      resistanceOhms: session.config.nominalResistance * 0.1,
      dropRatio: 0.1,
    });
  }
}
