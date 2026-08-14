<script setup lang="ts">
useHead({ title: '账号设置' });
const api = useApi();
const auth = useAuth();
const toast = useToast();

const accountForm = reactive({
  username: auth.user.value?.username || '',
  password: '',
});
const passwordForm = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
});
const accountPending = ref(false);
const passwordPending = ref(false);
const accountError = ref('');
const passwordError = ref('');
const passwordVisible = reactive({
  account: false,
  current: false,
  next: false,
  confirm: false,
});
const accountFieldErrors = reactive({ username: '', password: '' });
const passwordFieldErrors = reactive({ current: '', next: '', confirm: '' });

const anyPending = computed(() => accountPending.value || passwordPending.value);
const normalizedUsername = computed(() => accountForm.username.trim());
const accountChanged = computed(
  () => normalizedUsername.value !== (auth.user.value?.username || ''),
);
const accountReady = computed(() =>
  Boolean(normalizedUsername.value && accountChanged.value && accountForm.password),
);
const passwordRules = computed(() => {
  const nextPassword = passwordForm.newPassword;
  const currentUsername = auth.user.value?.username || '';
  return [
    {
      label: `至少 ${MIN_ADMIN_PASSWORD_LENGTH} 个字符`,
      passed: nextPassword.length >= MIN_ADMIN_PASSWORD_LENGTH,
    },
    {
      label: '与当前密码不同',
      passed: Boolean(
        nextPassword &&
        passwordForm.currentPassword &&
        nextPassword !== passwordForm.currentPassword,
      ),
    },
    {
      label: '不与登录账号相同',
      passed: Boolean(nextPassword && nextPassword.toLowerCase() !== currentUsername.toLowerCase()),
    },
    {
      label: '两次输入一致',
      passed: Boolean(
        passwordForm.confirmPassword && nextPassword === passwordForm.confirmPassword,
      ),
    },
  ];
});
const passwordReady = computed(
  () => Boolean(passwordForm.currentPassword) && passwordRules.value.every((rule) => rule.passed),
);

function resetAccountErrors() {
  accountError.value = '';
  accountFieldErrors.username = '';
  accountFieldErrors.password = '';
}

function resetPasswordErrors() {
  passwordError.value = '';
  passwordFieldErrors.current = '';
  passwordFieldErrors.next = '';
  passwordFieldErrors.confirm = '';
}

async function updateAccount() {
  resetAccountErrors();
  if (!normalizedUsername.value) accountFieldErrors.username = '请输入登录账号';
  else if (!accountChanged.value) accountFieldErrors.username = '账号尚未修改';
  if (!accountForm.password) accountFieldErrors.password = '请输入当前密码';
  if (accountFieldErrors.username || accountFieldErrors.password) return;

  accountPending.value = true;
  try {
    auth.user.value = await api.auth.updateUsername(normalizedUsername.value, accountForm.password);
    accountForm.password = '';
    toast.add({ title: '账号已更新', color: 'success' });
  } catch (error) {
    const apiError = error as ApiError;
    if (apiError.code === 'INVALID_CURRENT_PASSWORD')
      accountFieldErrors.password = apiError.message;
    else if (apiError.code === 'USERNAME_TAKEN') accountFieldErrors.username = apiError.message;
    else accountError.value = apiError.message;
  } finally {
    accountPending.value = false;
  }
}

async function updatePassword() {
  resetPasswordErrors();
  if (!passwordForm.currentPassword) passwordFieldErrors.current = '请输入当前密码';
  if (!passwordForm.newPassword) passwordFieldErrors.next = '请输入新密码';
  else if (passwordForm.newPassword.length < MIN_ADMIN_PASSWORD_LENGTH)
    passwordFieldErrors.next = `新密码至少 ${MIN_ADMIN_PASSWORD_LENGTH} 个字符`;
  else if (passwordForm.newPassword === passwordForm.currentPassword)
    passwordFieldErrors.next = '新密码不能与当前密码相同';
  else if (
    passwordForm.newPassword.toLowerCase() === (auth.user.value?.username || '').toLowerCase()
  )
    passwordFieldErrors.next = '新密码不能与登录账号相同';
  if (!passwordForm.confirmPassword) passwordFieldErrors.confirm = '请再次输入新密码';
  else if (passwordForm.newPassword !== passwordForm.confirmPassword)
    passwordFieldErrors.confirm = '两次输入的新密码不一致';
  if (passwordFieldErrors.current || passwordFieldErrors.next || passwordFieldErrors.confirm)
    return;

  passwordPending.value = true;
  try {
    await api.auth.updatePassword(passwordForm.currentPassword, passwordForm.newPassword);
    toast.add({ title: '密码已修改', description: '请使用新密码重新登录', color: 'success' });
    await auth.logout();
    await navigateTo('/login');
  } catch (error) {
    const apiError = error as ApiError;
    if (apiError.code === 'INVALID_CURRENT_PASSWORD')
      passwordFieldErrors.current = apiError.message;
    else passwordError.value = apiError.message;
  } finally {
    passwordPending.value = false;
  }
}
</script>

