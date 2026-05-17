import { useState, useCallback, useRef } from "react";
import type { GamepadInput } from "./useGamepad";

export const MAIN_ROWS: string[][] = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l", "'"],
  ["z", "x", "c", "v", "b", "n", "m", ",", ".", "/"],
  ["SPACE"],
];

// mainRowStart is the MAIN_ROWS index that the sidebar key visually aligns with.
// Used by navigation to land on the correct main-grid row when crossing between sections.
export const LEFT_SIDEBAR = [
  { label: "Cursor Left", action: "CUR_LEFT", mainRowStart: 1 },
  { label: "Caps", action: "CAPS", mainRowStart: 3 },
];

export const RIGHT_SIDEBAR = [
  { label: "⌫", action: "BACK", mainRowStart: 0 },
  { label: "Cursor Right", action: "CUR_RIGHT", mainRowStart: 1 },
  { label: "Enter", action: "CONFIRM", mainRowStart: 3 },
];

export type OskSection = "left" | "main" | "right";

export interface OskFocus {
  section: OskSection;
  sideIdx: number;
  row: number;
  col: number;
}

type OskCallbacks = {
  onConfirm: (value: string) => void;
  onCancel?: () => void;
};

// Start on row 1 (QWERTY) rather than row 0 (numbers) — more common starting point.
const INITIAL_FOCUS: OskFocus = { section: "main", sideIdx: 0, row: 1, col: 0 };

// These map a main-grid row to whichever sidebar key it visually sits beside.
// LEFT:  rows 0–2 beside "Cursor Left" (sideIdx 0), rows 3–4 beside "Caps" (sideIdx 1).
// RIGHT: row 0 beside "Backspace" (sideIdx 0), rows 1–2 beside "Cursor Right" (sideIdx 1),
//        rows 3–4 beside "Enter" (sideIdx 2).
function mainRowToLeftSideIdx(row: number) {
  return row <= 2 ? 0 : 1;
}

function mainRowToRightSideIdx(row: number) {
  if (row === 0) return 0;
  if (row <= 2) return 1;
  return 2;
}

export type FlashKey = "space" | "backspace" | "cur_left" | "cur_right" | "caps" | null;

