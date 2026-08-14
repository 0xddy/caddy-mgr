import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { ProbeServerDto } from './server.dto';

const validProbe = {
  host: '192.0.2.10',
  port: 22,
  username: 'root',
  authMethod: 'password',
  password: 'ssh-secret',
  elevationMethod: 'root',
};

describe('ProbeServerDto', () => {
  it('rejects an authenticated probe without a confirmed host fingerprint', async () => {
    const errors = await validate(plainToInstance(ProbeServerDto, validProbe));

    expect(errors.some((error) => error.property === 'hostFingerprint')).toBe(true);
  });

  it('accepts an authenticated probe with a confirmed host fingerprint', async () => {
    const errors = await validate(plainToInstance(ProbeServerDto, {
      ...validProbe,
      hostFingerprint: 'SHA256:abcdefghijklmnopqrstuvwxyz0123456789ABCD',
    }));

    expect(errors).toEqual([]);
  });
});
