import { Module } from '@nestjs/common';
import { InstrumentModule } from './instrument/instrument.module';
import { FlowEngineModule } from './flow-engine/flow-engine.module';
import { WebSocketModule } from './websocket/websocket.module';

@Module({
  imports: [InstrumentModule, FlowEngineModule, WebSocketModule],
})
export class AppModule {}
