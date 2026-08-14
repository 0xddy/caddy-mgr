import { randomBytes, randomInt } from 'node:crypto';

const CAPTCHA_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface CaptchaChallenge {
  code: string;
  imageSvg: string;
}

function randomChar(): string {
  return CAPTCHA_ALPHABET[randomInt(CAPTCHA_ALPHABET.length)];
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Distorted SVG captcha — no native deps; characters stay readable to humans. */
export function createCaptchaChallenge(length = 4): CaptchaChallenge {
  const code = Array.from({ length }, () => randomChar()).join('');
  const width = 148;
  const height = 48;
  const noise: string[] = [];

  for (let index = 0; index < 6; index += 1) {
    const x1 = randomInt(0, width);
    const y1 = randomInt(0, height);
    const x2 = randomInt(0, width);
    const y2 = randomInt(0, height);
    noise.push(
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(148,163,184,0.55)" stroke-width="1"/>`,
    );
  }
  for (let index = 0; index < 18; index += 1) {
    const cx = randomInt(0, width);
    const cy = randomInt(0, height);
    noise.push(`<circle cx="${cx}" cy="${cy}" r="1.2" fill="rgba(148,163,184,0.7)"/>`);
  }

  const glyphs = [...code].map((char, index) => {
    const x = 22 + index * 30 + randomInt(-3, 4);
    const y = 30 + randomInt(-4, 5);
    const rotate = randomInt(-28, 29);
    const size = 22 + randomInt(0, 5);
    return `<text x="${x}" y="${y}" fill="#e2e8f0" font-size="${size}" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-weight="700" transform="rotate(${rotate} ${x} ${y})">${escapeXml(char)}</text>`;
  });

  const imageSvg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="captcha">`,
    `<rect width="100%" height="100%" rx="8" fill="#0f172a"/>`,
    ...noise,
    ...glyphs,
    `</svg>`,
  ].join('');

  return { code, imageSvg };
}

export function newCaptchaId(): string {
  return randomBytes(16).toString('base64url');
}

export function normalizeCaptchaCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}
