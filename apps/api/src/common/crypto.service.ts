import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { runtimeConfig } from './runtime-config';

export function encryptUtf8(key: Buffer, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptUtf8(key: Buffer, value: string): string {
  const [version, ivText, tagText, ciphertextText, extra] = value.split('.');
  if (version !== 'v1' || !ivText || !tagText || !ciphertextText || extra) {
    throw new Error('Unsupported encrypted value');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor() {
    mkdirSync(dirname(runtimeConfig.masterKeyPath), { recursive: true });
    try {
      this.key = readFileSync(runtimeConfig.masterKeyPath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') throw error;
      if (runtimeConfig.databaseExistedAtBoot) {
        throw new Error(
          `Master key is missing at ${runtimeConfig.masterKeyPath} while the database already exists; refusing to start`,
        );
      }
      this.key = randomBytes(32);
      writeFileSync(runtimeConfig.masterKeyPath, this.key, { flag: 'wx', mode: 0o600 });
    }
    if (this.key.length !== 32) throw new Error('Master key must contain exactly 32 bytes');
    try {
      chmodSync(runtimeConfig.masterKeyPath, 0o600);
    } catch {
      // Windows ACLs do not support POSIX modes; file placement remains the operator's responsibility.
    }
  }

  encryptString(plaintext: string): string {
    return encryptUtf8(this.key, plaintext);
  }

  decryptString(value: string): string {
    return decryptUtf8(this.key, value);
  }

  encryptJson<T>(value: T): string {
    return this.encryptString(JSON.stringify(value));
  }

  decryptJson<T>(value: string): T {
    return JSON.parse(this.decryptString(value)) as T;
  }
}
