import { Logger } from '@nestjs/common';

export interface FilteredSample {
  rawValue: number;
  filteredValue: number;
  timestamp: number;
  medianWindow: number[];
}

export class MovingMedianFilter {
  private readonly logger = new Logger(MovingMedianFilter.name);
  private readonly windowSize: number;
  private buffer: number[] = [];
  private readonly name: string;

  constructor(windowSize: number, name = 'default') {
    if (windowSize < 3 || windowSize % 2 === 0) {
      throw new Error(`窗口大小必须为奇数且 >= 3, 实际: ${windowSize}`);
    }
    this.windowSize = windowSize;
    this.name = name;
  }

  addSample(value: number): FilteredSample {
    if (!isFinite(value) || isNaN(value)) {
      this.logger.warn(`[${this.name}] 无效采样值: ${value}, 忽略`);
      const lastValue = this.buffer.length > 0 ? this.buffer[this.buffer.length - 1] : 0;
      return {
        rawValue: value,
        filteredValue: lastValue,
        timestamp: Date.now(),
        medianWindow: [...this.buffer],
      };
    }

    this.buffer.push(value);
    if (this.buffer.length > this.windowSize) {
      this.buffer.shift();
    }

    const sorted = [...this.buffer].sort((a, b) => a - b);
    const medianIndex = Math.floor(sorted.length / 2);
    const median = sorted[medianIndex];

    return {
      rawValue: value,
      filteredValue: median,
      timestamp: Date.now(),
      medianWindow: [...this.buffer],
    };
  }

  getBuffer(): number[] {
    return [...this.buffer];
  }

  getCurrentMedian(): number {
    if (this.buffer.length === 0) return 0;
    const sorted = [...this.buffer].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  getWindowSize(): number {
    return this.windowSize;
  }

  reset(): void {
    this.buffer = [];
    this.logger.debug(`[${this.name}] 滤波器已重置`);
  }

  isBufferFull(): boolean {
    return this.buffer.length >= this.windowSize;
  }

  getStandardDeviation(): number {
    if (this.buffer.length < 2) return 0;
    const mean = this.buffer.reduce((a, b) => a + b, 0) / this.buffer.length;
    const squaredDiffs = this.buffer.map((v) => Math.pow(v - mean, 2));
    return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / this.buffer.length);
  }
}

export class PyroSafetyMonitor {
  private readonly logger = new Logger(PyroSafetyMonitor.name);
  private readonly currentFilter: MovingMedianFilter;
  private readonly voltageFilter: MovingMedianFilter;
  private readonly resistanceHistory: Array<{ value: number; timestamp: number }> = [];
  private readonly maxHistorySize = 10000;
  private readonly sampleRateMs: number;
  private readonly criticalDropSamples: number;
  private readonly safeCurrentMaxMa: number;
  private readonly safeResistanceMinOhms: number;
  private readonly nominalResistance: number;
  private readonly breakdownThresholdRatio: number;
  private samplingLoopTimer?: NodeJS.Timeout;
  private isMonitoring = false;
  private sampleCounter = 0;
  private lastTriggeredReason?: string;
  private readonly pyroId: string;

  private onEmergencyCallback?: (reason: string, data: any) => void;
  private onSampleCallback?: (data: PyroSampleData) => void;

  constructor(config: {
    pyroId: string;
    sampleRateMs?: number;
    filterWindowSize?: number;
    criticalDropSamples?: number;
    safeCurrentMaxMa?: number;
    safeResistanceMinOhms?: number;
    nominalResistance?: number;
    breakdownThresholdRatio?: number;
  }) {
    this.pyroId = config.pyroId;
    this.sampleRateMs = config.sampleRateMs || 10;
    this.criticalDropSamples = config.criticalDropSamples || 3;
    this.safeCurrentMaxMa = config.safeCurrentMaxMa || 10;
    this.safeResistanceMinOhms = config.safeResistanceMinOhms || 0.5;
    this.nominalResistance = config.nominalResistance || 2.0;
    this.breakdownThresholdRatio = config.breakdownThresholdRatio || 0.3;

    const filterSize = config.filterWindowSize || 5;
    this.currentFilter = new MovingMedianFilter(filterSize, `${this.pyroId}-current`);
    this.voltageFilter = new MovingMedianFilter(filterSize, `${this.pyroId}-voltage`);
  }

