# Daily Task Managing System

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
# Fill DATABASE_URL, REDIS_URL, AUTH_SECRET, etc. Never commit `.env`.

# 3. Database
pnpm db:push
pnpm db:seed

# 4. Run
pnpm dev                 # http://localhost:3000
pnpm worker:dev          # morning 8:30 report / EOD 5:00 Discord / overdue
pnpm discord:bot         # optional keyword bot (needs DISCORD_BOT_TOKEN)
```

Local seed creates a single super admin. **Never use the default demo password in production** — set `SEED_PASSWORD` (12+ chars) and prefer `SEED_FORCE_PASSWORD_CHANGE=true`. Credentials live only in your private `.env` / DB, never in `.env.example`.

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
MAIL_FROM=
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
# System Health: prefer first-time setup at /system-health (DB-backed).
# Optional cookie HMAC (defaults to AUTH_SECRET):
SYSTEM_HEALTH_SECRET=
# Login session GeoIP (country/ISP on user_sessions). Default: free ip-api.com, no key.
# GEOIP_DISABLED=1
# GEOIP_LOOKUP_URL=http://ip-api.com/json/{ip}?fields=status,country,isp,query
# optional
DISCORD_BOT_TOKEN=
POSTGRES_PASSWORD=<strong-password>
```

Real secrets belong only in the server `.env` (gitignored). Never put production passwords or tokens in `.env.example` or commit them.

`DATABASE_URL` / `REDIS_URL` inside Compose are overridden to point at the `postgres` and `redis` services.

### 2. Start

```bash
# App + Postgres + Redis
# NOTE: RUN_SEED defaults to false. Never set RUN_SEED=true on a live DB — seed truncates users/tasks.
docker compose -f docker-compose.prod.yml up -d --build

# Background jobs (reminders, overdue, daily summary) — required for morning 08:30 / EOD 17:00
docker compose -f docker-compose.prod.yml --profile worker up -d --build

# Optional Discord keyword bot — run EXACTLY ONE replica (Redis dedupes duplicate Gateway sessions)
docker compose -f docker-compose.prod.yml --profile bot up -d --build
```

App listens on `http://127.0.0.1:3000` (put Nginx + TLS in front; the app assumes HTTPS via `X-Forwarded-Proto`).

First-time empty database only — seed once, then set a strong password / rotate:

```bash
# Prefer explicit one-shot seed with a strong password (never leave password123 in prod)
docker compose -f docker-compose.prod.yml exec \
  -e SEED_PASSWORD='<strong-secret>' \
  -e SEED_FORCE_PASSWORD_CHANGE=true \
  app pnpm db:seed
```

### 2b. Postgres backups

Use the bundled script (stores dumps under `/opt/dailytask/backups`, retains 14 days):

```bash
chmod +x /opt/dailytask/scripts/backup-postgres.sh
APP_DIR=/opt/dailytask /opt/dailytask/scripts/backup-postgres.sh
```

Install a daily cron (example):

```bash
cat >/etc/cron.d/dailytask-backup <<'EOF'
15 3 * * * root APP_DIR=/opt/dailytask /opt/dailytask/scripts/backup-postgres.sh >>/var/log/dailytask-backup.log 2>&1
EOF
chmod 644 /etc/cron.d/dailytask-backup
```

**Restore** (into a stopped/maintenance window — practice on staging first):

```bash
# List dumps
ls -lh /opt/dailytask/backups/

# Drop+recreate is destructive. Prefer restore into a fresh volume/DB name when testing.
cd /opt/dailytask
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U dailyflow -d dailyflow --clean --if-exists < /opt/dailytask/backups/dailyflow-YYYYMMDDTHHMMSSZ.dump
```

Off-box copies (rsync/S3) are strongly recommended — local dumps alone are not a DR plan.

### 2c. Health watch (uptime)

```bash
chmod +x /opt/dailytask/scripts/health-watch.sh
# Optional: export HEALTH_ALERT_WEBHOOK_URL in the cron line if you want Discord alerts
cat >/etc/cron.d/dailytask-health <<'EOF'
*/5 * * * * root HEALTH_URL=http://127.0.0.1:3000/api/health /opt/dailytask/scripts/health-watch.sh >>/var/log/dailytask-health.log 2>&1
EOF
chmod 644 /etc/cron.d/dailytask-health
```

