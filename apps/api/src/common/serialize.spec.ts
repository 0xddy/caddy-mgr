import { assertAbsolutePath, assertSystemdUnit, shellQuote } from './serialize';

describe('remote shell safety', () => {
  it('quotes apostrophes without permitting interpolation', () => {
    expect(shellQuote("a'b;$HOME")).toBe("'a'\"'\"'b;$HOME'");
  });

  it('accepts strict systemd service unit names', () => {
    expect(() => assertSystemdUnit('caddy@edge-1.service')).not.toThrow();
    expect(() => assertSystemdUnit('caddy.service; reboot')).toThrow();
  });

  it('requires canonical absolute remote paths', () => {
    expect(() => assertAbsolutePath('/etc/caddy/Caddyfile')).not.toThrow();
    expect(() => assertAbsolutePath('/')).not.toThrow();
    expect(() => assertAbsolutePath('../Caddyfile')).toThrow();
    expect(() => assertAbsolutePath('/etc/caddy/../../etc/shadow')).toThrow();
    expect(() => assertAbsolutePath('/etc/caddy/./Caddyfile')).toThrow();
    expect(() => assertAbsolutePath('//etc/caddy/Caddyfile')).toThrow();
    expect(() => assertAbsolutePath('/etc/caddy/')).toThrow();
  });
});
