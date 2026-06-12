import { Module } from '@nestjs/common';
import { InstrumentService } from './instrument.service';
import { InstrumentController } from './instrument.controller';
import { ProtocolDriverFactory } from './drivers/driver.factory';
import { CommandQueueService } from './command-queue.service';

@Module({
  controllers: [InstrumentController],
  providers: [InstrumentService, ProtocolDriverFactory, CommandQueueService],
  exports: [InstrumentService],
})
export class InstrumentModule {}
