import { AppError } from '../common/app-error';

export const DEFAULT_ADMIN_USERNAME = 'admin';
export const DEFAULT_ADMIN_PASSWORD = 'admin';
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 500;

export function isBuiltinDefaultPassword(password: string): boolean {
  return password === DEFAULT_ADMIN_PASSWORD;
}

export function assertPasswordPolicy(password: string, username?: string): void {
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    throw new AppError(
      'PASSWORD_TOO_WEAK',
      `新密码长度必须为 ${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} 个字符`,
      422,
    );
  }
  if (isBuiltinDefaultPassword(password)) {
    throw new AppError('PASSWORD_TOO_WEAK', '不能继续使用初始默认密码', 422);
  }
  const account = username?.trim();
  if (account && password.toLowerCase() === account.toLowerCase()) {
    throw new AppError('PASSWORD_TOO_WEAK', '密码不能与账号相同', 422);
  }
}
