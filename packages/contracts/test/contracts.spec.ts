import { describe, expect, it } from 'vitest';

import {
  API_ROUTES,
  AuthMethod,
  CaddyAdapter,
  ElevationMethod,
  OperationStatus,
  RecoveryAction,
  adminProfileSchema,
  captchaResponseSchema,
  createServerRequestSchema,
  discoveryResultSchema,
  hostKeyRequestSchema,
  isCanonicalPosixAbsolutePath,
  loginRequestSchema,
  operationListResponseSchema,
  posixAbsolutePathSchema,
  recoveryActionRequestSchema,
  serverSummarySchema,
  updateAccountRequestSchema,
} from '../src/index.js';

describe('wire contracts', () => {
  it('accepts the flat server payload used by the Nest DTO', () => {
    const result = createServerRequestSchema.parse({
      name: '生产入口',
      host: 'caddy.example.com',
      username: 'ops',
      authMethod: AuthMethod.Password,
      password: 'secret',
      elevationMethod: ElevationMethod.SudoNopass,
      hostFingerprint: 'SHA256:Abc123+/example',
      serviceName: 'caddy.service',
      caddyBinary: '/usr/bin/caddy',
      caddyVersion: 'v2.10.0',
      configPath: '/etc/caddy/Caddyfile',
      adapter: CaddyAdapter.Caddyfile,
    });

    expect(result.port).toBe(22);
    expect(result.authMethod).toBe('password');
    expect(result.caddyVersion).toBe('v2.10.0');
  });

  it('requires the confirmed host key and CAPTCHA fields used by login', () => {
    expect(hostKeyRequestSchema.parse({ host: 'caddy.example.com' })).toEqual({
      host: 'caddy.example.com',
      port: 22,
    });
    expect(() =>
      loginRequestSchema.parse({ username: 'admin', password: 'admin' }),
    ).toThrow();
    expect(
      captchaResponseSchema.parse({
        captchaId: 'captcha-id',
        imageSvg: '<svg></svg>',
        expiresInSeconds: 300,
      }),
    ).not.toHaveProperty('debugCode');
  });

  it('uses direct response objects and strips unknown secret fields', () => {
    expect(
      adminProfileSchema.parse({
        id: 'c53cf978-8683-4cc4-b1bb-20c8f8ec342f',
        username: 'admin',
        usingDefaultPassword: true,
      }),
    ).toEqual({
      id: 'c53cf978-8683-4cc4-b1bb-20c8f8ec342f',
      username: 'admin',
      usingDefaultPassword: true,
    });

    const server = serverSummarySchema.parse({
      id: 'c53cf978-8683-4cc4-b1bb-20c8f8ec342f',
      name: '边缘节点',
      host: '192.0.2.1',
      port: 22,
      username: 'ops',
      serviceName: 'caddy.service',
      configPath: '/etc/caddy/Caddyfile',
      caddyVersion: 'v2.10.0',
      supported: true,
      lastConnectionStatus: null,
      lastConnectedAt: null,
      createdAt: '2026-08-14T00:00:00.000Z',
      updatedAt: '2026-08-14T00:00:00.000Z',
      password: 'must-not-leak',
    });
    expect(server).not.toHaveProperty('password');
  });

  it('models operation arrays and actual status spelling', () => {
    expect(operationListResponseSchema.parse([])).toEqual([]);
    expect(OperationStatus.RolledBack).toBe('rolled_back');
    expect(OperationStatus.NeedsAttention).toBe('needs_attention');
  });

  it('keeps the recovery endpoint and action body stable', () => {
    expect(API_ROUTES.operations.recover('op-id')).toBe('/api/operations/op-id/recover');
    expect(recoveryActionRequestSchema.parse({ action: RecoveryAction.RetryReload })).toEqual({
      action: 'retryReload',
    });
  });

  it('keeps multiple systemd candidates on the discovery payload', () => {
    const result = discoveryResultSchema.parse({
      supported: true,
      platform: 'Linux',
      serviceName: 'caddy.service',
      serviceNames: ['caddy.service', 'caddy-edge.service'],
      caddyBinary: '/usr/bin/caddy',
      configPath: '/etc/caddy/Caddyfile',
      adapter: 'caddyfile',
      sudoAvailable: true,
      warnings: [],
      candidates: [
        {
          serviceName: 'caddy.service',
          caddyBinary: '/usr/bin/caddy',
          configPath: '/etc/caddy/Caddyfile',
          adapter: 'caddyfile',
        },
        {
          serviceName: 'caddy-edge.service',
          caddyBinary: '/usr/bin/caddy',
          configPath: '/etc/caddy/edge.Caddyfile',
          adapter: 'caddyfile',
        },
      ],
    });
    expect(result.candidates).toHaveLength(2);
    expect(result.skipped).toEqual([]);
    expect(discoveryResultSchema.parse({
      supported: false,
      platform: 'Linux',
      serviceNames: ['caddy.service', 'caddy-api.service'],
      sudoAvailable: true,
      warnings: [],
      skipped: [{ serviceName: 'caddy-api.service', reason: '不支持 Caddy API-only 服务' }],
    }).skipped).toEqual([{ serviceName: 'caddy-api.service', reason: '不支持 Caddy API-only 服务' }]);
  });

  it('matches the current action and rediscovery paths', () => {
    expect(API_ROUTES.servers.rediscover('server-id')).toBe(
      '/api/servers/server-id/rediscover',
    );
    expect(API_ROUTES.servers.reload('server-id')).toBe(
      '/api/servers/server-id/actions/reload',
    );
    expect(API_ROUTES.auth.account).toBe('/api/auth/account');
    expect(API_ROUTES.auth.captcha).toBe('/api/auth/captcha');
    expect(API_ROUTES.servers.hostKey).toBe('/api/servers/host-key');
  });

  it('rejects non-canonical remote paths and short replacement passwords', () => {
    expect(isCanonicalPosixAbsolutePath('/etc/caddy/Caddyfile')).toBe(true);
    expect(posixAbsolutePathSchema.safeParse('/etc/caddy/../../etc/shadow').success).toBe(false);
    expect(updateAccountRequestSchema.safeParse({
      currentPassword: 'admin',
      newPassword: 'short',
    }).success).toBe(false);
    expect(updateAccountRequestSchema.parse({
      currentPassword: 'admin',
      newPassword: 'correct-horse',
    }).newPassword).toBe('correct-horse');
  });
});
