import type { SshSession } from '../ssh/ssh.service';
import { applyPreferredCandidate, CaddyDiscoveryService } from './caddy-discovery.service';

interface SessionFixtureOptions {
  fragmentPath?: string;
  dropInPaths?: string;
  aptOwned?: boolean;
  standardConfigExists?: boolean;
  units?: string[];
  execStartByUnit?: Record<string, string>;
  fragmentPathByUnit?: Record<string, string>;
  dropInPathsByUnit?: Record<string, string>;
}

function session(execStart: string, options: SessionFixtureOptions = {}): SshSession & { commands: string[] } {
  const commands: string[] = [];
  const units = options.units ?? ['caddy.service'];
  const fixture = {
    commands,
    exec: async (command: string) => {
      commands.push(command);
      if (command === 'uname -s') return { code: 0, stdout: 'Linux\n', stderr: '' };
      if (command.startsWith('command -v systemctl')) return { code: 0, stdout: '', stderr: '' };
      if (command === 'id -u') return { code: 0, stdout: '0\n', stderr: '' };
      if (command.includes('list-unit-files')) return { code: 0, stdout: `${units.join('\n')}\n`, stderr: '' };
      if (command.startsWith('systemctl show caddy.service -p LoadState')) return { code: 0, stdout: 'loaded\n', stderr: '' };
      const showUnit = command.match(/^systemctl show '([^']+)' /)?.[1];
      if (showUnit) {
        return {
          code: 0,
          stderr: '',
          stdout: [
            `ExecStart={ path=/usr/bin/caddy ; argv[]=${options.execStartByUnit?.[showUnit] ?? execStart} ; }`,
            'ExecReload=',
            'User=',
            'Group=',
            'WorkingDirectory=/etc/caddy',
            'Environment=',
            'EnvironmentFiles=/etc/caddy/service.env (ignore_errors=no)',
            `FragmentPath=${options.fragmentPathByUnit?.[showUnit] ?? options.fragmentPath ?? '/usr/lib/systemd/system/caddy.service'}`,
            `DropInPaths=${options.dropInPathsByUnit?.[showUnit] ?? options.dropInPaths ?? ''}`,
          ].join('\n'),
        };
      }
      if (command.startsWith('dpkg-query -S -- ')) {
        return options.aptOwned === false
          ? { code: 1, stdout: '', stderr: 'no path found' }
          : { code: 0, stdout: `caddy: ${options.fragmentPath ?? '/usr/lib/systemd/system/caddy.service'}\n`, stderr: '' };
      }
      if (command.includes('test -f /etc/caddy/Caddyfile')) {
        return options.standardConfigExists === false
          ? { code: 1, stdout: '', stderr: '' }
          : { code: 0, stdout: '/etc/caddy/Caddyfile', stderr: '' };
      }
      if (command === "'/usr/bin/caddy' version") return { code: 0, stdout: 'v2.10.0\n', stderr: '' };
      return { code: 1, stdout: '', stderr: 'unexpected command' };
    },
  } as unknown as SshSession & { commands: string[] };
  return fixture;
}

describe('CaddyDiscoveryService environment discovery', () => {
  it('records Caddy --envfile without exposing its contents and keeps empty User as root', async () => {
    const service = new CaddyDiscoveryService();
    const result = await service.discover(session('/usr/bin/caddy run --config /etc/caddy/Caddyfile --adapter caddyfile --envfile /etc/caddy/caddy.env'));

    expect(result.supported).toBe(true);
    expect(result.serviceUser).toBeNull();
    expect(result.environmentFiles).toEqual(['/etc/caddy/service.env']);
    expect(result.caddyEnvFiles).toEqual(['/etc/caddy/caddy.env']);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.serviceName).toBe('caddy.service');
  });

  it('marks a malformed Caddy --envfile startup as unsupported instead of validating bare', async () => {
    const service = new CaddyDiscoveryService();
    const result = await service.discover(session('/usr/bin/caddy run --config /etc/caddy/Caddyfile --adapter caddyfile --envfile'));

    expect(result.supported).toBe(false);
    expect(result.reason).toContain('--envfile');
    expect(result.candidates).toEqual([]);
  });

  it('uses the conventional Caddyfile only for a package-owned standard apt unit', async () => {
    const service = new CaddyDiscoveryService();
    const fixture = session('/usr/bin/caddy run --environ');
    const result = await service.discover(fixture);

    expect(result.supported).toBe(true);
    expect(result.configPath).toBe('/etc/caddy/Caddyfile');
    expect(fixture.commands.some((command) => command.startsWith('dpkg-query -S -- '))).toBe(true);
    expect(fixture.commands.some((command) => command.includes('test -f /etc/caddy/Caddyfile'))).toBe(true);
  });

  it('does not guess /etc/caddy/Caddyfile for a custom unit without --config', async () => {
    const service = new CaddyDiscoveryService();
    const fixture = session('/usr/local/bin/caddy run', {
      fragmentPath: '/etc/systemd/system/caddy.service',
    });
    const result = await service.discover(fixture);

    expect(result.supported).toBe(false);
    expect(result.configPath).toBeUndefined();
    expect(result.reason).toContain('无法可靠确定');
    expect(fixture.commands.some((command) => command.includes('test -f /etc/caddy/Caddyfile'))).toBe(false);
  });

  it('skips caddy-api.service and keeps the Caddyfile unit when both exist', async () => {
    const service = new CaddyDiscoveryService();
    const result = await service.discover(session(
      '/usr/bin/caddy run --config /etc/caddy/Caddyfile --adapter caddyfile',
      { units: ['caddy-api.service', 'caddy.service'] },
    ));

    expect(result.supported).toBe(true);
    expect(result.serviceName).toBe('caddy.service');
    expect(result.serviceNames).toEqual(['caddy-api.service', 'caddy.service']);
    expect(result.candidates).toEqual([
      expect.objectContaining({
        serviceName: 'caddy.service',
        configPath: '/etc/caddy/Caddyfile',
      }),
    ]);
    expect(result.skipped).toEqual([
      { serviceName: 'caddy-api.service', reason: '不支持 Caddy API-only 服务' },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('returns every usable Caddyfile unit so the UI can choose', async () => {
    const service = new CaddyDiscoveryService();
    const result = await service.discover(session(
      '/usr/bin/caddy run --config /etc/caddy/Caddyfile --adapter caddyfile',
      {
        units: ['caddy-edge.service', 'caddy.service'],
        execStartByUnit: {
          'caddy.service': '/usr/bin/caddy run --config /etc/caddy/Caddyfile --adapter caddyfile',
          'caddy-edge.service': '/usr/bin/caddy run --config /etc/caddy/edge.Caddyfile --adapter caddyfile',
        },
      },
    ));

    expect(result.supported).toBe(true);
    expect(result.serviceName).toBe('caddy.service');
    expect(result.candidates.map((item) => item.serviceName)).toEqual(['caddy.service', 'caddy-edge.service']);
    expect(result.candidates.map((item) => item.configPath)).toEqual([
      '/etc/caddy/Caddyfile',
      '/etc/caddy/edge.Caddyfile',
    ]);
    expect(applyPreferredCandidate(result, 'caddy-edge.service').serviceName).toBe('caddy-edge.service');
    expect(applyPreferredCandidate(result, 'caddy-edge.service').configPath).toBe('/etc/caddy/edge.Caddyfile');
  });
});
