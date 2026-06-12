export enum InstrumentType {
  OSCILLOSCOPE = 'oscilloscope',
  POWER_SUPPLY = 'power_supply',
  DATA_ACQUISITION = 'data_acquisition',
  MULTIMETER = 'multimeter',
  RELAY = 'relay',
}

export enum InstrumentStatus {
  OFFLINE = 'offline',
  CONNECTING = 'connecting',
  ONLINE = 'online',
  ERROR = 'error',
  BUSY = 'busy',
}

export enum ProtocolType {
  VXI11 = 'vxi11',
  VISA_TCPIP = 'visa_tcpip',
  VISA_USB = 'visa_usb',
  SERIAL = 'serial',
  GPIB = 'gpib',
}

export interface InstrumentConfig {
  id: string;
  name: string;
  type: InstrumentType;
  protocol: ProtocolType;
  host?: string;
  port?: number;
  resourceString?: string;
  timeoutMs?: number;
  description?: string;
}

export interface InstrumentState {
  config: InstrumentConfig;
  status: InstrumentStatus;
  lastHeartbeat?: number;
  errorMessage?: string;
  identity?: string;
}

export const instrumentTypeLabels: Record<InstrumentType, string> = {
  [InstrumentType.OSCILLOSCOPE]: '示波器',
  [InstrumentType.POWER_SUPPLY]: '程控电源',
  [InstrumentType.DATA_ACQUISITION]: '数据采集卡',
  [InstrumentType.MULTIMETER]: '万用表',
  [InstrumentType.RELAY]: '继电器矩阵',
};

export const instrumentStatusLabels: Record<InstrumentStatus, string> = {
  [InstrumentStatus.OFFLINE]: '离线',
  [InstrumentStatus.CONNECTING]: '连接中',
  [InstrumentStatus.ONLINE]: '在线',
  [InstrumentStatus.ERROR]: '错误',
  [InstrumentStatus.BUSY]: '忙碌',
};

export const instrumentStatusColors: Record<InstrumentStatus, string> = {
  [InstrumentStatus.OFFLINE]: '#909399',
  [InstrumentStatus.CONNECTING]: '#E6A23C',
  [InstrumentStatus.ONLINE]: '#67C23A',
  [InstrumentStatus.ERROR]: '#F56C6C',
  [InstrumentStatus.BUSY]: '#409EFF',
};
