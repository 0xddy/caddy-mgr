import { z } from 'zod';

export enum AuthMethod {
  Password = 'password',
  PrivateKey = 'privateKey',
}

export enum ElevationMethod {
  Root = 'root',
  SudoNopass = 'sudoNopass',
  SudoPassword = 'sudoPassword',
}

export enum CaddyAdapter {
  Caddyfile = 'caddyfile',
}

export enum ConfigRevisionSource {
  Baseline = 'baseline',
  Apply = 'apply',
  Restore = 'restore',
  External = 'external',
}

export enum OperationKind {
  Apply = 'apply',
  Restore = 'restore',
  Reload = 'reload',
  Restart = 'restart',
}

export enum OperationStatus {
  Queued = 'queued',
  Running = 'running',
  Succeeded = 'succeeded',
  Failed = 'failed',
  RolledBack = 'rolled_back',
  NeedsAttention = 'needs_attention',
  Interrupted = 'interrupted',
}

/** Known stages emitted today. The API intentionally stores and returns stage as a string. */
export enum OperationStage {
  Queued = 'queued',
  Connecting = 'connecting',
  CheckingConflict = 'checking_conflict',
  Uploading = 'uploading',
  Validating = 'validating',
  BackingUp = 'backing_up',
  Replacing = 'replacing',
  Reloading = 'reloading',
  RollingBack = 'rolling_back',
  PruningBackups = 'pruning_backups',
  Reload = 'reload',
  Restart = 'restart',
  Completed = 'completed',
  Failed = 'failed',
  RolledBack = 'rolled_back',
  NeedsAttention = 'needs_attention',
  Interrupted = 'interrupted',
}

export enum RecoveryAction {
  RetryReload = 'retryReload',
  RestoreBackup = 'restoreBackup',
}

export const authMethodSchema = z.enum(AuthMethod);
export const elevationMethodSchema = z.enum(ElevationMethod);
export const caddyAdapterSchema = z.enum(CaddyAdapter);
export const configRevisionSourceSchema = z.enum(ConfigRevisionSource);
export const operationKindSchema = z.enum(OperationKind);
export const operationStatusSchema = z.enum(OperationStatus);
export const operationStageSchema = z.string().min(1);
export const recoveryActionSchema = z.enum(RecoveryAction);
