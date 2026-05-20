import { isTauri } from '@tauri-apps/api/core';
import { useEffect, useRef } from 'react';

export type GamepadInput =
  | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'
  | 'A' | 'B' | 'X' | 'Y'
  | 'LB' | 'RB' | 'L2' | 'R2' | 'L3' | 'START';

const INITIAL_DELAY = 400;
const REPEAT_INTERVAL = 120;
const DIRECTIONAL: ReadonlySet<GamepadInput> = new Set(['UP', 'DOWN', 'LEFT', 'RIGHT', 'LB', 'RB']);

type PluginButtonName =
  | 'South' | 'East' | 'North' | 'West'
  | 'C' | 'Z'
  | 'LeftTrigger' | 'RightTrigger'
  | 'LeftTrigger2' | 'RightTrigger2'
  | 'Select' | 'Start' | 'Mode'
  | 'LeftThumb' | 'RightThumb'
  | 'DPadUp' | 'DPadDown' | 'DPadLeft' | 'DPadRight'
  | 'Unknown';

const PLUGIN_BUTTON_TO_INPUT: Partial<Record<PluginButtonName, GamepadInput>> = {
  DPadUp: 'UP',    DPadDown: 'DOWN',  DPadLeft: 'LEFT', DPadRight: 'RIGHT',
  South: 'A',      East: 'B',         North: 'Y',       West: 'X',
  LeftTrigger: 'LB',  RightTrigger: 'RB',
  LeftTrigger2: 'L2', RightTrigger2: 'R2',
  LeftThumb: 'L3',
  Start: 'START',
};

function getActiveGamepad(): Gamepad | undefined {
  return Array.from(navigator.getGamepads()).find(
    (gp): gp is Gamepad => Boolean(gp?.connected),
  );
}

function axisToDirection(x: number, y: number): GamepadInput | null {
  if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) return null;
  return Math.abs(x) >= Math.abs(y)
    ? x < 0 ? 'LEFT' : 'RIGHT'
    : y < 0 ? 'UP' : 'DOWN';
}

