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

export interface ScpiCommand {
  id: string;
  instrumentId?: string;
  command: string;
  expectResponse?: boolean;
  timeoutMs?: number;
  priority?: number;
  retryCount?: number;
}

export interface ScpiCommandOptions {
  timeoutMs?: number;
  retryCount?: number;
  validateResponse?: (resp: string) => boolean;
}

export interface ScpiResponse {
  commandId: string;
  instrumentId: string;
  success: boolean;
  data?: string | null;
  error?: string;
  requestId?: string;
  timestamp: number;
  executionTimeMs: number;
}
