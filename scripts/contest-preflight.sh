#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

WITH_LOCAL_SUPABASE=0

print_usage() {
  cat <<'EOF'
Usage: ./scripts/contest-preflight.sh [--with-local-supabase]
EOF
}

section() {
  printf '\n========== %s ==========\n' "$1"
}

warn() {
  printf 'WARN: %s\n' "$1"
}

die() {
  printf 'ERROR: %s\n' "$1"
  exit 1
}

for arg in "$@"; do
  case "$arg" in
    --with-local-supabase)
      WITH_LOCAL_SUPABASE=1
      ;;
    -h|--help)
      print_usage
      exit 0
      ;;
    *)
      die "Unknown argument: $arg"
      ;;
  esac
done

section "1) Git cleanliness"
if [ -n "$(git status --porcelain)" ]; then
  die "Working tree is not clean. Commit or stash changes."
fi
echo "Git cleanliness: OK"

section "2) Secret scan (tracked files only)"
TRACKED_ENV_FILES="$(git ls-files | grep -E '(^|/)\.env($|\.)' | grep -vE '(^|/)\.env\.example$' || true)"
if [ -n "$TRACKED_ENV_FILES" ]; then
  printf '%s\n' "$TRACKED_ENV_FILES"
  die "Tracked .env file found. Remove it from git history."
fi

if [ -f "$ROOT/scripts/secret-scan.mjs" ]; then
  echo "Running node scripts/secret-scan.mjs"
  node "$ROOT/scripts/secret-scan.mjs"
else
  PATTERN='(sk-[A-Za-z0-9]{20,}|OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|service_role|BEGIN PRIVATE KEY|-----BEGIN|AIzaSy|xox[baprs]-)'
  if git grep -n -I -E "$PATTERN" -- . ':!pnpm-lock.yaml' ':!docs/CODEX_LOG.md'; then
    die "Possible secret detected. Remove it before submission."
  fi
fi
echo "Secret scan: OK"

section "3) Dependency + checks"
echo "Running npm run verify"
npm run verify
echo "verify: OK"

echo "Running pnpm -C statrumble test"
pnpm -C statrumble test
echo "test: OK"

echo "Running pnpm -C statrumble build"
pnpm -C statrumble build
echo "build: OK"

section "4) Migration sanity"
MIGRATIONS_DIR="statrumble/supabase/migrations"

if [ ! -d "$MIGRATIONS_DIR" ]; then
  die "Migration directory not found: $MIGRATIONS_DIR"
fi

echo "Local migrations (latest 30):"
ls "$MIGRATIONS_DIR" | sort | tail -n 30

if ! ls "$MIGRATIONS_DIR" | grep -q '^000_'; then
  die "Missing 000 migration file locally."
fi

if ! ls "$MIGRATIONS_DIR" | grep -q '^022_'; then
  die "Missing 022 migration file locally."
fi
echo "Local migration check: OK"

REMOTE_LIST_OUTPUT_FILE="$(mktemp)"
if pnpm -C statrumble exec supabase migration list >"$REMOTE_LIST_OUTPUT_FILE" 2>&1; then
  cat "$REMOTE_LIST_OUTPUT_FILE"
  if grep -q '022' "$REMOTE_LIST_OUTPUT_FILE"; then
    echo "Remote migration check: found 022"
  else
    warn "Remote migration list does not include 022. Check linked project history."
  fi
else
  warn "supabase migration list failed (not linked). Skipping remote migration check."
  cat "$REMOTE_LIST_OUTPUT_FILE"
fi
rm -f "$REMOTE_LIST_OUTPUT_FILE"

if [ "$WITH_LOCAL_SUPABASE" -eq 1 ]; then
  section "5) Optional local Supabase smoke"
  if ! docker info >/dev/null 2>&1; then
    die "Docker is required for --with-local-supabase."
  fi

  pnpm -C statrumble exec supabase stop || true
  pnpm -C statrumble exec supabase start
  pnpm -C statrumble exec supabase db reset
  pnpm -C statrumble exec supabase status
  pnpm -C statrumble exec supabase stop

  echo "Local Supabase smoke: OK"
fi

echo
echo "Preflight OK. Next: push, create release tag, take screenshots."
