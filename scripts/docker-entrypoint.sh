#!/bin/sh
set -e

# pnpm 11 supply-chain / minimumReleaseAge can block fresh packages in CI/prod images
printf '%s\n' \
  'minimumReleaseAge=0' \
  'dangerouslyAllowAllBuilds=true' \
  > /app/.npmrc
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

echo "[entrypoint] Applying schema (pnpm db:push)..."
pnpm db:push --config.minimumReleaseAge=0

if [ "${RUN_SEED:-false}" = "true" ]; then
  echo "[entrypoint] Seeding database..."
  pnpm db:seed --config.minimumReleaseAge=0 || echo "[entrypoint] Seed skipped/failed (continuing)"
fi

mkdir -p "${UPLOAD_DIR:-./uploads}"

echo "[entrypoint] Starting: $*"
exec "$@"
