import { z } from 'zod';

import {
  entityIdSchema,
  hostFingerprintSchema,
  isoDateTimeSchema,
  posixAbsolutePathSchema,
} from './common.js';
import {
  AuthMethod,
  CaddyAdapter,
  ElevationMethod,
  authMethodSchema,
  caddyAdapterSchema,
  elevationMethodSchema,
} from './enums.js';

const hostSchema = z.string().min(1).max(253).regex(/^[^\s\u0000]+$/);
const usernameSchema = z.string().min(1).max(100);
const passwordSchema = z.string().min(1).max(1000);
const privateKeySchema = z.string().min(1).max(100_000);
const passphraseSchema = z.string().max(1000);

const connectionInputShape = {
  host: hostSchema,
  port: z.coerce.number().int().min(1).max(65_535).default(22),
  username: usernameSchema,
  authMethod: authMethodSchema,
  password: passwordSchema.optional(),
  privateKey: privateKeySchema.optional(),
  passphrase: passphraseSchema.optional(),
  elevationMethod: elevationMethodSchema,
  sudoPassword: passwordSchema.optional(),
  hostFingerprint: hostFingerprintSchema,
};

/** Unauthenticated SSH handshake input used only to display a host key for confirmation. */
export const hostKeyRequestSchema = z
  .object({
    host: hostSchema,
    port: z.coerce.number().int().min(1).max(65_535).default(22),
  })
  .strict();

export const hostKeyResponseSchema = z.object({
  fingerprint: hostFingerprintSchema,
});

function requireSelectedCredentials(
  input: {
    authMethod: AuthMethod;
    elevationMethod: ElevationMethod;
    password?: string | undefined;
    privateKey?: string | undefined;
    sudoPassword?: string | undefined;
  },
  context: z.core.$RefinementCtx,
): void {
  if (input.authMethod === AuthMethod.Password && !input.password) {
    context.addIssue({ code: 'custom', path: ['password'], message: '密码认证必须提供 password' });
  }
  if (input.authMethod === AuthMethod.PrivateKey && !input.privateKey) {
    context.addIssue({ code: 'custom', path: ['privateKey'], message: '私钥认证必须提供 privateKey' });
  }
  if (input.elevationMethod === ElevationMethod.SudoPassword && !input.sudoPassword) {
    context.addIssue({ code: 'custom', path: ['sudoPassword'], message: 'sudo 密码模式必须提供 sudoPassword' });
  }
}

/** Flat, write-only SSH payload accepted by POST /api/servers/probe. */
export const probeServerRequestSchema = z
  .object(connectionInputShape)
  .strict()
  .superRefine(requireSelectedCredentials);

export const discoveryCandidateSchema = z.object({
  serviceName: z.string(),
  caddyBinary: posixAbsolutePathSchema,
  configPath: posixAbsolutePathSchema,
  adapter: z.string(),
  serviceUser: z.string().nullable().optional(),
  workingDirectory: posixAbsolutePathSchema.optional(),
  environmentFiles: z.array(z.string()).optional(),
  caddyEnvFiles: z.array(z.string()).optional(),
  hasEnvironment: z.boolean().optional(),
  execStart: z.string().optional(),
  execReload: z.string().optional(),
  version: z.string().optional(),
});

export const discoverySkippedUnitSchema = z.object({
  serviceName: z.string(),
  reason: z.string(),
});

export const discoveryResultSchema = z.object({
  supported: z.boolean(),
  reason: z.string().optional(),
  platform: z.string(),
  serviceName: z.string().optional(),
  serviceNames: z.array(z.string()),
  caddyBinary: posixAbsolutePathSchema.optional(),
  configPath: posixAbsolutePathSchema.optional(),
  adapter: z.string().optional(),
  serviceUser: z.string().nullable().optional(),
  workingDirectory: posixAbsolutePathSchema.optional(),
  environmentFiles: z.array(z.string()).optional(),
  caddyEnvFiles: z.array(z.string()).optional(),
  hasEnvironment: z.boolean().optional(),
  execStart: z.string().optional(),
  execReload: z.string().optional(),
  version: z.string().optional(),
  sudoAvailable: z.boolean(),
  warnings: z.array(z.string()),
  candidates: z.array(discoveryCandidateSchema).default([]),
  skipped: z.array(discoverySkippedUnitSchema).default([]),
});

