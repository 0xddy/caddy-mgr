import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CreateServerDto, HostKeyDto, ProbeServerDto, UpdateServerDto } from './server.dto';
import { ServersService } from './servers.service';

@Controller('servers')
export class ServersController {
  constructor(private readonly servers: ServersService) {}

  @Post('host-key')
  @HttpCode(200)
  hostKey(@Body() input: HostKeyDto) { return this.servers.hostKey(input); }

  @Post('probe') probe(@Body() input: ProbeServerDto) { return this.servers.probe(input); }
  @Get() list() { return this.servers.list(); }
  @Post() create(@Body() input: CreateServerDto) { return this.servers.create(input); }
  @Get(':id') detail(@Param('id', ParseUUIDPipe) id: string) { return this.servers.detail(id); }
  @Patch(':id') update(@Param('id', ParseUUIDPipe) id: string, @Body() input: UpdateServerDto) { return this.servers.update(id, input); }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.servers.remove(id); }

  @Post(':id/rediscover') rediscover(@Param('id', ParseUUIDPipe) id: string) { return this.servers.rediscover(id); }
  @Get(':id/status') status(@Param('id', ParseUUIDPipe) id: string) { return this.servers.status(id); }
  @Get(':id/logs') logs(@Param('id', ParseUUIDPipe) id: string, @Query('lines') lines?: string) { return this.servers.logs(id, Number.parseInt(lines ?? '200', 10) || 200); }
}
