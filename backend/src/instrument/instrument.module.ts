import { Module } from '@nestjs/common';
import { InstrumentService } from './instrument.service';
import { InstrumentController } from './instrument.controller';
import { ProtocolDriverFactory } from './drivers/driver.factory';
import { CommandQueueService } from './command-queue.service';
import { StressTestController } from './stress-test.controller';

@Module({
  controllers: [InstrumentController, StressTestController],
  providers: [InstrumentService, ProtocolDriverFactory, CommandQueueService],
  exports: [InstrumentService, CommandQueueService],
})
export class InstrumentModule {}
