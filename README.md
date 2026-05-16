# CouchCraft

![CouchCraft](images/main.png)

A Minecraft launcher designed to run on a TV via a gamepad. No keyboard or mouse required.

It runs as a [Wolf](https://github.com/games-on-whales/wolf) / [Games on Whales](https://github.com/games-on-whales/gow) Docker container, streamed to any Moonlight-compatible client.

---

## How it works

CouchCraft is a [Tauri 2](https://tauri.app) app — Rust backend, WebKit2GTK renderer, React/TypeScript/Tailwind frontend. Inside a Wolf container, [Sway](https://swaywm.org) acts as the Wayland compositor. Wolf streams the Sway output to Moonlight clients.

```
Moonlight client (TV/phone/etc)
        ↕ (stream)
   Wolf / GOW host
        ↕
   Docker container
     Sway (Wayland compositor)
       ↕
   CouchCraft (Tauri app)
```

All UI interaction is gamepad-driven. There is no keyboard or pointer input in normal use.

---

## Stack

| Layer | Technology |
|---|---|
| App framework | Tauri 2 |
| Frontend | React 19, TypeScript, Vite |
| Styling | Tailwind CSS v4 |
| Database | SQLite via `tauri-plugin-sql` |
| Gamepad | `tauri-plugin-gamepad` + `gilrs` |
| Auth | Microsoft OAuth2 device code flow |
| Container base | `ghcr.io/games-on-whales/base-app:edge` |
| Compositor | Sway (via GOW's `launch-comp.sh`) |

---

## Project structure

```
CouchCraft/
├── docker/
│   ├── Dockerfile          # Production image (installs .deb)
│   ├── Dockerfile.dev      # Dev image (copies raw binary)
│   ├── build.sh            # Builds .deb and production Docker image
│   ├── build-dev.sh        # Builds binary and dev Docker image
│   ├── wolf-app.toml       # Template Wolf config block
│   └── scripts/
│       └── startup.sh      # Container entrypoint (sets env, starts Sway, launches app)
├── images/                 # Logos and Wolf card art (SVG + PNG)
└── tauri-app/
    ├── src/                # React frontend
    │   ├── App.tsx         # Root component, input routing, nav state
    │   ├── pages/          # One file per page; each exports a hook + component
    │   ├── hooks/          # Shared hooks (gamepad, auth, instances, settings, etc.)
    │   ├── components/     # Sidebar, GamepadGlyph, SplashScreen
    │   ├── gamepad/        # Button glyph definitions (Xbox / PS layouts)
    │   ├── services/db.ts  # All SQLite queries
    │   └── types.ts        # Shared TypeScript types
    └── src-tauri/          # Rust backend
        └── src/
            ├── lib.rs      # Tauri setup, commands (launch_minecraft, rumble_gamepad, etc.)
            └── auth.rs     # Microsoft OAuth2 device code flow implementation
```

---

## Local development

### Prerequisites

- [Rust](https://rustup.rs) (stable)
- [Node.js](https://nodejs.org) 18+
- A Wayland or X11 desktop environment
- WebKit2GTK 4.1 (`libwebkit2gtk-4.1-dev` on Debian/Ubuntu)

### Run locally

```bash
cd tauri-app
npm install
npm run tauri dev
```

This starts Vite's dev server on `localhost:1420` and opens the app window. Hot reload works for frontend changes. Rust changes require a restart.

### Build a standalone binary

```bash
cd tauri-app
npm run tauri build -- --no-bundle
# binary at: src-tauri/target/release/couchcraft
```

`--no-bundle` skips generating .deb/.AppImage. The binary has the frontend embedded and does not need a dev server.

### Build the full .deb package

```bash
cd tauri-app
npm run tauri build
# .deb at: src-tauri/target/release/bundle/deb/*.deb
```

---

## Docker / Wolf deployment

### Dev image (fastest iteration)

Builds the binary and packages it into a Docker image directly:

```bash
./docker/build-dev.sh
# produces: couchcraft:dev
```

This runs `npm run tauri build -- --no-bundle`, then builds the Docker image using `Dockerfile.dev`.

### Production image

Builds a .deb, then installs it into the image:

```bash
./docker/build.sh
# produces: couchcraft:latest
```

### Wolf configuration

Add the block from `docker/wolf-app.toml` to your Wolf `config.toml` under `[[profiles.apps]]`.

Key Wolf env vars used:
- `RUN_SWAY=true` — tells GOW's `launch-comp.sh` to start Sway
- `GOW_REQUIRED_DEVICES` — passes input and DRM devices into the container

### Transferring images to the Wolf host

```bash
docker save couchcraft:dev | gzip | ssh user@host 'docker load'
```

Or export/import via a file:

```bash
docker save couchcraft:dev | gzip > couchcraft-dev.tar.gz
scp couchcraft-dev.tar.gz user@host:~
ssh user@host 'docker load < couchcraft-dev.tar.gz'
```

---

## Navigation model

All navigation is stack-based (`useNavStack`). Pages are: `home`, `library`, `create`, `settings`, `account`.

Global focus is either `"sidebar"` or `"page"`. Gamepad input (`useGamepad`) fires events that `App.tsx` routes to the correct handler based on current focus and page.

Pages each export two things:
- A hook (e.g. `useHomePage`) that owns the page's state and `handleInput`
- A component (e.g. `HomePage`) that renders from that state

All page hooks are always mounted so state survives navigation without re-fetching.

---

## Display / scaling

The UI is designed at 1920×1080. `useViewportScale` calculates `min(viewport_width / 1920, viewport_height / 1080)` and applies a CSS `transform: scale()` to the root so the entire UI scales to fit any resolution (720p, 1080p, 4K).

In the Wolf container, window sizing works as follows:
1. Rust `setup()` tries `current_monitor()` to get the display size
2. Falls back to `COUCHCRAFT_RESOLUTION` env var, set by `startup.sh` via `swaymsg` after Sway starts
3. `GDK_SCALE=1` and `GDK_DPI_SCALE=1` are set in the Dockerfile to prevent GTK from applying HiDPI scaling that would make physical and CSS pixel counts disagree

---

## Microsoft authentication

Uses the [device code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-device-code). The app displays a short code and a URL; the user enters it on a phone or PC. No keyboard needed on the TV.

The auth chain is: Microsoft device code → access token → Xbox Live token → XSTS token → Minecraft token → profile fetch. Implemented in `src-tauri/src/auth.rs`.

The `CLIENT_ID` in `auth.rs` is CouchCraft's own Azure app registration, approved by Microsoft and Mojang for third-party launcher use.

---

## Known issues and gotchas

**`fullscreen: true` alone doesn't fill the screen in Wolf.** Without explicit dimensions or programmatic sizing, the Tauri window may not fill the Sway output. `current_monitor()` can return `None` on Wayland before the window is mapped, hence the `COUCHCRAFT_RESOLUTION` fallback.

---

## License

MIT
