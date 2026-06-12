import { ProtocolDriverBase } from './protocol-driver.base';
import { Logger } from '@nestjs/common';

export class VisaTcpipDriver extends ProtocolDriverBase {
  private readonly logger = new Logger(VisaTcpipDriver.name);
  private mockIdentity = '';

  constructor(options: { instrumentId: string; host?: string; port?: number; timeoutMs?: number; mockIdentity?: string }) {
    super(options);
    this.port = options.port || 5025;
    this.mockIdentity = options.mockIdentity || 'ROCKET-AIT,Simulated-VISA-TCPIP,67890,FW2.0';
  }

  async connect(): Promise<void> {
    this.logger.log(`[VISA-TCPIP] 正在连接仪器 ${this.instrumentId} @ TCPIP::${this.host}::${this.port}::SOCKET`);
    await this.delay(150);
    this.connected = true;
    this.logger.log(`[VISA-TCPIP] 仪器 ${this.instrumentId} 连接成功`);
  }

  async disconnect(): Promise<void> {
    this.logger.log(`[VISA-TCPIP] 断开仪器 ${this.instrumentId}`);
    this.connected = false;
  }

  async sendRaw(data: string): Promise<string | null> {
    if (!this.connected) {
      throw new Error(`仪器 ${this.instrumentId} 未连接`);
    }

    this.logger.debug(`[VISA-TCPIP] ${this.instrumentId} << ${data}`);
    await this.delay(20 + Math.random() * 40);

    const response = this.handleScpiCommand(data);
    if (response !== null) {
      this.logger.debug(`[VISA-TCPIP] ${this.instrumentId} >> ${response}`);
    }
    return response;
  }

  async getIdentity(): Promise<string> {
    return this.mockIdentity;
  }

  private handleScpiCommand(cmd: string): string | null {
    const trimmed = cmd.trim().toUpperCase();

    if (trimmed === '*IDN?') return this.mockIdentity;
    if (trimmed === '*RST') return null;
    if (trimmed === '*OPC?') return '1';
    if (trimmed === '*STB?') return '16';

    if (trimmed.startsWith('MEAS:') || trimmed.startsWith('READ:')) {
      if (trimmed.includes('VOLT')) return (Math.random() * 100 + 28).toFixed(6);
      if (trimmed.includes('CURR')) return (Math.random() * 2 + 5).toFixed(6);
      if (trimmed.includes('IMP') || trimmed.includes('RES')) return (Math.random() * 2 + 100).toFixed(4);
      if (trimmed.includes('TEMP')) return (Math.random() * 10 + 22).toFixed(2);
      if (trimmed.includes('FREQ')) return (Math.random() * 10 + 1000).toFixed(3);
    }

    if (trimmed.startsWith('SOUR:')) return null;
    if (trimmed.startsWith('OUTP:')) return null;
    if (trimmed.startsWith('ROUT:')) return null;
    if (trimmed.startsWith('TRIG:')) return null;
    if (trimmed.startsWith('SENS:')) return null;

    if (trimmed.endsWith('?')) return '0';
    return null;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
