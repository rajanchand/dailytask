#!/bin/sh
set -e

# pnpm 11 supply-chain / minimumReleaseAge can block fresh packages (e.g. bullmq)
# Prefer env + config-before-command; never rely on args after script names.
export npm_config_minimum_release_age=0
export PNPM_MINIMUM_RELEASE_AGE=0
if [ -w /app ] || [ -w /app/.npmrc ] 2>/dev/null; then
  printf '%s\n' \
    'minimumReleaseAge=0' \
    'dangerouslyAllowAllBuilds=true' \
    > /app/.npmrc 2>/dev/null || true
fi
pnpm config set minimumReleaseAge 0 >/dev/null 2>&1 || true
pnpm config set dangerouslyAllowAllBuilds true >/dev/null 2>&1 || true

echo "[entrypoint] Waiting for Postgres..."
i=0
until node <<'NODE'
const postgres = require("postgres");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const sql = postgres(url, { max: 1, connect_timeout: 3 });
sql`select 1`
  .then(async () => {
    await sql.end({ timeout: 1 });
    process.exit(0);
  })
  .catch(async () => {
    try {
      await sql.end({ timeout: 1 });
    } catch {
      /* ignore */
    }
    process.exit(1);
  });
NODE
do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then
    echo "[entrypoint] Postgres not ready after 60s — aborting"
    exit 1
  fi
  sleep 1
done

# Soft config checks (do not abort — schema push / start still useful for debugging)
if [ -z "${AUTH_SECRET:-}${NEXTAUTH_SECRET:-}" ]; then
  echo "[entrypoint] WARNING: AUTH_SECRET is empty — sessions will not be secure"
fi
if [ -n "${APP_URL:-}" ] && [ -n "${AUTH_URL:-}" ] && [ "$APP_URL" != "$AUTH_URL" ]; then
  echo "[entrypoint] WARNING: APP_URL ($APP_URL) != AUTH_URL ($AUTH_URL) — keep them identical in production"
fi
if [ "${NODE_ENV:-}" = "production" ] && echo "${AUTH_URL:-}${APP_URL:-}" | grep -Eq 'localhost|127\.0\.0\.1'; then
  echo "[entrypoint] WARNING: AUTH_URL/APP_URL looks like localhost in production"
fi
if [ "${RUN_SEED:-false}" = "true" ] && [ "${NODE_ENV:-}" = "production" ]; then
  echo "[entrypoint] WARNING: RUN_SEED=true in production will wipe users/tasks"
fi

echo "[entrypoint] Applying schema (drizzle-kit push)..."
# Bypass pnpm script deps/supply-chain checks — binaries already in the image
if [ -x ./node_modules/.bin/drizzle-kit ]; then
  ./node_modules/.bin/drizzle-kit push
elif [ -f ./node_modules/drizzle-kit/bin.cjs ]; then
  node ./node_modules/drizzle-kit/bin.cjs push
else
  pnpm --config.minimumReleaseAge=0 run db:push
fi

# Production: RUN_SEED must stay false unless you intentionally wipe users.
if [ "${RUN_SEED:-false}" = "true" ]; then
  echo "[entrypoint] WARNING: RUN_SEED=true will TRUNCATE users/tasks and reseed."
  if [ -x ./node_modules/.bin/tsx ]; then
    ./node_modules/.bin/tsx scripts/seed.ts || echo "[entrypoint] Seed skipped/failed (continuing)"
  else
    pnpm --config.minimumReleaseAge=0 run db:seed || echo "[entrypoint] Seed skipped/failed (continuing)"
  fi
else
  echo "[entrypoint] Skipping seed (RUN_SEED!=true)"
fi

mkdir -p "${UPLOAD_DIR:-./uploads}"

echo "[entrypoint] Starting: $*"
exec "$@"
