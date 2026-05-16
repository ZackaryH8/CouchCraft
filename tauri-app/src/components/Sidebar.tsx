import type { MutableRefObject } from "react";
import { SIDEBAR_ITEMS } from "../constants";

interface SidebarProps {
  sidebarIndex: number;
  globalFocus: "sidebar" | "page";
  sidebarRefs: MutableRefObject<Array<HTMLDivElement | null>>;
  onClickItem: (i: number) => void;
  onHoverItem: (i: number) => void;
}

export function Sidebar({ sidebarIndex, globalFocus, sidebarRefs, onClickItem, onHoverItem }: SidebarProps) {
  return (
    <aside className="simple-panel flex w-[19rem] shrink-0 flex-col overflow-y-auto rounded-[2rem] px-6 py-7">
      <div className="mb-10 flex items-center justify-between">
        <div>
          <p className="font-display text-4xl leading-none tracking-[-0.08em] text-lime-300">CC</p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-[0.35em] text-stone-400">
            CouchCraft
          </p>
        </div>
        <div className="h-3 w-3 rounded-full bg-lime-300/80" />
      </div>

      <nav className="space-y-3">
        {SIDEBAR_ITEMS.map((item, i) => {
          const isActive = sidebarIndex === i && globalFocus === "sidebar";
          return (
            <div
              key={item.label}
              ref={(node) => {
                sidebarRefs.current[i] = node;
              }}
              onClick={() => onClickItem(i)}
              onMouseEnter={() => onHoverItem(i)}
              className={`cursor-default rounded-[1.4rem] border px-5 py-4 transition duration-200 ${
                item.danger
                  ? isActive
                    ? "border-red-400/60 bg-red-500 text-white"
                    : "border-transparent bg-transparent text-red-400/70"
                  : isActive
                    ? "border-lime-300/60 bg-lime-300 text-slate-950"
                    : "border-transparent bg-transparent text-stone-100/88"
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-2xl font-semibold tracking-[-0.03em]">{item.label}</p>
                  <p className={`mt-1 text-sm ${
                    item.danger
                      ? isActive ? "text-red-100/70" : "text-red-400/50"
                      : isActive ? "text-slate-900/70" : "text-stone-400"
                  }`}>
                    {item.meta}
                  </p>
                </div>
                <div
                  className={`h-3 w-3 rounded-full ${
                    item.danger
                      ? isActive ? "bg-white" : "bg-red-400/40"
                      : isActive ? "bg-slate-950" : "bg-stone-600"
                  }`}
                />
              </div>
            </div>
          );
        })}
      </nav>

      <div className="mt-auto rounded-[1.6rem] border border-white/8 bg-white/[0.03] p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-stone-500">
          Launcher Status
        </p>
        <p className="mt-3 font-display text-2xl tracking-[-0.05em] text-white">Ready</p>
        <p className="mt-2 text-sm leading-6 text-stone-400">
          Controller navigation is active. Instances, updates, and settings available from the
          sidebar.
        </p>
      </div>
    </aside>
  );
}
