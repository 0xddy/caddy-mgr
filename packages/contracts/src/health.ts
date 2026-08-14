import { z } from 'zod';

import { isoDateTimeSchema } from './common.js';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  database: z.literal('ok'),
  uptimeSeconds: z.number().int().min(0),
  timestamp: isoDateTimeSchema,
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
