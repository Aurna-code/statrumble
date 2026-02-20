#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="${ROOT_DIR}/statrumble"

cd "${APP_DIR}"

npm run lint
npm run typecheck
npm run test --if-present
