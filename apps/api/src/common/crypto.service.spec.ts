import { randomBytes } from 'node:crypto';
import { decryptUtf8, encryptUtf8 } from './crypto.service';

describe('AES-GCM storage format', () => {
  it('round-trips UTF-8 plaintext and rejects tampering', () => {
    const key = randomBytes(32);
    const encoded = encryptUtf8(key, 'secret value');
    expect(encoded.startsWith('v1.')).toBe(true);
    expect(decryptUtf8(key, encoded)).toBe('secret value');

    const parts = encoded.split('.');
    const ciphertext = Buffer.from(parts[3]!, 'base64url');
    ciphertext[0] ^= 1;
    parts[3] = ciphertext.toString('base64url');
    expect(() => decryptUtf8(key, parts.join('.'))).toThrow();
  });

  it('rejects malformed envelopes', () => {
    const key = randomBytes(32);
    expect(() => decryptUtf8(key, 'v2.abc.def.ghi')).toThrow('Unsupported encrypted value');
    expect(() => decryptUtf8(key, encryptUtf8(key, 'ok') + '.extra')).toThrow('Unsupported encrypted value');
  });
});
