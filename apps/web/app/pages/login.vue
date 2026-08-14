<script setup lang="ts">
definePageMeta({ layout: 'auth' });
useHead({ title: '登录' });

const route = useRoute();
const { login } = useAuth();
const api = useApi();
const form = reactive({ username: 'admin', password: '', captchaCode: '' });
const captchaId = ref('');
const captchaImage = ref('');
const captchaLoading = ref(false);
const loading = ref(false);
const errorMessage = ref('');
const showPassword = ref(false);

async function refreshCaptcha(preserveMessage = false) {
  captchaLoading.value = true;
  captchaId.value = '';
  captchaImage.value = '';
  if (!preserveMessage) errorMessage.value = '';
  try {
    const captcha = await api.auth.captcha();
    captchaId.value = captcha.captchaId;
    captchaImage.value = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(captcha.imageSvg)}`;
    form.captchaCode = '';
  } catch (error) {
    const apiError = error as ApiError;
    errorMessage.value = apiError.message;
  } finally {
    captchaLoading.value = false;
  }
}

async function submit() {
  if (loading.value) return;
  if (!form.username || !form.password) {
    errorMessage.value = '请输入账号和密码';
    return;
  }
  if (!form.captchaCode || !captchaId.value) {
    errorMessage.value = '请输入验证码';
    return;
  }
  loading.value = true;
  errorMessage.value = '';
  try {
    await login(form.username, form.password, captchaId.value, form.captchaCode);
    await navigateTo(safeRedirectPath(route.query.redirect));
  } catch (error) {
    const apiError = error as ApiError;
    if (apiError.code === 'LOGIN_RATE_LIMITED') {
      errorMessage.value = apiError.message;
      captchaId.value = '';
      captchaImage.value = '';
    } else if (apiError.code === 'INVALID_CAPTCHA') errorMessage.value = apiError.message;
    else if (apiError.statusCode === 401) errorMessage.value = '账号或密码错误';
    else errorMessage.value = apiError.message;
    if (apiError.code !== 'LOGIN_RATE_LIMITED') await refreshCaptcha(true);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void refreshCaptcha();
});
</script>

<template>
  <section class="login-card" aria-labelledby="login-title">
    <div class="login-card__header">
      <span class="login-card__eyebrow">
        <UIcon name="i-lucide-shield-check" />
        SECURE ADMIN ACCESS
      </span>
      <h1 id="login-title">欢迎回来</h1>
      <p>使用管理员账号进入 Caddy 控制台</p>
    </div>

    <form class="login-form" @submit.prevent="submit">
      <UFormField label="管理员账号" required class="login-field">
        <UInput
          v-model="form.username"
          icon="i-lucide-user-round"
          autocomplete="username"
          placeholder="输入管理员账号"
          size="xl"
          class="login-input"
          autofocus
        />
      </UFormField>
      <UFormField label="登录密码" required class="login-field">
        <UInput
          v-model="form.password"
          :type="showPassword ? 'text' : 'password'"
          icon="i-lucide-lock-keyhole"
          autocomplete="current-password"
          placeholder="输入登录密码"
          size="xl"
          class="login-input"
        >
          <template #trailing>
            <button
              type="button"
              class="password-toggle"
              :aria-label="showPassword ? '隐藏密码' : '显示密码'"
              :title="showPassword ? '隐藏密码' : '显示密码'"
              @click="showPassword = !showPassword"
            >
              <UIcon :name="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'" />
            </button>
          </template>
        </UInput>
      </UFormField>
      <UFormField label="验证码" required class="login-field">
        <template #hint>
          <button
            type="button"
            class="captcha-refresh"
            :disabled="captchaLoading"
            @click="refreshCaptcha()"
          >
            <UIcon name="i-lucide-refresh-cw" :class="{ spinning: captchaLoading }" />
            换一张
          </button>
        </template>
        <div class="captcha-row">
          <UInput
            v-model="form.captchaCode"
            maxlength="8"
            autocomplete="off"
            autocapitalize="characters"
            inputmode="text"
            icon="i-lucide-fingerprint"
            size="xl"
            class="login-input captcha-row__input"
            placeholder="不区分大小写"
          />
          <button
            type="button"
            class="captcha-row__image"
            aria-label="刷新验证码"
            title="点击换一张验证码"
            :disabled="captchaLoading"
            @click="refreshCaptcha()"
          >
            <img v-if="captchaImage" :src="captchaImage" alt="" width="148" height="48" />
            <span v-else class="captcha-row__loading">
              <UIcon name="i-lucide-loader-circle" class="spinning" />
              加载中
            </span>
          </button>
        </div>
      </UFormField>

      <div v-if="errorMessage" class="error-callout login-error" role="alert" aria-live="polite">
        <UIcon name="i-lucide-circle-alert" />
        <span>{{ errorMessage }}</span>
      </div>

      <UButton
        type="submit"
        size="xl"
        :loading="loading"
        :disabled="loading"
        trailing-icon="i-lucide-arrow-right"
        class="login-submit"
      >
        {{ loading ? '正在验证' : '进入控制台' }}
      </UButton>
    </form>
  </section>
</template>

<style scoped>
.login-card {
  width: 100%;
}
.login-card__header {
  margin-bottom: 32px;
}
.login-card__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--accent);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.16em;
}
.login-card__eyebrow svg {
  width: 14px;
  height: 14px;
}
.login-card h1 {
  margin: 14px 0 8px;
  font-size: clamp(30px, 4vw, 38px);
  font-weight: 720;
  letter-spacing: -0.045em;
  line-height: 1.14;
}
.login-card p {
  margin: 0;
  color: var(--text-soft);
  font-size: 14px;
  line-height: 1.65;
}
.login-form {
  display: grid;
  gap: 20px;
}
.login-field :deep(label) {
  color: #dce5df;
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.01em;
}
.login-field :deep([data-slot='hint']) {
  display: flex;
  align-items: center;
}
.login-input {
  width: 100%;
}
.login-input :deep(input) {
  height: 50px;
  border-radius: 12px;
  color: var(--text);
  background: rgba(7, 11, 9, 0.58);
  box-shadow: 0 0 0 1px var(--line-strong) inset;
  transition:
    background 0.16s ease,
    box-shadow 0.16s ease;
}
.login-input :deep(input:hover) {
  background: rgba(10, 15, 12, 0.76);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.18) inset;
}
.login-input :deep(input:focus) {
  background: rgba(10, 16, 12, 0.9);
  box-shadow:
    0 0 0 1px rgba(88, 214, 141, 0.8) inset,
    0 0 0 4px rgba(88, 214, 141, 0.11);
}
.login-input :deep(input::placeholder) {
  color: #626d66;
}
.login-input :deep([data-slot='leading']) {
  color: #7f8b83;
}
.login-input :deep([data-slot='leadingIcon']) {
  width: 16px;
  height: 16px;
  opacity: 0.82;
}
.login-input :deep(input:-webkit-autofill),
.login-input :deep(input:-webkit-autofill:hover) {
  -webkit-text-fill-color: var(--text);
  box-shadow:
    0 0 0 1000px #0b100d inset,
    0 0 0 1px var(--line-strong) inset;
  caret-color: var(--text);
}
.login-input :deep(input:-webkit-autofill:focus) {
  -webkit-text-fill-color: var(--text);
  box-shadow:
    0 0 0 1000px #0b100d inset,
    0 0 0 1px rgba(88, 214, 141, 0.8) inset,
    0 0 0 4px rgba(88, 214, 141, 0.11);
  caret-color: var(--text);
}
.password-toggle {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 0;
  border-radius: 8px;
  color: var(--text-faint);
  background: transparent;
  cursor: pointer;
  transition:
    color 0.16s ease,
    background 0.16s ease;
}
.password-toggle:hover,
.password-toggle:focus-visible {
  color: var(--text);
  background: rgba(255, 255, 255, 0.055);
  outline: none;
}
.password-toggle svg {
  width: 15px;
  height: 15px;
}
.captcha-refresh {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0;
  border: 0;
  color: var(--text-faint);
  background: transparent;
  cursor: pointer;
  font-size: 11px;
  transition: color 0.16s ease;
}
.captcha-refresh:hover,
.captcha-refresh:focus-visible {
  color: var(--accent);
  outline: none;
}
.captcha-refresh:disabled {
  cursor: wait;
  opacity: 0.65;
}
.captcha-refresh svg {
  width: 12px;
  height: 12px;
}
.captcha-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 148px;
  gap: 12px;
  align-items: stretch;
  width: 100%;
}
.captcha-row__input {
  width: 100%;
}
.captcha-row__image {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 148px;
  height: 50px;
  padding: 0;
  border: 1px solid var(--line-strong);
  border-radius: 12px;
  background: #0c1410;
  cursor: pointer;
  overflow: hidden;
  color: var(--text-faint);
  font-size: 12px;
  transition:
    border-color 0.16s ease,
    transform 0.16s ease;
}
.captcha-row__image:hover,
.captcha-row__image:focus-visible {
  border-color: rgba(88, 214, 141, 0.55);
  outline: none;
  transform: translateY(-1px);
}
.captcha-row__image:disabled {
  opacity: 0.7;
  cursor: wait;
}
.captcha-row__image img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.captcha-row__loading {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.captcha-row__loading svg {
  width: 14px;
  height: 14px;
}
.login-error {
  margin-top: -2px;
}
.login-submit {
  width: 100%;
  height: 52px;
  margin-top: 4px;
  justify-content: center;
  border-radius: 12px;
  color: #fff;
  font-size: 15px;
  font-weight: 680;
  letter-spacing: 0.02em;
  cursor: pointer;
  box-shadow:
    0 10px 22px rgba(18, 42, 28, 0.28),
    0 1px 0 rgba(255, 255, 255, 0.1) inset;
  transition:
    transform 0.16s ease,
    box-shadow 0.16s ease,
    filter 0.16s ease;
}
.login-submit :deep([data-slot='trailingIcon']) {
  width: 16px;
  height: 16px;
  margin-inline-start: 2px;
}
.login-submit:hover:not(:disabled) {
  cursor: pointer;
  box-shadow:
    0 12px 26px rgba(18, 42, 28, 0.34),
    0 1px 0 rgba(255, 255, 255, 0.12) inset;
  filter: brightness(1.08);
  transform: translateY(-1px);
}
.login-submit:active:not(:disabled) {
  transform: translateY(0);
}
.login-submit:disabled {
  cursor: wait;
}
@media (max-width: 460px) {
  .login-card__header {
    margin-bottom: 28px;
  }
}
@media (max-width: 350px) {
  .captcha-row {
    grid-template-columns: minmax(0, 1fr);
  }
  .captcha-row__image {
    width: 100%;
  }
}
@media (prefers-reduced-motion: reduce) {
  .captcha-row__image,
  .login-submit {
    transition: none;
  }
}
</style>
