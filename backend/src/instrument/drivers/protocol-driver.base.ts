import { Logger } from '@nestjs/common';
import {
  ScpiCommand,
  ScpiResponse,
  ScpiCommandOptions,
} from '../../common/types/instrument.types';
import {
  ScpiTransactionPipeline,
  ScpiTransactionOptions,
  TransactionResult,
} from '../scpi-transaction-pipeline';

export interface IProtocolDriver {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  sendCommand(
    command: ScpiCommand,
    options?: ScpiCommandOptions,
  ): Promise<ScpiResponse>;
  sendRaw(data: string): Promise<string | null>;
  getIdentity(): Promise<string>;
  getStatistics(): {
    total: number;
    success: number;
    failed: number;
    consecutiveErrors: number;
    circuitBreakerOpen: boolean;
    averageLatencyMs: number;
    isBusy: boolean;
    queueDepth: number;
  };
  getRecentTransactions(count?: number): TransactionResult[];
}

export abstract class ProtocolDriverBase implements IProtocolDriver {
  protected readonly logger: Logger;
  protected connected = false;
  protected instrumentId: string;
  protected host: string;
  protected port: number;
  protected timeoutMs: number;
  protected transactionPipeline: ScpiTransactionPipeline;

  constructor(options: {
    instrumentId: string;
    host?: string;
    port?: number;
    timeoutMs?: number;
  }) {
    this.instrumentId = options.instrumentId;
    this.host = options.host || '127.0.0.1';
    this.port = options.port || 5025;
    this.timeoutMs = options.timeoutMs || 5000;
    this.logger = new Logger(`Driver-${options.instrumentId}`);
    this.transactionPipeline = new ScpiTransactionPipeline(options.instrumentId);
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract sendRaw(data: string): Promise<string | null>;
  abstract getIdentity(): Promise<string>;

  isConnected(): boolean {
    return this.connected;
  }

  async sendCommand(
    command: ScpiCommand,
    options?: ScpiCommandOptions,
  ): Promise<ScpiResponse> {
    const startTime = Date.now();

    const transactionOptions: ScpiTransactionOptions = {
      timeoutMs: command.timeoutMs || options?.timeoutMs || this.timeoutMs,
      expectResponse: command.expectResponse ?? true,
      retryCount: command.retryCount || options?.retryCount || 0,
      requireTerminator: true,
      terminator: '\n',
    };

    if (options?.validateResponse && typeof options.validateResponse === 'function') {
      transactionOptions.validateResponse = options.validateResponse;
    }

    try {
      const result = await this.transactionPipeline.executeTransaction(
        (cmd) => this.sendRaw(cmd),
        command.command,
        transactionOptions,
      );

      return {
        commandId: command.id,
        instrumentId: this.instrumentId,
        success: true,
        data: result.response,
        requestId: result.requestId,
        timestamp: result.timestamp,
        executionTimeMs: result.latencyMs,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const latency = Date.now() - startTime;

      this.logger.error(
        `[${this.instrumentId}] 命令执行失败: ${command.command} -> ${errorMsg} (${latency}ms)`,
      );

      return {
        commandId: command.id,
        instrumentId: this.instrumentId,
        success: false,
        error: errorMsg,
        timestamp: Date.now(),
        executionTimeMs: latency,
      };
    }
  }

  async sendQuery(command: string, timeoutMs?: number): Promise<string> {
    const scpiCommand: ScpiCommand = {
      id: `query-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      command,
      expectResponse: true,
      timeoutMs: timeoutMs || this.timeoutMs,
      retryCount: 0,
    };

    const response = await this.sendCommand(scpiCommand);

    if (!response.success) {
      throw new Error(`查询失败: ${command} - ${response.error}`);
    }

    if (response.data === undefined || response.data === null) {
      throw new Error(`查询无响应: ${command}`);
    }

    return response.data;
  }

  async sendWrite(command: string, timeoutMs?: number): Promise<void> {
    const scpiCommand: ScpiCommand = {
      id: `write-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      command,
      expectResponse: false,
      timeoutMs: timeoutMs || this.timeoutMs,
      retryCount: 0,
    };

    const response = await this.sendCommand(scpiCommand);

    if (!response.success) {
      throw new Error(`写入失败: ${command} - ${response.error}`);
    }
  }

  getStatistics(): {
    total: number;
    success: number;
    failed: number;
    consecutiveErrors: number;
    circuitBreakerOpen: boolean;
    averageLatencyMs: number;
    isBusy: boolean;
    queueDepth: number;
  } {
    const pipelineStats = this.transactionPipeline.getStatistics();
    return {
      ...pipelineStats,
      isBusy: this.transactionPipeline.isBusy(),
      queueDepth: this.transactionPipeline.getQueueDepth(),
    };
  }

  getRecentTransactions(count?: number): TransactionResult[] {
    return this.transactionPipeline.getTransactionHistory(count);
  }

  resetPipeline(): void {
    this.transactionPipeline.reset();
  }

  protected async withTimeout<T>(
    promise: Promise<T>,
    customTimeout?: number,
  ): Promise<T> {
    const timeout = customTimeout || this.timeoutMs;
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`操作超时 (${timeout}ms)`)),
          timeout,
        ),
      ),
    ]);
  }

  protected buildScpiCommand(
    cmd: string,
    params?: Record<string, any>,
  ): string {
    let command = cmd.trim();
    if (params && Object.keys(params).length > 0) {
      const paramStr = Object.entries(params)
        .map(([, v]) => v)
        .join(',');
      command = `${command} ${paramStr}`;
    }
    if (!command.endsWith('\n')) {
      command += '\n';
    }
    return command;
  }

  protected parseNumericResponse(response: string): number {
    const cleaned = response
      .trim()
      .replace(/^[+\-]?\d+\.?\d*[eE][+\-]?\d+/, (m) => m)
      .trim();
    const num = parseFloat(cleaned);
    if (isNaN(num)) {
      throw new Error(`无法解析数值响应: "${response}"`);
    }
    return num;
  }

  protected parseBooleanResponse(response: string): boolean {
    const cleaned = response.trim().toUpperCase();
    if (cleaned === '1' || cleaned === 'ON' || cleaned === 'TRUE') {
      return true;
    }
    if (cleaned === '0' || cleaned === 'OFF' || cleaned === 'FALSE') {
      return false;
    }
    throw new Error(`无法解析布尔响应: "${response}"`);
  }
}
