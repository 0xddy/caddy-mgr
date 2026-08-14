import type { AdminProfile } from '~/types/api';
import type { ApiError } from '~/composables/useApi';

export function safeRedirectPath(value: unknown, fallback = '/'): string {
  return typeof value === 'string' && /^\/(?![\\/])/.test(value) ? value : fallback;
}

export const MIN_ADMIN_PASSWORD_LENGTH = 12;

export function useAuth() {
  const user = useState<AdminProfile | null>('auth:user', () => null);
  const initialized = useState<boolean>('auth:initialized', () => false);
  const api = useApi();

  async function load(force = false) {
    if (initialized.value && !force) return user.value;

    try {
      user.value = await api.auth.me();
    } catch (error) {
      const apiError = error as ApiError;
      if (apiError.statusCode === 401) user.value = null;
      else throw error;
    } finally {
      initialized.value = true;
    }
    return user.value;
  }

  async function login(username: string, password: string, captchaId: string, captchaCode: string) {
    user.value = await api.auth.login(username, password, captchaId, captchaCode);
    initialized.value = true;
    return user.value;
  }

  async function logout() {
    try {
      await api.auth.logout();
    } finally {
      user.value = null;
      initialized.value = true;
    }
  }

  return { user, initialized, load, login, logout };
}
