import { describe, expect, it } from 'vitest';
import { safeRedirectPath } from '../app/composables/useAuth';
import { buildCreateServerRequest, buildHostKeyRequest, mapDiscovery, normalizeApiError, shortCaddyVersion } from '../app/composables/useApi';
import type { CreateServerInput, ServerConnectionInput } from '../app/types/api';
import { buildApiTarget } from '../server/utils/api-target';
import {
  INTERNAL_CLIENT_IP_HEADER,
  resolveProxyClientIp,
  trustForwardedClientIp,
} from '../server/utils/client-ip';

describe('Nuxt API adapter', () => {
  it('maps every usable systemd candidate from discovery', () => {
    const mapped = mapDiscovery({
      supported: true,
      platform: 'Linux',
      serviceName: 'caddy.service',
      serviceNames: ['caddy.service', 'caddy-edge.service'],
      caddyBinary: '/usr/bin/caddy',
      configPath: '/etc/caddy/Caddyfile',
      adapter: 'caddyfile',
      sudoAvailable: true,
      warnings: [],
      skipped: [],
      candidates: [
        {
          serviceName: 'caddy.service',
          caddyBinary: '/usr/bin/caddy',
          configPath: '/etc/caddy/Caddyfile',
          adapter: 'caddyfile',
          version: 'v2.10.0',
        },
        {
          serviceName: 'caddy-edge.service',
          caddyBinary: '/usr/bin/caddy',
          configPath: '/etc/caddy/edge.Caddyfile',
          adapter: 'caddyfile',
          version: 'v2.10.0',
        },
      ],
    })

    expect(mapped.candidates.map(item => item.serviceName)).toEqual([
      'caddy.service',
      'caddy-edge.service',
    ])
    expect(mapped.candidates[1]?.configPath).toBe('/etc/caddy/edge.Caddyfile')
    expect(mapped.skipped).toEqual([])
  })

  it('keeps skipped systemd units out of warning banners', () => {
    const mapped = mapDiscovery({
      supported: true,
      platform: 'Linux',
      serviceName: 'caddy.service',
      serviceNames: ['caddy.service', 'caddy-api.service'],
      caddyBinary: '/usr/bin/caddy',
      configPath: '/etc/caddy/Caddyfile',
      adapter: 'caddyfile',
      sudoAvailable: true,
      warnings: ['当前提权方式不可用，无法写入配置或控制服务'],
      candidates: [{
        serviceName: 'caddy.service',
        caddyBinary: '/usr/bin/caddy',
        configPath: '/etc/caddy/Caddyfile',
        adapter: 'caddyfile',
        version: 'v2.11.4 h1:XKxkMTgNSizEvKG6QHue6cAsFOteU2qA61w2tKkCWi0=',
      }],
      skipped: [{ serviceName: 'caddy-api.service', reason: '不支持 Caddy API-only 服务' }],
    })

    expect(mapped.skipped).toEqual([
      { serviceName: 'caddy-api.service', reason: '不支持 Caddy API-only 服务' },
    ])
    expect(mapped.warnings).toEqual(['当前提权方式不可用，无法写入配置或控制服务'])
    expect(shortCaddyVersion(mapped.candidates[0]?.caddyVersion)).toBe('v2.11.4')
  })

  it('never includes authentication or sudo secrets in the host-key scan payload', () => {
    const connection: ServerConnectionInput = {
      name: 'production',
      host: '192.0.2.10',
      port: 22,
      username: 'root',
      authMethod: 'privateKey',
      privateKey: 'PRIVATE KEY MATERIAL',
      privateKeyPassphrase: 'private-key-passphrase',
      privilegeMode: 'sudo-password',
      sudoPassword: 'sudo-secret',
    };

    expect(buildHostKeyRequest(connection)).toEqual({ host: '192.0.2.10', port: 22 });
  });

  it('keeps the probed Caddy version when building the create request', () => {
    const input: CreateServerInput = {
      name: 'production',
      host: '192.0.2.10',
      port: 22,
      username: 'root',
      authMethod: 'password',
      password: 'ssh-password',
      privilegeMode: 'root',
      hostFingerprint: 'SHA256:Abc123+/example',
      serviceName: 'caddy.service',
      caddyBinary: '/usr/bin/caddy',
      caddyVersion: 'v2.10.0',
      configPath: '/etc/caddy/Caddyfile',
      adapter: 'caddyfile',
    };

    expect(buildCreateServerRequest(input)).toMatchObject({ caddyVersion: 'v2.10.0' });
  });

  it('preserves query parameters when proxying to Nest', () => {
    expect(
      buildApiTarget('http://127.0.0.1:3001/', 'operations', '?serverId=server-1&limit=10'),
    ).toBe('http://127.0.0.1:3001/api/operations?serverId=server-1&limit=10');
  });

  it('uses the socket address unless the outer proxy is explicitly trusted', () => {
    expect(resolveProxyClientIp('198.51.100.20', '203.0.113.20', false)).toBe('198.51.100.20');
    expect(resolveProxyClientIp('198.51.100.20', '203.0.113.20, 198.51.100.20', true)).toBe(
      '203.0.113.20',
    );
    expect(resolveProxyClientIp('::ffff:198.51.100.20', 'not-an-ip', true)).toBe('198.51.100.20');
    expect(trustForwardedClientIp('1')).toBe(true);
    expect(trustForwardedClientIp('false')).toBe(false);
    expect(INTERNAL_CLIENT_IP_HEADER).toBe('x-caddy-mgr-client-ip');
  });

  it('accepts only single-slash local post-login redirects', () => {
    expect(safeRedirectPath('/servers/server-1?tab=config')).toBe('/servers/server-1?tab=config');
    expect(safeRedirectPath('//evil.example/session')).toBe('/');
    expect(safeRedirectPath('/\\evil.example/session')).toBe('/');
    expect(safeRedirectPath('https://evil.example/session')).toBe('/');
  });

  it('normalizes the nested Nest error envelope', () => {
    const error = normalizeApiError({
      statusCode: 409,
      data: {
        error: {
          code: 'CONFIG_CONFLICT',
          message: '远端配置已更改',
          details: { currentHash: 'abc' },
        },
      },
    });
    expect(error).toMatchObject({
      statusCode: 409,
      code: 'CONFIG_CONFLICT',
      message: '远端配置已更改',
      details: { currentHash: 'abc' },
    });
  });
});
