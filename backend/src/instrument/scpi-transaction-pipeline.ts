import { Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { Mutex, MutexPool } from './mutex';

export interface PendingRequest {
  id: string;
  command: string;
  expectResponse: boolean;
  sentAt: number;
  timeoutMs: number;
  resolve: (value: string | null) => void;
  reject: (reason: Error) => void;
  completed: boolean;
}

export interface TransactionResult {
  requestId: string;
  command: string;
  success: boolean;
  response?: string;
  error?: string;
  latencyMs: number;
  timestamp: number;
}

export interface ScpiTransactionOptions {
  timeoutMs?: number;
  expectResponse?: boolean;
  retryCount?: number;
  requireTerminator?: boolean;
  terminator?: string;
  validateResponse?: (resp: string) => boolean;
}

const DEFAULT_OPTIONS: Required<ScpiTransactionOptions> = {
  timeoutMs: 5000,
  expectResponse: false,
  retryCount: 0,
  requireTerminator: true,
  terminator: '\n',
  validateResponse: () => true,
};

export class ScpiTransactionPipeline {
  private readonly logger: Logger;
  private readonly instrumentId: string;
  private readonly mutex: Mutex;
  private pendingRequest: PendingRequest | null = null;
  private responseBuffer: string = '';
  private transactionHistory: TransactionResult[] = [];
  private readonly maxHistorySize = 1000;
  private consecutiveErrors = 0;
  private readonly maxConsecutiveErrors = 5;
  private circuitBreakerOpen = false;
  private circuitBreakerResetAt = 0;
  private readonly circuitBreakerTimeout = 30000;

  constructor(instrumentId: string) {
    this.instrumentId = instrumentId;
    this.logger = new Logger(`ScpiPipeline-${instrumentId}`);
    this.mutex = MutexPool.get(`scpi-${instrumentId}`);
  }

  async executeTransaction(
    sendRaw: (data: string) => Promise<string | null>,
    command: string,
    options: ScpiTransactionOptions = {},
  ): Promise<TransactionResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const requestId = uuidv4();
    const startTime = Date.now();

    if (this.circuitBreakerOpen) {
      if (Date.now() > this.circuitBreakerResetAt) {
        this.circuitBreakerOpen = false;
        this.consecutiveErrors = 0;
        this.logger.warn(`[${this.instrumentId}] 熔断器已重置，恢复通信`);
      } else {
        const remaining = this.circuitBreakerResetAt - Date.now();
        throw new Error(
          `熔断器已打开，请等待 ${Math.ceil(remaining / 1000)} 秒后重试`,
        );
      }
    }

    return this.mutex.runExclusive(
      async () => {
        this.logger.debug(
          `[${this.instrumentId}] 开始事务 [${requestId.slice(0, 8)}]: ${command}`,
        );

        this.responseBuffer = '';
        let lastError: Error | null = null;
        let finalResponse: string | null = null;

        for (let attempt = 0; attempt <= opts.retryCount; attempt++) {
          if (attempt > 0) {
            this.logger.warn(
              `[${this.instrumentId}] 重试第 ${attempt} 次 [${requestId.slice(0, 8)}]`,
            );
            await new Promise((r) => setTimeout(r, 100 * attempt));
          }

          try {
            const result = await this.executeSingleTransaction(
              sendRaw,
              command,
              opts,
              requestId,
            );

            if (result.success) {
              finalResponse = result.response;
              lastError = null;
              break;
            } else {
              lastError = new Error(result.error || '执行失败');
            }
          } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            this.logger.warn(
              `[${this.instrumentId}] 事务失败 [${requestId.slice(0, 8)}] 第 ${attempt + 1} 次: ${lastError.message}`,
            );
          }
        }

        const latencyMs = Date.now() - startTime;
        const success = lastError === null;

        if (!success && lastError) {
          this.consecutiveErrors++;
          if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
            this.openCircuitBreaker();
          }
        } else {
          this.consecutiveErrors = 0;
        }

        const transactionResult: TransactionResult = {
          requestId,
          command,
          success,
          response: finalResponse ?? undefined,
          error: lastError?.message,
          latencyMs,
          timestamp: Date.now(),
        };

        this.recordTransaction(transactionResult);

        if (!success && lastError) {
          this.logger.error(
            `[${this.instrumentId}] 事务最终失败 [${requestId.slice(0, 8)}]: ${command} - ${lastError.message} (耗时 ${latencyMs}ms)`,
          );
          throw lastError;
        }

        this.logger.debug(
          `[${this.instrumentId}] 事务完成 [${requestId.slice(0, 8)}]: ${command} -> ${success ? 'OK' : 'FAIL'} (耗时 ${latencyMs}ms)`,
        );

        return transactionResult;
      },
      opts.timeoutMs * (opts.retryCount + 1) + 1000,
      requestId,
    );
  }

  private async executeSingleTransaction(
    sendRaw: (data: string) => Promise<string | null>,
    command: string,
    opts: Required<ScpiTransactionOptions>,
    requestId: string,
  ): Promise<{ success: boolean; response?: string | null; error?: string }> {
    this.responseBuffer = '';
    this.pendingRequest = {
      id: requestId,
      command,
      expectResponse: opts.expectResponse,
      sentAt: Date.now(),
      timeoutMs: opts.timeoutMs,
      resolve: () => {},
      reject: () => {},
      completed: false,
    };

    try {
      const response = await this.withTimeout(
        sendRaw(command),
        opts.timeoutMs,
      );

      if (!opts.expectResponse) {
        this.pendingRequest.completed = true;
        return { success: true, response: null };
      }

      if (response === null || response === undefined) {
        return { success: false, error: '未收到仪器响应' };
      }

      const cleanedResponse = this.cleanResponse(response, opts);

      if (opts.requireTerminator && !this.hasValidTerminator(response, opts.terminator)) {
        this.logger.warn(
          `[${this.instrumentId}] 响应缺少终止符: ${JSON.stringify(response.slice(-20))}`,
        );
      }

      if (!opts.validateResponse(cleanedResponse)) {
        return { success: false, error: `响应验证失败: ${cleanedResponse}` };
      }

      this.pendingRequest.completed = true;
      return { success: true, response: cleanedResponse };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMsg };
    } finally {
      this.pendingRequest = null;
    }
  }

  private cleanResponse(
    response: string,
    opts: Required<ScpiTransactionOptions>,
  ): string {
    let cleaned = response;

    if (opts.requireTerminator && cleaned.endsWith(opts.terminator)) {
      cleaned = cleaned.slice(0, -opts.terminator.length);
    }

    cleaned = cleaned.trim();
    cleaned = cleaned.replace(/\u0000/g, '');
    cleaned = cleaned.replace(/\r/g, '');

    return cleaned;
  }

  private hasValidTerminator(response: string, terminator: string): boolean {
    return response.endsWith(terminator);
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`操作超时 (${timeoutMs}ms)`)),
          timeoutMs,
        ),
      ),
    ]);
  }

  private recordTransaction(result: TransactionResult): void {
    this.transactionHistory.push(result);
    if (this.transactionHistory.length > this.maxHistorySize) {
      this.transactionHistory.shift();
    }
  }

  private openCircuitBreaker(): void {
    this.circuitBreakerOpen = true;
    this.circuitBreakerResetAt = Date.now() + this.circuitBreakerTimeout;
    this.logger.error(
      `[${this.instrumentId}] 连续错误 ${this.consecutiveErrors} 次，熔断器已打开，暂停通信 ${this.circuitBreakerTimeout / 1000} 秒`,
    );
  }

  getTransactionHistory(count?: number): TransactionResult[] {
    if (count) {
      return this.transactionHistory.slice(-count);
    }
    return [...this.transactionHistory];
  }

  getPendingRequest(): PendingRequest | null {
    return this.pendingRequest;
  }

  getStatistics(): {
    total: number;
    success: number;
    failed: number;
    consecutiveErrors: number;
    circuitBreakerOpen: boolean;
    averageLatencyMs: number;
  } {
    const total = this.transactionHistory.length;
    const success = this.transactionHistory.filter((t) => t.success).length;
    const failed = total - success;
    const latencies = this.transactionHistory.map((t) => t.latencyMs);
    const averageLatencyMs =
      latencies.length > 0
        ? latencies.reduce((a, b) => a + b, 0) / latencies.length
        : 0;

    return {
      total,
      success,
      failed,
      consecutiveErrors: this.consecutiveErrors,
      circuitBreakerOpen: this.circuitBreakerOpen,
      averageLatencyMs: Math.round(averageLatencyMs),
    };
  }

  reset(): void {
    this.responseBuffer = '';
    this.pendingRequest = null;
    this.consecutiveErrors = 0;
    this.circuitBreakerOpen = false;
    this.circuitBreakerResetAt = 0;
    this.logger.log(`[${this.instrumentId}] 事务管道已重置`);
  }

  isBusy(): boolean {
    return this.mutex.isLocked();
  }

  getQueueDepth(): number {
    return this.mutex.getQueueDepth();
  }
}
