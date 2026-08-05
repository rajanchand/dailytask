#!/usr/bin/env bash
# Lightweight uptime probe for /api/health.
# Cron example (every 5 min):
#   */5 * * * * APP_DIR=/opt/dailytask /opt/dailytask/scripts/health-watch.sh >>/var/log/dailytask-health.log 2>&1
#
# Env:
#   HEALTH_URL              — default http://127.0.0.1:3000/api/health
#   DISCORD_WEBHOOK_URL     — optional alert webhook
#   HEALTH_ALERT_WEBHOOK_URL — preferred override for alerts (falls back to DISCORD_WEBHOOK_URL)
#   HEALTH_ALERT_COOLDOWN_SEC — suppress repeat Discord alerts (default 900)

set -euo pipefail

HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"
WEBHOOK="${HEALTH_ALERT_WEBHOOK_URL:-${DISCORD_WEBHOOK_URL:-}}"
COOLDOWN="${HEALTH_ALERT_COOLDOWN_SEC:-900}"
STATE_DIR="${HEALTH_WATCH_STATE_DIR:-/tmp/dailytask-health-watch}"
STATE_FILE="${STATE_DIR}/last-alert"
mkdir -p "${STATE_DIR}"

TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
BODY_FILE="$(mktemp)"
trap 'rm -f "${BODY_FILE}"' EXIT

HTTP_CODE="$(
  curl -sS -o "${BODY_FILE}" -w '%{http_code}' --max-time 10 "${HEALTH_URL}" || echo "000"
)"

if [[ "${HTTP_CODE}" == "200" ]]; then
  # Clear alert state on recovery so the next outage notifies again
  rm -f "${STATE_FILE}"
  exit 0
fi

MSG="[${TS}] health-watch FAIL http=${HTTP_CODE} url=${HEALTH_URL} body=$(tr '\n' ' ' < "${BODY_FILE}" | head -c 400)"
echo "${MSG}" >&2

if [[ -n "${WEBHOOK}" ]]; then
  NOW="$(date +%s)"
  LAST=0
  [[ -f "${STATE_FILE}" ]] && LAST="$(cat "${STATE_FILE}" 2>/dev/null || echo 0)"
  if [[ $((NOW - LAST)) -ge "${COOLDOWN}" ]]; then
    payload="$(printf '{"content":%s}' "$(printf '%s' "${MSG}" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null || printf '"%s"' "${MSG}")")"
    curl -sS -o /dev/null --max-time 10 -H 'Content-Type: application/json' \
      -d "${payload}" "${WEBHOOK}" || true
    echo "${NOW}" > "${STATE_FILE}"
  fi
fi

exit 1
