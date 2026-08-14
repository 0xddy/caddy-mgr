import { z } from 'zod';

export const entityIdSchema = z.string().uuid();
export const isoDateTimeSchema = z.string().datetime({ offset: true });
export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/, '必须是小写 SHA-256 十六进制摘要');
export const hostFingerprintSchema = z.string().regex(/^SHA256:[A-Za-z0-9+/]+$/);
export function isCanonicalPosixAbsolutePath(path: string): boolean {
  if (!path.startsWith('/') || path.startsWith('//')) return false;
  if (/[\u0000-\u001f\\]/.test(path)) return false;
  if (path.length > 1 && path.endsWith('/')) return false;
  return !path.includes('/./') && !path.includes('/../') && !path.endsWith('/.') && !path.endsWith('/..');
}

export const posixAbsolutePathSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine(isCanonicalPosixAbsolutePath, '必须是规范的 POSIX 绝对路径');

export const emptyResponseSchema = z.void();

export type EmptyResponse = z.infer<typeof emptyResponseSchema>;
