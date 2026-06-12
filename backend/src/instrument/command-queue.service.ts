import { Injectable, Logger } from '@nestjs/common';
import { ScpiCommand, ScpiResponse } from '../common/types/instrument.types';
import { IProtocolDriver } from './drivers/protocol-driver.base';

interface QueuedCommand {
  command: ScpiCommand;
  resolve: (value: ScpiResponse) => void;
  reject: (reason: any) => void;
  timestamp: number;
}

@Injectable()
export class CommandQueueService {
  private readonly logger = new Logger(CommandQueueService.name);
  private queues = new Map<string, QueuedCommand[]>();
  private processing = new Set<string>();
  private drivers = new Map<string, IProtocolDriver>();

  registerDriver(instrumentId: string, driver: IProtocolDriver): void {
    this.drivers.set(instrumentId, driver);
    if (!this.queues.has(instrumentId)) {
      this.queues.set(instrumentId, []);
    }
  }

  unregisterDriver(instrumentId: string): void {
    this.drivers.delete(instrumentId);
    const queue = this.queues.get(instrumentId);
    if (queue) {
      while (queue.length > 0) {
        const cmd = queue.shift();
        cmd?.reject(new Error(`仪器 ${instrumentId} 已断开连接`));
      }
    }
    this.queues.delete(instrumentId);
    this.processing.delete(instrumentId);
  }

  enqueue(command: ScpiCommand): Promise<ScpiResponse> {
    return new Promise((resolve, reject) => {
      const queued: QueuedCommand = {
        command,
        resolve,
        reject,
        timestamp: Date.now(),
      };

      if (!this.queues.has(command.instrumentId)) {
        this.queues.set(command.instrumentId, []);
      }
      this.queues.get(command.instrumentId)!.push(queued);
      this.logger.debug(`命令入队 [${command.instrumentId}]: ${command.command} (队列深度: ${this.queues.get(command.instrumentId)!.length})`);

      this.processQueue(command.instrumentId);
    });
  }

  getQueueDepth(instrumentId: string): number {
    return this.queues.get(instrumentId)?.length ?? 0;
  }

  clearQueue(instrumentId: string): void {
    const queue = this.queues.get(instrumentId);
    if (queue) {
      while (queue.length > 0) {
        const cmd = queue.shift();
        cmd?.reject(new Error('命令队列已被清空'));
      }
    }
    this.logger.warn(`仪器 ${instrumentId} 命令队列已清空`);
  }

  private async processQueue(instrumentId: string): Promise<void> {
    if (this.processing.has(instrumentId)) {
      return;
    }

    const queue = this.queues.get(instrumentId);
    if (!queue || queue.length === 0) {
      return;
    }

    const driver = this.drivers.get(instrumentId);
    if (!driver) {
      while (queue.length > 0) {
        const cmd = queue.shift();
        cmd?.reject(new Error(`仪器 ${instrumentId} 驱动未注册`));
      }
      return;
    }

    this.processing.add(instrumentId);

    try {
      while (queue.length > 0) {
        const queued = queue.shift()!;
        const waitTime = Date.now() - queued.timestamp;
        this.logger.debug(`执行命令 [${instrumentId}]: ${queued.command.command} (等待${waitTime}ms)`);

        try {
          if (!driver.isConnected()) {
            throw new Error(`仪器 ${instrumentId} 未连接`);
          }
          const response = await driver.sendCommand(queued.command);
          queued.resolve(response);
        } catch (error) {
          this.logger.error(`命令执行失败 [${instrumentId}]: ${queued.command.command} - ${error}`);
          const errorResponse: ScpiResponse = {
            commandId: queued.command.id,
            instrumentId,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            timestamp: Date.now(),
            executionTimeMs: 0,
          };
          queued.resolve(errorResponse);
        }
      }
    } finally {
      this.processing.delete(instrumentId);
    }
  }
}