  startMonitoring(
    readCurrentMa: () => Promise<number>,
    readVoltageV: () => Promise<number>,
    onEmergency: (reason: string, data: any) => void,
    onSample?: (data: PyroSampleData) => void,
  ): void {
    if (this.isMonitoring) {
      this.logger.warn(`[${this.pyroId}] 火工品监控已在运行中`);
      return;
    }

    this.isMonitoring = true;
    this.sampleCounter = 0;
    this.resistanceHistory.length = 0;
    this.currentFilter.reset();
    this.voltageFilter.reset();
    this.onEmergencyCallback = onEmergency;
    this.onSampleCallback = onSample;

    this.logger.warn(
      `[${this.pyroId}] 🔥 火工品安全监控已启动! 采样率: ${this.sampleRateMs}ms, 名义电阻: ${this.nominalResistance}Ω, 击穿阈值: ${(this.breakdownThresholdRatio * 100).toFixed(0)}%`,
    );

    this.samplingLoopTimer = setInterval(async () => {
      if (!this.isMonitoring) return;

      try {
        await this.processSample(readCurrentMa, readVoltageV);
      } catch (error) {
        this.logger.error(`[${this.pyroId}] 采样循环异常: ${error}`);
      }
    }, this.sampleRateMs);
  }

  stopMonitoring(): void {
    if (this.samplingLoopTimer) {
      clearInterval(this.samplingLoopTimer);
      this.samplingLoopTimer = undefined;
    }
    this.isMonitoring = false;
    this.logger.warn(`[${this.pyroId}] 火工品安全监控已停止`);
  }

  private async processSample(
    readCurrentMa: () => Promise<number>,
    readVoltageV: () => Promise<number>,
  ): Promise<void> {
    const sampleTimestamp = Date.now();
    this.sampleCounter++;

    let rawCurrentMa: number;
    let rawVoltageV: number;

    try {
      rawCurrentMa = await readCurrentMa();
      rawVoltageV = await readVoltageV();
    } catch (error) {
      this.logger.error(`[${this.pyroId}] 读取仪器数据失败: ${error}`);
      return;
    }

    const filteredCurrent = this.currentFilter.addSample(rawCurrentMa);
    const filteredVoltage = this.voltageFilter.addSample(rawVoltageV);

    let calculatedResistance: number;
    if (Math.abs(filteredCurrent.filteredValue) > 0.001) {
      calculatedResistance =
        (filteredVoltage.filteredValue / filteredCurrent.filteredValue) * 1000;
    } else {
      calculatedResistance = Infinity;
    }

    if (calculatedResistance !== Infinity && isFinite(calculatedResistance)) {
      this.resistanceHistory.push({
        value: calculatedResistance,
        timestamp: sampleTimestamp,
      });
      if (this.resistanceHistory.length > this.maxHistorySize) {
        this.resistanceHistory.shift();
      }
    }

    const sampleData: PyroSampleData = {
      pyroId: this.pyroId,
      sampleIndex: this.sampleCounter,
      timestamp: sampleTimestamp,
      rawCurrentMa,
      rawVoltageV,
      filteredCurrentMa: filteredCurrent.filteredValue,
      filteredVoltageV: filteredVoltage.filteredValue,
      resistanceOhms: calculatedResistance,
      currentStdDev: this.currentFilter.getStandardDeviation(),
      filterBufferFull: this.currentFilter.isBufferFull() && this.voltageFilter.isBufferFull(),
    };

    if (this.onSampleCallback) {
      try {
        this.onSampleCallback(sampleData);
      } catch (e) {}
    }

    this.detectDanger(sampleData);
  }

  private detectDanger(sample: PyroSampleData): void {
    if (!sample.filterBufferFull) return;

    const reasons: string[] = [];
    const dangerData: any = { ...sample };

    if (sample.filteredCurrentMa > this.safeCurrentMaxMa) {
      reasons.push(
        `电流超限: ${sample.filteredCurrentMa.toFixed(3)}mA > ${this.safeCurrentMaxMa}mA (安全上限)`,
      );
    }

    if (
      sample.resistanceOhms !== Infinity &&
      sample.resistanceOhms < this.safeResistanceMinOhms
    ) {
      reasons.push(
        `电阻过低: ${sample.resistanceOhms.toFixed(4)}Ω < ${this.safeResistanceMinOhms}Ω (安全下限)`,
      );
    }

    if (this.detectResistanceDrop()) {
      const dropRatio = this.calculateDropRatio();
      reasons.push(
        `电阻骤降! 已连续 ${this.criticalDropSamples} 个采样周期锐减, 当前值为名义值的 ${(dropRatio * 100).toFixed(1)}%, 逼近击穿阈值 ${(this.breakdownThresholdRatio * 100).toFixed(0)}%`,
      );
      dangerData.dropRatio = dropRatio;
      dangerData.nominalResistance = this.nominalResistance;
      dangerData.breakdownThreshold = this.nominalResistance * this.breakdownThresholdRatio;
    }

    if (reasons.length > 0) {
      const combinedReason = reasons.join('; ');
      this.lastTriggeredReason = combinedReason;
      this.logger.error(`[${this.pyroId}] 🚨 火工品危险检测触发: ${combinedReason}`);

      this.stopMonitoring();

      if (this.onEmergencyCallback) {
        try {
          this.onEmergencyCallback(combinedReason, dangerData);
        } catch (e) {
          this.logger.error(`[${this.pyroId}] 紧急回调执行失败: ${e}`);
        }
      }
    }
  }

