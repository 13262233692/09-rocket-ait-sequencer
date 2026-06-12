import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FlowEngineService } from './flow-engine.service';
import { FlowGraph, FlowExecutionState } from '../common/types/flow.types';

@Controller('api/flow')
export class FlowEngineController {
  constructor(private readonly flowEngineService: FlowEngineService) {}

  @Post('validate')
  validate(@Body() graph: FlowGraph): { valid: boolean; errors: string[] } {
    return this.flowEngineService.validateFlow(graph);
  }

  @Post('execute')
  async execute(@Body() graph: FlowGraph): Promise<{ executionId: string; status: string }> {
    try {
      const state = await this.flowEngineService.startExecution(graph);
      return { executionId: state.executionId, status: state.status };
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : String(error),
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  @Post(':id/stop')
  stop(@Param('id') executionId: string): { stopped: boolean } {
    const stopped = this.flowEngineService.stopExecution(executionId);
    if (!stopped) {
      throw new HttpException(
        `执行实例 ${executionId} 不存在或已停止`,
        HttpStatus.NOT_FOUND,
      );
    }
    return { stopped: true };
  }

  @Get(':id')
  getExecution(@Param('id') executionId: string): any {
    const state = this.flowEngineService.getExecutionSerializable(executionId);
    if (!state) {
      throw new HttpException(`执行实例 ${executionId} 不存在`, HttpStatus.NOT_FOUND);
    }
    return state;
  }

  @Get()
  getAllExecutions(): any[] {
    return this.flowEngineService.getAllExecutionsSerializable();
  }
}