On HTTP 503/non-200 the script logs and optionally posts to Discord (with a 15m cooldown).

### 2d. Smoke checklist

```bash
./scripts/smoke-prod.sh https://dailytask.zero-trust-security.org
# or on the VPS:
BASE_URL=http://127.0.0.1:3000 ./scripts/smoke-prod.sh
```

### 2e. Staging stub

`docker-compose.staging.yml` uses separate volumes and defaults to host port `3001`. Use a dedicated `.env.staging` — never share production Postgres volumes.

```bash
cp .env.example .env.staging
# set AUTH_URL / APP_URL / POSTGRES_PASSWORD for staging
docker compose -f docker-compose.staging.yml --env-file .env.staging --profile worker up -d --build
```

### 2f. Secret rotation (ops)

| Secret | Rotate how | Notes |
| --- | --- | --- |
| `AUTH_SECRET` | Generate `openssl rand -base64 48`, update `.env`, recreate `app` (+ worker/bot). | Invalidates existing sessions (users re-login). |
| `POSTGRES_PASSWORD` | 1) Take a backup. 2) Update Postgres role password inside the container. 3) Update `.env` `POSTGRES_PASSWORD`. 4) Recreate app/worker/bot so `DATABASE_URL` picks up the new password. | Do not only change `.env` — the running Postgres role must match. |
| Discord bot token | Reset in Discord Developer Portal → update `DISCORD_BOT_TOKEN` → recreate `bot`. | Required if the token was ever pasted in chat. |
| SMTP password | Rotate at provider → update `SMTP_PASS` → recreate `app`. | Prefer verifying mail still works after. |
| VPS root password | `passwd` after confirming SSH key login works. | Do not disable password auth until key login is proven. |

SSH key deploy (recommended): add your public key to `~/.ssh/authorized_keys`, set GitHub secret `VPS_SSH_KEY`, use `scripts/deploy-vps.sh` with `VPS_SSH_KEY=…`. Keep password auth until a successful key deploy.

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

Obtain certs with Certbot, then reload Nginx. The app sends HSTS and other security headers from `next.config.ts`.

Confirm Certbot renew timer on the VPS:

```bash
systemctl list-timers 'certbot*' --no-pager
certbot renew --dry-run
```

### 4. Health check

`GET /api/health` → probes Postgres (+ Redis status) and reports uploads size. HTTP **200** when DB is up (`status: "ok"` or `"degraded"` if Redis is down); **503** when Postgres is unreachable. When uploads exceed `HEALTH_UPLOADS_WARN_MB` (default 2048), `checks.uploads.warn` is `true` (still 200).

```bash
curl -fsS https://your-domain.com/api/health
```

Super Admin System Health UI: `/system-health` (role `super_admin` only in nav; then a separate ops unlock).
JSON: `GET /api/admin/system-health` (session + super_admin + unlocked ops cookie).

System Health is gated in the database (`system_health_credentials`):
1. First visit with no DB credentials → setup form (ops email, password, 6-digit memorable PIN; bcrypt-hashed).
2. Later visits → unlock with email + System Health password; after password failure you can use the PIN.
3. After 5 failed unlock attempts (password and/or PIN) the row is `locked`; unlock is refused until a super admin uses **Unblock System Health** (normal app session, no ops password) or runs SQL below.
4. Success sets a short-lived httpOnly cookie (`df_sys_health`, 30m) for diagnostics (DB metrics, login sessions with IP/UA/logout).
5. **Open database** requires a second re-auth (same password or 6-digit code) and sets `df_sys_health_db` (10m). Direct navigation to `/system-health/database` shows the challenge until that cookie is set. **Lock System Health** clears both cookies. Failed DB re-auth attempts share the same `failed_count` / 5-fail lockout.
6. Idle: System Health locks after 3 minutes of inactivity; a second idle window signs out the app session (`IdleTimeoutGuard`).

Manual unblock in Postgres:

```sql
UPDATE system_health_credentials
SET locked = false, locked_at = NULL, failed_count = 0, updated_at = NOW();
```

### 4b. Drizzle migrations (transition from `db:push`)

Today the container entrypoint still runs **`drizzle-kit push`** so existing production databases (created without a migrations journal) keep receiving additive schema sync without wipe risk.

