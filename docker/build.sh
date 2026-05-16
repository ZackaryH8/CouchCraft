#!/usr/bin/env bash
# Usage: ./docker/build.sh [path/to/gow-repo]
# Builds the CouchCraft .deb then assembles the GOW Docker image.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
GOW_REPO="${1:-${REPO_ROOT}/../gow}"
APP_BUILD_DIR="${GOW_REPO}/apps/couchcraft/build"

# ── 1. Build the .deb package ─────────────────────────────────────────────────
echo ">>> Building CouchCraft..."
cd "${REPO_ROOT}/tauri-app"
npm ci
npm run tauri build -- --bundles deb

DEB=$(find "${REPO_ROOT}/tauri-app/src-tauri/target/release/bundle/deb" -name "*.deb" | head -1)
if [[ -z "${DEB}" ]]; then
  echo "ERROR: no .deb found in target/release/bundle/deb" >&2
  exit 1
fi
echo ">>> Built: ${DEB}"

# ── 2. Copy app files into the GOW repo ──────────────────────────────────────
echo ">>> Copying files to ${APP_BUILD_DIR}..."
mkdir -p "${APP_BUILD_DIR}/scripts"

cp "${DEB}"                           "${APP_BUILD_DIR}/couchcraft.deb"
cp "${SCRIPT_DIR}/Dockerfile"         "${APP_BUILD_DIR}/Dockerfile"
cp "${SCRIPT_DIR}/scripts/startup.sh" "${APP_BUILD_DIR}/scripts/startup.sh"

# ── 3. Build the Docker image from the GOW repo root ─────────────────────────
echo ">>> Building Docker image..."
cd "${GOW_REPO}"
docker build \
  -t couchcraft:latest \
  --build-arg BASE_APP_IMAGE=ghcr.io/games-on-whales/base-app:edge \
  apps/couchcraft/build

echo ""
echo "Done. Image available as couchcraft:latest"
