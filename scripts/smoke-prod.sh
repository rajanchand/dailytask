#!/usr/bin/env bash
# Quick production smoke checks (health + login page).
#
# Usage:
#   BASE_URL=https://dailytask.zero-trust-security.org ./scripts/smoke-prod.sh
#   ./scripts/smoke-prod.sh http://127.0.0.1:3000

set -euo pipefail

BASE="${1:-${BASE_URL:-http://127.0.0.1:3000}}"
BASE="${BASE%/}"
FAIL=0

check() {
  local name="$1" url="$2" expect="$3"
  local code body_file
  body_file="$(mktemp)"
  code="$(curl -sS -o "${body_file}" -w '%{http_code}' --max-time 15 -L "${url}" || echo 000)"
  if [[ "${code}" == "${expect}" ]] || [[ "${expect}" == "*" && "${code}" != "000" && "${code}" != "5"* ]]; then
    echo "OK  ${name} → ${code}"
  else
    echo "FAIL ${name} → ${code} (expected ${expect})" >&2
    head -c 200 "${body_file}" >&2 || true
    echo >&2
    FAIL=1
  fi
  rm -f "${body_file}"
}

echo "==> Smoke against ${BASE}"
check "GET /api/health" "${BASE}/api/health" "200"
check "GET /login" "${BASE}/login" "200"

# Optional CSP / security header spot-check on login
HEADERS="$(curl -sS -I --max-time 15 "${BASE}/login" || true)"
if echo "${HEADERS}" | grep -qi 'content-security-policy'; then
  echo "OK  CSP header present on /login"
else
  echo "WARN CSP header missing on /login" >&2
fi
if echo "${HEADERS}" | grep -qi 'strict-transport-security'; then
  echo "OK  HSTS header present on /login"
fi

if [[ "${FAIL}" -ne 0 ]]; then
  echo "==> Smoke FAILED" >&2
  exit 1
fi
echo "==> Smoke PASSED"
