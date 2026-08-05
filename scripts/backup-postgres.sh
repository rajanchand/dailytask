#!/usr/bin/env bash
# Logical Postgres backup for the production Compose stack.
#
# Usage (on VPS):
#   /opt/dailytask/scripts/backup-postgres.sh
#
# Env (optional):
#   APP_DIR          — default /opt/dailytask
#   COMPOSE_FILE     — default docker-compose.prod.yml
#   BACKUP_DIR       — default $APP_DIR/backups
#   RETAIN_DAYS      — default 14
#   UPLOADS_WARN_MB  — warn if uploads volume > this many MB (default 2048)
#   POSTGRES_USER / POSTGRES_DB — defaults dailyflow

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/dailytask}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKUP_DIR="${BACKUP_DIR:-${APP_DIR}/backups}"
RETAIN_DAYS="${RETAIN_DAYS:-14}"
UPLOADS_WARN_MB="${UPLOADS_WARN_MB:-2048}"
PG_USER="${POSTGRES_USER:-dailyflow}"
PG_DB="${POSTGRES_DB:-dailyflow}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${BACKUP_DIR}/dailyflow-${STAMP}.dump"
LOG_TAG="backup-postgres"

mkdir -p "${BACKUP_DIR}"
cd "${APP_DIR}"

echo "[${LOG_TAG}] dumping ${PG_DB} → ${OUT}"
docker compose -f "${COMPOSE_FILE}" exec -T postgres \
  pg_dump -U "${PG_USER}" -d "${PG_DB}" -Fc > "${OUT}"

# Refuse empty / tiny dumps (likely failed silently)
SIZE="$(wc -c < "${OUT}" | tr -d ' ')"
if [[ "${SIZE}" -lt 1024 ]]; then
  echo "[${LOG_TAG}] ERROR: dump too small (${SIZE} bytes) — removing" >&2
  rm -f "${OUT}"
  exit 1
fi

echo "[${LOG_TAG}] wrote ${OUT} (${SIZE} bytes)"

# Prune old dumps
find "${BACKUP_DIR}" -type f -name 'dailyflow-*.dump' -mtime "+${RETAIN_DAYS}" -print -delete \
  | while read -r f; do echo "[${LOG_TAG}] pruned ${f}"; done || true

# Uploads volume size warning (via app container mount)
UPLOADS_BYTES="$(
  docker compose -f "${COMPOSE_FILE}" exec -T app \
    sh -c 'du -sb /app/uploads 2>/dev/null | cut -f1' 2>/dev/null || echo 0
)"
UPLOADS_BYTES="$(echo "${UPLOADS_BYTES}" | tr -cd '0-9')"
UPLOADS_BYTES="${UPLOADS_BYTES:-0}"
UPLOADS_MB=$((UPLOADS_BYTES / 1024 / 1024))
if [[ "${UPLOADS_MB}" -ge "${UPLOADS_WARN_MB}" ]]; then
  echo "[${LOG_TAG}] WARNING: uploads volume ~${UPLOADS_MB}MB (threshold ${UPLOADS_WARN_MB}MB)" >&2
fi

echo "[${LOG_TAG}] done"
