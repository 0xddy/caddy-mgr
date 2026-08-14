import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { MoreThan, Repository } from 'typeorm';
import { AppError } from '../common/app-error';
import { runtimeConfig } from '../common/runtime-config';
import { sha256 } from '../common/serialize';
import { AdminEntity, SessionEntity } from '../database/entities';
import type { UpdateAccountDto } from './auth.dto';
import { assertPasswordPolicy } from './password-policy';

export const SESSION_COOKIE = 'caddy_mgr_session';

let dummyPasswordHash: Promise<string> | undefined;

function getDummyPasswordHash(): Promise<string> {
  dummyPasswordHash ??= argon2.hash('__caddy_mgr_timing__', { type: argon2.argon2id });
  return dummyPasswordHash;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(AdminEntity) private readonly admins: Repository<AdminEntity>,
    @InjectRepository(SessionEntity) private readonly sessions: Repository<SessionEntity>,
  ) {}

  async login(username: string, password: string): Promise<{ token: string; expiresAt: Date; admin: AdminEntity }> {
    const admin = await this.admins.findOne({ where: { username } });
    const hash = admin?.passwordHash ?? (await getDummyPasswordHash());
    const passwordOk = await argon2.verify(hash, password);
    if (!admin || !passwordOk) {
      throw new AppError('INVALID_CREDENTIALS', '账号或密码错误', 401);
    }
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + runtimeConfig.sessionTtlSeconds * 1000);
    await this.sessions.save(this.sessions.create({ adminId: admin.id, tokenHash: sha256(token), expiresAt }));
    return { token, expiresAt, admin };
  }

  async authenticate(token: string | undefined): Promise<{ admin: AdminEntity; session: SessionEntity } | null> {
    if (!token) return null;
    const session = await this.sessions.findOne({
      where: { tokenHash: sha256(token), expiresAt: MoreThan(new Date()) },
    });
    if (!session) return null;
    const admin = await this.admins.findOne({ where: { id: session.adminId } });
    if (!admin) return null;
    if (!session.lastSeenAt || Date.now() - session.lastSeenAt.getTime() > 5 * 60_000) {
      session.lastSeenAt = new Date();
      void this.sessions.save(session).catch(() => undefined);
    }
    return { admin, session };
  }

  async logout(token: string | undefined): Promise<void> {
    if (token) await this.sessions.delete({ tokenHash: sha256(token) });
  }

  async updateAccount(admin: AdminEntity, input: UpdateAccountDto): Promise<AdminEntity> {
    if (!(await argon2.verify(admin.passwordHash, input.currentPassword))) {
      throw new AppError('INVALID_CURRENT_PASSWORD', '当前密码错误', 422);
    }
    if (!input.username && !input.newPassword) {
      throw new AppError('NO_ACCOUNT_CHANGES', '请提供新账号或新密码', 422);
    }
    if (input.username) admin.username = input.username.trim();
    const passwordChanged = Boolean(input.newPassword);
    if (input.newPassword) {
      assertPasswordPolicy(input.newPassword, input.username ?? admin.username);
      admin.passwordHash = await argon2.hash(input.newPassword, { type: argon2.argon2id });
      admin.usingDefaultPassword = false;
    }
    try {
      const saved = await this.admins.save(admin);
      if (passwordChanged) await this.sessions.delete({ adminId: admin.id });
      return saved;
    } catch (error) {
      if (String(error).includes('UNIQUE')) throw new AppError('USERNAME_TAKEN', '账号已存在', 409);
      throw error;
    }
  }

  serializeAdmin(admin: AdminEntity): { id: string; username: string; usingDefaultPassword: boolean } {
    return { id: admin.id, username: admin.username, usingDefaultPassword: admin.usingDefaultPassword };
  }
}
