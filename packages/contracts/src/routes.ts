/** Canonical paths matching the Nest controllers. */
export const API_ROUTES = {
  health: '/api/health',
  auth: {
    login: '/api/auth/login',
    logout: '/api/auth/logout',
    me: '/api/auth/me',
    captcha: '/api/auth/captcha',
    account: '/api/auth/account',
  },
  servers: {
    list: '/api/servers',
    create: '/api/servers',
    hostKey: '/api/servers/host-key',
    probe: '/api/servers/probe',
    detail: (serverId: string) => `/api/servers/${serverId}`,
    rediscover: (serverId: string) => `/api/servers/${serverId}/rediscover`,
    status: (serverId: string) => `/api/servers/${serverId}/status`,
    logs: (serverId: string) => `/api/servers/${serverId}/logs`,
    config: (serverId: string) => `/api/servers/${serverId}/config`,
    formatConfig: (serverId: string) => `/api/servers/${serverId}/config/format`,
    validateConfig: (serverId: string) => `/api/servers/${serverId}/config/validate`,
    applyConfig: (serverId: string) => `/api/servers/${serverId}/config/apply`,
    revisions: (serverId: string) => `/api/servers/${serverId}/revisions`,
    revision: (serverId: string, revisionId: string) =>
      `/api/servers/${serverId}/revisions/${revisionId}`,
    restoreRevision: (serverId: string, revisionId: string) =>
      `/api/servers/${serverId}/revisions/${revisionId}/restore`,
    reload: (serverId: string) => `/api/servers/${serverId}/actions/reload`,
    restart: (serverId: string) => `/api/servers/${serverId}/actions/restart`,
  },
  operations: {
    list: '/api/operations',
    detail: (operationId: string) => `/api/operations/${operationId}`,
    recover: (operationId: string) => `/api/operations/${operationId}/recover`,
  },
} as const;
