import { isTauri } from '@tauri-apps/api/core';
import { useEffect, useRef } from 'react';

export type GamepadInput = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'A' | 'B';

const INITIAL_DELAY = 400;
const REPEAT_INTERVAL = 120;
const DIRECTIONAL: ReadonlySet<GamepadInput> = new Set(['UP', 'DOWN', 'LEFT', 'RIGHT']);

type PluginButtonName =
  | 'DPadUp'
  | 'DPadDown'
  | 'DPadLeft'
  | 'DPadRight'
  | 'South'
  | 'East';

type PluginGamepadEvent =
  | { ButtonPressed: [PluginButtonName, unknown] }
  | { ButtonReleased: [PluginButtonName, unknown] }
  | { ButtonChanged: [PluginButtonName, number, unknown] }
  | { AxisChanged: [string, number, unknown] };

type PluginGamepadPayload = { event: unknown };

const PLUGIN_BUTTON_TO_INPUT: Record<PluginButtonName, GamepadInput> = {
  DPadUp: 'UP',
  DPadDown: 'DOWN',
  DPadLeft: 'LEFT',
  DPadRight: 'RIGHT',
  South: 'A',
  East: 'B',
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

export function useGamepad(onInput: (input: GamepadInput) => void) {
  const onInputRef = useRef(onInput);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    onInputRef.current = onInput;
  }, [onInput]);

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

      void import('tauri-plugin-gamepad-api').then(async ({ execute }) => {
        if (!isActive) return;

        await execute((payload: PluginGamepadPayload) => {
          if (!isActive) return;
          if (typeof payload.event === 'string' || !payload.event || typeof payload.event !== 'object') return;

          const event = payload.event as PluginGamepadEvent;

          if ('ButtonPressed' in event) {
            const [buttonName] = event.ButtonPressed;
            const input = PLUGIN_BUTTON_TO_INPUT[buttonName];
            if (!input) return;

            heldButton.v = buttonName;
            onInputRef.current(input);

            if (DIRECTIONAL.has(input)) {
              startRepeat(input, clearHold, holdTimeout, holdInterval);
            }
            return;
          }

          if ('ButtonReleased' in event) {
            const [buttonName] = event.ButtonReleased;
            if (heldButton.v === buttonName) {
              heldButton.v = null;
              clearHold();
            }
            return;
          }

          if ('ButtonChanged' in event) {
            const [buttonName, value] = event.ButtonChanged;
            if (value > 0.5 && !heldButton.v) {
              const input = PLUGIN_BUTTON_TO_INPUT[buttonName];
              if (input) onInputRef.current(input);
            }
            return;
          }

          if ('AxisChanged' in event) {
            const [axisName, value] = event.AxisChanged;

            if (axisName === 'LeftStickX' || axisName === 'LeftX') axisState.x = value;
            else if (axisName === 'LeftStickY' || axisName === 'LeftY') axisState.y = value;
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
          }
        });
      });

      return () => {
        isActive = false;
        clearHold();
        clearAxisHold();
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

        if (input !== held.input) {
          held.input = input;
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
