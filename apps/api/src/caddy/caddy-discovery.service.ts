import { Injectable } from '@nestjs/common';
import type { DiscoveryCandidate, DiscoveryResult } from '../common/contracts';
import { assertSystemdUnit, shellQuote } from '../common/serialize';
import type { ExecResult } from '../ssh/ssh.types';
import type { SshSession } from '../ssh/ssh.service';
import { extractExecCommand, flagValue, flagValues, parseEnvironmentFiles, parseSystemdProperties } from './systemd-parser';

type UnitInspection =
  | { supported: true; candidate: DiscoveryCandidate }
  | { supported: false; serviceName: string; reason: string };

@Injectable()
export class CaddyDiscoveryService {
  async discover(session: SshSession): Promise<DiscoveryResult> {
    const warnings: string[] = [];
    const platformResult = await session.exec('uname -s');
    const platform = platformResult.stdout.trim();
    if (platformResult.code !== 0 || platform !== 'Linux') {
      return this.unsupported('仅支持 Linux 服务器', { platform: platform || 'unknown' });
    }
    const systemd = await session.exec('command -v systemctl >/dev/null 2>&1');
    if (systemd.code !== 0) {
      return this.unsupported('目标服务器未使用 systemd', { platform });
    }
    const privilege = await session.exec('id -u', { elevated: true });
    const sudoAvailable = privilege.code === 0 && privilege.stdout.trim() === '0';
    if (!sudoAvailable) warnings.push('当前提权方式不可用，无法写入配置或控制服务');

    const unitsResult = await session.exec(
      "systemctl list-unit-files --type=service --no-legend 'caddy*.service' 2>/dev/null | awk '{print $1}'",
    );
    const serviceNames = [...new Set(unitsResult.stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^caddy[^/]*\.service$/.test(line)))];
    if (serviceNames.length === 0) {
      const known = await session.exec('systemctl show caddy.service -p LoadState --value 2>/dev/null');
      if (known.stdout.trim() !== 'not-found' && known.stdout.trim()) serviceNames.push('caddy.service');
    }
    if (serviceNames.length === 0) {
      return this.unsupported('未检测到 Caddy systemd unit', { platform, sudoAvailable, warnings });
    }

    const context: InspectionContext = { fallbackBinary: undefined, versions: new Map() };
    const candidates: DiscoveryCandidate[] = [];
    const skipped: DiscoveryResult['skipped'] = [];
    for (const serviceName of this.sortServiceNames(serviceNames)) {
      const inspected = await this.inspectUnit(session, serviceName, context);
      if (inspected.supported) candidates.push(inspected.candidate);
      else skipped.push({ serviceName: inspected.serviceName, reason: inspected.reason });
    }

    if (candidates.length === 0) {
      return this.unsupported(
        serviceNames.length > 1
          ? '检测到多个 Caddy systemd unit，但没有可管理的 Caddyfile 实例'
          : (skipped.at(-1)?.reason || '未发现可靠的 Caddyfile systemd 实例'),
        { platform, serviceNames, sudoAvailable, warnings, skipped },
      );
    }

