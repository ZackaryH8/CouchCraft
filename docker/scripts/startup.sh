#!/bin/bash
set -e

# Pre-create app data dir so Tauri can write on first launch.
# Must run before launcher drops to the retro user.
APP_DATA=/home/retro/.local/share/com.couchcraft.launcher
mkdir -p "$APP_DATA"
chown -R retro:retro /home/retro/.local

# Must be set before launch-comp.sh starts Sway so the env is inherited
export WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1
export WEBKIT_DISABLE_COMPOSITING_MODE=1
export WEBKIT_DISABLE_DMABUF_RENDERER=1

source /opt/gow/launch-comp.sh
launcher /usr/bin/couchcraft