  private detectResistanceDrop(): boolean {
    if (this.resistanceHistory.length < this.criticalDropSamples * 3) {
      return false;
    }

    const recent = this.resistanceHistory.slice(-this.criticalDropSamples);
    const earlierCount = Math.min(this.criticalDropSamples * 2, this.resistanceHistory.length - this.criticalDropSamples);
    const earlier = this.resistanceHistory.slice(
      -(this.criticalDropSamples + earlierCount),
      -this.criticalDropSamples,
    );

    if (recent.length < this.criticalDropSamples || earlier.length < this.criticalDropSamples) {
      return false;
    }

    const avgRecent =
      recent.reduce((s, r) => s + r.value, 0) / recent.length;
    const avgEarlier =
      earlier.reduce((s, r) => s + r.value, 0) / earlier.length;

    if (avgEarlier <= 0 || avgRecent <= 0) return false;

    const isDrop = avgRecent < avgEarlier * this.breakdownThresholdRatio;

    let consecutiveDrop = true;
    for (let i = 1; i < recent.length; i++) {
      if (recent[i].value >= recent[i - 1].value * 1.01) {
        consecutiveDrop = false;
        break;
      }
    }

    return isDrop && consecutiveDrop;
  }

  private calculateDropRatio(): number {
    if (this.resistanceHistory.length < this.criticalDropSamples) {
      return 1.0;
    }
    const recent = this.resistanceHistory.slice(-this.criticalDropSamples);
    const avgRecent =
      recent.reduce((s, r) => s + r.value, 0) / recent.length;
    return avgRecent / this.nominalResistance;
  }

  getStatus(): PyroMonitorStatus {
    return {
      pyroId: this.pyroId,
      isMonitoring: this.isMonitoring,
      sampleCount: this.sampleCounter,
      sampleRateMs: this.sampleRateMs,
      latestResistance:
        this.resistanceHistory.length > 0
          ? this.resistanceHistory[this.resistanceHistory.length - 1].value
          : null,
      resistanceHistoryCount: this.resistanceHistory.length,
      lastTriggeredReason: this.lastTriggeredReason,
      safeCurrentMaxMa: this.safeCurrentMaxMa,
      safeResistanceMinOhms: this.safeResistanceMinOhms,
      nominalResistance: this.nominalResistance,
      breakdownThresholdRatio: this.breakdownThresholdRatio,
    };
  }

  getRecentSamples(count = 100): PyroSampleData[] {
    const result: PyroSampleData[] = [];
    const start = Math.max(0, this.resistanceHistory.length - count);
    for (let i = start; i < this.resistanceHistory.length; i++) {
      const r = this.resistanceHistory[i];
      result.push({
        pyroId: this.pyroId,
        sampleIndex: i + 1,
        timestamp: r.timestamp,
        rawCurrentMa: 0,
        rawVoltageV: 0,
        filteredCurrentMa: 0,
        filteredVoltageV: 0,
        resistanceOhms: r.value,
        currentStdDev: 0,
        filterBufferFull: true,
      });
    }
    return result;
  }
}

export interface PyroSampleData {
  pyroId: string;
  sampleIndex: number;
  timestamp: number;
  rawCurrentMa: number;
  rawVoltageV: number;
  filteredCurrentMa: number;
  filteredVoltageV: number;
  resistanceOhms: number;
  currentStdDev: number;
  filterBufferFull: boolean;
}

export interface PyroMonitorStatus {
  pyroId: string;
  isMonitoring: boolean;
  sampleCount: number;
  sampleRateMs: number;
  latestResistance: number | null;
  resistanceHistoryCount: number;
  lastTriggeredReason?: string;
  safeCurrentMaxMa: number;
  safeResistanceMinOhms: number;
  nominalResistance: number;
  breakdownThresholdRatio: number;
}

export interface PyroEmergencyEvent {
  eventType: 'PYRO_EMERGENCY_STOP';
  severity: 'CRITICAL';
  pyroId: string;
  reason: string;
  data: PyroSampleData & { [key: string]: any };
  timestamp: number;
  emergencyStopSent: boolean;
  allInstrumentsShutdown: boolean;
}
