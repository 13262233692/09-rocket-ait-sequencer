import { Injectable, Logger } from '@nestjs/common';
import {
  ScpiCommand,
  ScpiResponse,
  ScpiCommandOptions,
} from '../common/types/instrument.types';
import { IProtocolDriver } from './drivers/protocol-driver.base';
import { TransactionResult } from './scpi-transaction-pipeline';

export interface QueuedCommand {
  command: ScpiCommand;
  options?: ScpiCommandOptions;
  resolve: (value: ScpiResponse) => void;
  reject: (reason: any) => void;
  timestamp: number;
  priority: number;
}

export interface QueueStatistics {
  pendingCount: number;
  totalProcessed: number;
  successCount: number;
  failedCount: number;
  averageWaitTimeMs: number;
  averageExecutionTimeMs: number;
}

@Injectable()
export class CommandQueueService {
  private readonly logger = new Logger(CommandQueueService.name);
  private drivers = new Map<string, IProtocolDriver>();
  private statistics = new Map<
    string,
    {
      totalProcessed: number;
      successCount: number;
      failedCount: number;
      totalWaitTime: number;
      totalExecutionTime: number;
    }
  >();

  registerDriver(instrumentId: string, driver: IProtocolDriver): void {
    this.drivers.set(instrumentId, driver);
    if (!this.statistics.has(instrumentId)) {
      this.statistics.set(instrumentId, {
        totalProcessed: 0,
        successCount: 0,
        failedCount: 0,
        totalWaitTime: 0,
        totalExecutionTime: 0,
      });
    }
    this.logger.log(`已注册仪器驱动: ${instrumentId}`);
  }

  unregisterDriver(instrumentId: string): void {
    const driver = this.drivers.get(instrumentId);
    if (driver) {
      this.logger.warn(`注销仪器驱动: ${instrumentId}`);
    }
    this.drivers.delete(instrumentId);
  }

