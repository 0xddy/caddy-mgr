import type {
  AuthMethod as SharedAuthMethod,
  ConfigRevision as SharedConfigRevision,
  DiscoveryCandidate as SharedDiscoveryCandidate,
  DiscoveryResult as SharedDiscoveryResult,
  ElevationMethod as SharedElevationMethod,
  Operation as SharedOperation,
  OperationKind as SharedOperationKind,
  OperationStatus as SharedOperationStatus,
  RemoteConfig as SharedRemoteConfig,
  ServerDetail as SharedServerDetail,
  ServerSummary as SharedServerSummary,
  ValidationResult as SharedValidationResult,
} from '@caddy-mgr/contracts';

/**
 * Internal compatibility facade over the monorepo's canonical public contract.
 * Template-literal aliases keep the backend ergonomic with string-valued enums.
 */
export type AuthMethod = `${SharedAuthMethod}`;
export type ElevationMethod = `${SharedElevationMethod}`;
export type OperationKind = `${SharedOperationKind}`;
export type OperationStatus = `${SharedOperationStatus}`;
export type ConfigRevisionSource = `${SharedConfigRevision['source']}`;

export type ServerSummary = SharedServerSummary;
export interface ServerDetail extends Omit<SharedServerDetail, 'authMethod' | 'elevationMethod' | 'discovery'> {
  authMethod: AuthMethod;
  elevationMethod: ElevationMethod;
  discovery: DiscoveryResult | null;
}
export type DiscoveryResult = SharedDiscoveryResult;
export type DiscoveryCandidate = SharedDiscoveryCandidate;
export type RemoteConfig = SharedRemoteConfig;
export type ValidationResult = SharedValidationResult;
export interface ConfigRevision extends Omit<SharedConfigRevision, 'source'> {
  source: ConfigRevisionSource;
}
export interface Operation extends Omit<SharedOperation, 'kind' | 'status'> {
  kind: OperationKind;
  status: OperationStatus;
}
