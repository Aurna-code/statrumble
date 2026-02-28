#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

# Option: --fast skips checks
FAST=0
if [[ "${1:-}" == "--fast" ]]; then
  FAST=1
  shift
fi

MSG="${*:-}"
if [[ -z "$MSG" ]]; then
  MSG="wip: $(git branch --show-current) $(date +'%Y-%m-%d %H:%M:%S')"
fi

# 1) Stage everything (gitignore still applies)
git add -A

# 2) Block risky patterns in staged files
STAGED="$(git diff --cached --name-only || true)"

if [[ -z "$STAGED" ]]; then
  echo "No changes staged. Nothing to commit."
  exit 0
fi

# Forbidden patterns (extend as needed)
FORBIDDEN_REGEX='(^|/)\.env($|/)|(^|/)\.env\.[^/]+$|(^|/)node_modules/|(^|/)\.next/|(^|/)statrumble/supabase/\.temp/|(^|/)\.ssh/|id_rsa|id_ed25519|\.pem$|\.key$|\.p12$'

BAD="$(echo "$STAGED" | grep -E "$FORBIDDEN_REGEX" || true)"

# Allow .env.example
BAD="$(echo "$BAD" | grep -vE '(^|/)\.env\.example$' || true)"

if [[ -n "$BAD" ]]; then
  echo "❌ Refusing to commit/push. Forbidden files are staged:"
  echo "$BAD"
  echo
  echo "Fix: unstage/remove those files, or add proper .gitignore rules."
  git reset
  exit 1
fi

# 3) Optional quick checks
if [[ "$FAST" -eq 0 ]]; then
  # Run from monorepo root; app lives under statrumble/
  if command -v pnpm >/dev/null 2>&1; then
    pnpm -C statrumble run lint
    pnpm -C statrumble run typecheck
  fi
fi

# 4) Commit + push
git commit -m "$MSG"
git push origin HEAD

# 5) Warn when migrations changed (no automatic db push)
if echo "$STAGED" | grep -qE '^statrumble/supabase/migrations/'; then
  echo
  echo "⚠️  Note: supabase migrations changed."
  echo "    Run: (cd statrumble && pnpm exec supabase db push --dry-run && pnpm exec supabase db push)"
fi

echo "✅ Done."
