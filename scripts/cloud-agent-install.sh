#!/usr/bin/env bash
# Idempotent Cloud Agent install. Secrets stay in the Cursor environment, not here.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="${HOME}/.bun/bin:/root/.bun/bin:${PATH}"
if ! command -v bun >/dev/null 2>&1; then
  curl -fsSL https://bun.sh/install | bash
  export PATH="${HOME}/.bun/bin:/root/.bun/bin:${PATH}"
fi
bun install
