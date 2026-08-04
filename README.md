# Dailytask Manager

Production-ready daily task and team productivity app.

## Stack

- Next.js 15 + TypeScript
- PostgreSQL + Drizzle
- Auth.js sessions
- Redis + BullMQ worker
- Discord webhook + optional Discord bot

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

**Demo login:** `rajan@dailyflow.app` / `password123`

## Discord keywords

- `today task`
- `today total task update`
- `today complete task`
- `report` / `daily report`
- `weekly report`
- `help`

## VPS / production deploy

### 1. Server requirements

- Node.js 22+
- pnpm 9+
- Docker (for Postgres + Redis) **or** managed Postgres/Redis
- Process manager (pm2 / systemd)

### 2. Clone & configure

```bash
git clone https://github.com/rajanchand/dailytask.git
cd dailytask
pnpm install
cp .env.example .env
nano .env
```

Set at least:

```env
DATABASE_URL=postgresql://USER:PASS@HOST:5432/dailytask
REDIS_URL=redis://HOST:6379
AUTH_SECRET=<openssl rand -base64 48>
AUTH_URL=https://your-domain.com
NEXTAUTH_URL=https://your-domain.com
APP_NAME=Dailytask Manager
# optional
DISCORD_BOT_TOKEN=
```

### 3. Database

```bash
pnpm db:push
pnpm db:seed   # first time only
```

### 4. Build & run

```bash
pnpm build
pnpm start                 # Next.js on port 3000
pnpm worker                # background jobs
pnpm discord:bot           # optional
```

### 5. PM2 example

```bash
pnpm build
pm2 start "pnpm start" --name dailytask-web
pm2 start "pnpm worker" --name dailytask-worker
pm2 start "pnpm discord:bot" --name dailytask-bot
pm2 save
```

### 6. Health check

`GET /api/health` → `{ "status": "ok" }`

Put Nginx/Caddy in front and proxy to `127.0.0.1:3000`.

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
