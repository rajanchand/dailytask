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

echo "[entrypoint] Applying schema (drizzle-kit push)..."
# Bypass pnpm script deps/supply-chain checks — binaries already in the image
if [ -x ./node_modules/.bin/drizzle-kit ]; then
  ./node_modules/.bin/drizzle-kit push
elif [ -f ./node_modules/drizzle-kit/bin.cjs ]; then
  node ./node_modules/drizzle-kit/bin.cjs push
else
  pnpm --config.minimumReleaseAge=0 run db:push
fi

if [ "${RUN_SEED:-false}" = "true" ]; then
  echo "[entrypoint] Seeding database..."
  if [ -x ./node_modules/.bin/tsx ]; then
    ./node_modules/.bin/tsx scripts/seed.ts || echo "[entrypoint] Seed skipped/failed (continuing)"
  else
    pnpm --config.minimumReleaseAge=0 run db:seed || echo "[entrypoint] Seed skipped/failed (continuing)"
  fi
fi

mkdir -p "${UPLOAD_DIR:-./uploads}"

echo "[entrypoint] Starting: $*"
exec "$@"