  async enqueue(
    command: ScpiCommand,
    options?: ScpiCommandOptions,
  ): Promise<ScpiResponse> {
    const instrumentId = command.instrumentId!;
    const queuedTime = Date.now();
    const driver = this.drivers.get(instrumentId);

    if (!driver) {
      const errorMsg = `仪器 ${instrumentId} 驱动未注册`;
      this.logger.error(errorMsg);
      return {
        commandId: command.id,
        instrumentId,
        success: false,
        error: errorMsg,
        timestamp: Date.now(),
        executionTimeMs: 0,
      };
    }

    if (!driver.isConnected()) {
      const errorMsg = `仪器 ${instrumentId} 未连接`;
      this.logger.error(errorMsg);
      return {
        commandId: command.id,
        instrumentId,
        success: false,
        error: errorMsg,
        timestamp: Date.now(),
        executionTimeMs: 0,
      };
    }

    this.logger.debug(
      `[${instrumentId}] 命令入队: ${command.command} (期望响应: ${command.expectResponse ?? true})`,
    );

    try {
      const response = await driver.sendCommand(command, options);
      const waitTime = Date.now() - queuedTime;
      this.updateStatistics(instrumentId, response, waitTime);

      if (response.success) {
        this.logger.debug(
          `[${instrumentId}] 命令完成: ${command.command} -> 成功 (耗时 ${response.executionTimeMs}ms, 等待 ${waitTime}ms)`,
        );
      } else {
        this.logger.warn(
          `[${instrumentId}] 命令完成: ${command.command} -> 失败: ${response.error}`,
        );
      }

      return response;
    } catch (error) {
      const waitTime = Date.now() - queuedTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[${instrumentId}] 命令异常: ${command.command} -> ${errorMsg}`,
      );

      const errorResponse: ScpiResponse = {
        commandId: command.id,
        instrumentId,
        success: false,
        error: errorMsg,
        timestamp: Date.now(),
        executionTimeMs: waitTime,
      };

      this.updateStatistics(instrumentId, errorResponse, waitTime);
      return errorResponse;
    }
  }

  async enqueueBatch(
    commands: ScpiCommand[],
    options?: ScpiCommandOptions,
    sequential = true,
  ): Promise<ScpiResponse[]> {
    if (sequential) {
      const results: ScpiResponse[] = [];
      for (const cmd of commands) {
        const result = await this.enqueue(cmd, options);
        results.push(result);
        if (!result.success) {
          this.logger.warn(
            `批量命令在 ${cmd.command} 失败，继续执行后续命令`,
          );
        }
      }
      return results;
    } else {
      return Promise.all(commands.map((cmd) => this.enqueue(cmd, options)));
    }
  }

  private updateStatistics(
    instrumentId: string,
    response: ScpiResponse,
    waitTimeMs: number,
  ): void {
    const stats = this.statistics.get(instrumentId);
    if (!stats) return;

    stats.totalProcessed++;
    if (response.success) {
      stats.successCount++;
    } else {
      stats.failedCount++;
    }
    stats.totalWaitTime += waitTimeMs;
    stats.totalExecutionTime += response.executionTimeMs;
  }

  getQueueDepth(instrumentId: string): number {
    const driver = this.drivers.get(instrumentId);
    return driver?.getStatistics().queueDepth ?? 0;
  }

  getQueueStatistics(instrumentId: string): QueueStatistics {
    const stats = this.statistics.get(instrumentId) || {
      totalProcessed: 0,
      successCount: 0,
      failedCount: 0,
      totalWaitTime: 0,
      totalExecutionTime: 0,
    };

    const driver = this.drivers.get(instrumentId);
    const pendingCount = driver?.getStatistics().queueDepth ?? 0;

    return {
      pendingCount,
      totalProcessed: stats.totalProcessed,
      successCount: stats.successCount,
      failedCount: stats.failedCount,
      averageWaitTimeMs:
        stats.totalProcessed > 0
          ? Math.round(stats.totalWaitTime / stats.totalProcessed)
          : 0,
      averageExecutionTimeMs:
        stats.totalProcessed > 0
          ? Math.round(stats.totalExecutionTime / stats.totalProcessed)
          : 0,
    };
  }

  getDriverStatistics(
    instrumentId: string,
  ):
    | {
        total: number;
        success: number;
        failed: number;
        consecutiveErrors: number;
        circuitBreakerOpen: boolean;
        averageLatencyMs: number;
        isBusy: boolean;
        queueDepth: number;
      }
    | undefined {
    return this.drivers.get(instrumentId)?.getStatistics();
  }

  getRecentTransactions(
    instrumentId: string,
    count?: number,
  ): TransactionResult[] {
    return this.drivers.get(instrumentId)?.getRecentTransactions(count) || [];
  }

  clearQueue(instrumentId: string): void {
    this.logger.warn(`仪器 ${instrumentId} 命令队列已清空（已在驱动层处理）`);
  }

  resetStatistics(instrumentId?: string): void {
    if (instrumentId) {
      this.statistics.set(instrumentId, {
        totalProcessed: 0,
        successCount: 0,
        failedCount: 0,
        totalWaitTime: 0,
        totalExecutionTime: 0,
      });
      this.logger.log(`已重置仪器 ${instrumentId} 统计数据`);
    } else {
      for (const id of this.statistics.keys()) {
        this.statistics.set(id, {
          totalProcessed: 0,
          successCount: 0,
          failedCount: 0,
          totalWaitTime: 0,
          totalExecutionTime: 0,
        });
      }
      this.logger.log('已重置所有仪器统计数据');
    }
  }

  getRegisteredInstruments(): string[] {
    return Array.from(this.drivers.keys());
  }

  isInstrumentBusy(instrumentId: string): boolean {
    const driver = this.drivers.get(instrumentId);
    return driver?.getStatistics().isBusy ?? false;
  }

  async awaitInstrumentIdle(instrumentId: string, timeoutMs = 30000): Promise<void> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      if (!this.isInstrumentBusy(instrumentId)) {
        return;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`等待仪器 ${instrumentId} 空闲超时 (${timeoutMs}ms)`);
  }
}
