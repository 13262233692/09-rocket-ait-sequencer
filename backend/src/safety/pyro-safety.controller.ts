import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  HttpException,
  HttpStatus,
  Query,
} from '@nestjs/common';
import {
  PyroSafetyService,
  PyroTestConfig,
  PyroTestSession,
} from './pyro-safety.service';
import { PyroSampleData } from './moving-median-filter';

@Controller('api/pyro-safety')
export class PyroSafetyController {
  constructor(private readonly pyroSafetyService: PyroSafetyService) {}

  @Post('sessions')
  createSession(@Body() config: PyroTestConfig): PyroTestSession {
    try {
      if (!config.pyroId || !config.sourceInstrumentId) {
        throw new HttpException(
          '必须提供 pyroId 和 sourceInstrumentId',
          HttpStatus.BAD_REQUEST,
        );
      }
      return this.pyroSafetyService.createSession(config);
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : String(error),
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('sessions/:id/start')
  async startSession(@Param('id') sessionId: string): Promise<PyroTestSession> {
    try {
      return await this.pyroSafetyService.startSession(sessionId);
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : String(error),
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('sessions/:id/stop')
  async stopSession(@Param('id') sessionId: string): Promise<PyroTestSession> {
    try {
      return await this.pyroSafetyService.stopSession(sessionId, true);
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : String(error),
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post('sessions/:id/simulate-danger')
  simulateDanger(@Param('id') sessionId: string): { success: boolean; message: string } {
    try {
      this.pyroSafetyService.simulateDangerCondition(sessionId);
      return {
        success: true,
        message: '已注入危险模拟信号，应急关断即将触发',
      };
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : String(error),
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Get('sessions/:id')
  getSession(@Param('id') sessionId: string): PyroTestSession {
    const session = this.pyroSafetyService.getSession(sessionId);
    if (!session) {
      throw new HttpException(`会话 ${sessionId} 不存在`, HttpStatus.NOT_FOUND);
    }
    return session;
  }

  @Get('sessions/:id/samples')
  getSessionSamples(
    @Param('id') sessionId: string,
    @Query('count') countParam?: string,
  ): PyroSampleData[] {
    const count = parseInt(countParam || '500', 10);
    return this.pyroSafetyService.getSessionSamples(sessionId, count);
  }

  @Get('sessions')
  getAllSessions(): PyroTestSession[] {
    return this.pyroSafetyService.getAllSessions();
  }

  @Get('emergency/status')
  getEmergencyStatus(): {
    isActive: boolean;
    lastEvent?: any;
  } {
    return {
      isActive: this.pyroSafetyService.isEmergencyActive(),
      lastEvent: undefined,
    };
  }

  @Post('emergency/reset')
  resetEmergency(): { success: boolean; message: string } {
    this.pyroSafetyService.resetEmergencyState();
    return {
      success: true,
      message: '紧急状态已重置，仪器控制权限恢复',
    };
  }
}
