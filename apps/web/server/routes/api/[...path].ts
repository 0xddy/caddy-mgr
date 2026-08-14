import { getRequestHeader, getRequestIP, getRequestURL, proxyRequest } from 'h3';
import { buildApiTarget } from '../../utils/api-target';
import {
  INTERNAL_CLIENT_IP_HEADER,
  resolveProxyClientIp,
  trustForwardedClientIp,
} from '../../utils/client-ip';

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const path = event.context.params?.path || '';
  const search = getRequestURL(event).search;
  const target = buildApiTarget(String(config.apiBaseUrl), path, search);
  const clientIp = resolveProxyClientIp(
    getRequestIP(event) || event.node.req.socket.remoteAddress,
    getRequestHeader(event, 'x-forwarded-for'),
    trustForwardedClientIp(),
  );

  const response: unknown = await proxyRequest(event, target, {
    fetchOptions: { redirect: 'manual' },
    headers: {
      [INTERNAL_CLIENT_IP_HEADER]: clientIp,
      'x-forwarded-for': clientIp,
      'x-real-ip': clientIp,
    },
  });
  return response;
});
