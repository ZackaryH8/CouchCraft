import { useCallback } from "react";
import type { GamepadInput } from "../hooks/useGamepad";

// ─── hook ────────────────────────────────────────────────────────────────────

interface UseUpdatesPageOptions {
  toSidebar: () => void;
}

export function useUpdatesPage({ toSidebar }: UseUpdatesPageOptions) {
  const handleInput = useCallback(
    (input: GamepadInput) => {
      switch (input) {
        case "B":
        case "LEFT":
          toSidebar();
          break;
      }
    },
    [toSidebar],
  );

  return { handleInput };
}

// ─── component ───────────────────────────────────────────────────────────────

export function UpdatesPage({ hasFocus: _hasFocus }: { hasFocus: boolean }) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center">
      <div className="simple-panel flex w-full max-w-xl flex-col items-center gap-6 rounded-[2rem] px-14 py-12 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-lime-300/30 bg-lime-300/10">
          <svg
            className="h-8 w-8 text-lime-300"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-stone-500">
            Assets &amp; Mods
          </p>
          <h2 className="mt-3 font-display text-4xl tracking-[-0.05em] text-white">Up to date</h2>
          <p className="mt-3 text-lg leading-7 text-stone-400">
            All assets, libraries, and mod packs are current. No updates pending.
          </p>
        </div>
      </div>
    </section>
  );
}
