<script setup lang="ts">
const route = useRoute();
const { user, logout } = useAuth();
const mobileOpen = ref(false);

const navigation = [
  { label: '概览', to: '/', icon: 'i-lucide-layout-dashboard' },
  { label: '服务器', to: '/servers', icon: 'i-lucide-server' },
  { label: '账号设置', to: '/settings/account', icon: 'i-lucide-user-round-cog' },
];

watch(
  () => route.fullPath,
  () => {
    mobileOpen.value = false;
  },
);

function isActive(to: string) {
  return to === '/' ? route.path === '/' : route.path.startsWith(to);
}

async function signOut() {
  await logout();
  await navigateTo('/login');
}
</script>

<template>
  <div class="app-shell">
    <button
      v-if="mobileOpen"
      class="sidebar-scrim"
      aria-label="关闭导航"
      @click="mobileOpen = false"
    />
    <aside class="sidebar" :class="{ 'sidebar--open': mobileOpen }">
      <div class="sidebar__brand">
        <AppLogo />
      </div>

      <nav class="sidebar__nav" aria-label="主导航">
        <NuxtLink
          v-for="item in navigation"
          :key="item.to"
          :to="item.to"
          class="nav-item"
          :class="{ 'nav-item--active': isActive(item.to) }"
        >
          <UIcon :name="item.icon" class="nav-item__icon" />
          <span>{{ item.label }}</span>
        </NuxtLink>
      </nav>

      <div class="sidebar__footer">
        <div class="sidebar-user">
          <div class="avatar">{{ user?.username?.slice(0, 1).toUpperCase() }}</div>
          <div class="sidebar-user__meta">
            <strong>{{ user?.username }}</strong>
            <span>管理员</span>
          </div>
          <UButton
            icon="i-lucide-log-out"
            color="neutral"
            variant="ghost"
            aria-label="退出登录"
            @click="signOut"
          />
        </div>
      </div>
    </aside>

    <div class="app-main">
      <header class="mobile-header">
        <UButton
          icon="i-lucide-menu"
          color="neutral"
          variant="ghost"
          aria-label="打开导航"
          @click="mobileOpen = true"
        />
        <AppLogo compact />
      </header>

      <div v-if="user?.usesDefaultPassword" class="default-password-banner">
        <UIcon name="i-lucide-triangle-alert" />
        <span>当前仍在使用初始密码，建议尽快修改。</span>
        <NuxtLink to="/settings/account#password-settings" class="default-password-banner__action">立即修改</NuxtLink>
      </div>

      <main class="page-container">
        <slot />
      </main>
    </div>
  </div>
</template>
