import { createHash } from 'node:crypto';
import { posix } from 'node:path';

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function cleanOutput(value: string, secrets: Array<string | undefined> = [], maxLength = 4 * 1024 * 1024): string {
  let output = value.replaceAll(/\x1B\[[0-?]*[ -/]*[@-~]/g, '').replaceAll('\u0000', '');
  for (const secret of secrets) {
    if (secret) output = output.split(secret).join('[REDACTED]');
  }
  return output.slice(0, maxLength);
}

/** POSIX shell single-quote escaping for values, never commands. */
export function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function assertAbsolutePath(value: string, field = 'path'): void {
  if (!value.startsWith('/') || value.startsWith('//') || /[\u0000-\u001f\\]/.test(value)) {
    throw new Error(`${field} must be an absolute POSIX path`);
  }
  if ((value.length > 1 && value.endsWith('/')) || posix.normalize(value) !== value) {
    throw new Error(`${field} must be a canonical POSIX absolute path`);
  }
}

export function assertSystemdUnit(value: string): void {
  if (!/^[A-Za-z0-9_.@:-]+\.service$/.test(value)) throw new Error('Invalid systemd service unit');
}
