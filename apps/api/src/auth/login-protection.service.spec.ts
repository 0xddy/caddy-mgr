import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../common/app-error';
import { LoginProtectionService } from './login-protection.service';

vi.mock('../common/runtime-config', () => ({
  runtimeConfig: {
    captchaTtlSeconds: 300,
    captchaMaxPerMinute: 30,
    captchaDebugCode: true,
    loginMaxFailures: 3,
    loginFailureWindowSeconds: 900,
    loginLockoutSeconds: 600,
  },
}));

describe('LoginProtectionService', () => {
  let protection: LoginProtectionService;

  beforeEach(() => {
    protection = new LoginProtectionService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('issues a captcha that can be consumed once', () => {
    const issued = protection.createCaptcha('127.0.0.1');
    expect(issued.captchaId).toBeTruthy();
    expect(issued.imageSvg).toContain('<svg');
    expect(issued.debugCode).toMatch(/^[A-Z0-9]{4}$/);

    protection.consumeCaptcha(issued.captchaId, issued.debugCode!.toLowerCase());
    expect(() => protection.consumeCaptcha(issued.captchaId, issued.debugCode!)).toThrow(AppError);
  });

  it('rejects wrong captcha codes', () => {
    const issued = protection.createCaptcha('127.0.0.1');
    expect(() => protection.consumeCaptcha(issued.captchaId, 'XXXX')).toThrow(/验证码错误/);
  });

  it('locks an IP after repeated failures', () => {
    const ip = '203.0.113.10';
    protection.recordFailure(ip);
    protection.recordFailure(ip);
    protection.assertNotLocked(ip);
    protection.recordFailure(ip);
    expect(() => protection.assertNotLocked(ip)).toThrow(/登录尝试过于频繁/);
  });

  it('clears failures after successful login path', () => {
    const ip = '203.0.113.11';
    protection.recordFailure(ip);
    protection.recordFailure(ip);
    protection.recordFailure(ip);
    protection.clearFailures(ip);
    expect(() => protection.assertNotLocked(ip)).not.toThrow();
  });

  it('keeps failure buckets isolated per forwarded client address', () => {
    const noisyClient = '203.0.113.20';
    protection.recordFailure(noisyClient);
    protection.recordFailure(noisyClient);
    protection.recordFailure(noisyClient);

    expect(() => protection.assertNotLocked(noisyClient)).toThrow(/登录尝试过于频繁/);
    expect(() => protection.assertNotLocked('203.0.113.21')).not.toThrow();
  });

  it('starts a fresh failure bucket after a lock expires', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-14T00:00:00Z'));
    const ip = '203.0.113.22';
    protection.recordFailure(ip);
    protection.recordFailure(ip);
    protection.recordFailure(ip);
    expect(() => protection.assertNotLocked(ip)).toThrow(AppError);

    vi.advanceTimersByTime(600_001);
    expect(() => protection.assertNotLocked(ip)).not.toThrow();
    protection.recordFailure(ip);
    expect(() => protection.assertNotLocked(ip)).not.toThrow();
  });
});
