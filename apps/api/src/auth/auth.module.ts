import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminEntity, SessionEntity } from '../database/entities';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { LoginProtectionService } from './login-protection.service';

@Module({
  imports: [TypeOrmModule.forFeature([AdminEntity, SessionEntity])],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, LoginProtectionService],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
