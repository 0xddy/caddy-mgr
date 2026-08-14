import { isIP } from 'node:net';

export const INTERNAL_CLIENT_IP_HEADER = 'x-caddy-mgr-client-ip';

function normalizeIp(value: string | undefined): string | undefined {
  const candidate = value?.trim();
  if (!candidate) return undefined;

  const ipv4Mapped = candidate.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i)?.[1];
  const normalized = ipv4Mapped || candidate;
  return isIP(normalized) ? normalized : undefined;
}

export function trustForwardedClientIp(value = process.env.TRUST_PROXY): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}

/**
 * Resolve the browser address at the public Nuxt boundary. Forwarded headers are
 * considered only when the operator explicitly declares the outer proxy trusted.
 */
export function resolveProxyClientIp(
  remoteAddress: string | undefined,
  forwardedFor: string | undefined,
  trustProxy = trustForwardedClientIp(),
): string {
  if (trustProxy) {
    const forwarded = normalizeIp(forwardedFor?.split(',', 1)[0]);
    if (forwarded) return forwarded;
  }

  return normalizeIp(remoteAddress) || 'unknown';
}
