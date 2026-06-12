import { Module } from '@nestjs/common';
import { EngineGateway } from './engine.gateway';
import { FlowEngineModule } from '../flow-engine/flow-engine.module';
import { InstrumentModule } from '../instrument/instrument.module';

@Module({
  imports: [FlowEngineModule, InstrumentModule],
  providers: [EngineGateway],
  exports: [EngineGateway],
})
export class WebSocketModule {}
