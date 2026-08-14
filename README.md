# caddy-mgr

通过网页和 SSH 管理多台 Linux 主机上的 systemd Caddy 服务与 Caddyfile。

## Docker Compose 部署

准备一台安装了 Docker Compose 的服务器，并完成：

- 域名 A/AAAA 记录指向该服务器。
- 防火墙和云安全组放行 TCP 80、443。
- 目标主机可通过 SSH 访问，且已安装 systemd 和 Caddy。

```bash
git clone https://github.com/0xddy/caddy-mgr.git
cd caddy-mgr
cp .env.example .env
```

编辑 `.env`：

```dotenv
DOMAIN=caddy.example.com
INITIAL_ADMIN_PASSWORD=请替换为至少12位的强密码
```

启动：

```bash
docker compose up -d --build
docker compose ps
```

打开 `https://你的域名`，使用用户名 `admin` 和 `.env` 中的密码登录。Caddy 会自动申请、续期证书，并将 HTTP 重定向到 HTTPS；应用端口不会暴露到公网。

## 常用命令

```bash
# 查看日志
docker compose logs -f caddy caddy-mgr

# 拉取代码并更新
git pull
docker compose up -d --build

# 停止服务
docker compose down
```

不要运行 `docker compose down -v`。应用数据库、加密主密钥和 TLS 证书保存在 Docker volumes 中，删除 volumes 会导致数据丢失。

## 本地开发

需要 Node.js 24 和 pnpm 11：

```bash
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install
pnpm dev
```

检查代码：

```bash
pnpm typecheck
pnpm test
pnpm build
```
