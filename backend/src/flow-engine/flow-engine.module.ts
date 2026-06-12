import { Module } from '@nestjs/common';
import { FlowEngineService } from './flow-engine.service';
import { FlowEngineController } from './flow-engine.controller';
import { TopologyService } from './topology.service';
import { NodeExecutorService } from './node-executor.service';
import { InstrumentModule } from '../instrument/instrument.module';
import { SafetyModule } from '../safety/safety.module';

@Module({
  imports: [InstrumentModule, SafetyModule],
  controllers: [FlowEngineController],
  providers: [FlowEngineService, TopologyService, NodeExecutorService],
  exports: [FlowEngineService],
})
export class FlowEngineModule {}
