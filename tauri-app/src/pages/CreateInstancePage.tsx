import { useState, useCallback, type CSSProperties } from "react";
import type { CreateStep, GameInstance } from "../types";
import { LOADERS, MC_VERSIONS, INSTANCE_COLORS, LOADER_COLORS } from "../constants";
import type { GamepadInput } from "../hooks/useGamepad";

// ─── nav helpers (pure, defined outside so they don't recreate) ─────────────

const STEPS: CreateStep[] = ["loader", "version", "color", "confirm"];

function getCreateCols(step: CreateStep): number {
  if (step === "loader") return 2;
  if (step === "version") return 4;
  if (step === "color") return 4;
  return 1;
}

function getCreateCount(step: CreateStep): number {
  if (step === "loader") return LOADERS.length;
  if (step === "version") return MC_VERSIONS.length;
  if (step === "color") return INSTANCE_COLORS.length;
  return 1;
}

// ─── hook ────────────────────────────────────────────────────────────────────

interface UseCreatePageOptions {
  pop: () => void;
  onCreated: (instance: GameInstance) => Promise<void>;
}

export function useCreatePage({ pop, onCreated }: UseCreatePageOptions) {
  const [createStep, setCreateStep] = useState<CreateStep>("loader");
  const [createItemIndex, setCreateItemIndex] = useState(0);
  const [draftLoader, setDraftLoader] = useState("");
  const [draftVersion, setDraftVersion] = useState("");
  const [draftColor, setDraftColor] = useState<string>(INSTANCE_COLORS[0]);

  const resetDraft = useCallback(() => {
    setCreateStep("loader");
    setCreateItemIndex(0);
    setDraftLoader("");
    setDraftVersion("");
    setDraftColor(INSTANCE_COLORS[0]);
  }, []);

  const selectItem = useCallback(
    (i: number) => {
      if (createStep === "loader") {
        const loader = LOADERS[i];
        setDraftLoader(loader.id);
        setDraftColor(LOADER_COLORS[loader.id] ?? INSTANCE_COLORS[0]);
        setCreateStep("version");
        setCreateItemIndex(0);
      } else if (createStep === "version") {
        setDraftVersion(MC_VERSIONS[i]);
        setCreateStep("color");
        setCreateItemIndex(0);
      } else if (createStep === "color") {
        setDraftColor(INSTANCE_COLORS[i]);
        setCreateStep("confirm");
        setCreateItemIndex(0);
      } else {
        const loaderOption = LOADERS.find((l) => l.id === draftLoader);
        const newInstance: GameInstance = {
          id: `instance-${Date.now()}`,
          name: `${loaderOption?.label ?? "Custom"} ${draftVersion}`,
          loader: loaderOption?.label ?? "Custom",
          minecraftVersion: draftVersion,
          color: draftColor,
          modCount: "No mods",
          lastPlayed: "Never",
          playtime: "0h",
          status: "New",
          summary: `Custom ${loaderOption?.label ?? ""} instance for Minecraft ${draftVersion}.`,
          details: "Created with CouchCraft.",
        };
        void onCreated(newInstance).then(() => {
          pop();
          resetDraft();
        });
      }
    },
    [createStep, draftLoader, draftVersion, draftColor, onCreated, pop, resetDraft],
  );

  const handleInput = useCallback(
    (input: GamepadInput) => {
      const cols = getCreateCols(createStep);
      const count = getCreateCount(createStep);

      switch (input) {
        case "UP":
          setCreateItemIndex((i) => Math.max(i - cols, 0));
          break;
        case "DOWN":
          setCreateItemIndex((i) => Math.min(i + cols, count - 1));
          break;
        case "LEFT":
          setCreateItemIndex((i) => (i % cols === 0 ? i : i - 1));
          break;
        case "RIGHT":
          setCreateItemIndex((i) => Math.min(i + 1, count - 1));
          break;
        case "A":
          selectItem(createItemIndex);
          break;
        case "B": {
          const i = STEPS.indexOf(createStep);
          if (i === 0) {
            pop();
            resetDraft();
          } else {
            setCreateStep(STEPS[i - 1]);
            setCreateItemIndex(0);
          }
          break;
        }
      }
    },
    [createStep, createItemIndex, selectItem, pop, resetDraft],
  );

  return {
    createStep,
    createItemIndex,
    draftLoader,
    draftVersion,
    draftColor,
    handleInput,
    onMoveFocus: setCreateItemIndex,
    onSelect: selectItem,
  };
}

