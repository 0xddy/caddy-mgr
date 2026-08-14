import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApplyConfigDto, ConfigContentDto, RecoverOperationDto, RestoreConfigDto } from './caddy.dto';
import { CaddyService } from './caddy.service';

@Controller('servers/:serverId')
export class CaddyController {
  constructor(private readonly caddy: CaddyService) {}

  @Get('config') read(@Param('serverId', ParseUUIDPipe) serverId: string) { return this.caddy.read(serverId); }
  @Post('config/format') format(@Param('serverId', ParseUUIDPipe) serverId: string, @Body() input: ConfigContentDto) { return this.caddy.format(serverId, input.content); }
  @Post('config/validate') validate(@Param('serverId', ParseUUIDPipe) serverId: string, @Body() input: ConfigContentDto) { return this.caddy.validate(serverId, input.content); }

  @Post('config/apply')
  @HttpCode(202)
  apply(@Param('serverId', ParseUUIDPipe) serverId: string, @Body() input: ApplyConfigDto) { return this.caddy.queueApply(serverId, input); }

  @Get('revisions') revisions(@Param('serverId', ParseUUIDPipe) serverId: string) { return this.caddy.listRevisions(serverId); }
  @Get('revisions/:revisionId') revision(@Param('serverId', ParseUUIDPipe) serverId: string, @Param('revisionId', ParseUUIDPipe) revisionId: string) { return this.caddy.revision(serverId, revisionId); }

  @Post('revisions/:revisionId/restore')
  @HttpCode(202)
  restore(@Param('serverId', ParseUUIDPipe) serverId: string, @Param('revisionId', ParseUUIDPipe) revisionId: string, @Body() input: RestoreConfigDto) {
    return this.caddy.queueRestore(serverId, revisionId, input.baseHash);
  }

  @Post('actions/reload')
  @HttpCode(202)
  reload(@Param('serverId', ParseUUIDPipe) serverId: string) { return this.caddy.queueServiceAction(serverId, 'reload'); }

  @Post('actions/restart')
  @HttpCode(202)
  restart(@Param('serverId', ParseUUIDPipe) serverId: string) { return this.caddy.queueServiceAction(serverId, 'restart'); }
}

@Controller('operations')
export class CaddyRecoveryController {
  constructor(private readonly caddy: CaddyService) {}

  @Post(':operationId/recover')
  @HttpCode(202)
  recover(
    @Param('operationId', ParseUUIDPipe) operationId: string,
    @Body() input: RecoverOperationDto,
  ) {
    return this.caddy.queueRecovery(operationId, input.action);
  }
}
