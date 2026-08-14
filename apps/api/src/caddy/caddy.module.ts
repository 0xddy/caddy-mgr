import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigRevisionEntity } from '../database/entities';
import { OperationsModule } from '../operations/operations.module';
import { ServersModule } from '../servers/servers.module';
import { CaddyController, CaddyRecoveryController } from './caddy.controller';
import { CaddyService } from './caddy.service';

@Module({
  imports: [TypeOrmModule.forFeature([ConfigRevisionEntity]), ServersModule, OperationsModule],
  controllers: [CaddyController, CaddyRecoveryController],
  providers: [CaddyService],
})
export class CaddyModule {}
