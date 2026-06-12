import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { FlowEngineService, EngineEvent } from '../flow-engine/flow-engine.service';
import { InstrumentService } from '../instrument/instrument.service';
import { InstrumentState } from '../common/types/instrument.types';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/engine',
  pingInterval: 10000,
  pingTimeout: 5000,
})
export class EngineGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(EngineGateway.name);
  private eventSubscription: any;
  private instrumentTimer: NodeJS.Timeout;

  constructor(
    private readonly flowEngineService: FlowEngineService,
    private readonly instrumentService: InstrumentService,
  ) {}

  afterInit() {
    this.logger.log('[WebSocket] 引擎网关已初始化');

    this.eventSubscription = this.flowEngineService.getEvents().subscribe({
      next: (event: EngineEvent) => {
        this.broadcastEvent(event);
      },
      error: (err) => {
        this.logger.error(`事件流错误: ${err}`);
      },
    });

    this.instrumentTimer = setInterval(() => {
      this.broadcastInstruments();
    }, 5000);
  }

  handleConnection(client: Socket) {
    this.logger.log(`[WebSocket] 客户端已连接: ${client.id}`);
    client.emit('connected', { serverTime: Date.now() });
    this.broadcastInstruments();
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`[WebSocket] 客户端已断开: ${client.id}`);
  }

  @SubscribeMessage('ping')
  handlePing(@MessageBody() data: any, @ConnectedSocket() client: Socket) {
    client.emit('pong', { serverTime: Date.now(), clientData: data });
  }

  @SubscribeMessage('get_instruments')
  handleGetInstruments(@ConnectedSocket() client: Socket) {
    const instruments = this.instrumentService.getAllInstruments();
    client.emit('instruments', instruments);
  }

  @SubscribeMessage('connect_instrument')
  async handleConnectInstrument(
    @MessageBody() data: { instrumentId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const state = await this.instrumentService.connectInstrument(data.instrumentId);
      client.emit('instrument_updated', state);
      this.broadcastInstruments();
    } catch (error) {
      client.emit('error', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  @SubscribeMessage('disconnect_instrument')
  async handleDisconnectInstrument(
    @MessageBody() data: { instrumentId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const state = await this.instrumentService.disconnectInstrument(data.instrumentId);
      client.emit('instrument_updated', state);
      this.broadcastInstruments();
    } catch (error) {
      client.emit('error', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private broadcastEvent(event: EngineEvent) {
    this.server.emit('engine_event', event);
  }

  private broadcastInstruments() {
    const instruments = this.instrumentService.getAllInstruments();
    this.server.emit('instruments', instruments);
  }
}
