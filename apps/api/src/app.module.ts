import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthGuard } from './auth/auth.guard';
import { AuthModule } from './auth/auth.module';
import { CaddyModule } from './caddy/caddy.module';
import { DatabaseBootstrapService } from './database/bootstrap.service';
import { AdminEntity, OperationEntity, SessionEntity } from './database/entities';
import { typeormOptions } from './database/typeorm-options';
import { HealthController } from './health/health.controller';
import { OperationsModule } from './operations/operations.module';
import { ServersModule } from './servers/servers.module';

@Module({
  imports: [
    TypeOrmModule.forRoot(typeormOptions),
    TypeOrmModule.forFeature([AdminEntity, SessionEntity, OperationEntity]),
    AuthModule,
    ServersModule,
    OperationsModule,
    CaddyModule,
  ],
  controllers: [HealthController],
  providers: [
    DatabaseBootstrapService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
