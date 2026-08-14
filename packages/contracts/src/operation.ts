import { z } from 'zod';

import { entityIdSchema, isoDateTimeSchema } from './common.js';
import {
  operationKindSchema,
  operationStageSchema,
  operationStatusSchema,
  recoveryActionSchema,
} from './enums.js';

export const operationAcceptedSchema = z.object({
  operationId: entityIdSchema,
});

export const operationSchema = z.object({
  id: entityIdSchema,
  serverId: entityIdSchema,
  kind: operationKindSchema,
  status: operationStatusSchema,
  stage: operationStageSchema,
  summary: z.string().nullable(),
  errorCode: z.string().nullable(),
  backupPath: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  startedAt: isoDateTimeSchema.nullable(),
  finishedAt: isoDateTimeSchema.nullable(),
});

export const operationListResponseSchema = z.array(operationSchema);

export const operationListQuerySchema = z.object({
  serverId: entityIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const recoveryActionRequestSchema = z
  .object({
    action: recoveryActionSchema,
  })
  .strict();

export const recoveryActionResponseSchema = operationAcceptedSchema;

export type OperationAccepted = z.infer<typeof operationAcceptedSchema>;
export type Operation = z.infer<typeof operationSchema>;
export type OperationListQuery = z.infer<typeof operationListQuerySchema>;
export type RecoveryActionRequest = z.infer<typeof recoveryActionRequestSchema>;
export type RecoveryActionResponse = z.infer<typeof recoveryActionResponseSchema>;
