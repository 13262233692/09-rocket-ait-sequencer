import { Controller, Get, Post, Param, Body, HttpException, HttpStatus } from '@nestjs/common';
import { InstrumentService } from './instrument.service';
import { InstrumentState, ScpiCommand, ScpiResponse } from '../common/types/instrument.types';

@Controller('api/instruments')
export class InstrumentController {
  constructor(private readonly instrumentService: InstrumentService) {}

  @Get()
  getAllInstruments(): InstrumentState[] {
    return this.instrumentService.getAllInstruments();
  }

  @Get(':id')
  getInstrument(@Param('id') id: string): InstrumentState {
    const inst = this.instrumentService.getInstrument(id);
    if (!inst) {
      throw new HttpException(`仪器 ${id} 不存在`, HttpStatus.NOT_FOUND);
    }
    return inst;
  }

  @Post(':id/connect')
  async connect(@Param('id') id: string): Promise<InstrumentState> {
    try {
      return await this.instrumentService.connectInstrument(id);
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : String(error),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':id/disconnect')
  async disconnect(@Param('id') id: string): Promise<InstrumentState> {
    try {
      return await this.instrumentService.disconnectInstrument(id);
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : String(error),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('connect-all')
  async connectAll(): Promise<InstrumentState[]> {
    try {
      return await this.instrumentService.connectAll();
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : String(error),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('scpi')
  async sendScpi(@Body() command: ScpiCommand): Promise<ScpiResponse> {
    try {
      return await this.instrumentService.sendCommand(command);
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : String(error),
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post(':id/read-voltage')
  async readVoltage(
    @Param('id') id: string,
    @Body() body?: { channel?: number | string },
  ): Promise<{ value: number; unit: string }> {
    try {
      const value = await this.instrumentService.readVoltage(id, body?.channel);
      return { value, unit: 'V' };
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : String(error),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':id/read-current')
  async readCurrent(
    @Param('id') id: string,
    @Body() body?: { channel?: number | string },
  ): Promise<{ value: number; unit: string }> {
    try {
      const value = await this.instrumentService.readCurrent(id, body?.channel);
      return { value, unit: 'A' };
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : String(error),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post(':id/read-impedance')
  async readImpedance(
    @Param('id') id: string,
    @Body() body?: { channel?: number | string },
  ): Promise<{ value: number; unit: string }> {
    try {
      const value = await this.instrumentService.readImpedance(id, body?.channel);
      return { value, unit: 'Ω' };
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : String(error),
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