export function useOSK() {
  const [isOpen, setIsOpen] = useState(false);
  // Ref mirrors isOpen but updates synchronously inside open/close so that
  // the App.tsx input-routing callback always reads the current value even
  // when the React closure still captures the previous render's value.
  const isOpenRef = useRef(false);
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [cursorPos, setCursorPos] = useState(0);
  const [focus, setFocus] = useState<OskFocus>(INITIAL_FOCUS);
  const [isShift, setIsShift] = useState(false);
  const [flashKey, setFlashKey] = useState<FlashKey>(null);
  const callbacksRef = useRef<OskCallbacks | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((key: FlashKey) => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setFlashKey(key);
    flashTimerRef.current = setTimeout(() => setFlashKey(null), 150);
  }, []);

  const open = useCallback(
    (label: string, initial: string, onConfirm: (value: string) => void, onCancel?: () => void) => {
      isOpenRef.current = true;
      setLabel(label);
      setValue(initial);
      setCursorPos(initial.length);
      setFocus(INITIAL_FOCUS);
      setIsShift(false);
      callbacksRef.current = { onConfirm, onCancel };
      setIsOpen(true);
    },
    [],
  );

  const close = useCallback(() => {
    isOpenRef.current = false;
    setIsOpen(false);
    callbacksRef.current = null;
  }, []);

  const handleInput = useCallback(
    (input: GamepadInput) => {
      // ── Tier 1: global shortcuts ─────────────────────────────────────────────
      // These fire unconditionally — the user never needs to navigate to a key.
      // All other inputs fall through to tier-2 (focus-based navigation + A to press).
      if (input === "R2" || input === "START") {
        callbacksRef.current?.onConfirm(value);
        close();
        return;
      }
      if (input === "B") {
        callbacksRef.current?.onCancel?.();
        close();
        return;
      }
      if (input === "L2" || input === "L3") {
        flash("caps");
        setIsShift((s) => !s);
        return;
      }
      // LB/RB move the text insertion point, not the keyboard grid cursor
      if (input === "LB") {
        flash("cur_left");
        setCursorPos((p) => Math.max(0, p - 1));
        return;
      }
      if (input === "RB") {
        flash("cur_right");
        setCursorPos((p) => Math.min(value.length, p + 1));
        return;
      }
      // GamepadInput 'X' is fired by the physical Y button on Xbox and Square on PS.
      // GamepadInput 'Y' is fired by the physical X button on Xbox and Triangle on PS.
      // This is a Linux kernel convention: BTN_X is aliased to BTN_NORTH (0x133) and
      // BTN_Y to BTN_WEST (0x134) in input-event-codes.h — gilrs follows it faithfully.
      // The actions below are written in terms of GamepadInput, not physical labels.
      if (input === "Y") {
        flash("space");
        setValue((v) => v.slice(0, cursorPos) + " " + v.slice(cursorPos));
        setCursorPos((p) => p + 1);
        return;
      }
      if (input === "X") {
        flash("backspace");
        if (cursorPos > 0) {
          setValue((v) => v.slice(0, cursorPos - 1) + v.slice(cursorPos));
          setCursorPos((p) => p - 1);
        }
        return;
      }

      // ── Tier 2: focus-based navigation + A to press ──────────────────────────
      const { section, sideIdx, row, col } = focus;

      const pressKey = (key: string) => {
        switch (key) {
          case "CUR_LEFT":
            setCursorPos((p) => Math.max(0, p - 1));
            break;
          case "CUR_RIGHT":
            setCursorPos((p) => Math.min(value.length, p + 1));
            break;
          case "CAPS":
            setIsShift((s) => !s);
            break;
          case "BACK":
            if (cursorPos > 0) {
              setValue((v) => v.slice(0, cursorPos - 1) + v.slice(cursorPos));
              setCursorPos((p) => p - 1);
            }
            break;
          case "CONFIRM":
            callbacksRef.current?.onConfirm(value);
            close();
            break;
          case "SPACE":
            setValue((v) => v.slice(0, cursorPos) + " " + v.slice(cursorPos));
            setCursorPos((p) => p + 1);
            break;
          default: {
            const char = isShift ? key.toUpperCase() : key;
            setValue((v) => v.slice(0, cursorPos) + char + v.slice(cursorPos));
            setCursorPos((p) => p + 1);
            break;
          }
        }
      };

      if (section === "main") {
        switch (input) {
          case "UP":
            if (row > 0) {
              const nr = row - 1;
              const nc = Math.min(col, MAIN_ROWS[nr].length - 1);
              setFocus((f) => ({ ...f, row: nr, col: nc }));
            }
            break;
          case "DOWN":
            if (row < MAIN_ROWS.length - 1) {
              const nr = row + 1;
              // Spacebar row has only one key — col resets to 0https://github.com/InventivetalentDev/minecraft-assets/tree/1.21.8
              const nc = nr === 4 ? 0 : Math.min(col, MAIN_ROWS[nr].length - 1);
              setFocus((f) => ({ ...f, row: nr, col: nc }));
            }
            break;
          case "LEFT":
            if (row === 4) {
              // Spacebar → Caps on the left
              setFocus({ section: "left", sideIdx: 1, row: 3, col: 0 });
            } else if (col > 0) {
              setFocus((f) => ({ ...f, col: col - 1 }));
            } else if (row === 0) {
              // Numbers row has no left sidebar key, so wrap to the far right of the same row.
              setFocus((f) => ({ ...f, col: MAIN_ROWS[0].length - 1 }));
            } else {
              setFocus({ section: "left", sideIdx: mainRowToLeftSideIdx(row), row, col: 0 });
            }
            break;
          case "RIGHT":
            if (row === 4) {
              // Spacebar → Enter on the right
              setFocus({ section: "right", sideIdx: 2, row: 3, col: 0 });
            } else if (col < MAIN_ROWS[row].length - 1) {
              setFocus((f) => ({ ...f, col: col + 1 }));
            } else {
              setFocus({ section: "right", sideIdx: mainRowToRightSideIdx(row), row, col: 0 });
            }
            break;
          case "A":
            pressKey(row === 4 ? "SPACE" : MAIN_ROWS[row][col]);
            break;
        }
      } else if (section === "left") {
        switch (input) {
          case "UP":
            if (sideIdx > 0) setFocus((f) => ({ ...f, sideIdx: sideIdx - 1 }));
            break;
          case "DOWN":
            if (sideIdx < LEFT_SIDEBAR.length - 1) setFocus((f) => ({ ...f, sideIdx: sideIdx + 1 }));
            break;
          case "RIGHT":
            setFocus({ section: "main", sideIdx: 0, row: LEFT_SIDEBAR[sideIdx].mainRowStart, col: 0 });
            break;
          case "A":
            pressKey(LEFT_SIDEBAR[sideIdx].action);
            break;
        }
      } else {
        // right sidebar
        switch (input) {
          case "UP":
            if (sideIdx > 0) setFocus((f) => ({ ...f, sideIdx: sideIdx - 1 }));
            break;
          case "DOWN":
            if (sideIdx < RIGHT_SIDEBAR.length - 1) setFocus((f) => ({ ...f, sideIdx: sideIdx + 1 }));
            break;
          case "LEFT": {
            const mainRow = RIGHT_SIDEBAR[sideIdx].mainRowStart;
            const lastCol = mainRow === 4 ? 0 : MAIN_ROWS[mainRow].length - 1;
            setFocus({ section: "main", sideIdx: 0, row: mainRow, col: lastCol });
            break;
          }
          case "A":
            pressKey(RIGHT_SIDEBAR[sideIdx].action);
            break;
        }
      }
    },
    [focus, isShift, value, cursorPos, close, flash],
  );

  return { isOpen, isOpenRef, label, value, cursorPos, focus, isShift, flashKey, open, handleInput };
}
