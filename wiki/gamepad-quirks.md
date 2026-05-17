# Gamepad Input Quirks

## The Linux BTN_X / BTN_NORTH swap (Xbox face buttons)

### What happens

When you press the physical **X button** on an Xbox controller, the Linux kernel fires event code `0x133`. When you press **Y**, it fires `0x134`.

Those codes are defined in [`include/uapi/linux/input-event-codes.h`](https://github.com/torvalds/linux/blob/master/include/uapi/linux/input-event-codes.h) as:

```c
#define BTN_NORTH   0x133
#define BTN_X       BTN_NORTH   // physical Xbox X → North event

#define BTN_WEST    0x134
#define BTN_Y       BTN_WEST    // physical Xbox Y → West event
```

The Xbox X button is physically at the **west** (left) position on the face diamond, and Y is at the **north** (top) position. But the kernel maps them to the opposite positional names — X fires North, Y fires West. This is a historical artifact baked into the stable UAPI and cannot be changed without breaking every Linux input consumer.

### How it propagates

```
Physical Xbox X → kernel 0x133 (BTN_NORTH) → gilrs Button::North → plugin "North" → GamepadInput 'Y'
Physical Xbox Y → kernel 0x134 (BTN_WEST)  → gilrs Button::West  → plugin "West"  → GamepadInput 'X'
```

gilrs ([gilrs-core `platform/linux/gamepad.rs`](https://gitlab.com/gilrs-project/gilrs)) maps evdev code `0x133` to `BTN_NORTH` — correct per the kernel spec. The tauri-plugin-gamepad is a thin wrapper that passes gilrs events through unchanged. Neither is at fault.

### PS and Switch are not affected

PlayStation and Switch controllers use standard positional HID mappings:
- Square (left/west) → BTN_WEST → `GamepadInput 'X'`
- Triangle (top/north) → BTN_NORTH → `GamepadInput 'Y'`

These match physical position, so `GamepadInput 'X'` = physical Square and `GamepadInput 'Y'` = physical Triangle — no swap.

### How CouchCraft handles it

In `useOSK.ts`, the space and backspace actions are written in terms of `GamepadInput`, not physical button labels:

```ts
if (input === "X") { /* insert space    — physical Y on Xbox, Square on PS */ }
if (input === "Y") { /* delete (bksp)   — physical X on Xbox, Triangle on PS */ }
```

The glyph icons in `OSK.tsx` use per-controller helper functions so the correct physical button image is always shown:

```ts
// Xbox: physical X fires 'Y' (North), so show the Y-button image for backspace
//       and the X-button image (via west glyph) for… actually the Y-image for space.
// The helpers below resolve to the image that matches the physical button the user presses.
function spaceIcon(ct):     Xbox → "north" (y.png)   PS/Switch → "west" (triangle/Y image)
function backspaceIcon(ct): Xbox → "west"  (x.png)   PS/Switch → "north" (square/X image)
```

The `glyphs.ts` image filenames are keyed by *positional* name (`north`, `west`) but each controller maps those to the correct *labelled* image for that hardware, so Switch `north` renders `x.png` (the X button) and PS `north` renders `triangle.png`.

### Can this be fixed upstream?

The kernel UAPI is a frozen stable ABI — `BTN_X = BTN_NORTH` cannot be changed without silently breaking every existing application. gilrs could remap its `Button::North` / `Button::West` enum values but that would be a breaking change for all gilrs consumers. The application-layer workaround in `useOSK.ts` is the practical solution.

---

## Button repeat (directional inputs)

`LB` and `RB` are included in the `DIRECTIONAL` set in `useGamepad.ts`, so holding them repeats the cursor-move action with the same timing as D-pad navigation:

- **Initial delay:** 400 ms before repeat begins
- **Repeat interval:** 120 ms between subsequent fires

All other OSK shortcut buttons (`X`, `Y`, `L2`, `L3`) are not in `DIRECTIONAL` and fire only once per press.
