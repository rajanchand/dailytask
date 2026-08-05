#!/usr/bin/env bash
# Deploy Daily Task Managing System to a VPS via rsync + docker compose.
#
# Required env:
#   VPS_HOST   — e.g. 212.227.39.216
#   VPS_USER   — e.g. root
#
# Auth (one of):
#   VPS_SSH_KEY — path to private key
#   VPS_PASS    — password (requires sshpass)
#
# Optional:
#   VPS_APP_DIR — remote path (default /opt/dailytask)
#   VPS_PORT    — SSH port (default 22)
#   SKIP_BUILD  — if 1, only rsync + restart (compose rebuilds)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${VPS_HOST:?Set VPS_HOST}"
USER="${VPS_USER:-root}"
PORT="${VPS_PORT:-22}"
APP_DIR="${VPS_APP_DIR:-/opt/dailytask}"

SSH_OPTS=(-p "$PORT" -o StrictHostKeyChecking=accept-new)
RSYNC_SSH="ssh -p $PORT -o StrictHostKeyChecking=accept-new"

if [[ -n "${VPS_SSH_KEY:-}" ]]; then
  SSH_OPTS+=(-i "$VPS_SSH_KEY")
  RSYNC_SSH="ssh -p $PORT -i $VPS_SSH_KEY -o StrictHostKeyChecking=accept-new"
fi

run_ssh() {
  if [[ -n "${VPS_PASS:-}" ]] && command -v sshpass >/dev/null 2>&1; then
    sshpass -p "$VPS_PASS" ssh "${SSH_OPTS[@]}" "${USER}@${HOST}" "$@"
  else
    ssh "${SSH_OPTS[@]}" "${USER}@${HOST}" "$@"
  fi
}

run_rsync() {
  local args=(-az --delete
    --exclude '.git'
    --exclude 'node_modules'
    --exclude '.next'
    --exclude '.pnpm-store'
    --exclude 'uploads'
    --exclude '.env'
    --exclude '.env.local'
    --exclude '.DS_Store'
    -e "$RSYNC_SSH"
  )
  if [[ -n "${VPS_PASS:-}" ]] && command -v sshpass >/dev/null 2>&1; then
    sshpass -p "$VPS_PASS" rsync "${args[@]}" "$@"
  else
    rsync "${args[@]}" "$@"
  fi
}

echo "==> Ensuring remote directory ${APP_DIR}"
run_ssh "mkdir -p '${APP_DIR}'"

echo "==> Rsyncing ${ROOT} → ${USER}@${HOST}:${APP_DIR}"
run_rsync "${ROOT}/" "${USER}@${HOST}:${APP_DIR}/"

echo "==> Rebuilding and restarting containers"
run_ssh "cd '${APP_DIR}' && docker compose -f docker-compose.prod.yml up -d --build"

echo "==> Waiting for health"
sleep 10
run_ssh "curl -fsS http://127.0.0.1:3000/api/health || (docker compose -f '${APP_DIR}/docker-compose.prod.yml' logs --tail=80 app; exit 1)"

echo "==> Deploy complete"