<template>
  <div class="settings-page">
    <PageHeader
      eyebrow="SECURITY"
      title="账号设置"
      description="管理唯一管理员的登录账号与密码。"
    />

    <div class="panel settings-surface">
      <section
        id="account-settings"
        class="settings-section"
        aria-labelledby="account-settings-title"
      >
        <header class="settings-section__intro">
          <div>
            <p class="settings-section__eyebrow">ACCOUNT</p>
            <h2 id="account-settings-title">登录账号</h2>
            <p>保存后，下次登录需要使用新的账号名称。</p>
          </div>
          <span class="settings-section__meta">当前：{{ auth.user.value?.username }}</span>
        </header>

        <form class="settings-form" :aria-busy="accountPending" @submit.prevent="updateAccount">
          <UFormField
            label="登录账号"
            required
            description="1–100 个字符，保存后立即生效"
            :error="accountFieldErrors.username || undefined"
          >
            <UInput
              v-model="accountForm.username"
              autocomplete="username"
              :maxlength="100"
              size="lg"
              class="settings-input"
              :disabled="anyPending"
              @update:model-value="accountFieldErrors.username = ''"
            />
          </UFormField>
          <UFormField
            label="当前密码"
            required
            description="用于确认本次账号变更"
            :error="accountFieldErrors.password || undefined"
          >
            <UInput
              v-model="accountForm.password"
              :type="passwordVisible.account ? 'text' : 'password'"
              autocomplete="current-password"
              :maxlength="500"
              size="lg"
              class="settings-input"
              :disabled="anyPending"
              @update:model-value="accountFieldErrors.password = ''"
            >
              <template #trailing>
                <button
                  type="button"
                  class="settings-password-toggle"
                  :aria-label="passwordVisible.account ? '隐藏当前密码' : '显示当前密码'"
                  :title="passwordVisible.account ? '隐藏当前密码' : '显示当前密码'"
                  @click="passwordVisible.account = !passwordVisible.account"
                >
                  <UIcon :name="passwordVisible.account ? 'i-lucide-eye-off' : 'i-lucide-eye'" />
                </button>
              </template>
            </UInput>
          </UFormField>

          <div
            v-if="accountError"
            class="error-callout settings-form__error"
            role="alert"
            aria-live="polite"
          >
            <UIcon name="i-lucide-circle-alert" />
            <span>{{ accountError }}</span>
          </div>

          <div class="settings-form__actions">
            <UButton
              type="submit"
              size="lg"
              :loading="accountPending"
              :disabled="!accountReady || anyPending"
            >
              更新账号
            </UButton>
          </div>
        </form>
      </section>

      <section
        id="password-settings"
        class="settings-section"
        aria-labelledby="password-settings-title"
      >
        <header class="settings-section__intro">
          <div>
            <p class="settings-section__eyebrow">PASSWORD</p>
            <h2 id="password-settings-title">登录密码</h2>
            <p>设置新的管理员密码，并重新验证登录。</p>
          </div>
        </header>

        <form class="settings-form" :aria-busy="passwordPending" @submit.prevent="updatePassword">
          <UFormField label="当前密码" required :error="passwordFieldErrors.current || undefined">
            <UInput
              v-model="passwordForm.currentPassword"
              :type="passwordVisible.current ? 'text' : 'password'"
              autocomplete="current-password"
              :maxlength="500"
              size="lg"
              class="settings-input"
              :disabled="anyPending"
              @update:model-value="passwordFieldErrors.current = ''"
            >
              <template #trailing>
                <button
                  type="button"
                  class="settings-password-toggle"
                  :aria-label="passwordVisible.current ? '隐藏当前密码' : '显示当前密码'"
                  :title="passwordVisible.current ? '隐藏当前密码' : '显示当前密码'"
                  @click="passwordVisible.current = !passwordVisible.current"
                >
                  <UIcon :name="passwordVisible.current ? 'i-lucide-eye-off' : 'i-lucide-eye'" />
                </button>
              </template>
            </UInput>
          </UFormField>

          <div class="password-pair">
            <UFormField label="新密码" required :error="passwordFieldErrors.next || undefined">
              <UInput
                v-model="passwordForm.newPassword"
                :type="passwordVisible.next ? 'text' : 'password'"
                autocomplete="new-password"
                :maxlength="500"
                size="lg"
                class="settings-input"
                :disabled="anyPending"
                @update:model-value="passwordFieldErrors.next = ''"
              >
                <template #trailing>
                  <button
                    type="button"
                    class="settings-password-toggle"
                    :aria-label="passwordVisible.next ? '隐藏新密码' : '显示新密码'"
                    :title="passwordVisible.next ? '隐藏新密码' : '显示新密码'"
                    @click="passwordVisible.next = !passwordVisible.next"
                  >
                    <UIcon :name="passwordVisible.next ? 'i-lucide-eye-off' : 'i-lucide-eye'" />
                  </button>
                </template>
              </UInput>
            </UFormField>

            <UFormField
              label="确认新密码"
              required
              :error="passwordFieldErrors.confirm || undefined"
            >
              <UInput
                v-model="passwordForm.confirmPassword"
                :type="passwordVisible.confirm ? 'text' : 'password'"
                autocomplete="new-password"
                :maxlength="500"
                size="lg"
                class="settings-input"
                :disabled="anyPending"
                @update:model-value="passwordFieldErrors.confirm = ''"
              >
                <template #trailing>
                  <button
                    type="button"
                    class="settings-password-toggle"
                    :aria-label="passwordVisible.confirm ? '隐藏确认密码' : '显示确认密码'"
                    :title="passwordVisible.confirm ? '隐藏确认密码' : '显示确认密码'"
                    @click="passwordVisible.confirm = !passwordVisible.confirm"
                  >
                    <UIcon :name="passwordVisible.confirm ? 'i-lucide-eye-off' : 'i-lucide-eye'" />
                  </button>
                </template>
              </UInput>
            </UFormField>
          </div>

          <ul class="password-rules" aria-label="新密码要求">
            <li
              v-for="rule in passwordRules"
              :key="rule.label"
              :class="{ 'password-rule--passed': rule.passed }"
            >
              <UIcon :name="rule.passed ? 'i-lucide-circle-check' : 'i-lucide-circle-dashed'" />
              {{ rule.label }}
            </li>
          </ul>

          <div
            v-if="passwordError"
            class="error-callout settings-form__error"
            role="alert"
            aria-live="polite"
          >
            <UIcon name="i-lucide-circle-alert" />
            <span>{{ passwordError }}</span>
          </div>

          <div class="password-impact">
            <UIcon name="i-lucide-shield-check" />
            <p>
              <strong>修改后会退出所有登录会话</strong>
              <span>保存成功后将返回登录页，请使用新密码重新登录。</span>
            </p>
          </div>

          <div class="settings-form__actions">
            <UButton
              type="submit"
              size="lg"
              trailing-icon="i-lucide-arrow-right"
              :loading="passwordPending"
              :disabled="!passwordReady || anyPending"
            >
              更新密码并重新登录
            </UButton>
          </div>
        </form>
      </section>
    </div>
  </div>
