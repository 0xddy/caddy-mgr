import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { OperationService } from './operation.service';

@Controller('operations')
export class OperationsController {
  constructor(private readonly operations: OperationService) {}

  @Get()
  list(@Query('serverId') serverId?: string, @Query('limit') limit?: string) {
    return this.operations.list(serverId, Number.parseInt(limit ?? '50', 10) || 50);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) { return this.operations.get(id); }
}
