import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { AuthMethod, ConfigRevision, ElevationMethod, OperationKind, OperationStatus } from '../common/contracts';

@Entity('admins')
export class AdminEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index({ unique: true }) @Column({ type: 'text' }) username: string;
  @Column({ type: 'text' }) passwordHash: string;
  @Column({ type: 'boolean', default: true }) usingDefaultPassword: boolean;
  @CreateDateColumn({ type: 'datetime' }) createdAt: Date;
  @UpdateDateColumn({ type: 'datetime' }) updatedAt: Date;
}

@Entity('sessions')
export class SessionEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index({ unique: true }) @Column({ type: 'text' }) tokenHash: string;
  @Index() @Column({ type: 'text' }) adminId: string;
  @Index() @Column({ type: 'datetime' }) expiresAt: Date;
  @Column({ type: 'datetime', nullable: true }) lastSeenAt: Date | null;
  @CreateDateColumn({ type: 'datetime' }) createdAt: Date;
}

@Entity('caddy_servers')
export class CaddyServerEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index({ unique: true }) @Column({ type: 'text' }) targetKey: string;
  @Column({ type: 'text' }) name: string;
  @Column({ type: 'text' }) host: string;
  @Column({ type: 'integer', default: 22 }) port: number;
  @Column({ type: 'text' }) username: string;
  @Column({ type: 'text' }) authMethod: AuthMethod;
  @Column({ type: 'text' }) elevationMethod: ElevationMethod;
  @Column({ type: 'text' }) credentialCipher: string;
  @Column({ type: 'text' }) hostFingerprint: string;
  @Column({ type: 'text' }) serviceName: string;
  @Column({ type: 'text' }) caddyBinary: string;
  @Column({ type: 'text', nullable: true }) caddyVersion: string | null;
  @Column({ type: 'text' }) configPath: string;
  @Column({ type: 'text', default: 'caddyfile' }) adapter: string;
  @Column({ type: 'text', nullable: true }) serviceUser: string | null;
  @Column({ type: 'text', nullable: true }) workingDirectory: string | null;
  @Column({ type: 'boolean', default: true }) supported: boolean;
  @Column({ type: 'text', nullable: true }) discoveryJson: string | null;
  @Column({ type: 'text', nullable: true }) lastConnectionStatus: string | null;
  @Column({ type: 'datetime', nullable: true }) lastConnectedAt: Date | null;
  @CreateDateColumn({ type: 'datetime' }) createdAt: Date;
  @UpdateDateColumn({ type: 'datetime' }) updatedAt: Date;
}

@Entity('config_revisions')
@Index(['serverId', 'createdAt'])
export class ConfigRevisionEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'text' }) serverId: string;
  @Column({ type: 'text' }) hash: string;
  @Column({ type: 'text' }) contentCipher: string;
  @Column({ type: 'text' }) source: ConfigRevision['source'];
  @Column({ type: 'text', nullable: true }) operationId: string | null;
  @Column({ type: 'integer', nullable: true }) size: number | null;
  @CreateDateColumn({ type: 'datetime' }) createdAt: Date;
}

@Entity('operations')
@Index(['serverId', 'createdAt'])
export class OperationEntity {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'text' }) serverId: string;
  @Column({ type: 'text' }) kind: OperationKind;
  @Column({ type: 'text', default: 'queued' }) status: OperationStatus;
  @Column({ type: 'text', default: 'queued' }) stage: string;
  @Column({ type: 'text', nullable: true }) summary: string | null;
  @Column({ type: 'text', nullable: true }) errorCode: string | null;
  @Column({ type: 'text', nullable: true }) backupPath: string | null;
  @CreateDateColumn({ type: 'datetime' }) createdAt: Date;
  @Column({ type: 'datetime', nullable: true }) startedAt: Date | null;
  @Column({ type: 'datetime', nullable: true }) finishedAt: Date | null;
}

export const ENTITIES = [
  AdminEntity,
  SessionEntity,
  CaddyServerEntity,
  ConfigRevisionEntity,
  OperationEntity,
] as const;
