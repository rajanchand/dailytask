#!/bin/sh
set -e

echo "[entrypoint] waiting for database..."
ATTEMPTS=0
MAX_ATTEMPTS=60

until node --input-type=module -e "
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 3 });
try {
  await sql\`select 1\`;
  await sql.end({ timeout: 1 });
  process.exit(0);
} catch (e) {
  await sql.end({ timeout: 1 }).catch(() => {});
  process.exit(1);
}
"; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -ge "$MAX_ATTEMPTS" ]; then
    echo "[entrypoint] database not ready after ${MAX_ATTEMPTS}s"
    exit 1
  fi
  echo "[entrypoint] database not ready yet (${ATTEMPTS}/${MAX_ATTEMPTS})..."
  sleep 1
done

echo "[entrypoint] pushing schema..."
pnpm db:push

if [ "${RUN_SEED:-false}" = "true" ]; then
  echo "[entrypoint] seeding database..."
  pnpm db:seed || echo "[entrypoint] seed failed or already seeded (continuing)"
fi

mkdir -p "${UPLOAD_DIR:-./uploads}"

echo "[entrypoint] starting: $*"
exec "$@"
