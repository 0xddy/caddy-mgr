# @caddy-mgr/web

Nuxt 4 + Vue 3 SSR 管理端。浏览器始终请求同源 `/api/**`，Nitro 将请求（包括 Cookie 与状态码）代理到仅在本机监听的 Nest API。

## 本地开发

在仓库根目录安装依赖后：

```bash
pnpm --filter @caddy-mgr/web dev
```

默认将 API 代理至 `http://127.0.0.1:3001`。开发时可设置 `NUXT_API_BASE_URL` 覆盖；生产环境统一使用仓库根目录的 `.env.production`。

## 构建与验证

```bash
pnpm --filter @caddy-mgr/web typecheck
pnpm --filter @caddy-mgr/web test
pnpm --filter @caddy-mgr/web build
```

生产产物入口为 `.output/server/index.mjs`。PM2 实际启动仓库根目录的 `scripts/start-web.mjs`：它在配置 TLS 时读取 `NITRO_SSL_CERT` 与 `NITRO_SSL_KEY` 指向的文件，再导入 Nuxt 产物。Nitro 监听地址使用 `NITRO_HOST`、`NITRO_PORT`。

## 页面

- `/login`：管理员登录、图形验证码与失败限流提示，SSR 会话守卫。
- `/`：实例与操作概览。
- `/servers`、`/servers/new`：服务器列表和 SSH 探测向导。
- `/servers/:id`：服务状态、远端参数、日志和人工 reload/restart。
- `/servers/:id/config`：CodeMirror 编辑、格式化、校验、diff、应用与历史恢复。
- `/settings/account`：管理员账号和密码修改。

API DTO 与路由适配统一位于 `app/composables/useApi.ts`，服务端契约调整时无需改动页面。