// ─── component ───────────────────────────────────────────────────────────────

const STEP_LABELS: Record<CreateStep, string> = {
  loader: "Mod Loader",
  version: "Minecraft Version",
  color: "Instance Color",
  confirm: "Confirm",
};

const STEP_HINTS: Record<CreateStep, string> = {
  loader: "Use D-pad to choose a mod loader. Press A to confirm and continue. Press B to cancel.",
  version: "Use D-pad to pick a Minecraft version. Press A to confirm. Press B to go back.",
  color: "Use D-pad to choose an accent color. Press A to confirm. Press B to go back.",
  confirm: "Press A to create the instance, or B to go back and change the color.",
};

interface CreateInstancePageProps {
  step: CreateStep;
  focusedIndex: number;
  draftLoader: string;
  draftVersion: string;
  draftColor: string;
  hasFocus: boolean;
  onMoveFocus: (index: number) => void;
  onSelect: (index: number) => void;
}

export function CreateInstancePage({
  step,
  focusedIndex,
  draftLoader,
  draftVersion,
  draftColor,
  hasFocus,
  onMoveFocus,
  onSelect,
}: CreateInstancePageProps) {
  const stepNumber = STEPS.indexOf(step) + 1;
  const currentLoader = LOADERS.find((l) => l.id === draftLoader);
  const instanceName =
    draftLoader && draftVersion
      ? `${currentLoader?.label ?? ""} ${draftVersion}`
      : draftLoader
        ? `${currentLoader?.label ?? ""} Instance`
        : "New Instance";

  const isFocused = (i: number) => hasFocus && focusedIndex === i;

  return (
    <section className="grid min-h-0 flex-1 grid-cols-[minmax(0,0.95fr)_minmax(20rem,0.7fr)] gap-6">
      <div className="flex min-h-0 flex-col gap-5">
        {/* Progress bar */}
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`h-[3px] flex-1 rounded-full transition-all duration-300 ${
                i <= STEPS.indexOf(step) ? "bg-lime-300" : "bg-white/10"
              }`}
            />
          ))}
        </div>

        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-stone-500">
            Step {stepNumber} of {STEPS.length}
          </p>
          <h2 className="mt-2 font-display text-4xl tracking-[-0.05em] text-white">
            {STEP_LABELS[step]}
          </h2>
        </div>

        {step === "loader" && (
          <div className="grid flex-1 auto-rows-max grid-cols-2 gap-3">
            {LOADERS.map((loader, i) => (
              <article
                key={loader.id}
                onClick={() => onSelect(i)}
                onMouseEnter={() => onMoveFocus(i)}
                style={{ "--accent": loader.color } as CSSProperties}
                className={`relative cursor-default overflow-hidden rounded-[1.75rem] border p-6 transition duration-200 ${
                  isFocused(i) ? "border-lime-300/60 bg-[#171c1a]" : "border-white/8 bg-[#121514]"
                }`}
              >
                <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[var(--accent)] opacity-20 blur-2xl" />
                <div className="relative">
                  <div className="h-10 w-10 rounded-[0.75rem]" style={{ background: loader.color }} />
                  <h3 className="mt-4 font-display text-3xl tracking-[-0.04em] text-white">
                    {loader.label}
                  </h3>
                  <p className="mt-2 text-base leading-6 text-stone-400">{loader.description}</p>
                </div>
                {isFocused(i) && (
                  <div className="absolute right-5 top-5 h-3 w-3 rounded-full bg-lime-300" />
                )}
              </article>
            ))}
          </div>
        )}

        {step === "version" && (
          <div className="grid auto-rows-max grid-cols-4 gap-3 overflow-y-auto">
            {MC_VERSIONS.map((version, i) => (
              <button
                key={version}
                type="button"
                onClick={() => onSelect(i)}
                onMouseEnter={() => onMoveFocus(i)}
                className={`rounded-[1.25rem] border px-4 py-5 text-center transition duration-200 ${
                  isFocused(i)
                    ? "border-lime-300/60 bg-[#171c1a] text-white"
                    : "border-white/8 bg-[#121514] text-stone-300"
                }`}
              >
                <p className="text-xl font-semibold tracking-[-0.03em]">{version}</p>
              </button>
            ))}
          </div>
        )}

        {step === "color" && (
          <div className="flex flex-col gap-6">
            <p className="text-lg leading-7 text-stone-400">
              This color identifies your instance in the launcher and on the grid.
            </p>
            <div className="grid grid-cols-4 gap-4">
              {INSTANCE_COLORS.map((color, i) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => onSelect(i)}
                  onMouseEnter={() => onMoveFocus(i)}
                  className={`aspect-square rounded-[1.5rem] border-2 transition duration-200 ${
                    isFocused(i) ? "scale-110 border-lime-300" : "border-transparent"
                  }`}
                  style={{ background: color }}
                />
              ))}
            </div>
            <div className="rounded-[1.25rem] border border-white/8 bg-white/[0.03] px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-stone-500">
                Instance Name
              </p>
              <p className="mt-2 text-xl font-semibold text-white">{instanceName}</p>
              <p className="mt-1 text-sm text-stone-500">
                Name is generated from your loader and version. You can rename it after.
              </p>
            </div>
          </div>
        )}

        {step === "confirm" && (
          <div className="flex flex-col gap-4">
            <div className="rounded-[1.75rem] border border-white/8 bg-[#121514] p-6">
              <div className="flex items-center gap-5">
                <div
                  className="h-16 w-16 shrink-0 rounded-[1.5rem] border border-white/10 shadow-[inset_0_1px_20px_rgba(255,255,255,0.08)]"
                  style={{
                    background: `linear-gradient(145deg, rgba(255,255,255,0.12), rgba(0,0,0,0.16)), ${draftColor}`,
                  }}
                />
                <div>
                  <h3 className="font-display text-3xl tracking-[-0.04em] text-white">
                    {instanceName}
                  </h3>
                  <p className="mt-1 text-stone-400">
                    {currentLoader?.label} · Minecraft {draftVersion}
                  </p>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3">
                {[
                  { label: "Loader", value: currentLoader?.label ?? "" },
                  { label: "Version", value: draftVersion },
                  { label: "Mods", value: "None yet" },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-4 py-3"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.32em] text-stone-500">
                      {item.label}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-white">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => onSelect(0)}
              onMouseEnter={() => onMoveFocus(0)}
              className={`rounded-[1.75rem] border px-8 py-6 text-left transition duration-200 ${
                isFocused(0)
                  ? "border-lime-300/60 bg-lime-300 text-slate-950"
                  : "border-white/8 bg-[#121514] text-white"
              }`}
            >
              <p
                className={`text-xs font-semibold uppercase tracking-[0.34em] ${
                  isFocused(0) ? "text-slate-900/60" : "text-stone-500"
                }`}
              >
                Ready to create
              </p>
              <p className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Create Instance</p>
              <p
                className={`mt-2 text-base ${isFocused(0) ? "text-slate-900/70" : "text-stone-400"}`}
              >
                Add {instanceName} to your launcher. Install mods and adjust settings after.
              </p>
            </button>
          </div>
        )}
      </div>

      {/* Inspector */}
      <aside className="simple-panel flex flex-col rounded-[1.75rem] px-6 py-6">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-stone-500">Preview</p>

        <div className="mt-4 flex items-center gap-4">
          <div
            className="h-14 w-14 shrink-0 rounded-[1.25rem] border border-white/10 shadow-[inset_0_1px_16px_rgba(255,255,255,0.08)] transition-all duration-300"
            style={{
              background: `linear-gradient(145deg, rgba(255,255,255,0.12), rgba(0,0,0,0.16)), ${draftColor}`,
            }}
          />
          <h3 className="font-display text-3xl leading-none tracking-[-0.05em] text-white">
            {instanceName}
          </h3>
        </div>

        <div className="mt-6 space-y-3">
          {[
            { label: "Loader", value: currentLoader?.label },
            { label: "Version", value: draftVersion || null },
            { label: "Color", value: draftColor, isColor: true },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-[1.25rem] border border-white/8 bg-white/[0.03] px-5 py-4"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-stone-500">
                {item.label}
              </p>
              {item.isColor ? (
                <div className="mt-2 flex items-center gap-3">
                  <div
                    className="h-5 w-5 rounded-full border border-white/10"
                    style={{ background: draftColor }}
                  />
                  <p className="font-mono text-lg font-semibold text-white">{draftColor}</p>
                </div>
              ) : (
                <p className="mt-2 text-xl font-semibold text-white">
                  {item.value ?? <span className="text-stone-600">Not selected</span>}
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="mt-auto rounded-[1.25rem] border border-lime-300/20 bg-lime-300/8 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-lime-300/70">
            Navigation
          </p>
          <p className="mt-2 text-sm leading-6 text-stone-400">{STEP_HINTS[step]}</p>
        </div>
      </aside>
    </section>
  );
}
