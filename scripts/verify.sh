#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="${ROOT_DIR}/statrumble"

if command -v pnpm >/dev/null 2>&1; then
  echo "==> pnpm -C statrumble lint"
  pnpm -C "${APP_DIR}" lint

  echo "==> pnpm -C statrumble typecheck"
  pnpm -C "${APP_DIR}" typecheck

  echo "==> pnpm -C statrumble test"
  pnpm -C "${APP_DIR}" test
else
  echo "==> npm --prefix statrumble run lint"
  npm --prefix "${APP_DIR}" run lint

  echo "==> npm --prefix statrumble run typecheck"
  npm --prefix "${APP_DIR}" run typecheck

  echo "==> npm --prefix statrumble run test --if-present"
  npm --prefix "${APP_DIR}" run test --if-present
fi

echo "==> node --loader scripts/ts-strip-loader.mjs scripts/verify-date-format.mjs"
node --loader "${ROOT_DIR}/scripts/ts-strip-loader.mjs" "${ROOT_DIR}/scripts/verify-date-format.mjs"
