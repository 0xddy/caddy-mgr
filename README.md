# caddy-mgr

通过 SSH 管理 Linux systemd Caddy 服务和 Caddyfile 的 Web 面板。

## Docker 部署

需要 Docker Compose 2.23.1+，并开放 TCP 80、443。域名需解析到服务器，IP 必须是公网地址。

```bash
curl -fsSLO https://raw.githubusercontent.com/0xddy/caddy-mgr/main/docker-compose.yaml
```

创建 `.env`：

```dotenv
# 域名、公网 IPv4，或带方括号的 IPv6；不要填写 https://
SITE_ADDRESS=caddy.example.com

# admin 的初始密码，至少 12 个字符
INITIAL_ADMIN_PASSWORD=change-this-password
```

启动：

```bash
docker compose up -d
```

访问 `https://SITE_ADDRESS`，使用用户名 `admin` 登录。Caddy 自动申请和续期 HTTPS 证书。

## 常用命令

```bash
docker compose logs -f
docker compose pull && docker compose up -d
docker compose down
```

数据和证书保存在 Docker volumes 中，不要执行 `docker compose down -v`。
