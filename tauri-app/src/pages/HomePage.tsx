import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type MutableRefObject,
} from "react";
import type { GameInstance, McAccount } from "../types";
import { GRID_COLUMNS, LOADER_COLORS, LOADER_LABELS } from "../constants";
import { formatLastPlayed, formatModCount, formatPlaytime } from "../utils/format";
import type { GamepadInput } from "../hooks/useGamepad";

// ─── hook ────────────────────────────────────────────────────────────────────

type HomeFocus = "hero" | "grid";

interface UseHomePageOptions {
  instances: GameInstance[];
  launchInstance: (instance: GameInstance) => Promise<void>;
  toSidebar: () => void;
  push: (frame: { id: "create" }) => void;
}

export function useHomePage({ instances, launchInstance, toSidebar, push }: UseHomePageOptions) {
  const heroRef = useRef<HTMLElement | null>(null);
  const gridRef = useRef<HTMLElement | null>(null);
  const instanceRefs = useRef<Array<HTMLElement | null>>([]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [homeFocus, setHomeFocus] = useState<HomeFocus>("hero");

  // Clamp activeIndex when instance list shrinks
  useEffect(() => {
    if (activeIndex > instances.length) setActiveIndex(instances.length);
  }, [instances.length, activeIndex]);

  useEffect(() => {
    const opts: ScrollIntoViewOptions = { behavior: "smooth", block: "nearest", inline: "nearest" };
    if (homeFocus === "hero") {
      heroRef.current?.scrollIntoView(opts);
    } else {
      instanceRefs.current[activeIndex]?.scrollIntoView(opts);
    }
  }, [activeIndex, homeFocus]);

  const handleInput = useCallback(
    (input: GamepadInput) => {
      if (homeFocus === "hero") {
        switch (input) {
          case "LEFT":
          case "B":
            toSidebar();
            break;
          case "DOWN":
            setHomeFocus("grid");
            break;
          case "A":
            void launchInstance(instances[activeIndex]);
            break;
        }
        return;
      }

      // grid
      switch (input) {
        case "UP":
          if (activeIndex < GRID_COLUMNS) setHomeFocus("hero");
          else setActiveIndex((p) => Math.max(p - GRID_COLUMNS, 0));
          break;
        case "DOWN":
          setActiveIndex((p) => {
            const next = p + GRID_COLUMNS;
            return next <= instances.length ? next : p;
          });
          break;
        case "LEFT":
          if (activeIndex % GRID_COLUMNS === 0) toSidebar();
          else setActiveIndex((p) => p - 1);
          break;
        case "RIGHT":
          setActiveIndex((p) => Math.min(p + 1, instances.length));
          break;
        case "A":
          if (activeIndex === instances.length) push({ id: "create" });
          else void launchInstance(instances[activeIndex]);
          break;
        case "B":
          setHomeFocus("hero");
          break;
      }
    },
    [activeIndex, homeFocus, instances, launchInstance, push, toSidebar],
  );

  const selectedInstance = instances[Math.min(activeIndex, instances.length - 1)];

  return {
    activeIndex,
    homeFocus,
    heroRef,
    gridRef,
    instanceRefs,
    selectedInstance,
    handleInput,
    onMoveToHero: useCallback(() => setHomeFocus("hero"), []),
    onMoveToGrid: setActiveIndex,
  };
}

// ─── component ───────────────────────────────────────────────────────────────

interface HomePageProps {
  instances: GameInstance[];
  selectedInstance: GameInstance;
  activeIndex: number;
  homeFocus: "hero" | "grid";
  hasFocus: boolean;
  account: McAccount | null;
  quickActions: { label: string; value: string }[];
  heroRef: MutableRefObject<HTMLElement | null>;
  gridRef: MutableRefObject<HTMLElement | null>;
  instanceRefs: MutableRefObject<Array<HTMLElement | null>>;
  onMoveToHero: () => void;
  onMoveToGrid: (index: number) => void;
  onLaunch: (instance: GameInstance) => void;
  onCreateNew: () => void;
}

export function HomePage({
  instances,
  selectedInstance,
  activeIndex,
  homeFocus,
  hasFocus,
  account,
  quickActions,
  heroRef,
  gridRef,
  instanceRefs,
  onMoveToHero,
  onMoveToGrid,
  onLaunch,
  onCreateNew,
}: HomePageProps) {
  return (
    <>
      <section
        ref={heroRef}
        onMouseEnter={onMoveToHero}
        className={`relative overflow-hidden rounded-[2rem] border p-8 transition duration-200 ${
          hasFocus && homeFocus === "hero"
            ? "border-lime-300/60 bg-[#141917]"
            : "border-white/8 bg-[#111413]"
        }`}
        style={{ "--accent": selectedInstance.color } as CSSProperties}
      >
        <div className="absolute inset-y-0 right-0 w-[28rem] bg-[radial-gradient(circle_at_center,_var(--accent),_transparent_60%)] opacity-25 blur-3xl" />
        <div className="relative flex items-end justify-between gap-8">
          <div className="max-w-3xl">
            <div className="mb-6 flex flex-wrap gap-3">
              <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold uppercase tracking-[0.28em] text-stone-200">
                Default Instance
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold uppercase tracking-[0.28em] text-stone-300">
                {LOADER_LABELS[selectedInstance.loaderType]}
              </span>
            </div>
            <h2 className="font-display text-5xl leading-[0.95] tracking-[-0.07em] text-white">
              {selectedInstance.name}
            </h2>
            {selectedInstance.notes && (
              <p className="mt-4 text-xl text-stone-200/85">{selectedInstance.notes}</p>
            )}

            <div className="mt-8 flex flex-wrap gap-4">
              {[
                { label: "Minecraft", value: selectedInstance.minecraftVersion },
                { label: "Mods", value: formatModCount(selectedInstance.modCount) },
                { label: "Playtime", value: formatPlaytime(selectedInstance.playTimeSecs) },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-[1.2rem] border border-white/8 bg-black/15 px-5 py-4"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.32em] text-stone-500">
                    {item.label}
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-white">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10 flex w-[22rem] shrink-0 flex-col gap-3">
            <button
              type="button"
              onClick={() => onLaunch(selectedInstance)}
              onFocus={onMoveToHero}
              onMouseEnter={onMoveToHero}
              className={`rounded-[1.4rem] border px-6 py-5 text-left transition duration-200 ${
                hasFocus && homeFocus === "hero"
                  ? "border-lime-300/60 bg-lime-300 text-slate-950"
                  : "border-white/10 bg-white/5 text-white"
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.34em]">Quick Launch</p>
              <p className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Play</p>
              <p
                className={`mt-2 text-base ${
                  hasFocus && homeFocus === "hero" ? "text-slate-900/75" : "text-stone-300/70"
                }`}
              >
                {account ? `Signed in as ${account.mcUsername}.` : "Not signed in."}{" "}
                Last played {formatLastPlayed(selectedInstance.lastPlayedAt)}.
              </p>
            </button>

            {quickActions.map((action) => (
              <div
                key={action.label}
                className="rounded-[1.2rem] border border-white/8 bg-white/[0.03] px-5 py-4"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.32em] text-stone-500">
                  {action.label}
                </p>
                <p className="mt-2 text-xl font-semibold text-white">{action.value}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section ref={gridRef} className="flex min-h-0 flex-1 flex-col">
        <div className="mb-5 flex items-end justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.42em] text-stone-500">
              Instance Library
            </p>
            <h3 className="mt-2 font-display text-4xl tracking-[-0.06em] text-white">
              Installed Instances
            </h3>
          </div>
          <p className="text-base text-stone-400">
            Use the D-pad to move, then press A to launch or create.
          </p>
        </div>

        <div className="grid flex-1 grid-cols-2 gap-5">
          {instances.map((instance, i) => {
            const isActive = hasFocus && homeFocus === "grid" && i === activeIndex;

            return (
              <article
                key={instance.id}
                ref={(node) => {
                  instanceRefs.current[i] = node;
                }}
                onClick={() => onMoveToGrid(i)}
                onMouseEnter={() => onMoveToGrid(i)}
                className={`group relative overflow-hidden rounded-[1.75rem] border p-5 transition duration-200 ${
                  isActive ? "border-lime-300/60 bg-[#171c1a]" : "border-white/8 bg-[#121514]"
                }`}
                style={{ "--accent": instance.color } as CSSProperties}
              >
                <div className="absolute -right-10 top-0 h-36 w-36 rounded-full bg-[var(--accent)] opacity-25 blur-3xl transition duration-200 group-hover:scale-110" />
                <div className="relative flex h-full flex-col">
                  <div className="flex items-start justify-between gap-4">
                    <div
                      className="h-24 w-24 rounded-[1.5rem] border border-white/10 shadow-[inset_0_1px_30px_rgba(255,255,255,0.08)]"
                      style={{
                        background:
                          "linear-gradient(145deg, rgba(255,255,255,0.14), rgba(0,0,0,0.18)), var(--accent)",
                      }}
                    />
                    <div
                     className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm font-semibold uppercase tracking-[0.28em]"
                     style={{ backgroundColor: LOADER_COLORS[instance.loaderType] + "20", borderColor: LOADER_COLORS[instance.loaderType] + "40" }}
                    >
                      {LOADER_LABELS[instance.loaderType]}
                    </div>
                  </div>

                  <div className="mt-6 space-y-3">
                    <h4 className="font-display text-4xl leading-none tracking-[-0.06em] text-white">
                      {instance.name}
                    </h4>
                    <p className="text-lg text-stone-300/80">
                      Minecraft {instance.minecraftVersion}
                    </p>
                    <p className="min-h-14 text-base leading-7 text-stone-400">{instance.notes}</p>
                  </div>

                  <div className="mt-auto flex items-center justify-between pt-6 text-sm font-medium text-stone-300/85">
                    <span>{formatModCount(instance.modCount)}</span>
                    <span>{formatPlaytime(instance.playTimeSecs)} played</span>
                  </div>
                </div>
              </article>
            );
          })}

          {/* Create new instance card */}
          {(() => {
            const createIndex = instances.length;
            const isActive = hasFocus && homeFocus === "grid" && activeIndex === createIndex;
            return (
              <article
                ref={(node) => {
                  instanceRefs.current[createIndex] = node;
                }}
                onClick={() => {
                  onMoveToGrid(createIndex);
                  onCreateNew();
                }}
                onMouseEnter={() => onMoveToGrid(createIndex)}
                className={`flex cursor-default flex-col items-center justify-center rounded-[1.75rem] border p-5 transition duration-200 ${
                  isActive
                    ? "border-lime-300/60 bg-[#171c1a]"
                    : "border-dashed border-white/10 bg-transparent"
                }`}
              >
                <div
                  className={`flex h-16 w-16 items-center justify-center rounded-full border-2 transition duration-200 ${
                    isActive ? "border-lime-300/60 bg-lime-300/10" : "border-white/15"
                  }`}
                >
                  <span
                    className={`text-4xl font-light leading-none ${
                      isActive ? "text-lime-300" : "text-white/30"
                    }`}
                  >
                    +
                  </span>
                </div>
                <p
                  className={`mt-5 text-xl font-semibold transition duration-200 ${
                    isActive ? "text-white" : "text-white/40"
                  }`}
                >
                  New Instance
                </p>
                <p
                  className={`mt-1 text-sm transition duration-200 ${
                    isActive ? "text-stone-400" : "text-stone-600"
                  }`}
                >
                  Create from scratch
                </p>
              </article>
            );
          })()}
        </div>
      </section>
    </>
  );
}
