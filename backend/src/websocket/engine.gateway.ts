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
import { PyroSafetyService } from '../safety/pyro-safety.service';
import { PyroEmergencyEvent, PyroSampleData } from '../safety/moving-median-filter';

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
  private pyroUnsubscribers: Array<() => void> = [];

  constructor(
    private readonly flowEngineService: FlowEngineService,
    private readonly instrumentService: InstrumentService,
    private readonly pyroSafetyService: PyroSafetyService,
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

    const unsubEmergency = this.pyroSafetyService.onEmergency(
      (event: PyroEmergencyEvent) => {
        this.logger.fatal(
          `[WebSocket] 🚨 广播火工品紧急关断警报: ${event.reason}`,
        );
        this.server.emit('pyro_emergency', event);
      },
    );
    this.pyroUnsubscribers.push(unsubEmergency);

    const unsubSample = this.pyroSafetyService.onSample(
      (data: PyroSampleData & { sessionId: string }) => {
        this.server.emit('pyro_sample', data);
      },
    );
    this.pyroUnsubscribers.push(unsubSample);

    const unsubEvent = this.pyroSafetyService.onPyroEvent((event: any) => {
      this.server.emit('pyro_event', event);
    });
    this.pyroUnsubscribers.push(unsubEvent);
  }

  handleConnection(client: Socket) {
    this.logger.log(`[WebSocket] 客户端已连接: ${client.id}`);
    client.emit('connected', { serverTime: Date.now() });
    this.broadcastInstruments();

    if (this.pyroSafetyService.isEmergencyActive()) {
      client.emit('pyro_emergency_active', {
        active: true,
      });
    }
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
