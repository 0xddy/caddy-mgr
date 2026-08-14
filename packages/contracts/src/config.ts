import { z } from 'zod';

import { entityIdSchema, isoDateTimeSchema, sha256Schema } from './common.js';
import { configRevisionSourceSchema } from './enums.js';

const configContentSchema = z.string().refine((content) => !content.includes('\0'), '配置不能包含 NUL');

export const remoteConfigSchema = z.object({
  content: configContentSchema,
  baseHash: sha256Schema,
  mtime: z.number().int().min(0),
  size: z.number().int().min(0),
  owner: z.string(),
  group: z.string(),
  mode: z.string(),
});

export const configContentRequestSchema = z.object({ content: configContentSchema }).strict();

export const validationResultSchema = z.object({
  valid: z.boolean(),
  output: z.string(),
  formatted: configContentSchema.optional(),
});

export const applyConfigRequestSchema = z
  .object({
    content: configContentSchema,
    baseHash: sha256Schema,
  })
  .strict();

export const restoreConfigRequestSchema = z.object({ baseHash: sha256Schema }).strict();

export const configRevisionSchema = z.object({
  id: entityIdSchema,
  serverId: entityIdSchema,
  hash: sha256Schema,
  source: configRevisionSourceSchema,
  operationId: entityIdSchema.nullable(),
  createdAt: isoDateTimeSchema,
  size: z.number().int().min(0),
});

export const configRevisionDetailSchema = configRevisionSchema.extend({
  content: configContentSchema,
});

export const configRevisionListResponseSchema = z.array(configRevisionSchema);

export type RemoteConfig = z.infer<typeof remoteConfigSchema>;
export type ConfigContentRequest = z.infer<typeof configContentRequestSchema>;
export type ValidationResult = z.infer<typeof validationResultSchema>;
export type ApplyConfigRequest = z.infer<typeof applyConfigRequestSchema>;
export type RestoreConfigRequest = z.infer<typeof restoreConfigRequestSchema>;
export type ConfigRevision = z.infer<typeof configRevisionSchema>;
export type ConfigRevisionDetail = z.infer<typeof configRevisionDetailSchema>;
