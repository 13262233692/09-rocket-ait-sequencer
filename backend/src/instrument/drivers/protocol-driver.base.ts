import { ScpiCommand, ScpiResponse } from '../../common/types/instrument.types';

export interface IProtocolDriver {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  sendCommand(command: ScpiCommand): Promise<ScpiResponse>;
  sendRaw(data: string): Promise<string | null>;
  getIdentity(): Promise<string>;
}

export abstract class ProtocolDriverBase implements IProtocolDriver {
  protected connected = false;
  protected instrumentId: string;
  protected host: string;
  protected port: number;
  protected timeoutMs: number;

  constructor(options: { instrumentId: string; host?: string; port?: number; timeoutMs?: number }) {
    this.instrumentId = options.instrumentId;
    this.host = options.host || '127.0.0.1';
    this.port = options.port || 5025;
    this.timeoutMs = options.timeoutMs || 5000;
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract sendRaw(data: string): Promise<string | null>;
  abstract getIdentity(): Promise<string>;

  isConnected(): boolean {
    return this.connected;
  }

  async sendCommand(command: ScpiCommand): Promise<ScpiResponse> {
    const startTime = Date.now();
    try {
      const data = command.expectResponse
        ? await this.sendRaw(command.command)
        : await this.sendRaw(command.command);

      return {
        commandId: command.id,
        instrumentId: this.instrumentId,
        success: true,
        data: data ?? undefined,
        timestamp: Date.now(),
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        commandId: command.id,
        instrumentId: this.instrumentId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  protected async withTimeout<T>(promise: Promise<T>, customTimeout?: number): Promise<T> {
    const timeout = customTimeout || this.timeoutMs;
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`操作超时 (${timeout}ms)`)), timeout),
      ),
    ]);
  }
}
