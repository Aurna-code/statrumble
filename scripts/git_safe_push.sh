#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

# 옵션: --fast면 테스트 스킵
FAST=0
if [[ "${1:-}" == "--fast" ]]; then
  FAST=1
  shift
fi

MSG="${*:-}"
if [[ -z "$MSG" ]]; then
  MSG="wip: $(git branch --show-current) $(date +'%Y-%m-%d %H:%M:%S')"
fi

# 1) 전부 스테이징(단, gitignore가 막아줌)
git add -A

# 2) 스테이징된 파일 목록에서 위험 패턴 차단
STAGED="$(git diff --cached --name-only || true)"

if [[ -z "$STAGED" ]]; then
  echo "No changes staged. Nothing to commit."
  exit 0
fi

# 커밋 금지 패턴(필요하면 더 추가)
FORBIDDEN_REGEX='(^|/)\.env($|/)|(^|/)\.env\.[^/]+$|(^|/)node_modules/|(^|/)\.next/|(^|/)statrumble/supabase/\.temp/|(^|/)\.ssh/|id_rsa|id_ed25519|\.pem$|\.key$|\.p12$'

BAD="$(echo "$STAGED" | grep -E "$FORBIDDEN_REGEX" || true)"

# .env.example은 허용(예외 처리)
BAD="$(echo "$BAD" | grep -vE '(^|/)\.env\.example$' || true)"

if [[ -n "$BAD" ]]; then
  echo "❌ Refusing to commit/push. Forbidden files are staged:"
  echo "$BAD"
  echo
  echo "Fix: unstage/remove those files, or add proper .gitignore rules."
  git reset
  exit 1
fi

# 3) (선택) 빠른 검증
if [[ "$FAST" -eq 0 ]]; then
  # monorepo 루트에서 실행: 앱은 statrumble/ 안에 있음
  if command -v pnpm >/dev/null 2>&1; then
    pnpm -C statrumble run lint
    pnpm -C statrumble run typecheck
  fi
fi

# 4) 커밋 + 푸시
git commit -m "$MSG"
git push origin HEAD

# 5) supabase migrations 변경되면 경고만(자동 db push는 안 함)
if echo "$STAGED" | grep -qE '^statrumble/supabase/migrations/'; then
  echo
  echo "⚠️  Note: supabase migrations changed."
  echo "    Run: (cd statrumble && pnpm exec supabase db push --dry-run && pnpm exec supabase db push)"
fi

echo "✅ Done."
