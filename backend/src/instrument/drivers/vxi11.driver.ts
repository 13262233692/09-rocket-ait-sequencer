import { ProtocolDriverBase } from './protocol-driver.base';
import { Logger } from '@nestjs/common';

export class Vxi11Driver extends ProtocolDriverBase {
  private readonly logger = new Logger(Vxi11Driver.name);
  private simulationData: Map<string, any> = new Map();
  private mockIdentity = '';

  constructor(options: { instrumentId: string; host?: string; port?: number; timeoutMs?: number; mockIdentity?: string }) {
    super(options);
    this.mockIdentity = options.mockIdentity || 'ROCKET-AIT,Simulated-VXI11,12345,FW1.0';
    this.initSimulationData();
  }

  private initSimulationData() {
    this.simulationData.set('MEAS:VOLT:DC?', (Math.random() * 5 + 24).toFixed(6));
    this.simulationData.set('MEAS:CURR:DC?', (Math.random() * 0.5 + 1.5).toFixed(6));
    this.simulationData.set('MEAS:IMP?', (Math.random() * 0.5 + 50).toFixed(4));
    this.simulationData.set('MEAS:TEMP?', (Math.random() * 5 + 25).toFixed(2));
    this.simulationData.set('SYST:ERR?', '0,"No error"');
    this.simulationData.set('*STB?', '0');
    this.simulationData.set('*ESR?', '0');
  }

  async connect(): Promise<void> {
    this.logger.log(`[VXI-11] 正在连接仪器 ${this.instrumentId} @ ${this.host}:${this.port}`);
    await this.delay(200);
    this.connected = true;
    this.logger.log(`[VXI-11] 仪器 ${this.instrumentId} 连接成功`);
  }

  async disconnect(): Promise<void> {
    this.logger.log(`[VXI-11] 断开仪器 ${this.instrumentId}`);
    this.connected = false;
  }

  async sendRaw(data: string): Promise<string | null> {
    if (!this.connected) {
      throw new Error(`仪器 ${this.instrumentId} 未连接`);
    }

    this.logger.debug(`[VXI-11] ${this.instrumentId} << ${data}`);
    await this.delay(10 + Math.random() * 50);

    const response = this.handleScpiCommand(data);
    if (response !== null) {
      this.logger.debug(`[VXI-11] ${this.instrumentId} >> ${response}`);
    }
    return response;
  }

  async getIdentity(): Promise<string> {
    return this.mockIdentity;
  }

  private handleScpiCommand(cmd: string): string | null {
    const trimmed = cmd.trim().toUpperCase();

    if (trimmed === '*IDN?') {
      return this.mockIdentity;
    }

    if (trimmed === '*RST') {
      this.initSimulationData();
      return null;
    }

    if (trimmed === '*OPC?') {
      return '1';
    }

    if (trimmed.startsWith('MEAS:') || trimmed.startsWith('READ:')) {
      if (trimmed.includes('VOLT')) {
        return (Math.random() * 5 + 24).toFixed(6);
      }
      if (trimmed.includes('CURR')) {
        return (Math.random() * 0.5 + 1.5).toFixed(6);
      }
      if (trimmed.includes('IMP') || trimmed.includes('RES')) {
        return (Math.random() * 0.5 + 50).toFixed(4);
      }
    }

    if (trimmed.startsWith('SOUR:VOLT:LEV')) {
      return null;
    }

    if (trimmed.startsWith('SOUR:CURR:LEV')) {
      return null;
    }

    if (trimmed.startsWith('OUTP:STAT')) {
      return null;
    }

    if (trimmed.startsWith('ROUT:CLOS') || trimmed.startsWith('ROUT:OPEN')) {
      return null;
    }

    if (this.simulationData.has(trimmed)) {
      return this.simulationData.get(trimmed);
    }

    if (trimmed.endsWith('?')) {
      return '0';
    }

    return null;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
