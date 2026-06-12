import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Mutex, MutexPool } from '../instrument/mutex';
import { PyroEmergencyEvent } from './moving-median-filter';
import { EventEmitter } from 'events';

export interface EmergencyStopResult {
  success: boolean;
  timestamp: number;
  shutdownInstruments: string[];
  failedInstruments: Array<{ instrumentId: string; error: string }>;
  elapsedMs: number;
}

@Injectable()
export class EmergencyStopService implements OnModuleInit {
  private readonly logger = new Logger(EmergencyStopService.name);
  private readonly emergencyMutex: Mutex;
  private _isEmergencyActive = false;
  private lastEmergencyEvent?: PyroEmergencyEvent;
  private readonly eventEmitter = new EventEmitter();
  private shutdownHistory: EmergencyStopResult[] = [];
  private readonly maxHistorySize = 100;

  constructor() {
    this.emergencyMutex = MutexPool.get('global-emergency-stop');
  }

  onModuleInit(): void {
    this.logger.warn('🚨 紧急关断服务已初始化，独立急停通道就绪');
  }

  onEmergencyEvent(callback: (event: PyroEmergencyEvent) => void): () => void {
    this.eventEmitter.on('emergency', callback);
    return () => this.eventEmitter.off('emergency', callback);
  }

  async triggerEmergencyStop(
    reason: string,
    pyroId: string,
    sensorData: any,
    shutdownAllInstruments: (instrumentIds: string[]) => Promise<Array<{ id: string; success: boolean; error?: string }>>,
    allInstrumentIds: string[],
  ): Promise<EmergencyStopResult> {
    return this.emergencyMutex.runExclusive(
      async () => {
        const startTime = Date.now();

        if (this._isEmergencyActive) {
          this.logger.warn('紧急关断已激活，正在强制执行二次关断确认');
        }

        this._isEmergencyActive = true;

        this.logger.fatal(
          `\n\n` +
            `╔══════════════════════════════════════════════════════════════════╗\n` +
            `║           🚨🚨🚨  火工品紧急关断 TRIGGERED  🚨🚨🚨                  ║\n` +
            `╠══════════════════════════════════════════════════════════════════╣\n` +
            `║  火工品: ${pyroId.padEnd(54)}║\n` +
            `║  原因: ${(reason || '未知').toString().padEnd(56).slice(0, 56)}║\n` +
            `║  时间: ${new Date().toISOString().padEnd(54)}║\n` +
            `╚══════════════════════════════════════════════════════════════════╝\n`,
        );

        const emergencyEvent: PyroEmergencyEvent = {
          eventType: 'PYRO_EMERGENCY_STOP',
          severity: 'CRITICAL',
          pyroId,
          reason,
          data: sensorData,
          timestamp: startTime,
          emergencyStopSent: false,
          allInstrumentsShutdown: false,
        };

        this.lastEmergencyEvent = emergencyEvent;
        this.eventEmitter.emit('emergency', emergencyEvent);

        this.logger.warn(
          '[急停通道] 正在发送高优先级 OUTP OFF 关断指令，绕开常规流程网关...',
        );

        const shutdownResults = await shutdownAllInstruments(allInstrumentIds);

        const shutdownInstruments: string[] = [];
        const failedInstruments: Array<{ instrumentId: string; error: string }> = [];

        for (const result of shutdownResults) {
          if (result.success) {
            shutdownInstruments.push(result.id);
            this.logger.fatal(
              `[急停通道] ✅ 仪器 ${result.id} OUTP OFF 已执行`,
            );
          } else {
            failedInstruments.push({
              instrumentId: result.id,
              error: result.error || '未知错误',
            });
            this.logger.error(
              `[急停通道] ❌ 仪器 ${result.id} 关断失败: ${result.error}`,
            );
          }
        }

        emergencyEvent.emergencyStopSent = true;
        emergencyEvent.allInstrumentsShutdown = failedInstruments.length === 0;

        const elapsedMs = Date.now() - startTime;

        const stopResult: EmergencyStopResult = {
          success: failedInstruments.length === 0,
          timestamp: startTime,
          shutdownInstruments,
          failedInstruments,
          elapsedMs,
        };

        this.shutdownHistory.push(stopResult);
        if (this.shutdownHistory.length > this.maxHistorySize) {
          this.shutdownHistory.shift();
        }

        this.eventEmitter.emit('emergency_complete', {
          ...emergencyEvent,
          stopResult,
        });

        this.logger.fatal(
          `\n\n` +
            `╔══════════════════════════════════════════════════════════════════╗\n` +
            `║           🔥  紧急关断执行完成  🔥                                 ║\n` +
            `╠══════════════════════════════════════════════════════════════════╣\n` +
            `║  成功关断: ${String(shutdownInstruments.length).padEnd(48)}║\n` +
            `║  关断失败: ${String(failedInstruments.length).padEnd(48)}║\n` +
            `║  总耗时: ${`${elapsedMs}ms`.padEnd(52)}║\n` +
            `╚══════════════════════════════════════════════════════════════════╝\n`,
        );

        return stopResult;
      },
      60000,
      `emergency-${pyroId}-${Date.now()}`,
    );
  }

  resetEmergencyState(): void {
    this._isEmergencyActive = false;
    this.logger.warn('紧急状态已重置');
  }

  isEmergencyActive(): boolean {
    return this._isEmergencyActive;
  }

  getLastEmergencyEvent(): PyroEmergencyEvent | undefined {
    return this.lastEmergencyEvent;
  }

  getShutdownHistory(): EmergencyStopResult[] {
    return [...this.shutdownHistory];
  }
}
