import { Injectable, Logger } from '@nestjs/common';
import { IProtocolDriver } from './protocol-driver.base';
import { Vxi11Driver } from './vxi11.driver';
import { VisaTcpipDriver } from './visa-tcpip.driver';
import { InstrumentConfig, ProtocolType } from '../../common/types/instrument.types';

@Injectable()
export class ProtocolDriverFactory {
  private readonly logger = new Logger(ProtocolDriverFactory.name);
  private driverCache = new Map<string, IProtocolDriver>();

  createDriver(config: InstrumentConfig): IProtocolDriver {
    if (this.driverCache.has(config.id)) {
      return this.driverCache.get(config.id);
    }

    let driver: IProtocolDriver;
    const baseOptions = {
      instrumentId: config.id,
      host: config.host,
      port: config.port,
      timeoutMs: config.timeoutMs,
      mockIdentity: this.generateMockIdentity(config),
    };

    switch (config.protocol) {
      case ProtocolType.VXI11:
        driver = new Vxi11Driver(baseOptions);
        break;
      case ProtocolType.VISA_TCPIP:
        driver = new VisaTcpipDriver(baseOptions);
        break;
      case ProtocolType.VISA_USB:
      case ProtocolType.SERIAL:
      case ProtocolType.GPIB:
      default:
        this.logger.warn(`协议 ${config.protocol} 使用 VXI-11 兼容模拟驱动`);
        driver = new Vxi11Driver(baseOptions);
    }

    this.driverCache.set(config.id, driver);
    return driver;
  }

  removeDriver(instrumentId: string): void {
    this.driverCache.delete(instrumentId);
  }

  getDriver(instrumentId: string): IProtocolDriver | undefined {
    return this.driverCache.get(instrumentId);
  }

  private generateMockIdentity(config: InstrumentConfig): string {
    const typeMap: Record<string, string> = {
      oscilloscope: 'MSO5204B',
      power_supply: 'E36312A',
      data_acquisition: 'DAQ970A',
      multimeter: '34465A',
      relay: '34980A',
    };
    const model = typeMap[config.type] || 'Generic';
    return `ROCKET-AIT,${model},SN-${config.id.slice(0, 8)},FW1.0`;
  }
}
