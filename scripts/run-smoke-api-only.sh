#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE=".env.smoke"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Copy .env.smoke.example to $ENV_FILE and fill in local values." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source "$ENV_FILE"
set +a

BASE_URL="${BASE_URL:-http://localhost:3000}"

require_env() {
  local key="$1"
  if [[ -z "${!key:-}" ]]; then
    echo "Missing required env var for API-only smoke: $key" >&2
    exit 1
  fi
}

require_env "SUPABASE_URL"
require_env "SUPABASE_ANON_KEY"
require_env "TEST_EMAIL"
require_env "TEST_PASSWORD"
require_env "IMPORT_ID"

SMOKE_API_ONLY=1 BASE_URL="$BASE_URL" bash scripts/demo-smoke.sh
