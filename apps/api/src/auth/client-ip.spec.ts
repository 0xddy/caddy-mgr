import { describe, expect, it } from 'vitest';
import type { Request } from 'express';

import { clientIp } from './client-ip';

function fakeRequest(partial: {
  remoteAddress?: string;
  internalClientIp?: string;
  forwardedFor?: string;
  ip?: string;
}): Request {
  return {
    ip: partial.ip,
    socket: { remoteAddress: partial.remoteAddress },
    headers: {
      ...(partial.internalClientIp ? { 'x-caddy-mgr-client-ip': partial.internalClientIp } : {}),
      ...(partial.forwardedFor ? { 'x-forwarded-for': partial.forwardedFor } : {}),
    },
  } as unknown as Request;
}

describe('clientIp', () => {
  it('reads the Nuxt internal address when the peer is loopback', () => {
    expect(
      clientIp(
        fakeRequest({
          remoteAddress: '127.0.0.1',
          internalClientIp: '203.0.113.50',
        }),
      ),
    ).toBe('203.0.113.50');
  });

  it('ignores browser-controlled standard forwarding headers', () => {
    expect(
      clientIp(
        fakeRequest({
          remoteAddress: '::ffff:127.0.0.1',
          forwardedFor: '203.0.113.50',
        }),
      ),
    ).toBe('127.0.0.1');
  });

  it('ignores the internal header from non-loopback peers', () => {
    expect(
      clientIp(
        fakeRequest({
          remoteAddress: '198.51.100.9',
          internalClientIp: '203.0.113.50',
          ip: '198.51.100.9',
        }),
      ),
    ).toBe('198.51.100.9');
  });

  it('rejects malformed internal addresses and falls back to the peer', () => {
    expect(
      clientIp(
        fakeRequest({
          remoteAddress: '127.0.0.1',
          internalClientIp: 'not-an-ip',
        }),
      ),
    ).toBe('127.0.0.1');
  });
});
