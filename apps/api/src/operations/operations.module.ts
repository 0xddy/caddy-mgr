import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OperationEntity } from '../database/entities';
import { OperationService } from './operation.service';
import { OperationsController } from './operations.controller';

@Module({
  imports: [TypeOrmModule.forFeature([OperationEntity])],
  controllers: [OperationsController],
  providers: [OperationService],
  exports: [OperationService],
})
export class OperationsModule {}
