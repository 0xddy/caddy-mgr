# Caddy Manager

Caddy Manager 是一个面向多台远程 Linux 主机的 Caddy 管理面板。管理端采用 Nuxt 4 / Vue 3 SSR，API 采用 NestJS，数据保存在本机 SQLite。它通过 SSH 发现 systemd Caddy 服务、读取和校验 Caddyfile，并按“校验 → 备份 → 原子替换 → reload → 失败恢复”的流程应用配置。

首次启动会创建唯一管理员：用户名 `admin`，密码 `admin`。也可通过环境变量 `INITIAL_ADMIN_PASSWORD` 设置初始密码（至少 12 位）。登录页需要图形验证码；同一 IP 在短时间内多次失败会被临时锁定（默认 15 分钟内失败 5 次锁定 15 分钟）。

## 支持范围

- 远程 Linux + systemd，每台已保存服务器管理一个 Caddy service / Caddyfile 实例。探测到多个 unit 时可在添加时选择其中一个。
- SSH 密码、私钥、加密私钥；root、免密 sudo、sudo 密码三种提权方式。
- apt 等标准安装及可从 systemd unit 可靠解析出的自定义安装。
- 配置读取、格式化、远程校验、差异确认、历史版本、回滚、reload/restart、状态与 journal 日志。

首版不支持 Docker 内的 Caddy、Windows/OpenRC、跳板机、Caddy API-only、原生 JSON 配置，也不会在 reload 失败时自动改用 restart。

## 仓库结构

```text
apps/api/                 NestJS API 与 SSH/Caddy 编排
apps/web/                 Nuxt SSR 管理端
packages/contracts/       API 双端共用的 Zod schema、类型、枚举和路由
scripts/                  生产预检、迁移及 Web/TLS 启动包装器
ecosystem.config.cjs      PM2 fork 单实例配置
```

## 本地开发

需要 Node.js 24.x 和 pnpm 11.19.x。不要使用多份 API 进程共享同一 SQLite 数据库。

```bash
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install
pnpm dev
```

常用检查：

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

浏览器端到端验收使用 Playwright。CI 首次运行前执行 `pnpm exec playwright install chromium`；本机默认复用已安装的 Chrome，也可通过 `PLAYWRIGHT_CHANNEL=msedge` 选择 Edge。随后运行：

```bash
pnpm test:e2e
```

该命令会重新构建两端，在隔离的临时 SQLite/主密钥目录启动 API 与 Nuxt，覆盖 SSR 登录守卫、初始密码提醒、SSH 指纹向导的秘密发送边界、日志刷新、CodeMirror hydration、diff、应用进度和历史恢复。

`pnpm dev:api` 和 `pnpm dev:web` 可分别启动两端。Nuxt 开发服务器固定监听 `http://127.0.0.1:3000`，避免 Windows 将 `localhost` 仅解析到 IPv6 回环地址。首次安装产生的 `pnpm-lock.yaml` 应提交，后续部署使用 `pnpm install --frozen-lockfile`。

## 单机生产部署

建议在独立的管理机或受保护的运维主机运行本程序。API 默认只监听 `127.0.0.1:3001`，Nuxt 监听 `0.0.0.0:3000` 并通过服务端地址代理同源 `/api/**` 请求。

1. 准备环境变量：

   ```bash
   cp .env.production.example .env.production
   chmod 600 .env.production
   ```

   至少确认公开地址、监听端口、数据库路径和主密钥路径。相对路径以仓库根目录为基准。登录保护参数默认是 15 分钟内失败 5 次后锁定 15 分钟，验证码有效期默认 5 分钟；生产环境必须保持 `CAPTCHA_DEBUG_CODE=false`。

2. 安装、构建和预检：

   ```bash
   corepack enable
   corepack prepare pnpm@11.19.0 --activate
   pnpm install --frozen-lockfile
   pnpm build
   pnpm preflight
   ```

3. 启动 PM2：

   ```bash
   pnpm pm2:start
   pnpm pm2:logs
   pnpm exec pm2 save
   pnpm exec pm2 startup
   ```

   `ecosystem.config.cjs` 会显式读取 `.env.production`，API 和 Web 均固定为 fork 模式单实例。修改环境变量或更新构建后运行 `pnpm pm2:restart`。

4. 健康检查：

   ```bash
   curl --fail http://127.0.0.1:3001/api/health
   curl --fail http://127.0.0.1:3000/api/health
   ```

API 启动时自动执行版本化 TypeORM migration，不在生产环境使用 `synchronize`。`pnpm migration:run` 仅用于需要在停机窗口提前迁移的场景；该命令会显式读取 `.env.production`，并先将数据库、数据目录和主密钥的相对路径解析为以仓库根目录为基准的绝对路径。空库首次迁移会在 TypeORM 创建 SQLite 前以原子方式生成 32 字节、权限为 `0600` 的主密钥；若数据库已存在但密钥缺失，或现有密钥长度非法，迁移会拒绝运行。回退最近一次迁移使用 `pnpm migration:revert`，执行前必须完成数据库和主密钥备份。

