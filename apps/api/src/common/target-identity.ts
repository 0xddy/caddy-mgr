interface TargetIdentityFields {
  hostFingerprint: string;
  serviceName: string;
  configPath: string;
}

/**
 * A host key identifies the remote machine even when it is reached through a
 * different DNS name. Unit + config path identifies the managed Caddy instance.
 */
export function targetIdentity(target: TargetIdentityFields): string {
  return `${target.hostFingerprint}\n${target.serviceName}\n${target.configPath}`;
}
