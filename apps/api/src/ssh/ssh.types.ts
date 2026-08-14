import type { AuthMethod, ElevationMethod } from '../common/contracts';

export interface SshCredentials {
  password?: string;
  privateKey?: string;
  passphrase?: string;
  sudoPassword?: string;
}

export interface SshConnectionOptions {
  host: string;
  port: number;
  username: string;
  authMethod: AuthMethod;
  elevationMethod: ElevationMethod;
  credentials: SshCredentials;
  hostFingerprint?: string;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number;
  signal?: string;
}

export interface ExecOptions {
  elevated?: boolean;
  asUser?: string | null;
  timeoutMs?: number;
}
