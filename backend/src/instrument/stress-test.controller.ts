import { Controller, Post, Get, Param, Query, HttpException, HttpStatus } from '@nestjs/common';
import { CommandQueueService } from './command-queue.service';
import { InstrumentService } from './instrument.service';
import { ScpiCommand } from '../common/types/instrument.types';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '@nestjs/common';

interface StressTestResult {
  totalCommands: number;
  successCount: number;
  failedCount: number;
  dataIntegrityErrors: number;
  averageLatencyMs: number;
  maxLatencyMs: number;
  minLatencyMs: number;
  throughPut: number;
  startTime: number;
  endTime: number;
  durationMs: number;
  mismatchedResponses: Array<{
    commandIndex: number;
    command: string;
    expectedPattern: string;
    actualResponse: string;
  }>;
}

@Controller('api/stress-test')
export class StressTestController {
  private readonly logger = new Logger(StressTestController.name);

  constructor(
    private readonly commandQueueService: CommandQueueService,
    private readonly instrumentService: InstrumentService,
  ) {}

  @Post(':instrumentId/data-integrity')
  async runDataIntegrityTest(
    @Param('instrumentId') instrumentId: string,
    @Query('count') countParam?: string,
    @Query('concurrency') concurrencyParam?: string,
  ): Promise<StressTestResult> {
    const count = parseInt(countParam || '100', 10);
    const concurrency = parseInt(concurrencyParam || '20', 10);

    if (count < 1 || count > 10000) {
      throw new HttpException('命令数量必须在 1-10000 之间', HttpStatus.BAD_REQUEST);
    }

    const instrument = this.instrumentService.getInstrument(instrumentId);
    if (!instrument) {
      throw new HttpException(`仪器 ${instrumentId} 不存在`, HttpStatus.NOT_FOUND);
    }

    if (instrument.status !== 'online') {
      throw new HttpException(`仪器 ${instrumentId} 未连接`, HttpStatus.BAD_REQUEST);
    }

    this.logger.warn(
      `开始数据完整性压测: 仪器=${instrumentId}, 命令数=${count}, 并发=${concurrency}`,
    );

    const commandTypes = [
      { cmd: 'MEAS:VOLT:DC?', pattern: /^[+\-]?\d+\.?\d*(?:[eE][+\-]?\d+)?$/ },
      { cmd: 'MEAS:CURR:DC?', pattern: /^[+\-]?\d+\.?\d*(?:[eE][+\-]?\d+)?$/ },
      { cmd: 'MEAS:IMP?', pattern: /^[+\-]?\d+\.?\d*(?:[eE][+\-]?\d+)?$/ },
      { cmd: '*IDN?', pattern: /^ROCKET-AIT/ },
      { cmd: '*STB?', pattern: /^\d+$/ },
    ];

    const commands: ScpiCommand[] = [];
    const expectedPatterns: RegExp[] = [];

    for (let i = 0; i < count; i++) {
      const typeIndex = i % commandTypes.length;
      const cmdType = commandTypes[typeIndex];
      commands.push({
        id: `stress-${i}-${uuidv4().slice(0, 8)}`,
        instrumentId,
        command: cmdType.cmd,
        expectResponse: true,
        timeoutMs: 5000,
        priority: 5,
        retryCount: 1,
      });
      expectedPatterns.push(cmdType.pattern);
    }

    const startTime = Date.now();
    const results = new Array(count);
    const mismatchedResponses: StressTestResult['mismatchedResponses'] = [];

    let completedCount = 0;
    let dataIntegrityErrors = 0;

    const processBatch = async (startIdx: number, endIdx: number) => {
      for (let i = startIdx; i < endIdx && i < count; i++) {
        try {
          const response = await this.commandQueueService.enqueue(commands[i]);
          results[i] = response;

          if (response.success && response.data) {
            const pattern = expectedPatterns[i];
            if (!pattern.test(response.data)) {
              dataIntegrityErrors++;
              mismatchedResponses.push({
                commandIndex: i,
                command: commands[i].command,
                expectedPattern: pattern.toString(),
                actualResponse: response.data,
              });
              this.logger.error(
                `数据完整性错误! 命令 ${i}: ${commands[i].command} -> 期望匹配 ${pattern}, 实际: ${response.data}`,
              );
            }
          }

          completedCount++;
          if (completedCount % 100 === 0) {
            this.logger.log(`已完成 ${completedCount}/${count} 个命令`);
          }
        } catch (error) {
          results[i] = {
            commandId: commands[i].id,
            instrumentId,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            timestamp: Date.now(),
            executionTimeMs: 0,
          };
          completedCount++;
        }
      }
    };

    const batchSize = Math.ceil(count / concurrency);
    const promises: Promise<void>[] = [];

    for (let i = 0; i < concurrency; i++) {
      const startIdx = i * batchSize;
      const endIdx = Math.min(startIdx + batchSize, count);
      promises.push(processBatch(startIdx, endIdx));
    }

    await Promise.all(promises);

    const endTime = Date.now();
    const durationMs = endTime - startTime;

    const latencies = results
      .filter((r) => r)
      .map((r) => r.executionTimeMs);
    const successCount = results.filter((r) => r && r.success).length;
    const failedCount = count - successCount;

    this.logger.warn(
      `压测完成: 成功=${successCount}, 失败=${failedCount}, 数据完整性错误=${dataIntegrityErrors}, 总耗时=${durationMs}ms`,
    );

    const testResult: StressTestResult = {
      totalCommands: count,
      successCount,
      failedCount,
      dataIntegrityErrors,
      averageLatencyMs: latencies.length > 0
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : 0,
      maxLatencyMs: latencies.length > 0 ? Math.max(...latencies) : 0,
      minLatencyMs: latencies.length > 0 ? Math.min(...latencies) : 0,
      throughPut: Math.round((count / durationMs) * 1000 * 100) / 100,
      startTime,
      endTime,
      durationMs,
      mismatchedResponses: mismatchedResponses.slice(0, 50),
    };

    if (dataIntegrityErrors > 0) {
      this.logger.error(
        `检测到 ${dataIntegrityErrors} 个数据完整性错误! 这是严重的系统问题!`,
      );
    } else {
      this.logger.log(
        `数据完整性验证通过! ${count} 个命令全部正确匹配!`,
      );
    }

    return testResult;
  }

  @Get('statistics/:instrumentId')
  getStatistics(@Param('instrumentId') instrumentId: string) {
    const queueStats = this.commandQueueService.getQueueStatistics(instrumentId);
    const driverStats = this.commandQueueService.getDriverStatistics(instrumentId);
    const recentTransactions = this.commandQueueService.getRecentTransactions(instrumentId, 20);

    return {
      queueStats,
      driverStats,
      recentTransactions,
    };
  }

  @Post(':instrumentId/reset-pipeline')
  resetPipeline(@Param('instrumentId') instrumentId: string) {
    const instrument = this.instrumentService.getInstrument(instrumentId);
    if (!instrument) {
      throw new HttpException(`仪器 ${instrumentId} 不存在`, HttpStatus.NOT_FOUND);
    }

    const driver = this.instrumentService['drivers'].get(instrumentId);
    if (driver && 'resetPipeline' in driver) {
      (driver as any).resetPipeline();
    }

    this.commandQueueService.resetStatistics(instrumentId);

    return {
      success: true,
      message: `仪器 ${instrumentId} 管道和统计已重置`,
    };
  }
}