### HTTPS

推荐使用受信任的反向代理终止 TLS，并将 `SESSION_COOKIE_SECURE=true`、`PUBLIC_APP_URL` 设置为实际 HTTPS 地址。只有代理会覆盖客户端来源地址且代理本身可信时才设置 `TRUST_PROXY=true`，否则所有用户可能共享代理地址的登录限流桶，或客户端地址可被伪造。若希望 Nitro 直接提供 HTTPS，同时填写证书和私钥的文件路径：

```dotenv
NITRO_SSL_CERT=/etc/caddy-mgr/tls/fullchain.pem
NITRO_SSL_KEY=/etc/caddy-mgr/tls/private.key
SESSION_COOKIE_SECURE=true
PUBLIC_APP_URL=https://caddy-mgr.example.com
```

两项只填一项时预检会失败。PM2 通过 `scripts/start-web.mjs` 读取文件内容，再将 PEM 传给 Nitro；证书私钥应仅允许运行用户读取。启用直接 HTTPS 后，Web 健康检查地址相应改为 `https://127.0.0.1:3000/api/health`。

## 远程主机与权限

目标主机必须可通过 SSH 访问，具备 systemd 和 Caddy CLI。首次连接会显示 SSH 主机密钥指纹，须由管理员确认；保存后若指纹改变，连接会被拒绝，不能通过重新测试静默接受。

远程账号还需要：

- 能通过 SFTP 向自己的临时目录上传候选配置。
- 能读取 Caddyfile、systemd unit 属性和近期 journal。
- 能以 Caddy 服务用户运行 `caddy validate` / `caddy fmt`。
- 能保留原文件 owner、group、mode，在配置目录创建临时文件、备份并原子替换。
- 能执行 `systemctl reload`、状态检查，以及用户明确确认后的 `systemctl restart`。
- SELinux 主机若提供 `restorecon`，应允许对目标配置执行它。

当前版本会将提权操作包装为 `sudo -- sh -c '<固定工作流命令>'`，因此 sudoers 实际匹配的是 shell 包装器，而不是其中的 `systemctl`、`stat` 或 `caddy`。仅放行这些内层二进制不会工作；放行任意 `sh -c` 又近似完整 root 权限。请使用专用、不可交互登录或用途隔离的运维账号，为其配置完整的免密 sudo 或 sudo 密码，或者直接使用受严格保护的 root SSH 凭据。面板 API 不接受任意命令，但远程账号本身仍是高权限账号，不要与普通业务账号复用。上线前务必通过“测试连接”和“远程校验”验证权限。

面板本身不提供任意远程命令入口。远程命令输出在入库和返回前会脱敏，但仍应避免在 Caddyfile 或 unit 参数中直接放置秘密。

## 数据、密钥与备份

- SQLite 默认位于 `var/data/caddy-mgr.sqlite`，启用 WAL、外键和 busy timeout。
- AES-256-GCM 主密钥默认位于 `var/secrets/master.key`，用于加密 SSH 凭据和历史配置正文。
- 首次空库运行时自动生成主密钥；如果数据库已经存在而密钥缺失，程序会拒绝启动。不要创建新密钥来绕过错误。
- 每次应用前会在远端同目录留下备份，自动保留最近 5 份；本地加密历史不自动裁剪。

数据库和主密钥必须作为同一备份集保存。最稳妥的文件级备份方式是短暂停机：

```bash
pnpm pm2:stop
tar -czf "caddy-mgr-backup-$(date +%Y%m%d-%H%M%S).tar.gz" \
  var/data var/secrets .env.production
pnpm pm2:start
```

若不能停机，应使用 SQLite 在线 `.backup` API；不要在写入期间只复制主数据库文件而遗漏 `-wal`。备份文件应加密并限制访问权限。

恢复时停止两个 PM2 进程，将数据库和原主密钥恢复到 `.env.production` 指定的路径，确保运行用户可读写数据库且只能读取密钥，然后执行 `pnpm preflight && pnpm pm2:start`。迁移会在应用启动时自动补齐。

## 运维命令

| 命令 | 用途 |
| --- | --- |
| `pnpm preflight` | 检查 Node 版本、必需环境变量、端口、TLS 文件及“有库无密钥”错误 |
| `pnpm migration:run` | 加载生产环境并对指定 SQLite 数据库执行待处理迁移 |
| `pnpm migration:revert` | 加载生产环境并回退最近一次迁移；仅在完成备份后使用 |
| `pnpm pm2:start` | 准备目录并启动 API/Web 单实例 |
| `pnpm pm2:restart` | 更新环境变量并重启两个进程 |
| `pnpm pm2:stop` | 停止两个进程，保留 PM2 记录 |
| `pnpm pm2:delete` | 从 PM2 删除两个进程 |
| `pnpm pm2:logs` | 跟踪 API 与 Web 日志 |

如果任务在进程退出或 SSH 中断时仍为运行中，重启后会被标记为 `interrupted`。请在操作详情核对远端当前文件哈希、备份路径和服务状态，再选择“重试 reload”或“恢复备份”。
