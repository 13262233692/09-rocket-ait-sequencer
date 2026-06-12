import { Module } from '@nestjs/common';
import { PyroSafetyService } from './pyro-safety.service';
import { EmergencyStopService } from './emergency-stop.service';
import { PyroSafetyController } from './pyro-safety.controller';
import { InstrumentModule } from '../instrument/instrument.module';

@Module({
  imports: [InstrumentModule],
  controllers: [PyroSafetyController],
  providers: [PyroSafetyService, EmergencyStopService],
  exports: [PyroSafetyService, EmergencyStopService],
})
export class SafetyModule {}