export const probeServerResponseSchema = z.object({
  fingerprint: hostFingerprintSchema,
  discovery: discoveryResultSchema,
});

export const createServerRequestSchema = z
  .object({
    ...connectionInputShape,
    name: z.string().min(1).max(100),
    hostFingerprint: hostFingerprintSchema,
    serviceName: z.string().min(1).max(255),
    caddyBinary: posixAbsolutePathSchema,
    configPath: posixAbsolutePathSchema,
    adapter: z.literal(CaddyAdapter.Caddyfile).default(CaddyAdapter.Caddyfile),
    serviceUser: z.string().max(100).optional(),
    workingDirectory: posixAbsolutePathSchema.optional(),
    discovery: z.unknown().optional(),
  })
  .strict()
  .superRefine(requireSelectedCredentials);

/** PATCH retains stored secrets when the corresponding fields are omitted. */
export const updateServerRequestSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    host: hostSchema.optional(),
    port: z.coerce.number().int().min(1).max(65_535).optional(),
    username: usernameSchema.optional(),
    authMethod: authMethodSchema.optional(),
    password: passwordSchema.optional(),
    privateKey: privateKeySchema.optional(),
    passphrase: passphraseSchema.optional(),
    elevationMethod: elevationMethodSchema.optional(),
    sudoPassword: passwordSchema.optional(),
    hostFingerprint: hostFingerprintSchema.optional(),
    serviceName: z.string().min(1).max(255).optional(),
    caddyBinary: posixAbsolutePathSchema.optional(),
    configPath: posixAbsolutePathSchema.optional(),
    adapter: caddyAdapterSchema.optional(),
    serviceUser: z.string().max(100).optional(),
    workingDirectory: posixAbsolutePathSchema.optional(),
  })
  .strict();

/** Safe response projection; credentials are deliberately absent. */
export const serverSummarySchema = z.object({
  id: entityIdSchema,
  name: z.string(),
  host: z.string(),
  port: z.number().int(),
  username: z.string(),
  serviceName: z.string(),
  configPath: posixAbsolutePathSchema,
  caddyVersion: z.string().nullable(),
  supported: z.boolean(),
  lastConnectionStatus: z.string().nullable(),
  lastConnectedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const serverDetailSchema = serverSummarySchema.extend({
  authMethod: authMethodSchema,
  elevationMethod: elevationMethodSchema,
  hostFingerprint: hostFingerprintSchema,
  caddyBinary: posixAbsolutePathSchema,
  adapter: z.string(),
  serviceUser: z.string().nullable(),
  workingDirectory: posixAbsolutePathSchema.nullable(),
  discovery: discoveryResultSchema.nullable(),
});

export const serverListResponseSchema = z.array(serverSummarySchema);

export const serverStatusResponseSchema = z.object({
  active: z.boolean(),
  serviceStatus: z.string(),
  version: z.string(),
  checkedAt: isoDateTimeSchema,
});

export const serverLogsQuerySchema = z.object({
  lines: z.coerce.number().int().min(1).max(1000).default(200),
});

export const serverLogsResponseSchema = z.object({
  content: z.string(),
  lines: z.number().int().min(1).max(1000),
});

export type HostKeyRequest = z.infer<typeof hostKeyRequestSchema>;
export type HostKeyResponse = z.infer<typeof hostKeyResponseSchema>;
export type ProbeServerRequest = z.infer<typeof probeServerRequestSchema>;
export type ProbeServerResponse = z.infer<typeof probeServerResponseSchema>;
export type DiscoveryCandidate = z.infer<typeof discoveryCandidateSchema>;
export type DiscoverySkippedUnit = z.infer<typeof discoverySkippedUnitSchema>;
export type DiscoveryResult = z.infer<typeof discoveryResultSchema>;
export type CreateServerRequest = z.infer<typeof createServerRequestSchema>;
export type UpdateServerRequest = z.infer<typeof updateServerRequestSchema>;
export type ServerSummary = z.infer<typeof serverSummarySchema>;
export type ServerDetail = z.infer<typeof serverDetailSchema>;
export type ServerStatusResponse = z.infer<typeof serverStatusResponseSchema>;
export type ServerLogsQuery = z.infer<typeof serverLogsQuerySchema>;
export type ServerLogsResponse = z.infer<typeof serverLogsResponseSchema>;
