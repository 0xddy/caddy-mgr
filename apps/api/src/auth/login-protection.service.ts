import { Injectable } from '@nestjs/common';
import { AppError } from '../common/app-error';
import { runtimeConfig } from '../common/runtime-config';
import { createCaptchaChallenge, newCaptchaId, normalizeCaptchaCode } from './captcha';

interface CaptchaEntry {
  code: string;
  expiresAt: number;
}

interface FailureBucket {
  failures: number;
  windowStartedAt: number;
  lockedUntil: number;
}

export interface CaptchaIssue {
  captchaId: string;
  imageSvg: string;
  expiresInSeconds: number;
  debugCode?: string;
}

@Injectable()
export class LoginProtectionService {
  private readonly captchas = new Map<string, CaptchaEntry>();
  private readonly failures = new Map<string, FailureBucket>();
  private readonly captchaIssuedAt = new Map<string, number[]>();

  createCaptcha(clientIp: string): CaptchaIssue {
    this.prune();
    this.assertCaptchaIssueAllowed(clientIp);

    const challenge = createCaptchaChallenge();
    const captchaId = newCaptchaId();
    const expiresInSeconds = runtimeConfig.captchaTtlSeconds;
    this.captchas.set(captchaId, {
      code: normalizeCaptchaCode(challenge.code),
      expiresAt: Date.now() + expiresInSeconds * 1000,
    });

    const issued = this.captchaIssuedAt.get(clientIp) ?? [];
    issued.push(Date.now());
    this.captchaIssuedAt.set(clientIp, issued);

    return {
      captchaId,
      imageSvg: challenge.imageSvg,
      expiresInSeconds,
      ...(runtimeConfig.captchaDebugCode ? { debugCode: challenge.code } : {}),
    };
  }

  assertNotLocked(clientIp: string): void {
    this.prune();
    const bucket = this.failures.get(clientIp);
    if (!bucket) return;
    if (bucket.lockedUntil > Date.now()) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.lockedUntil - Date.now()) / 1000));
      throw new AppError(
        'LOGIN_RATE_LIMITED',
        `登录尝试过于频繁，请 ${retryAfterSeconds} 秒后重试`,
        429,
        {
          retryAfterSeconds,
        },
      );
    }
    if (bucket.lockedUntil > 0) this.failures.delete(clientIp);
  }

  consumeCaptcha(captchaId: string, captchaCode: string): void {
    this.prune();
    const entry = this.captchas.get(captchaId);
    this.captchas.delete(captchaId);
    if (!entry || entry.expiresAt <= Date.now()) {
      throw new AppError('INVALID_CAPTCHA', '验证码已失效，请刷新后重试', 400);
    }
    if (normalizeCaptchaCode(captchaCode) !== entry.code) {
      throw new AppError('INVALID_CAPTCHA', '验证码错误', 400);
    }
  }

  recordFailure(clientIp: string): void {
    this.prune();
    const now = Date.now();
    const windowMs = runtimeConfig.loginFailureWindowSeconds * 1000;
    const existing = this.failures.get(clientIp);
    const bucket: FailureBucket =
      existing && now - existing.windowStartedAt < windowMs
        ? existing
        : { failures: 0, windowStartedAt: now, lockedUntil: 0 };

    bucket.failures += 1;
    if (bucket.failures >= runtimeConfig.loginMaxFailures) {
      bucket.lockedUntil = now + runtimeConfig.loginLockoutSeconds * 1000;
    }
    this.failures.set(clientIp, bucket);
  }

  clearFailures(clientIp: string): void {
    this.failures.delete(clientIp);
  }

  private assertCaptchaIssueAllowed(clientIp: string): void {
    const windowMs = 60_000;
    const now = Date.now();
    const recent = (this.captchaIssuedAt.get(clientIp) ?? []).filter((at) => now - at < windowMs);
    this.captchaIssuedAt.set(clientIp, recent);
    if (recent.length >= runtimeConfig.captchaMaxPerMinute) {
      throw new AppError('CAPTCHA_RATE_LIMITED', '验证码请求过于频繁，请稍后再试', 429, {
        retryAfterSeconds: 60,
      });
    }
  }

  private prune(): void {
    const now = Date.now();
    for (const [id, entry] of this.captchas) {
      if (entry.expiresAt <= now) this.captchas.delete(id);
    }
    for (const [ip, bucket] of this.failures) {
      const windowExpired =
        now - bucket.windowStartedAt > runtimeConfig.loginFailureWindowSeconds * 1000;
      const unlocked = bucket.lockedUntil <= now;
      if (windowExpired && unlocked) this.failures.delete(ip);
    }
    for (const [ip, issued] of this.captchaIssuedAt) {
      const recent = issued.filter((at) => now - at < 60_000);
      if (recent.length) this.captchaIssuedAt.set(ip, recent);
      else this.captchaIssuedAt.delete(ip);
    }
  }
}