    return applyPreferredCandidate({
      supported: sudoAvailable,
      ...(!sudoAvailable ? { reason: '没有可用的 root/sudo 权限' } : {}),
      platform,
      serviceNames,
      sudoAvailable,
      warnings,
      candidates,
      skipped,
    });
  }

  /**
   * `/etc/caddy/Caddyfile` is an implicit default only for the unmodified shape
   * of Caddy's Debian/Ubuntu package unit. Custom units must name `--config`.
   */
  private async isVerifiedAptStandardUnit(
    session: SshSession,
    serviceName: string,
    caddyBinary: string,
    argv: string[],
    properties: Record<string, string>,
  ): Promise<boolean> {
    const fragmentPath = properties.FragmentPath?.trim();
    const packageUnitPaths = new Set([
      '/lib/systemd/system/caddy.service',
      '/usr/lib/systemd/system/caddy.service',
    ]);
    if (
      serviceName !== 'caddy.service'
      || caddyBinary !== '/usr/bin/caddy'
      || argv[0] !== '/usr/bin/caddy'
      || argv[1] !== 'run'
      || !argv.includes('--environ')
      || !fragmentPath
      || !packageUnitPaths.has(fragmentPath)
      || Boolean(properties.DropInPaths?.trim())
    ) {
      return false;
    }

    const owner = await session.exec(`dpkg-query -S -- ${shellQuote(fragmentPath)} 2>/dev/null`);
    if (owner.code !== 0) return false;
    return owner.stdout.split(/\r?\n/).some((line) => {
      const match = line.trim().match(/^caddy(?::[^:]+)?:\s+(.+)$/);
      return match?.[1] === fragmentPath;
    });
  }

  private async inspectUnit(session: SshSession, serviceName: string, context: InspectionContext): Promise<UnitInspection> {
    try {
      assertSystemdUnit(serviceName);
    } catch {
      return { supported: false, serviceName, reason: 'systemd unit 名称无效' };
    }
    if (/caddy-api/i.test(serviceName)) {
      return { supported: false, serviceName, reason: '不支持 Caddy API-only 服务' };
    }
    const show = await session.exec(
      `systemctl show ${shellQuote(serviceName)} -p ExecStart -p ExecReload -p User -p Group -p WorkingDirectory -p Environment -p EnvironmentFiles -p FragmentPath -p DropInPaths`,
    );
    const properties = parseSystemdProperties(show.stdout);
    const argv = extractExecCommand(properties.ExecStart ?? '');
    const execStart = argv.join(' ');
    const execReload = properties.ExecReload ?? '';
    const environmentFiles = parseEnvironmentFiles(properties.EnvironmentFiles ?? '');
    const caddyEnvFiles = flagValues(argv, '--envfile');
    let caddyBinary = argv[0]?.startsWith('/') ? argv[0] : undefined;
    if (!caddyBinary) {
      if (context.fallbackBinary === undefined) {
        const binary = await session.exec('command -v caddy || true');
        context.fallbackBinary = binary.stdout.trim() || '/usr/bin/caddy';
      }
      caddyBinary = context.fallbackBinary;
    }
    const adapter = flagValue(argv, '--adapter') ?? 'caddyfile';
    let configPath = flagValue(argv, '--config');
    if (!configPath && /\bresume\b/.test(execStart)) {
      return { supported: false, serviceName, reason: '检测到 Caddy API/autosave 启动模式' };
    }
    if (!configPath && await this.isVerifiedAptStandardUnit(session, serviceName, caddyBinary, argv, properties)) {
      const standard = await session.exec("test -f /etc/caddy/Caddyfile && printf '%s' /etc/caddy/Caddyfile");
      configPath = standard.stdout.trim() || undefined;
    }
    if (adapter.toLowerCase() !== 'caddyfile') {
      return { supported: false, serviceName, reason: `不支持 ${adapter} adapter` };
    }
    if (!configPath?.startsWith('/')) {
      return { supported: false, serviceName, reason: '无法可靠确定 Caddyfile 绝对路径' };
    }
    if (caddyEnvFiles.some((path) => !path)) {
      return { supported: false, serviceName, reason: 'Caddy ExecStart 中的 --envfile 参数缺少路径，无法安全复用运行环境' };
    }
    let versionResult = context.versions.get(caddyBinary);
    if (!versionResult) {
      versionResult = await session.exec(`${shellQuote(caddyBinary)} version`);
      context.versions.set(caddyBinary, versionResult);
    }
    if (versionResult.code !== 0) {
      return { supported: false, serviceName, reason: '检测到的 Caddy 二进制不可执行' };
    }
    return {
      supported: true,
      candidate: {
        serviceName,
        caddyBinary,
        configPath,
        adapter,
        serviceUser: properties.User || null,
        workingDirectory: properties.WorkingDirectory || '/',
        environmentFiles,
        caddyEnvFiles,
        hasEnvironment: Boolean(properties.Environment),
        execStart,
        execReload,
        version: versionResult.stdout.trim() || versionResult.stderr.trim(),
      },
    };
  }

  private sortServiceNames(serviceNames: string[]): string[] {
    return [...serviceNames].sort((left, right) => {
      if (left === 'caddy.service') return -1;
      if (right === 'caddy.service') return 1;
      return left.localeCompare(right);
    });
  }

  private unsupported(
    reason: string,
    extras: Partial<DiscoveryResult> = {},
  ): DiscoveryResult {
    return {
      supported: false,
      reason,
      platform: extras.platform ?? 'unknown',
      serviceNames: extras.serviceNames ?? [],
      sudoAvailable: extras.sudoAvailable ?? false,
      warnings: extras.warnings ?? [],
      candidates: extras.candidates ?? [],
      skipped: extras.skipped ?? [],
    };
  }
}

interface InspectionContext {
  fallbackBinary: string | undefined;
  versions: Map<string, ExecResult>;
}

export function applyPreferredCandidate(
  result: Pick<DiscoveryResult, 'supported' | 'reason' | 'platform' | 'serviceNames' | 'sudoAvailable' | 'warnings' | 'candidates' | 'skipped'> & Partial<DiscoveryResult>,
  preferredServiceName?: string,
): DiscoveryResult {
  const selected =
    result.candidates.find((item) => item.serviceName === preferredServiceName)
    ?? result.candidates.find((item) => item.serviceName === 'caddy.service')
    ?? result.candidates[0];
  if (!selected) {
    return { ...result, candidates: result.candidates, skipped: result.skipped ?? [] };
  }
  return {
    ...result,
    serviceName: selected.serviceName,
    caddyBinary: selected.caddyBinary,
    configPath: selected.configPath,
    adapter: selected.adapter,
    serviceUser: selected.serviceUser ?? null,
    workingDirectory: selected.workingDirectory,
    environmentFiles: selected.environmentFiles,
    caddyEnvFiles: selected.caddyEnvFiles,
    hasEnvironment: selected.hasEnvironment,
    execStart: selected.execStart,
    execReload: selected.execReload,
    version: selected.version,
    candidates: result.candidates,
    skipped: result.skipped ?? [],
  };
}
