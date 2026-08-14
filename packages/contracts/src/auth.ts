import { z } from 'zod';

import { emptyResponseSchema, entityIdSchema } from './common.js';

export const captchaResponseSchema = z.object({
  captchaId: z.string().min(1).max(64),
  imageSvg: z.string().min(1),
  expiresInSeconds: z.number().int().positive(),
  /** Present only when CAPTCHA_DEBUG_CODE is explicitly enabled for smoke/dev. */
  debugCode: z.string().min(1).max(16).optional(),
});

export const loginRequestSchema = z
  .object({
    username: z.string().min(1).max(100),
    password: z.string().min(1).max(500),
    captchaId: z.string().min(1).max(64),
    captchaCode: z.string().min(1).max(16),
  })
  .strict();

export const adminProfileSchema = z.object({
  id: entityIdSchema,
  username: z.string(),
  usingDefaultPassword: z.boolean(),
});

/** Login and /auth/me both return the profile directly, without a data envelope. */
export const loginResponseSchema = adminProfileSchema;

export const updateAccountRequestSchema = z
  .object({
    currentPassword: z.string().min(1).max(500),
    username: z.string().min(1).max(100).optional(),
    newPassword: z.string().min(12).max(500).optional(),
  })
  .strict()
  .refine(({ username, newPassword }) => username !== undefined || newPassword !== undefined, {
    message: '请提供新账号或新密码',
  });

export const logoutResponseSchema = emptyResponseSchema;

export type CaptchaResponse = z.infer<typeof captchaResponseSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type AdminProfile = z.infer<typeof adminProfileSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type UpdateAccountRequest = z.infer<typeof updateAccountRequestSchema>;
