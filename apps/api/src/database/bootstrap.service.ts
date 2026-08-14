import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { In, LessThan, Repository } from 'typeorm';
import { DEFAULT_ADMIN_PASSWORD, DEFAULT_ADMIN_USERNAME, assertPasswordPolicy } from '../auth/password-policy';
import { runtimeConfig } from '../common/runtime-config';
import { AdminEntity, OperationEntity, SessionEntity } from './entities';

@Injectable()
export class DatabaseBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabaseBootstrapService.name);

  constructor(
    @InjectRepository(AdminEntity) private readonly admins: Repository<AdminEntity>,
    @InjectRepository(SessionEntity) private readonly sessions: Repository<SessionEntity>,
    @InjectRepository(OperationEntity) private readonly operations: Repository<OperationEntity>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if ((await this.admins.count()) === 0) {
      const password = runtimeConfig.initialAdminPassword;
      const usingDefaultPassword = password === DEFAULT_ADMIN_PASSWORD;
      if (!usingDefaultPassword) assertPasswordPolicy(password, DEFAULT_ADMIN_USERNAME);
      await this.admins.save(
        this.admins.create({
          username: DEFAULT_ADMIN_USERNAME,
          passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
          usingDefaultPassword,
        }),
      );
      this.logger.warn(
        usingDefaultPassword
          ? 'Created the initial administrator (admin/admin); the panel will require a password change before other actions'
          : 'Created the initial administrator from INITIAL_ADMIN_PASSWORD',
      );
    }
    await this.sessions.delete({ expiresAt: LessThan(new Date()) });
    await this.operations.update(
      { status: In(['queued', 'running']) },
      {
        status: 'interrupted',
        stage: 'interrupted',
        errorCode: 'PROCESS_INTERRUPTED',
        summary: 'API process exited before this operation completed',
        finishedAt: new Date(),
      },
    );
  }
}
