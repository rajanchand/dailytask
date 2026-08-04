# Dailytask Manager

Production-ready daily task and team productivity app.

## Stack

- Next.js 15 + TypeScript
- PostgreSQL + Drizzle
- Auth.js sessions
- Redis + BullMQ worker
- Discord webhook + optional Discord bot
- SMTP invites (nodemailer) + PDF daily reports (pdfkit)

## Local development

```bash
# 1. Start DB + Redis (Postgres 5434, Redis 6381)
docker compose up -d

# 2. Install
pnpm install
cp .env.example .env
# Set AUTH_SECRET: openssl rand -base64 48

# 3. Database
pnpm db:push
pnpm db:seed

# 4. Run
pnpm dev                 # http://localhost:3000
pnpm worker:dev          # reminders / overdue / daily summary
pnpm discord:bot         # optional keyword bot (needs DISCORD_BOT_TOKEN)
```

**Super admin login:** `rajanchand@zero-trust-security.org` / `password123`

Invite more people from **Team** — each invite is saved to the database and emailed login details automatically (requires SMTP in `.env`).

Public registration is **off** by default (`ALLOW_PUBLIC_REGISTER=false`). Admins invite users from Team; SMTP must be configured for invite emails.

## Discord keywords

- `today task`
- `today total task update`
- `today complete task`
- `report` / `daily report`
- `weekly report`
- `help`

## VPS / production deploy (Docker Compose)

One-command stack: Postgres + Redis + app (entrypoint waits for DB, runs `db:push`, then starts Next.js).

### 1. Clone & configure

```bash
git clone https://github.com/rajanchand/dailytask.git
cd dailytask
cp .env.example .env
nano .env
```

Set at least:

```env
AUTH_SECRET=<openssl rand -base64 48>
AUTH_URL=https://your-domain.com
NEXTAUTH_URL=https://your-domain.com
APP_URL=https://your-domain.com
ALLOW_PUBLIC_REGISTER=false
MAIL_FROM=noreply@zero-trust-security.org
SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
# optional
DISCORD_BOT_TOKEN=
POSTGRES_PASSWORD=<strong-password>
```

`DATABASE_URL` / `REDIS_URL` inside Compose are overridden to point at the `postgres` and `redis` services.

### 2. Start

```bash
# App + Postgres + Redis
docker compose -f docker-compose.prod.yml up -d --build

# Background jobs (reminders, overdue, daily summary)
docker compose -f docker-compose.prod.yml --profile worker up -d --build

# Optional Discord keyword bot
docker compose -f docker-compose.prod.yml --profile bot up -d --build
```

App listens on `http://127.0.0.1:3000`. Seed once if needed:

```bash
docker compose -f docker-compose.prod.yml exec app pnpm db:seed
```

### 3. Nginx (TLS reverse proxy)

Example site config:

```nginx
server {
  listen 443 ssl http2;
  server_name your-domain.com;

  ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Obtain certs with Certbot, then reload Nginx. With `AUTH_URL=https://...`, the app enables HSTS.

### 4. Health check

`GET /api/health` → `{ "status": "ok" }`

## CI / CD (GitHub Actions)

Workflow: [`.github/workflows/ci.yml`](.github/workflows/ci.yml) (lint/typecheck/build on push/PR to `main`).

Optional deploy: [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) (`workflow_dispatch`; enable the push trigger after secrets are set). Prefer an SSH key — never put the VPS password in the repo or workflow files.

### Required GitHub secrets

| Secret | Purpose |
| --- | --- |
| `VPS_HOST` | Server IP or hostname |
| `VPS_USER` | SSH user (usually `root`) |
| `VPS_SSH_KEY` | Private key contents for deploy |
| `VPS_PORT` | Optional SSH port (default handled as 22 if unset in Actions UI) |
| `VPS_APP_DIR` | Optional app path (default `/opt/dailytask`) |

Create a GitHub Environment named `production` (or remove `environment: production` from the workflow).

### Manual deploy

```bash
chmod +x scripts/deploy-vps.sh
export VPS_HOST=your.server.ip
export VPS_USER=root
export VPS_SSH_KEY=~/.ssh/id_ed25519   # preferred
# or: export VPS_PASS='…'             # requires sshpass; never commit
./scripts/deploy-vps.sh
```

## Profile

From **Settings**, users can update name, email (unique, lowercased), timezone, address, phone, contact number, notification prefs, password, and upload a profile photo (JPEG/PNG/WebP, max 2MB → `UPLOAD_DIR/avatars`, served via `/api/uploads/...`).

### Alternative: PM2 on the host

If you prefer bare metal Node instead of the `app` container:

```bash
docker compose up -d          # only postgres + redis from docker-compose.yml
pnpm install && pnpm db:push && pnpm build
pm2 start "pnpm start" --name dailytask-web
pm2 start "pnpm worker" --name dailytask-worker
pm2 start "pnpm discord:bot" --name dailytask-bot
pm2 save
```

## Scripts

| Script | Purpose |
| --- | --- |
| `pnpm dev` | Dev server |
| `pnpm build` / `pnpm start` | Production app |
| `pnpm worker` | Automation jobs |
| `pnpm discord:bot` | Keyword Discord bot |
| `pnpm discord:test` | Send sample Discord reports via webhook |
| `pnpm db:push` | Apply schema |
| `pnpm db:seed` | Seed demo users/tasks |

## Security notes

- Never commit `.env`
- Rotate Discord bot token if it was ever shared
- Use a strong unique `AUTH_SECRET` in production
- Keep `ALLOW_PUBLIC_REGISTER=false` unless you intentionally want open signup
- Configure SMTP before inviting users (invites roll back if email fails)
- Rate limits (login/register/forgot/invite/profile/Discord/PDF) use Redis when `REDIS_URL` is set
