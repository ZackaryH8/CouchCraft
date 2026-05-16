#!/usr/bin/env bash
# Build the production Docker image and push to GHCR.
# Usage: ./docker/release.sh
# Requires: docker login ghcr.io first
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
REGISTRY="ghcr.io/zackaryh8/couchcraft"

# ── Read version from Cargo.toml ──────────────────────────────────────────────
VERSION=$(grep '^version' "${REPO_ROOT}/tauri-app/src-tauri/Cargo.toml" | head -1 | sed 's/version = "\(.*\)"/\1/')
echo ">>> Releasing CouchCraft v${VERSION}"

# ── 1. Build the .deb ─────────────────────────────────────────────────────────
echo ">>> Building .deb..."
cd "${REPO_ROOT}/tauri-app"
npm ci
npm run tauri build -- --bundles deb

DEB=$(find "${REPO_ROOT}/tauri-app/src-tauri/target/release/bundle/deb" -name "*.deb" | head -1)
[[ -z "${DEB}" ]] && { echo "ERROR: no .deb found in target/release/bundle/deb" >&2; exit 1; }
echo ">>> Built: ${DEB}"

# ── 2. Stage build context into a temp dir ────────────────────────────────────
BUILD_CTX=$(mktemp -d)
trap 'rm -rf "${BUILD_CTX}"' EXIT

mkdir -p "${BUILD_CTX}/scripts"
cp "${DEB}"                           "${BUILD_CTX}/couchcraft.deb"
cp "${SCRIPT_DIR}/Dockerfile"         "${BUILD_CTX}/Dockerfile"
cp "${SCRIPT_DIR}/scripts/startup.sh" "${BUILD_CTX}/scripts/startup.sh"

# ── 3. Build Docker image ─────────────────────────────────────────────────────
echo ">>> Building Docker image..."
docker build \
  -t "${REGISTRY}:${VERSION}" \
  -t "${REGISTRY}:latest" \
  --build-arg BASE_APP_IMAGE=ghcr.io/games-on-whales/base-app:edge \
  --build-arg IMAGE_SOURCE="https://github.com/ZackaryH8/CouchCraft" \
  "${BUILD_CTX}"

# ── 4. Push to GHCR ───────────────────────────────────────────────────────────
echo ">>> Pushing ${REGISTRY}:${VERSION}..."
docker push "${REGISTRY}:${VERSION}"
echo ">>> Pushing ${REGISTRY}:latest..."
docker push "${REGISTRY}:latest"

echo ""
echo "Done! Published:"
echo "  ${REGISTRY}:${VERSION}"
echo "  ${REGISTRY}:latest"
