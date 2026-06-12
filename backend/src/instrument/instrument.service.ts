import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  InstrumentConfig,
  InstrumentState,
  InstrumentStatus,
  InstrumentType,
  ProtocolType,
  ScpiCommand,
  ScpiResponse,
} from '../common/types/instrument.types';
import { ProtocolDriverFactory } from './drivers/driver.factory';
import { IProtocolDriver } from './drivers/protocol-driver.base';
import { CommandQueueService } from './command-queue.service';

@Injectable()
export class InstrumentService implements OnModuleInit {
  private readonly logger = new Logger(InstrumentService.name);
  private instruments = new Map<string, InstrumentState>();
  private drivers = new Map<string, IProtocolDriver>();
  private heartbeatInterval: NodeJS.Timeout;

  constructor(
    private readonly driverFactory: ProtocolDriverFactory,
    private readonly commandQueue: CommandQueueService,
  ) {}

  onModuleInit() {
    this.logger.log('[仪器网关] 正在初始化火箭测试仪器网络...');
    this.initDefaultInstruments();
    this.startHeartbeatMonitoring();
  }

  private initDefaultInstruments(): void {
    const defaults: InstrumentConfig[] = [
      {
        id: 'ps-001',
        name: '箭体主电源',
        type: InstrumentType.POWER_SUPPLY,
        protocol: ProtocolType.VXI11,
        host: '192.168.1.101',
        port: 5025,
        timeoutMs: 5000,
        description: '火箭一级箭体主直流电源 (0-30V, 0-10A)',
      },
      {
        id: 'ps-002',
        name: '姿控电源',
        type: InstrumentType.POWER_SUPPLY,
        protocol: ProtocolType.VXI11,
        host: '192.168.1.102',
        port: 5025,
        timeoutMs: 5000,
        description: '姿态控制系统专用电源',
      },
      {
        id: 'ps-003',
        name: '有效载荷电源',
        type: InstrumentType.POWER_SUPPLY,
        protocol: ProtocolType.VXI11,
        host: '192.168.1.103',
        port: 5025,
        timeoutMs: 5000,
        description: '卫星载荷供电电源',
      },
      {
        id: 'dmm-001',
        name: '主通道万用表',
        type: InstrumentType.MULTIMETER,
        protocol: ProtocolType.VISA_TCPIP,
        host: '192.168.1.111',
        port: 5025,
        timeoutMs: 5000,
        description: '主母线电压电流高精度测量',
      },
      {
        id: 'dmm-002',
        name: '备用万用表',
        type: InstrumentType.MULTIMETER,
        protocol: ProtocolType.VISA_TCPIP,
        host: '192.168.1.112',
        port: 5025,
        timeoutMs: 5000,
        description: '备用测量通道',
      },
      {
        id: 'daq-001',
        name: '数据采集卡-A',
        type: InstrumentType.DATA_ACQUISITION,
        protocol: ProtocolType.VXI11,
        host: '192.168.1.121',
        port: 5025,
        timeoutMs: 8000,
        description: '多路温度/电压数据采集单元',
      },
      {
        id: 'daq-002',
        name: '数据采集卡-B',
        type: InstrumentType.DATA_ACQUISITION,
        protocol: ProtocolType.VXI11,
        host: '192.168.1.122',
        port: 5025,
        timeoutMs: 8000,
        description: '阻抗/应变数据采集单元',
      },
      {
        id: 'osc-001',
        name: '高速示波器',
        type: InstrumentType.OSCILLOSCOPE,
        protocol: ProtocolType.VISA_TCPIP,
        host: '192.168.1.131',
        port: 5025,
        timeoutMs: 10000,
        description: '瞬态信号波形采集示波器',
      },
      {
        id: 'relay-001',
        name: '继电器矩阵-A',
        type: InstrumentType.RELAY,
        protocol: ProtocolType.VXI11,
        host: '192.168.1.141',
        port: 5025,
        timeoutMs: 3000,
        description: '测试通路切换继电器矩阵 (32通道)',
      },
      {
        id: 'relay-002',
        name: '继电器矩阵-B',
        type: InstrumentType.RELAY,
        protocol: ProtocolType.VXI11,
        host: '192.168.1.142',
        port: 5025,
        timeoutMs: 3000,
        description: '高压通路切换继电器矩阵',
      },
    ];

    defaults.forEach((config) => {
      this.instruments.set(config.id, {
        config,
        status: InstrumentStatus.OFFLINE,
      });
    });

    this.logger.log(`[仪器网关] 已注册 ${defaults.length} 台默认仪器`);
  }

