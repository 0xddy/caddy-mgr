import type { FetchOptions } from 'ofetch'
import type {
  AdminProfile as BackendAdminProfile,
  CaptchaResponse,
  DiscoveryResult as BackendDiscoveryResult,
  RemoteConfig as BackendRemoteConfig,
  ServerDetail as BackendServerDetail,
  ServerStatusResponse as BackendStatus,
  ServerSummary as BackendServerSummary,
  ValidationResult as BackendValidationResult,
} from '@caddy-mgr/contracts'
import type {
  AdminProfile,
  ConfigRevision,
  CreateServerInput,
  DashboardSummary,
  DiscoveryCandidate,
  DiscoveryResult,
  DiscoverySkippedUnit,
  HostKeyResult,
  Operation,
  OperationAccepted,
  RemoteConfig,
  ServerConnectionInput,
  ServerDetail,
  ServerLogResult,
  ServerSummary,
  ValidationResult,
} from '~/types/api'

export class ApiError extends Error {
  statusCode: number
  code: string
  details?: unknown

  constructor(message: string, statusCode = 500, code = 'UNKNOWN_ERROR', details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}

export function normalizeApiError(error: unknown): ApiError {
  const value = error as {
    statusCode?: number
    status?: number
    data?: {
      message?: string | string[]
      code?: string
      details?: unknown
      error?: { message?: string | string[], code?: string, details?: unknown }
    }
    message?: string
  }
  const payload = value?.data?.error ?? value?.data
  const message = Array.isArray(payload?.message)
    ? payload.message.join('；')
    : payload?.message || value?.message || '请求失败，请稍后重试'
  return new ApiError(
    message,
    value?.statusCode || value?.status || 500,
    payload?.code || 'UNKNOWN_ERROR',
    payload?.details,
  )
}

interface BackendConfigRevision {
  id: string
  serverId: string
  hash: string
  source: string
  operationId: string | null
  createdAt: string
  size?: number
  content?: string
}

function mapAdmin(value: BackendAdminProfile): AdminProfile {
  return { id: value.id, username: value.username, usesDefaultPassword: value.usingDefaultPassword }
}

function mapPrivilege(value: BackendServerDetail['elevationMethod']): ServerDetail['privilegeMode'] {
  const normalized = String(value)
  return normalized === 'sudoNopass'
    ? 'sudo-nopasswd'
    : normalized === 'sudoPassword' ? 'sudo-password' : 'root'
}

function backendConnection(input: ServerConnectionInput) {
  return {
    host: input.host,
    port: input.port,
    username: input.username,
    authMethod: input.authMethod,
    password: input.password,
    privateKey: input.privateKey,
    passphrase: input.privateKeyPassphrase,
    elevationMethod: input.privilegeMode === 'sudo-nopasswd'
      ? 'sudoNopass'
      : input.privilegeMode === 'sudo-password' ? 'sudoPassword' : 'root',
    sudoPassword: input.sudoPassword,
    hostFingerprint: input.hostFingerprint,
  }
}

export function buildCreateServerRequest(input: CreateServerInput) {
  return {
    name: input.name,
    ...backendConnection(input),
    serviceName: input.serviceName,
    caddyBinary: input.caddyBinary,
    caddyVersion: input.caddyVersion,
    configPath: input.configPath,
    adapter: input.adapter,
    serviceUser: input.serviceUser,
    workingDirectory: input.workingDirectory,
  }
}

export function buildHostKeyRequest(input: Pick<ServerConnectionInput, 'host' | 'port'>) {
  return { host: input.host, port: input.port }
}

function mapCandidate(value: {
  serviceName?: string
  configPath?: string
  caddyBinary?: string
  adapter?: string
  serviceUser?: string | null
  workingDirectory?: string
  version?: string
}): DiscoveryCandidate | null {
  if (!value.serviceName || !value.configPath || !value.caddyBinary)
    return null
  return {
    serviceName: value.serviceName,
    configPath: value.configPath,
    caddyBinary: value.caddyBinary,
    adapter: value.adapter || 'caddyfile',
    serviceUser: value.serviceUser ?? undefined,
    workingDirectory: value.workingDirectory,
    caddyVersion: value.version,
  }
}

function parseSkippedWarning(warning: string): DiscoverySkippedUnit | null {
  const match = warning.match(/^已跳过\s+(.+?)：(.+)$/)
  const serviceName = match?.[1]
  const reason = match?.[2]
  return serviceName && reason ? { serviceName, reason } : null
}

export function shortCaddyVersion(version?: string) {
  return version?.trim().split(/\s+/, 1)[0] || ''
}

export function mapDiscovery(value: BackendDiscoveryResult, fingerprint = ''): DiscoveryResult {
  const mapped = (value.candidates?.length ? value.candidates : [value])
    .map(item => mapCandidate(item))
    .filter((item): item is DiscoveryCandidate => Boolean(item))
  const skipped = value.skipped?.length
    ? value.skipped
    : (value.warnings ?? []).flatMap(warning => parseSkippedWarning(warning) ?? [])
  return {
    supported: value.supported,
    hostFingerprint: fingerprint,
    platform: value.platform,
    systemdAvailable: value.platform === 'Linux',
    sudoAvailable: value.sudoAvailable,
    reason: value.reason,
    warnings: (value.warnings ?? []).filter(warning => !parseSkippedWarning(warning)),
    candidates: mapped,
    skipped,
  }
}

function mapServer(value: BackendServerSummary, detail?: BackendServerDetail, live?: BackendStatus): ServerSummary | ServerDetail {
  const status = !value.supported
    ? 'unsupported'
    : live ? (live.active ? 'online' : 'offline')
      : value.lastConnectionStatus === 'ok' ? 'online' : value.lastConnectionStatus ? 'offline' : 'unknown'
  const summary: ServerSummary = {
    id: value.id,
    name: value.name,
    host: value.host,
    port: value.port,
    username: value.username,
    serviceName: value.serviceName,
    configPath: value.configPath,
    caddyVersion: live?.version || value.caddyVersion || detail?.discovery?.version || null,
    status,
    serviceActive: live?.active,
    lastConnectedAt: value.lastConnectedAt,
    updatedAt: value.updatedAt,
  }
  if (!detail)
    return summary
  return {
    ...summary,
    authMethod: detail.authMethod,
    privilegeMode: mapPrivilege(detail.elevationMethod),
    caddyBinary: detail.caddyBinary,
    adapter: detail.adapter,
    serviceUser: detail.serviceUser,
    workingDirectory: detail.workingDirectory,
    hostFingerprint: detail.hostFingerprint,
    discoveryMessage: detail.discovery?.reason || null,
  }
}

function mapRevision(value: BackendConfigRevision): ConfigRevision {
  const knownSources = ['baseline', 'apply', 'restore', 'external'] as const
  const normalizedSource = value.source === 'before_apply' ? 'baseline' : value.source === 'applied' ? 'apply' : value.source === 'restored' ? 'restore' : value.source
  const source = knownSources.includes(normalizedSource as typeof knownSources[number])
    ? normalizedSource as ConfigRevision['source']
    : 'external'
  return {
    id: value.id,
    serverId: value.serverId,
    hash: value.hash,
    source,
    operationId: value.operationId,
    createdAt: value.createdAt,
    size: value.size ?? (value.content ? new TextEncoder().encode(value.content).length : 0),
    content: value.content,
  }
}

export function useApi() {
  async function request<T>(path: string, options: FetchOptions = {}): Promise<T> {
    try {
      const requestFetch = import.meta.server ? useRequestFetch() : $fetch
      return await requestFetch<T>(path, {
        baseURL: '/api',
        credentials: 'include',
        ...options,
      } as Parameters<typeof $fetch>[1])
    }
    catch (error) {
      throw normalizeApiError(error)
    }
  }

  return {
    request,
    auth: {
      me: async () => mapAdmin(await request<BackendAdminProfile>('/auth/me')),
      captcha: () => request<CaptchaResponse>('/auth/captcha'),
      login: async (username: string, password: string, captchaId: string, captchaCode: string) =>
        mapAdmin(await request<BackendAdminProfile>('/auth/login', {
          method: 'POST',
          body: { username, password, captchaId, captchaCode },
        })),
      logout: () => request<void>('/auth/logout', { method: 'POST' }),
      updateUsername: async (username: string, password: string) => mapAdmin(await request<BackendAdminProfile>('/auth/account', { method: 'PATCH', body: { username, currentPassword: password } })),
      updatePassword: (currentPassword: string, newPassword: string) => request<BackendAdminProfile>('/auth/account', { method: 'PATCH', body: { currentPassword, newPassword } }).then(() => undefined),
    },
    dashboard: async (): Promise<DashboardSummary> => {
      const [servers, operations] = await Promise.all([
        request<BackendServerSummary[]>('/servers').then(values => values.map(value => mapServer(value))),
        request<Operation[]>('/operations'),
      ])
      return {
        totalServers: servers.length,
        onlineServers: servers.filter(server => server.status === 'online').length,
        failedOperations: operations.filter(operation => ['failed', 'interrupted', 'needs_attention'].includes(operation.status)).length,
        recentOperations: operations.slice(0, 5),
        servers,
      }
    },
    servers: {
      list: async () => (await request<BackendServerSummary[]>('/servers')).map(value => mapServer(value)),
      get: async (id: string): Promise<ServerDetail> => {
        const detail = await request<BackendServerDetail>(`/servers/${id}`)
        try {
          const live = await request<BackendStatus>(`/servers/${id}/status`)
          return mapServer(detail, detail, live) as ServerDetail
        }
        catch {
          return { ...(mapServer(detail, detail) as ServerDetail), status: detail.supported ? 'offline' : 'unsupported', serviceActive: false }
        }
      },
      hostKey: async (input: Pick<ServerConnectionInput, 'host' | 'port'>): Promise<HostKeyResult> => {
        const result = await request<{ fingerprint: string }>('/servers/host-key', { method: 'POST', body: buildHostKeyRequest(input) })
        return { hostFingerprint: result.fingerprint }
      },
      discover: async (input: ServerConnectionInput) => {
        const result = await request<{ fingerprint: string, discovery: BackendDiscoveryResult }>('/servers/probe', { method: 'POST', body: backendConnection(input) })
        return mapDiscovery(result.discovery, result.fingerprint)
      },
      create: async (input: CreateServerInput) => {
        const detail = await request<BackendServerDetail>('/servers', {
          method: 'POST',
          body: buildCreateServerRequest(input),
        })
        return mapServer(detail, detail) as ServerDetail
      },
      update: async (id: string, input: Partial<CreateServerInput>) => {
        const connection = input.host && input.port && input.username && input.authMethod && input.privilegeMode
          ? backendConnection(input as ServerConnectionInput)
          : {}
        const detail = await request<BackendServerDetail>(`/servers/${id}`, {
          method: 'PATCH',
          body: {
            ...connection,
            name: input.name,
            serviceName: input.serviceName,
            caddyBinary: input.caddyBinary,
            configPath: input.configPath,
            adapter: input.adapter,
            serviceUser: input.serviceUser,
            workingDirectory: input.workingDirectory,
            hostFingerprint: input.hostFingerprint,
          },
        })
        return mapServer(detail, detail) as ServerDetail
      },
      remove: (id: string) => request<void>(`/servers/${id}`, { method: 'DELETE' }),
      rediscover: async (id: string) => mapDiscovery(await request<BackendDiscoveryResult>(`/servers/${id}/rediscover`, { method: 'POST' })),
      logs: async (id: string, lines = 100): Promise<ServerLogResult> => {
        const result = await request<{ content: string, lines: number }>(`/servers/${id}/logs`, { query: { lines } })
        return { lines: result.content.split(/\r?\n/), fetchedAt: new Date().toISOString() }
      },
      serviceAction: (id: string, action: 'reload' | 'restart') => request<OperationAccepted>(`/servers/${id}/actions/${action}`, { method: 'POST' }),
      config: async (id: string): Promise<RemoteConfig> => {
        const result = await request<BackendRemoteConfig>(`/servers/${id}/config`)
        return { ...result, modifiedAt: new Date(result.mtime * 1000).toISOString() }
      },
      format: async (id: string, content: string): Promise<ValidationResult> => {
        const result = await request<BackendValidationResult>(`/servers/${id}/config/format`, { method: 'POST', body: { content } })
        return { valid: result.valid, output: result.output, formattedContent: result.formatted }
      },
      validate: (id: string, content: string) => request<ValidationResult>(`/servers/${id}/config/validate`, { method: 'POST', body: { content } }),
      apply: (id: string, content: string, baseHash: string) => request<OperationAccepted>(`/servers/${id}/config/apply`, { method: 'POST', body: { content, baseHash } }),
      revisions: async (id: string) => (await request<BackendConfigRevision[]>(`/servers/${id}/revisions`)).map(mapRevision),
      revision: async (id: string, revisionId: string) => mapRevision(await request<BackendConfigRevision>(`/servers/${id}/revisions/${revisionId}`)),
      restore: (id: string, revisionId: string, baseHash: string) => request<OperationAccepted>(`/servers/${id}/revisions/${revisionId}/restore`, { method: 'POST', body: { baseHash } }),
      operations: (id: string) => request<Operation[]>('/operations', { query: { serverId: id } }),
    },
    operations: {
      get: (id: string) => request<Operation>(`/operations/${id}`),
      list: () => request<Operation[]>('/operations'),
      recover: (id: string, action: 'retryReload' | 'restoreBackup') => request<OperationAccepted>(`/operations/${id}/recover`, {
        method: 'POST',
        body: { action },
      }),
    },
  }
}
