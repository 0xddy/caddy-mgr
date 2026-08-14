# caddy-mgr

通过网页和 SSH 管理多台 Linux 主机上的 systemd Caddy 服务与 Caddyfile。

## Docker Compose 部署

[`docker-compose.yaml`](./docker-compose.yaml) 直接拉取 `0xddy/caddy-mgr:latest`，并已内嵌 Caddy 配置；部署不需要源码。Caddy 使用官方镜像，负责反向代理、自动 HTTPS 和证书续期。

准备一台安装了 Docker Compose 2.23.1 或更高版本的服务器，并完成：

- 使用域名时，将 A/AAAA 记录指向该服务器；使用 IP 时，必须是公网 IPv4 或 IPv6。
- 防火墙和云安全组放行 TCP 80、443。
- 目标主机可通过 SSH 访问，且已安装 systemd 和 Caddy。

```bash
curl -fsSLO https://raw.githubusercontent.com/0xddy/caddy-mgr/main/docker-compose.yaml
```

在同一目录创建 `.env`：

```dotenv
SITE_ADDRESS=caddy.example.com
INITIAL_ADMIN_PASSWORD=请替换为至少12位的强密码
```

`SITE_ADDRESS` 三选一：域名 `caddy.example.com`、公网 IPv4 `203.0.113.10`、公网 IPv6 `[2001:db8::10]`。不要填写 `https://`。

Compose 配置：

| 配置                     | 用途                                    |
| ------------------------ | --------------------------------------- |
| `0xddy/caddy-mgr:latest` | caddy-mgr 远程镜像，每次启动检查更新    |
| `SITE_ADDRESS`           | HTTPS 使用的域名或公网 IP               |
| `INITIAL_ADMIN_PASSWORD` | 初始用户 `admin` 的密码，至少 12 个字符 |
| TCP `80`、`443`          | Caddy HTTP/HTTPS 公网入口               |
| `caddy_mgr_data`         | SQLite 数据库、加密主密钥和日志         |
| `caddy_data`             | Caddy TLS 证书和私钥                    |
| `caddy_config`           | Caddy 运行配置                          |
| 内嵌 `caddyfile`         | Caddy 反向代理与 TLS 配置               |

应用端口 `3000` 只在 Compose 内部网络暴露，由 Caddy 反向代理，不映射到宿主机。

启动：

```bash
docker compose up -d
docker compose ps
```

打开 `https://SITE_ADDRESS`，使用用户名 `admin` 和 `.env` 中的密码登录。Caddy 会自动申请、续期域名或公网 IP 证书，并将 HTTP 重定向到 HTTPS；应用端口不会暴露到公网。

## 常用命令

```bash
# 查看日志
docker compose logs -f caddy caddy-mgr

# 更新 Compose 和镜像
curl -fsSL https://raw.githubusercontent.com/0xddy/caddy-mgr/main/docker-compose.yaml -o docker-compose.yaml
docker compose pull
docker compose up -d

# 停止服务
docker compose down
```

不要运行 `docker compose down -v`。应用数据库、加密主密钥和 TLS 证书保存在 Docker volumes 中，删除 volumes 会导致数据丢失。
