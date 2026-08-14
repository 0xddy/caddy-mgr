import type { Request } from 'express';
import { isIP } from 'node:net';

const INTERNAL_CLIENT_IP_HEADER = 'x-caddy-mgr-client-ip';

function normalizeIp(address: string | undefined): string | undefined {
  const candidate = address?.trim();
  if (!candidate) return undefined;
  const ipv4Mapped = candidate.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i)?.[1];
  const normalized = ipv4Mapped ?? candidate;
  return isIP(normalized) ? normalized : undefined;
}

function isLoopbackAddress(address: string | undefined): boolean {
  const normalized = normalizeIp(address);
  return normalized === '::1' || normalized?.startsWith('127.') === true;
}

/** Trust the internal client address only when the API peer is the loopback Nuxt proxy. */
export function clientIp(request: Request): string {
  const remote = request.socket.remoteAddress;
  if (isLoopbackAddress(remote)) {
    const forwarded = request.headers[INTERNAL_CLIENT_IP_HEADER];
    const normalized = normalizeIp(typeof forwarded === 'string' ? forwarded : forwarded?.[0]);
    if (normalized) return normalized;
  }
  return normalizeIp(remote) || 'unknown';
}
