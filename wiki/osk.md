# On-Screen Keyboard (OSK)

CouchCraft has no keyboard or mouse — all text entry goes through a gamepad-driven on-screen keyboard. This document covers the design, input model, navigation rules, and known caveats.

---

## Files

| File | Role |
|------|------|
| `tauri-app/src/hooks/useOSK.ts` | All state and input logic |
| `tauri-app/src/components/OSK.tsx` | Pure render component |

The OSK is opened imperatively: callers call `osk.open(initialValue, onConfirm, onCancel?)` and the hook takes over all gamepad input until the user confirms or cancels. `App.tsx` routes every `GamepadInput` to `osk.handleInput` first when the OSK is open, so no other page receives input while it is active.

---

## Layout

```
┌──────────┬────────────────────────────────────────────────────┬──────────┐
│          │  1  2  3  4  5  6  7  8  9  0                      │  ⌫ Back  │
│ ←Cursor  │  q  w  e  r  t  y  u  i  o  p                      │          │
│  (LB/L1) │  a  s  d  f  g  h  j  k  l  '                      │ →Cursor  │
│          │  z  x  c  v  b  n  m  ,  .  /                      │  (RB/R1) │
│   Caps   │              Space                                   │          │
│  (L3/L2) │                                                      │  Enter   │
└──────────┴────────────────────────────────────────────────────┴──────────┘
```

Three sections: **left sidebar**, **main grid**, **right sidebar**. The main grid is 5 rows × 10 columns, with row 4 being a single full-width spacebar.

### Sizing

- Each key: `w-16` (64px) × `h-14` (56px), `gap-2` (8px) between keys
- Spacebar: `w-[712px]` = 10 × 64 + 9 × 8 — exactly the width of a 10-key row
- Sidebar 2-row keys: `h-[120px]` = 56 + 8 + 56 — flush with two adjacent main rows
- Left sidebar has an `h-14` spacer at the top to align with the numbers row (which has no sidebar key)

---

## Input model

Input is handled in two tiers inside `useOSK.handleInput`.

### Tier 1 — global shortcuts

These fire from any focus position without navigating to a key. They return early and never reach the navigation logic.

| Input | Action | Visual feedback |
|-------|--------|-----------------|
| `R2` / `START` | Confirm and close | — |
| `B` | Cancel and close | — |
| `L2` / `L3` | Toggle caps | Caps key flashes |
| `LB` | Move text cursor left one character | ← Cursor key flashes |
| `RB` | Move text cursor right one character | → Cursor key flashes |
| `X` *(GamepadInput)* | Insert space at cursor | Space key flashes |
| `Y` *(GamepadInput)* | Backspace at cursor | ⌫ key flashes |

> **Note:** `LB`/`RB` move the *text insertion point* (where typed characters appear), not the keyboard grid selection. They do not change which key is highlighted.

### Tier 2 — navigate and press

D-pad / left stick moves the grid focus. `A` (south button) activates the focused key.

- **UP / DOWN** move between rows, clamping the column to the new row's length
- **LEFT / RIGHT** move between columns; at the edge they cross into the adjacent sidebar
- The numbers row (row 0) has no left sidebar — pressing LEFT from column 0 wraps to the far right of the same row

#### Sidebar navigation

Crossing from main → sidebar lands on the sidebar key whose `mainRowStart` is closest to the current row. Crossing back from sidebar → main lands on the main row at `mainRowStart` for that sidebar key.

| Sidebar | Key | mainRowStart | Visually beside |
|---------|-----|-------------|-----------------|
| Left | ← Cursor | 1 | QWERTY + ASDF rows |
| Left | Caps | 3 | ZXCV + Space rows |
| Right | ⌫ | 0 | Numbers row |
| Right | → Cursor | 1 | QWERTY + ASDF rows |
| Right | Enter | 3 | ZXCV + Space rows |

---

## Text cursor

All edits are insert-at-point — the text cursor (`cursorPos`) is an index into the string, separate from the keyboard grid focus. Characters are inserted/deleted at `cursorPos`, not appended. This allows mid-text editing without navigating the grid.

The value display uses `whitespace-pre` so multiple consecutive spaces render correctly — without it the browser collapses them.

---

## Flash feedback

When a tier-1 shortcut fires, `useOSK` sets a `FlashKey` state and clears it after 150 ms. `OSK.tsx` merges this with the normal focus-active check so the corresponding key lights up with the same lime highlight used for navigation. The timer is reset on each press, so rapid presses don't stack flash states.

---

## Caps / shift

`isShift` is a toggle, not a one-shot. It stays on until pressed again. Letters render uppercase in the grid when shift is active. The Caps sidebar key shows a `▲` indicator and a dim lime tint when active.

---

## Controller icons

Each sidebar key shows a glyph icon for the shortcut button the user should press. Icon selection is per-controller since button names differ:

| Action | Xbox | PS | Switch |
|--------|------|----|--------|
| Space | Y button | Triangle | X button |
| Backspace | X button | Square | Y button |
| ← Cursor | LB | L1 | L |
| → Cursor | RB | R1 | R |
| Caps | L3 (stick click) | L2 | L3 |
| Enter | Menu | R2 | + |

See [gamepad-quirks.md](gamepad-quirks.md) for why the Xbox space/backspace icons are swapped relative to the button labels.

---

## Opening the OSK

```ts
osk.open(
  currentName,          // pre-filled value (cursor starts at end)
  (name) => save(name), // onConfirm
  () => cancel(),       // onCancel (optional)
);
```

The OSK resets focus to row 1, column 0 (the `q` key) on every open, regardless of the pre-filled value.

---

## Caveats

- **Caps is sticky** — there is no auto-lowercase after typing one character. This is intentional (instance names are often ALL_CAPS or mixed).
- **No symbol/number layer** — the numbers row is always visible on row 0. There is no shifted layer for symbols (e.g. `!`, `@`).
- **Single controller type** — the icon set shown is determined by `controllerType` from `useSettings`. If the user switches controllers mid-session the icons update immediately, but the input mapping does not change (it is controller-agnostic at the `GamepadInput` level).
- **No mouse/keyboard fallback** — the OSK is designed exclusively for gamepad. There is no click handler or keyboard event listener on the keys.
