export default defineNuxtConfig({
  compatibilityDate: '2026-01-01',
  devtools: { enabled: true },
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  ssr: true,
  ui: {
    fonts: false,
    colorMode: false,
  },
  icon: {
    clientBundle: {
      scan: true,
    },
  },
  runtimeConfig: {
    apiBaseUrl: 'http://127.0.0.1:3001',
    public: {
      appName: 'Caddy 管理面板',
    },
  },
  app: {
    head: {
      htmlAttrs: { lang: 'zh-CN', class: 'dark' },
      titleTemplate: '%s · Caddy 管理面板',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'color-scheme', content: 'dark' },
        { name: 'theme-color', content: '#0b0e0c' },
      ],
    },
  },
  typescript: {
    typeCheck: true,
    strict: true,
  },
});
