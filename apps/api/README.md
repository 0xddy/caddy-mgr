# Caddy Manager API

NestJS API for the Caddy multi-server manager. The service is intentionally single-process because operation queues and SQLite locking are local to the process.

## Environment

- `API_HOST` (default `127.0.0.1`)
- `API_PORT` (default `3001`)
- `API_DATA_DIR` (default `./data`)
- `API_DATABASE_PATH` (default `<data>/caddy-manager.sqlite`)
- `API_MASTER_KEY_PATH` (default `<data>/master.key`)
- `PUBLIC_URL` (controls the Secure session cookie)
- `SESSION_TTL_SECONDS`, `SSH_CONNECT_TIMEOUT_MS`, `SSH_COMMAND_TIMEOUT_MS`, `MAX_CONFIG_BYTES`

Migrations run automatically. On a new database, the service creates `admin` / `admin`. If the database exists but the 32-byte master key does not, startup intentionally fails because encrypted SSH credentials and revisions would be unrecoverable.

All routes use the `/api` prefix. Only `POST /api/auth/login` and `GET /api/health` are public. Secret fields are write-only and are encrypted with AES-256-GCM before SQLite persistence.
