# syntax=docker/dockerfile:1

FROM node:24-bookworm-slim AS builder
WORKDIR /app

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@11.19.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build
ENV NODE_ENV=production
RUN pnpm install --frozen-lockfile --prod --ignore-scripts \
  && rm -rf \
    apps/api/src \
    apps/web/app \
    apps/web/tests \
    apps/web/.nuxt \
    packages/contracts/src \
    packages/contracts/test

FROM node:24-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    LANG=C.UTF-8 \
    API_HOST=127.0.0.1 \
    API_PORT=3001 \
    PUBLIC_APP_URL=http://127.0.0.1:3000 \
    DATABASE_PATH=/app/var/data/caddy-mgr.sqlite \
    MASTER_KEY_PATH=/app/var/secrets/master.key \
    SESSION_TTL_SECONDS=604800 \
    SESSION_COOKIE_SECURE=false \
    TRUST_PROXY=false \
    LOGIN_MAX_FAILURES=5 \
    LOGIN_FAILURE_WINDOW_SECONDS=900 \
    LOGIN_LOCKOUT_SECONDS=900 \
    CAPTCHA_TTL_SECONDS=300 \
    CAPTCHA_MAX_PER_MINUTE=30 \
    CAPTCHA_DEBUG_CODE=false \
    NITRO_HOST=0.0.0.0 \
    NITRO_PORT=3000 \
    NUXT_API_BASE_URL=http://127.0.0.1:3001

COPY --from=builder --chown=node:node /app /app
RUN mkdir -p /app/var/data /app/var/secrets /app/var/logs \
  && chown -R node:node /app/var

USER node
EXPOSE 3000
VOLUME ["/app/var"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["node", "scripts/docker-entrypoint.mjs"]
