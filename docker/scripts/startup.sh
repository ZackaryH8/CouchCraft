#!/bin/bash
set -e

# Pre-create app data dir so Tauri can write on first launch.
# Script already runs as retro, so mkdir is sufficient — chown is not needed.
mkdir -p /home/retro/.local/share/com.couchcraft.launcher

# Must be set before launch-comp.sh starts Sway so the env is inherited
export WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1
export WEBKIT_DISABLE_COMPOSITING_MODE=1
export WEBKIT_DISABLE_DMABUF_RENDERER=1

source /opt/gow/launch-comp.sh
launcher /usr/bin/couchcraft