</template>

<style scoped>
.settings-page {
  max-width: 980px;
  margin: 0 auto;
}
.settings-surface {
  overflow: hidden;
}
.settings-section {
  display: grid;
  grid-template-columns: minmax(205px, 0.72fr) minmax(0, 1.6fr);
  scroll-margin-top: 74px;
}
.settings-section + .settings-section {
  border-top: 1px solid var(--line);
}
.settings-section__intro {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-direction: column;
  gap: 24px;
  padding: 27px 25px;
  border-right: 1px solid var(--line);
  background: rgba(0, 0, 0, 0.075);
}
.settings-section__eyebrow {
  margin: 0 0 9px !important;
  color: var(--accent) !important;
  font-size: 11px !important;
  font-weight: 780;
  letter-spacing: 0.17em;
}
.settings-section__intro h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 680;
}
.settings-section__intro p {
  margin: 7px 0 0;
  color: var(--text-soft);
  font-size: 12px;
  line-height: 1.65;
}
.settings-section__meta {
  padding: 6px 10px;
  border: 1px solid rgba(88, 214, 141, 0.18);
  border-radius: 999px;
  color: #c5d4cb;
  background: rgba(88, 214, 141, 0.08);
  font-size: 12px;
}
.settings-form {
  display: grid;
  gap: 20px;
  padding: 25px 26px 26px;
}
.settings-form :deep(label) {
  color: #dce5df;
  font-size: 12px;
  font-weight: 650;
}
.settings-form :deep([data-slot='description']) {
  color: var(--text-faint);
  font-size: 11px;
  line-height: 1.45;
}
.settings-input {
  width: 100%;
}
.settings-input :deep(input) {
  height: 44px;
  border-radius: 10px;
  color: var(--text);
  background: rgba(7, 11, 9, 0.5);
  box-shadow: 0 0 0 1px var(--line-strong) inset;
  transition:
    background 0.16s ease,
    box-shadow 0.16s ease;
}
.settings-input :deep(input:hover) {
  background: rgba(10, 15, 12, 0.7);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.18) inset;
}
.settings-input :deep(input:focus) {
  background: rgba(10, 16, 12, 0.88);
  box-shadow:
    0 0 0 1px rgba(88, 214, 141, 0.78) inset,
    0 0 0 4px rgba(88, 214, 141, 0.1);
}
.settings-input :deep(input::placeholder) {
  color: #626d66;
}
.settings-input :deep(input:-webkit-autofill),
.settings-input :deep(input:-webkit-autofill:hover) {
  -webkit-text-fill-color: var(--text);
  box-shadow:
    0 0 0 1000px #0b100d inset,
    0 0 0 1px var(--line-strong) inset;
  caret-color: var(--text);
}
.settings-input :deep(input:-webkit-autofill:focus) {
  -webkit-text-fill-color: var(--text);
  box-shadow:
    0 0 0 1000px #0b100d inset,
    0 0 0 1px rgba(88, 214, 141, 0.78) inset,
    0 0 0 4px rgba(88, 214, 141, 0.1);
  caret-color: var(--text);
}
.settings-password-toggle {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 0;
  border-radius: 7px;
  color: var(--text-faint);
  background: transparent;
  cursor: pointer;
  transition:
    color 0.16s ease,
    background 0.16s ease;
}
.settings-password-toggle:hover,
.settings-password-toggle:focus-visible {
  color: var(--text);
  background: rgba(255, 255, 255, 0.05);
  outline: none;
}
.settings-password-toggle svg {
  width: 15px;
  height: 15px;
}
.password-pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.password-rules {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 16px;
  margin: 0;
  padding: 13px 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.018);
  list-style: none;
}
.password-rules li {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--text-faint);
  font-size: 12px;
  transition: color 0.16s ease;
}
.password-rules svg {
  width: 13px;
  height: 13px;
  flex: 0 0 auto;
}
.password-rules .password-rule--passed {
  color: #77d89d;
}
.password-impact {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  padding: 12px 13px;
  border: 1px solid rgba(117, 174, 250, 0.14);
  border-radius: 10px;
  color: #94a99a;
  background: rgba(117, 174, 250, 0.04);
}
.password-impact > svg {
  width: 17px;
  height: 17px;
  flex: 0 0 auto;
  margin-top: 1px;
  color: #79aef0;
}
.password-impact p {
  margin: 0;
}
.password-impact strong,
.password-impact span {
  display: block;
}
.password-impact strong {
  color: #c6d2ca;
  font-size: 12px;
  font-weight: 650;
}
.password-impact span {
  margin-top: 3px;
  color: var(--text-faint);
  font-size: 11px;
  line-height: 1.5;
}
.settings-form__error {
  margin-top: -2px;
}
.settings-form__actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 2px;
}
.settings-form__actions :deep(button) {
  min-height: 42px;
  border-radius: 10px;
}
.settings-form__actions :deep(button:disabled) {
  opacity: 0.46;
  filter: saturate(0.7);
  box-shadow: none;
}
@media (max-width: 800px) {
  .settings-section {
    grid-template-columns: 1fr;
  }
  .settings-section__intro {
    align-items: center;
    flex-direction: row;
    gap: 18px;
    padding: 21px 22px;
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }
}
@media (max-width: 560px) {
  .settings-section__intro {
    align-items: flex-start;
    flex-direction: column;
    gap: 13px;
    padding: 18px;
  }
  .settings-form {
    gap: 18px;
    padding: 20px 18px;
  }
  .password-pair {
    grid-template-columns: 1fr;
    gap: 18px;
  }
  .password-rules {
    grid-template-columns: 1fr;
  }
  .settings-form__actions :deep(button) {
    width: 100%;
    justify-content: center;
  }
}
@media (prefers-reduced-motion: reduce) {
  .settings-input :deep(input),
  .settings-password-toggle {
    transition: none;
  }
}
</style>
