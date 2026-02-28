#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="${ROOT_DIR}/statrumble"

clean_next_type_artifacts() {
  echo "==> rm -rf statrumble/.next/types statrumble/.next/dev/types statrumble/.next/cache"
  rm -rf "${APP_DIR}/.next/types" "${APP_DIR}/.next/dev/types" "${APP_DIR}/.next/cache"
}

verify_next_types() {
  echo "==> node scripts/verify-next-types.mjs"
  node "${ROOT_DIR}/scripts/verify-next-types.mjs"
}

verify_workspace_delete_policy_guard() {
  local migrations_dir="${APP_DIR}/supabase/migrations"
  local migration_file="${migrations_dir}/023_workspace_delete_owner_only.sql"

  echo "==> verify workspace delete policy guard"

  if [ ! -f "${migration_file}" ]; then
    echo "Missing required migration: ${migration_file}" >&2
    exit 1
  fi

  if ! grep -q "create or replace function public.delete_workspace" "${migration_file}"; then
    echo "Missing delete_workspace RPC in ${migration_file}" >&2
    exit 1
  fi

  if grep -R -n -E 'create[[:space:]]+policy[[:space:]]+workspaces_delete_member' "${migrations_dir}" --include='*.sql' | grep -v '000_init.sql' >/dev/null; then
    echo "workspaces_delete_member policy was reintroduced outside 000_init.sql" >&2
    exit 1
  fi
}

if command -v pnpm >/dev/null 2>&1; then
  echo "==> pnpm -C statrumble lint"
  pnpm -C "${APP_DIR}" lint

  clean_next_type_artifacts

  echo "==> pnpm -C statrumble typecheck"
  pnpm -C "${APP_DIR}" typecheck

  verify_next_types

  echo "==> pnpm -C statrumble test"
  pnpm -C "${APP_DIR}" test
else
  echo "==> npm --prefix statrumble run lint"
  npm --prefix "${APP_DIR}" run lint

  clean_next_type_artifacts

  echo "==> npm --prefix statrumble run typecheck"
  npm --prefix "${APP_DIR}" run typecheck

  verify_next_types

  echo "==> npm --prefix statrumble run test --if-present"
  npm --prefix "${APP_DIR}" run test --if-present
fi

verify_workspace_delete_policy_guard

echo "==> node --loader scripts/ts-strip-loader.mjs scripts/verify-date-format.mjs"
node --loader "${ROOT_DIR}/scripts/ts-strip-loader.mjs" "${ROOT_DIR}/scripts/verify-date-format.mjs"
