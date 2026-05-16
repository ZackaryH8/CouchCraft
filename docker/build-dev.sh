#!/usr/bin/env bash
# Fast dev build — compiles the binary only (no bundling), no .deb needed.
# Usage: ./docker/build-dev.sh [path/to/gow-repo]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
GOW_REPO="${1:-${REPO_ROOT}/../gow}"
APP_BUILD_DIR="${GOW_REPO}/apps/couchcraft/build"

# ── 1. Build binary with embedded frontend ────────────────────────────────────
echo ">>> Building CouchCraft..."
cd "${REPO_ROOT}/tauri-app"
npm run tauri build -- --no-bundle

BINARY="${REPO_ROOT}/tauri-app/src-tauri/target/release/couchcraft"
if [[ ! -f "${BINARY}" ]]; then
  echo "ERROR: binary not found at ${BINARY}" >&2
  exit 1
fi

# ── 2. Stage files into GOW repo ──────────────────────────────────────────────
echo ">>> Staging files into ${APP_BUILD_DIR}..."
mkdir -p "${APP_BUILD_DIR}/scripts"

cp "${BINARY}"                           "${APP_BUILD_DIR}/couchcraft"
cp "${SCRIPT_DIR}/Dockerfile.dev"        "${APP_BUILD_DIR}/Dockerfile.dev"
cp "${SCRIPT_DIR}/scripts/startup.sh"    "${APP_BUILD_DIR}/scripts/startup.sh"

# ── 3. Build image ────────────────────────────────────────────────────────────
echo ">>> Building Docker image..."
cd "${GOW_REPO}"
docker build \
  -t couchcraft:dev \
  -f apps/couchcraft/build/Dockerfile.dev \
  --build-arg BASE_APP_IMAGE=ghcr.io/games-on-whales/base-app:edge \
  apps/couchcraft/build

echo ""
echo "Done. Image available as couchcraft:dev"
