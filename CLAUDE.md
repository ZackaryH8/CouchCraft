# CouchCraft — AI Agent Reference

This file is for AI coding agents working in this repository. Read it before making changes.

---

## What this is

A Tauri 2 app (Rust + WebKit2GTK + React/TypeScript) that acts as a gamepad-driven Minecraft launcher. It runs inside a Wolf/GOW Docker container streamed via Moonlight. There is no keyboard or mouse input in normal use — everything goes through a gamepad.

---

## Build commands

All commands run from `tauri-app/`:

```bash
npm run tauri dev                    # local dev, hot reload, needs a desktop env
npm run tauri build -- --no-bundle  # release binary only (for Docker dev image)
npm run tauri build                  # full build including .deb
```

Docker images:
```bash
./docker/build-dev.sh   # builds binary + couchcraft:dev image
./docker/build.sh       # builds .deb + couchcraft:latest image
```

Do not use `cargo build --release` directly — it skips the frontend build step and produces a binary that points at `localhost:1420` instead of embedded assets.

---

## Repository layout

```
docker/                     Wolf/Docker deployment files
  Dockerfile                Production image (installs .deb)
  Dockerfile.dev            Dev image (copies raw binary)
  build.sh / build-dev.sh   Build scripts
  scripts/startup.sh        Container entrypoint
  wolf-app.toml             Wolf config template

tauri-app/
  src/                      React frontend (TypeScript)
    App.tsx                 Root — owns navigation state and routes gamepad input
    pages/                  One file per page
    hooks/                  Shared React hooks
    components/             Sidebar, GamepadGlyph, SplashScreen
    gamepad/glyphs.ts       Button image paths for Xbox and PS layouts
    services/db.ts          All SQLite access (instances table, settings table)
    types.ts                Shared TS types

  src-tauri/src/
    lib.rs                  Tauri builder, setup(), all #[tauri::command] handlers
    auth.rs                 Microsoft OAuth2 device code flow
```

---

## Frontend patterns

### Navigation

`useNavStack` is a simple push/pop stack. Pages: `home`, `library`, `create`, `settings`, `account`.

`globalFocus` in `App.tsx` is either `"sidebar"` or `"page"`. Gamepad events are routed to either `sidebar.handleInput` or the current page's `handleInput` based on this.

### Page structure

Every page file exports two things:
- `useFooPage(...)` — hook that owns state, handles input, returns props
- `FooPage(...)` — pure render component that takes those props

All page hooks are **always mounted** in `App.tsx` (not conditionally). This keeps state alive across navigation without re-fetching from the DB.

### Gamepad input

`useGamepad` (in `hooks/useGamepad.ts`) listens to `tauri-plugin-gamepad` events and fires a callback with a `GamepadInput` string: `"UP"`, `"DOWN"`, `"LEFT"`, `"RIGHT"`, `"A"`, `"B"`, `"X"`, `"Y"`.

`App.tsx` receives the event and dispatches to the active handler. Adding a new input action means: handle it in the relevant page's `handleInput`, not in `useGamepad`.

### Data layer

All database reads/writes go through `src/services/db.ts`. The SQLite schema is defined in `lib.rs` as a migration (version 1). Tables: `instances`, `settings`.

### OSK (on-screen keyboard)

`useOSK` in `hooks/useOSK.ts` manages keyboard state. Open it with `osk.open(label, initialValue, onConfirm, onCancel?)`. The `label` string is displayed as the field title — pass something descriptive like `"Instance Name"`, `"Search"`, or `"JVM Arguments"`.

### Mrpack imports

Users can drop `.mrpack` files into `<app_data>/imports/` (i.e. `~/.local/share/com.couchcraft.launcher/imports/` on Linux). The Create flow's "Import" source option scans this directory via `list_import_files` and installs the selected pack using `install_mrpack_from_file`. The folder is global — files persist and are not consumed after install.

### Display scaling

`useViewportScale` returns `min(innerWidth/1920, innerHeight/1080)`. `App.tsx` applies this as `transform: scale(N)` with `transformOrigin: "top left"` on a fixed 1920×1080 root element. Do not use viewport units (`vw`, `vh`) or dynamic font sizes — everything is designed at 1920×1080 and scaled via transform.

---

## Rust backend

### lib.rs

- `.setup()` — sizes the window to the monitor's physical size via `current_monitor()`, or falls back to the `COUCHCRAFT_RESOLUTION` env var (set by `startup.sh`)
- `launch_minecraft` — spawns the Java process (currently scaffolded)
- `rumble_gamepad` — sends force feedback via gilrs
- `start_device_code_flow`, `poll_device_code`, `refresh_mc_auth` — auth commands, implemented in `auth.rs`

### auth.rs

Full Microsoft → Xbox Live → XSTS → Minecraft auth chain. Uses `reqwest` with `rustls-tls` (no OpenSSL). Returns tokens to the frontend; the frontend stores them in SQLite via `db.ts`.

---

## Docker / Wolf specifics

### startup.sh

Runs inside the container before the app starts. Order matters:

1. Export WebKit env vars **before** `source /opt/gow/launch-comp.sh` so Sway inherits them
2. `source /opt/gow/launch-comp.sh` starts Sway and waits for it to be ready
3. Query Sway output resolution via `swaymsg` and export as `COUCHCRAFT_RESOLUTION`
4. `launcher /usr/bin/couchcraft` starts the app inside Sway

### WebKit sandbox

Must be disabled in Docker. Set `WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS=1`. The old `WEBKIT_FORCE_SANDBOX=0` no longer works. Also set `WEBKIT_DISABLE_COMPOSITING_MODE=1` and `WEBKIT_DISABLE_DMABUF_RENDERER=1` for rendering stability.

### GDK scaling

`GDK_SCALE=1` and `GDK_DPI_SCALE=1` are set in the Dockerfiles. Without these, if Sway reports a scale factor > 1, WebKit's CSS viewport halves in size and `current_monitor()` disagrees with `window.innerWidth`.

### Window sizing

`fullscreen: true` in `tauri.conf.json` alone does not reliably fill the Sway output. The Rust `setup()` hook explicitly sets the window size to the monitor's physical dimensions. `current_monitor()` may return `None` on Wayland before window mapping — the `COUCHCRAFT_RESOLUTION` env var from `startup.sh` is the fallback.

---

## What not to do

- Do not add `cargo build --release` as a build step — always go through `npm run tauri build`
- Do not use `WEBKIT_FORCE_SANDBOX=0` — it is silently ignored by newer WebKit
- Do not add `WINIT_X11_SCALE_FACTOR` — X11-specific, has no effect in the Wayland container
- Do not use `vw`/`vh` units or dynamic font sizes in CSS — the transform scale approach handles all resolution differences
- Do not add a `setup()` `.setup()` callback without `use tauri::Manager` imported
- Do not mount `/home/retro/.local/share/couchcraft` manually in the Wolf config — Wolf auto-mounts `profile-data/user/<ContainerName>/` as `/home/retro/` and the app data path is `com.couchcraft.launcher`, not `couchcraft`
