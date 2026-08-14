import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CryptoService } from '../common/crypto.service';
import { CaddyDiscoveryService } from '../caddy/caddy-discovery.service';
import { CaddyServerEntity, OperationEntity } from '../database/entities';
import { SshModule } from '../ssh/ssh.module';
import { ServersController } from './servers.controller';
import { ServersService } from './servers.service';

@Module({
  imports: [TypeOrmModule.forFeature([CaddyServerEntity, OperationEntity]), SshModule],
  controllers: [ServersController],
  providers: [ServersService, CaddyDiscoveryService, CryptoService],
  exports: [ServersService, CryptoService],
})
export class ServersModule {}