A baseline SQL migration lives in [`drizzle/0000_*.sql`](drizzle/). To move to `pnpm db:migrate` later **without destroying data**:

1. Take a Postgres backup.
2. On a staging clone of prod, run `pnpm db:migrate` (or mark the baseline as already applied if the schema already matches — drizzle `__drizzle_migrations` journal).
3. Diff schema vs prod; only switch the entrypoint from `push` → `migrate` after staging is green.
4. Keep using `pnpm db:generate` for future schema changes; review the SQL before applying.

Do **not** run destructive migrate/push flags against live data. Do **not** set `RUN_SEED=true` on prod.

### 4c. Structured logs → Loki (later)

Workers and the Discord bot emit JSON lines via `src/server/logger.ts` (`ts`, `level`, `msg`, `service`, …). Docker already captures stdout/stderr.

To ship to Grafana Loki later (sketch only):

```yaml
# docker-compose logging option or Promtail scrape
# - job_name: dailytask
#   docker_sd_configs: …
#   pipeline_stages:
#     - docker: {}
#     - json: { expressions: { level: level, msg: msg } }
```

Until then: `docker compose -f docker-compose.prod.yml logs -f worker bot app`.

### 5. Production DB inspection (Docker Postgres)

On the VPS as root (app at `/opt/dailytask`):

```bash
cd /opt/dailytask
docker compose -f docker-compose.prod.yml exec postgres psql -U dailyflow -d dailyflow
```

Useful SQL inside `psql`:

```sql
\dt
SELECT id, name, email, role, disabled, created_at FROM users;
SELECT id, name FROM teams;
SELECT id, title, status, date, assignee_id FROM tasks ORDER BY created_at DESC LIMIT 50;
-- Unblock System Health after lockout:
UPDATE system_health_credentials
SET locked = false, locked_at = NULL, failed_count = 0, updated_at = NOW();
```

Host / container checks:

```bash
# Container resource usage
docker stats --no-stream

# App health (local)
curl -fsS http://127.0.0.1:3000/api/health

# Public health
curl -fsS https://dailytask.zero-trust-security.org/api/health

# Nginx + TLS cert status
systemctl status nginx --no-pager
nginx -t
certbot certificates
```

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
| `pnpm db:push` | Apply schema (current prod entrypoint) |
| `pnpm db:generate` / `pnpm db:migrate` | Migration workflow (see §4b) |
| `pnpm db:seed` | Seed demo users/tasks |
| `scripts/backup-postgres.sh` | Logical dump → `/opt/dailytask/backups` |
| `scripts/health-watch.sh` | Curl `/api/health`; optional Discord alert |
| `scripts/smoke-prod.sh` | Health + login smoke |
| `scripts/deploy-vps.sh` | Rsync + compose rebuild |

## Security notes

- Never commit `.env`
- Rotate Discord bot token / VPS passwords if they were ever shared in chat
- Use a strong unique `AUTH_SECRET` in production; keep `AUTH_URL` = `NEXTAUTH_URL` = `APP_URL` (HTTPS)
- Keep `ALLOW_PUBLIC_REGISTER=false` unless you intentionally want open signup
- Keep `RUN_SEED=false` on live databases — seed **truncates** users/tasks
- Configure SMTP before inviting users (invites roll back if email fails)
- Rate limits (login/register/forgot/invite/profile/change-password/Discord/PDF/avatar/task-delete) use Redis when `REDIS_URL` is set
- Auth.js uses Secure cookies in production (`useSecureCookies`) + `trustHost` behind Nginx
- Security headers: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, CSP (no `unsafe-eval`), and HSTS
- User queries never return `passwordHash` to the client (team list, settings, system health)
- System Health (`/system-health`) is visible/usable only to `super_admin`, plus a separate DB-backed ops email/password/PIN gate; never exposes `DATABASE_URL`, `SMTP_PASS`, or `DISCORD_BOT_TOKEN`
- Ops credentials are stored hashed in `system_health_credentials`; lockouts require super-admin unblock or SQL — never commit real secrets
- Discord bot: one replica; Redis claim keys prevent duplicate command replies
- `.env.example` is a public empty template; real credentials go only in gitignored `.env`
