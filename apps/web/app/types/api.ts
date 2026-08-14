export type ServerConnectionStatus = 'online' | 'offline' | 'unknown' | 'unsupported'
export type OperationStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'rolled_back' | 'interrupted' | 'needs_attention'
export type OperationKind = 'apply' | 'restore' | 'reload' | 'restart' | 'discover'

export interface AdminProfile {
  id: string
  username: string
  usesDefaultPassword: boolean
  createdAt?: string
  updatedAt?: string
}

export interface ServerSummary {
  id: string
  name: string
  host: string
  port: number
  username: string
  serviceName: string | null
  configPath: string | null
  caddyVersion: string | null
  status: ServerConnectionStatus
  serviceActive?: boolean
  lastConnectedAt: string | null
  updatedAt: string
}

export interface ServerDetail extends ServerSummary {
  authMethod: 'password' | 'privateKey'
  privilegeMode: 'root' | 'sudo-nopasswd' | 'sudo-password'
  caddyBinary: string | null
  adapter: string | null
  serviceUser: string | null
  workingDirectory: string | null
  hostFingerprint: string
  discoveryMessage?: string | null
}

export interface DiscoveryCandidate {
  serviceName: string
  configPath: string
  caddyBinary: string
  adapter: string
  serviceUser?: string
  workingDirectory?: string
  caddyVersion?: string
}

export interface DiscoverySkippedUnit {
  serviceName: string
  reason: string
}

export interface DiscoveryResult {
  supported: boolean
  hostFingerprint: string
  platform?: string
  systemdAvailable?: boolean
  sudoAvailable?: boolean
  reason?: string
  warnings?: string[]
  candidates: DiscoveryCandidate[]
  skipped: DiscoverySkippedUnit[]
}

export interface HostKeyResult {
  hostFingerprint: string
}

export interface RemoteConfig {
  content: string
  baseHash: string
  modifiedAt: string
  size: number
  owner?: string
  group?: string
  mode?: string
}

export interface ValidationResult {
  valid: boolean
  output: string
  formattedContent?: string
}

export interface ConfigRevision {
  id: string
  serverId: string
  hash: string
  source: 'baseline' | 'apply' | 'restore' | 'external'
  operationId?: string | null
  createdAt: string
  size: number
  content?: string
}

export interface Operation {
  id: string
  serverId: string
  kind: OperationKind
  status: OperationStatus
  stage: string
  summary?: string | null
  errorCode?: string | null
  backupPath?: string | null
  rollbackStatus?: string | null
  createdAt: string
  startedAt?: string | null
  finishedAt?: string | null
}

export interface ServerLogResult {
  lines: string[]
  fetchedAt: string
}

export interface OperationAccepted {
  operationId: string
}

export interface ServerConnectionInput {
  name: string
  host: string
  port: number
  username: string
  authMethod: 'password' | 'privateKey'
  password?: string
  privateKey?: string
  privateKeyPassphrase?: string
  privilegeMode: 'root' | 'sudo-nopasswd' | 'sudo-password'
  sudoPassword?: string
  hostFingerprint?: string
}

export interface CreateServerInput extends ServerConnectionInput, DiscoveryCandidate {
  hostFingerprint: string
}

export interface DashboardSummary {
  totalServers: number
  onlineServers: number
  failedOperations: number
  recentOperations: Operation[]
  servers: ServerSummary[]
}