  private startHeartbeatMonitoring(): void {
    this.heartbeatInterval = setInterval(() => {
      this.instruments.forEach((state, id) => {
        if (state.status === InstrumentStatus.ONLINE) {
          this.sendHeartbeat(id).catch((err) => {
            this.logger.warn(`[心跳] 仪器 ${id} 心跳失败: ${err.message}`);
          });
        }
      });
    }, 15000);
  }

  private async sendHeartbeat(instrumentId: string): Promise<void> {
    const state = this.instruments.get(instrumentId);
    if (!state) return;

    const driver = this.drivers.get(instrumentId);
    if (!driver || !driver.isConnected()) {
      state.status = InstrumentStatus.OFFLINE;
      return;
    }

    try {
      await this.sendRawCommand(instrumentId, '*OPC?', true, 2000);
      state.lastHeartbeat = Date.now();
    } catch {
      state.status = InstrumentStatus.ERROR;
      state.errorMessage = '心跳超时';
    }
  }

  getAllInstruments(): InstrumentState[] {
    return Array.from(this.instruments.values());
  }

  getInstrument(id: string): InstrumentState | undefined {
    return this.instruments.get(id);
  }

  async connectInstrument(id: string): Promise<InstrumentState> {
    const state = this.instruments.get(id);
    if (!state) {
      throw new Error(`仪器 ${id} 不存在`);
    }

    if (state.status === InstrumentStatus.CONNECTING) {
      throw new Error(`仪器 ${id} 正在连接中`);
    }

    state.status = InstrumentStatus.CONNECTING;
    state.errorMessage = undefined;

    try {
      const driver = this.driverFactory.createDriver(state.config);
      await driver.connect();
      const identity = await driver.getIdentity();

      this.drivers.set(id, driver);
      this.commandQueue.registerDriver(id, driver);

      state.status = InstrumentStatus.ONLINE;
      state.identity = identity;
      state.lastHeartbeat = Date.now();

      this.logger.log(`[仪器网关] ${state.config.name} (${id}) 连接成功: ${identity}`);
      return state;
    } catch (error) {
      state.status = InstrumentStatus.ERROR;
      state.errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`[仪器网关] ${state.config.name} (${id}) 连接失败: ${state.errorMessage}`);
      throw error;
    }
  }

  async disconnectInstrument(id: string): Promise<InstrumentState> {
    const state = this.instruments.get(id);
    if (!state) {
      throw new Error(`仪器 ${id} 不存在`);
    }

    const driver = this.drivers.get(id);
    if (driver) {
      await driver.disconnect();
      this.commandQueue.unregisterDriver(id);
      this.drivers.delete(id);
    }

    state.status = InstrumentStatus.OFFLINE;
    state.identity = undefined;
    state.errorMessage = undefined;

    this.logger.log(`[仪器网关] ${state.config.name} (${id}) 已断开`);
    return state;
  }

  async connectAll(): Promise<InstrumentState[]> {
    this.logger.log('[仪器网关] 正在批量连接所有仪器...');
    const results: InstrumentState[] = [];
    const ids = Array.from(this.instruments.keys());

    for (const id of ids) {
      try {
        const state = await this.connectInstrument(id);
        results.push(state);
      } catch (error) {
        this.logger.warn(`[仪器网关] 批量连接跳过 ${id}: ${error}`);
        results.push(this.instruments.get(id)!);
      }
    }

    const online = results.filter((s) => s.status === InstrumentStatus.ONLINE).length;
    this.logger.log(`[仪器网关] 批量连接完成: ${online}/${results.length} 台仪器在线`);
    return results;
  }

  async sendCommand(command: ScpiCommand): Promise<ScpiResponse> {
    const state = this.instruments.get(command.instrumentId);
    if (!state) {
      throw new Error(`仪器 ${command.instrumentId} 不存在`);
    }

    if (state.status !== InstrumentStatus.ONLINE && state.status !== InstrumentStatus.BUSY) {
      throw new Error(`仪器 ${command.instrumentId} 未在线 (当前状态: ${state.status})`);
    }

    state.status = InstrumentStatus.BUSY;
    try {
      const response = await this.commandQueue.enqueue(command);
      if (this.commandQueue.getQueueDepth(command.instrumentId) === 0) {
        state.status = InstrumentStatus.ONLINE;
      }
      return response;
    } finally {
      if (this.commandQueue.getQueueDepth(command.instrumentId) === 0) {
        state.status = InstrumentStatus.ONLINE;
      }
    }
  }

  async sendRawCommand(
    instrumentId: string,
    cmd: string,
    expectResponse = false,
    timeoutMs?: number,
  ): Promise<ScpiResponse> {
    const command: ScpiCommand = {
      id: uuidv4(),
      instrumentId,
      command: cmd,
      expectResponse,
      timeoutMs,
      priority: 0,
    };
    return this.sendCommand(command);
  }

  async readVoltage(instrumentId: string, channel?: number | string): Promise<number> {
    const scpi = channel ? `MEAS:VOLT:DC? ${channel}` : 'MEAS:VOLT:DC?';
    const response = await this.sendRawCommand(instrumentId, scpi, true, 5000);
    if (!response.success) {
      throw new Error(`读取电压失败: ${response.error}`);
    }
    return parseFloat(response.data || '0');
  }

  async readCurrent(instrumentId: string, channel?: number | string): Promise<number> {
    const scpi = channel ? `MEAS:CURR:DC? ${channel}` : 'MEAS:CURR:DC?';
    const response = await this.sendRawCommand(instrumentId, scpi, true, 5000);
    if (!response.success) {
      throw new Error(`读取电流失败: ${response.error}`);
    }
    return parseFloat(response.data || '0');
  }

  async readImpedance(instrumentId: string, channel?: number | string): Promise<number> {
    const scpi = channel ? `MEAS:IMP? ${channel}` : 'MEAS:IMP?';
    const response = await this.sendRawCommand(instrumentId, scpi, true, 5000);
    if (!response.success) {
      throw new Error(`读取阻抗失败: ${response.error}`);
    }
    return parseFloat(response.data || '0');
  }

  async setVoltage(instrumentId: string, voltage: number, channel?: number | string): Promise<void> {
    const scpi = channel ? `SOUR:VOLT:LEV ${voltage},${channel}` : `SOUR:VOLT:LEV ${voltage}`;
    const response = await this.sendRawCommand(instrumentId, scpi, false, 3000);
    if (!response.success) {
      throw new Error(`设置电压失败: ${response.error}`);
    }
  }

  async setCurrent(instrumentId: string, current: number, channel?: number | string): Promise<void> {
    const scpi = channel ? `SOUR:CURR:LEV ${current},${channel}` : `SOUR:CURR:LEV ${current}`;
    const response = await this.sendRawCommand(instrumentId, scpi, false, 3000);
    if (!response.success) {
      throw new Error(`设置电流失败: ${response.error}`);
    }
  }

  async setPowerOutput(instrumentId: string, on: boolean, channel?: number | string): Promise<void> {
    const state = on ? 'ON' : 'OFF';
    const scpi = channel ? `OUTP:STAT ${state},${channel}` : `OUTP:STAT ${state}`;
    const response = await this.sendRawCommand(instrumentId, scpi, false, 2000);
    if (!response.success) {
      throw new Error(`设置电源输出失败: ${response.error}`);
    }
  }

  async setRelay(instrumentId: string, channel: number | string, closed: boolean): Promise<void> {
    const action = closed ? 'CLOS' : 'OPEN';
    const scpi = `ROUT:${action} (@${channel})`;
    const response = await this.sendRawCommand(instrumentId, scpi, false, 2000);
    if (!response.success) {
      throw new Error(`继电器操作失败: ${response.error}`);
    }
  }
}
