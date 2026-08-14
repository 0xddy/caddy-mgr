import { describe, expect, it } from 'vitest';
import { createCaptchaChallenge, normalizeCaptchaCode } from './captcha';

describe('captcha', () => {
  it('creates a four-character challenge embedded in svg', () => {
    const challenge = createCaptchaChallenge();
    expect(challenge.code).toMatch(/^[A-Z0-9]{4}$/);
    expect(challenge.imageSvg).toContain('<svg');
    for (const char of challenge.code) {
      expect(challenge.imageSvg).toContain(char);
    }
  });

  it('normalizes captcha input case-insensitively', () => {
    expect(normalizeCaptchaCode(' ab-12 ')).toBe('AB12');
  });
});
