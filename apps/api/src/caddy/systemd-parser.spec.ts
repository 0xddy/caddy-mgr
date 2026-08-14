import { extractExecCommand, flagValue, flagValues, parseEnvironmentFiles, parseSystemdProperties, shellWords } from './systemd-parser';

describe('systemd command parsing', () => {
  it('parses property values containing equals signs', () => {
    expect(parseSystemdProperties('User=caddy\nEnvironment=FOO=a=b\n').Environment).toBe('FOO=a=b');
  });

  it('extracts quoted Caddyfile paths from ExecStart', () => {
    const args = extractExecCommand('{ path=/usr/bin/caddy ; argv[]=/usr/bin/caddy run --config "/etc/caddy/My File" --adapter=caddyfile ; }');
    expect(flagValue(args, '--config')).toBe('/etc/caddy/My File');
    expect(flagValue(args, '--adapter')).toBe('caddyfile');
  });

  it('handles shell quoting without evaluating it', () => {
    expect(shellWords("caddy run --config '/etc/caddy/Caddyfile'")).toEqual(['caddy', 'run', '--config', '/etc/caddy/Caddyfile']);
  });

  it('parses required and optional systemd EnvironmentFile entries', () => {
    expect(parseEnvironmentFiles('/etc/caddy/main.env (ignore_errors=no) /etc/caddy/optional\\x20file.env (ignore_errors=yes)')).toEqual([
      '/etc/caddy/main.env',
      '-/etc/caddy/optional file.env',
    ]);
  });

  it('preserves Caddy --envfile values and their argv order', () => {
    const args = extractExecCommand('{ path=/usr/bin/caddy ; argv[]=/usr/bin/caddy run --envfile /etc/caddy/first.env --envfile=/etc/caddy/second.env --config /etc/caddy/Caddyfile ; }');
    expect(flagValues(args, '--envfile')).toEqual(['/etc/caddy/first.env', '/etc/caddy/second.env']);
    expect(flagValue(args, '--envfile')).toBe('/etc/caddy/second.env');
  });
});
