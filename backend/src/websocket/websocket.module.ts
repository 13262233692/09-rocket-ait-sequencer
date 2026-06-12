import { Module } from '@nestjs/common';
import { EngineGateway } from './engine.gateway';
import { FlowEngineModule } from '../flow-engine/flow-engine.module';
import { InstrumentModule } from '../instrument/instrument.module';
import { SafetyModule } from '../safety/safety.module';

@Module({
  imports: [FlowEngineModule, InstrumentModule, SafetyModule],
  providers: [EngineGateway],
  exports: [EngineGateway],
})
export class WebSocketModule {}