export function useGamepad(
  onInput: (input: GamepadInput) => void,
  onRelease?: (input: GamepadInput) => void,
  onRightStick?: (ry: number) => void,
) {
  const onInputRef      = useRef(onInput);
  const onReleaseRef    = useRef(onRelease);
  const onRightStickRef = useRef(onRightStick);
  const rafRef = useRef<number>(0);

  useEffect(() => { onInputRef.current = onInput; }, [onInput]);
  useEffect(() => { onReleaseRef.current = onRelease; }, [onRelease]);
  useEffect(() => { onRightStickRef.current = onRightStick; }, [onRightStick]);

  useEffect(() => {
    if (isTauri()) {
      let isActive = true;

      const holdTimeout: { v: ReturnType<typeof setTimeout> | null } = { v: null };
      const holdInterval: { v: ReturnType<typeof setInterval> | null } = { v: null };
      const heldButton: { v: PluginButtonName | null } = { v: null };

      const axisState = { x: 0, y: 0 };
      const axisHeld: { v: GamepadInput | null } = { v: null };
      const axisHoldTimeout: { v: ReturnType<typeof setTimeout> | null } = { v: null };
      const axisHoldInterval: { v: ReturnType<typeof setInterval> | null } = { v: null };

      // Right stick — tracked for continuous scroll via rAF
      const rightY = { v: 0 };
      const RIGHT_DEADZONE = 0.15;
      let scrollRafId = 0;
      const scrollLoop = () => {
        if (!isActive) return;
        if (Math.abs(rightY.v) > RIGHT_DEADZONE) {
          onRightStickRef.current?.(rightY.v);
        }
        scrollRafId = requestAnimationFrame(scrollLoop);
      };
      scrollRafId = requestAnimationFrame(scrollLoop);

      const clearHold = () => {
        if (holdTimeout.v) { clearTimeout(holdTimeout.v); holdTimeout.v = null; }
        if (holdInterval.v) { clearInterval(holdInterval.v); holdInterval.v = null; }
      };

      const clearAxisHold = () => {
        if (axisHoldTimeout.v) { clearTimeout(axisHoldTimeout.v); axisHoldTimeout.v = null; }
        if (axisHoldInterval.v) { clearInterval(axisHoldInterval.v); axisHoldInterval.v = null; }
      };

      const startRepeat = (input: GamepadInput, clearFn: () => void, timeout: typeof holdTimeout, interval: typeof holdInterval) => {
        clearFn();
        timeout.v = setTimeout(() => {
          interval.v = setInterval(() => {
            if (isActive) onInputRef.current(input);
          }, REPEAT_INTERVAL);
        }, INITIAL_DELAY);
      };

      let unsubButton: (() => void) | null = null;
      let unsubAxis: (() => void) | null = null;
      let pluginStop: (() => Promise<void>) | null = null;

      void import('tauri-plugin-gamepad-api').then(async ({ start, stop, onButtonChanged, onAxisChanged, setLogging }) => {
        if (!isActive) return;
        await setLogging(false);

        // Per-button timestamp of last fired input. ButtonChanged fires
        // continuously for analog buttons; the debounce ensures we fire once
        // per physical press rather than on every value update above threshold.
        const DEBOUNCE_MS = 80;
        const lastFiredAt = new Map<PluginButtonName, number>();

        const tryFire = (buttonName: PluginButtonName, input: GamepadInput) => {
          const now = Date.now();
          if (now - (lastFiredAt.get(buttonName) ?? 0) < DEBOUNCE_MS) return false;
          lastFiredAt.set(buttonName, now);
          heldButton.v = buttonName;
          onInputRef.current(input);
          return true;
        };

        const releaseButton = (buttonName: PluginButtonName) => {
          lastFiredAt.delete(buttonName);
          if (heldButton.v === buttonName) {
            heldButton.v = null;
            clearHold();
          }
          const input = PLUGIN_BUTTON_TO_INPUT[buttonName];
          if (input) onReleaseRef.current?.(input);
        };

        unsubButton = onButtonChanged((e) => {
          if (!isActive) return;
          const buttonName = e.button as PluginButtonName;
          const input = PLUGIN_BUTTON_TO_INPUT[buttonName];

          if (e.pressed && e.value > 0.5) {
            if (!input) return;
            const fired = tryFire(buttonName, input);
            if (fired && DIRECTIONAL.has(input)) {
              startRepeat(input, clearHold, holdTimeout, holdInterval);
            } else if (!fired && DIRECTIONAL.has(input) && !holdTimeout.v && !holdInterval.v) {
              startRepeat(input, clearHold, holdTimeout, holdInterval);
            }
          } else if (!e.pressed) {
            releaseButton(buttonName);
          }
        });

        unsubAxis = onAxisChanged((e) => {
          if (!isActive) return;
          const { axis, value } = e;

          if (axis === 'LeftStickX') axisState.x = value;
          else if (axis === 'LeftStickY') axisState.y = -value;
          else if (axis === 'RightStickY') { rightY.v = -value; return; }
          else if (axis === 'RightZ') { rightY.v = value; return; }
          else return;

          const direction = axisToDirection(axisState.x, axisState.y);

          if (direction !== axisHeld.v) {
            clearAxisHold();
            axisHeld.v = direction;
            if (direction) {
              onInputRef.current(direction);
              startRepeat(direction, clearAxisHold, axisHoldTimeout, axisHoldInterval);
            }
          }
        });

        pluginStop = stop;
        await start();

        if (!isActive) {
          unsubButton?.();
          unsubAxis?.();
          void stop();
        }
      });

      return () => {
        isActive = false;
        clearHold();
        clearAxisHold();
        cancelAnimationFrame(scrollRafId);
        unsubButton?.();
        unsubAxis?.();
        if (pluginStop) void pluginStop();
      };
    }

    // Browser path — poll via rAF
    const held: { input: GamepadInput | null; holdStart: number; lastRepeat: number } = {
      input: null,
      holdStart: 0,
      lastRepeat: 0,
    };

    const poll = () => {
      const gp = getActiveGamepad();
      const now = Date.now();

      if (gp) {
        let input: GamepadInput | null = null;

        // Right stick — continuous scroll
        const rightStickY = gp.axes[3] ?? 0;
        if (Math.abs(rightStickY) > 0.15) onRightStickRef.current?.(rightStickY);

        // Left stick + D-pad, prioritised by strongest axis
        const stickDir = axisToDirection(gp.axes[0] ?? 0, gp.axes[1] ?? 0);
        if (stickDir) {
          input = stickDir;
        } else if (gp.buttons[12]?.pressed) input = 'UP';
        else if (gp.buttons[13]?.pressed) input = 'DOWN';
        else if (gp.buttons[14]?.pressed) input = 'LEFT';
        else if (gp.buttons[15]?.pressed) input = 'RIGHT';
        else if (gp.buttons[0]?.pressed) input = 'A';
        else if (gp.buttons[1]?.pressed) input = 'B';
        else if (gp.buttons[2]?.pressed) input = 'X';
        else if (gp.buttons[3]?.pressed) input = 'Y';
        else if (gp.buttons[4]?.pressed) input = 'LB';
        else if (gp.buttons[5]?.pressed) input = 'RB';
        else if (gp.buttons[6]?.pressed) input = 'L2';
        else if (gp.buttons[7]?.pressed) input = 'R2';
        else if (gp.buttons[9]?.pressed) input = 'START';
        else if (gp.buttons[10]?.pressed) input = 'L3';

        if (input !== held.input) {
          const prev = held.input;
          held.input = input;
          if (prev) onReleaseRef.current?.(prev);
          if (input) {
            held.holdStart = now;
            held.lastRepeat = now;
            onInputRef.current(input);
          }
        } else if (input && DIRECTIONAL.has(input)) {
          const elapsed = now - held.holdStart;
          if (elapsed > INITIAL_DELAY && now - held.lastRepeat > REPEAT_INTERVAL) {
            onInputRef.current(input);
            held.lastRepeat = now;
          }
        }
      } else if (held.input !== null) {
        held.input = null;
      }

      rafRef.current = requestAnimationFrame(poll);
    };

    rafRef.current = requestAnimationFrame(poll);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);
}
