import { useState, useCallback, useMemo, type CSSProperties } from "react";
import type { CreateStep, GameInstance, LoaderType, McVersionInfo, LoaderVersionInfo } from "../types";
import { LOADERS, INSTANCE_COLORS, LOADER_COLORS } from "../constants";
import { requiredJavaVersion } from "../utils/format";
import type { GamepadInput } from "../hooks/useGamepad";

// ─── step ordering ────────────────────────────────────────────────────────────

const ALL_STEPS: CreateStep[] = ["loader", "version", "loader_version", "color", "confirm"];

const STEP_LABELS: Record<CreateStep, string> = {
  loader: "Mod Loader",
  version: "Minecraft Version",
  loader_version: "Loader Version",
  color: "Instance Color",
  confirm: "Confirm",
};

const STEP_HINTS: Record<CreateStep, string> = {
  loader: "D-pad to choose a loader. A to confirm. B to cancel.",
  version: "D-pad to pick a version. A to confirm. X to toggle snapshots. B to go back.",
  loader_version: "D-pad to pick a loader version. A to confirm. X to toggle stable-only. B to go back.",
  color: "D-pad to choose a color. A to confirm. B to go back.",
  confirm: "A to create the instance. B to go back.",
};

function getCreateCols(step: CreateStep): number {
  if (step === "version" || step === "color" || step === "loader_version") return 4;
  if (step === "loader") return 2;
  return 1;
}

// Skip loader_version going forward for vanilla; mirrors going backward.
function nextStepFor(step: CreateStep, loader: string): CreateStep {
  const idx = ALL_STEPS.indexOf(step);
  const next = ALL_STEPS[idx + 1] ?? "confirm";
  if (next === "loader_version" && loader === "vanilla") return ALL_STEPS[idx + 2] ?? "confirm";
  return next;
}

function prevStepFor(step: CreateStep, loader: string): CreateStep | null {
  const idx = ALL_STEPS.indexOf(step);
  if (idx <= 0) return null;
  const prev = ALL_STEPS[idx - 1];
  if (prev === "loader_version" && loader === "vanilla") return ALL_STEPS[idx - 2] ?? null;
  return prev ?? null;
}

// ─── hook ────────────────────────────────────────────────────────────────────

interface UseCreatePageOptions {
  pop: () => void;
  onCreated: (instance: GameInstance) => Promise<void>;
  openOSK: (initial: string, onConfirm: (value: string) => void, onCancel?: () => void) => void;
  mcVersions: McVersionInfo[];
  fetchLoaderVersions: (loader: LoaderType, mcVersion: string) => Promise<LoaderVersionInfo[]>;
}

export function useCreatePage({
  pop,
  onCreated,
  openOSK,
  mcVersions,
  fetchLoaderVersions,
}: UseCreatePageOptions) {
  const [createStep, setCreateStep] = useState<CreateStep>("loader");
  const [createItemIndex, setCreateItemIndex] = useState(0);
  const [draftLoader, setDraftLoader] = useState("");
  const [draftVersion, setDraftVersion] = useState("");
  const [draftLoaderVersion, setDraftLoaderVersion] = useState("");
  const [draftColor, setDraftColor] = useState<string>(INSTANCE_COLORS[0]);
  const [draftName, setDraftName] = useState("");

  // Version step filter
  const [showSnapshots, setShowSnapshots] = useState(false);

  // Loader version step state
  const [loaderVersions, setLoaderVersions] = useState<LoaderVersionInfo[]>([]);
  const [isLoadingLoaderVersions, setIsLoadingLoaderVersions] = useState(false);
  const [showOnlyStable, setShowOnlyStable] = useState(true);

  // Derived lists
  const filteredMcVersions = useMemo(() => {
    const allowed = showSnapshots ? ["release", "snapshot"] : ["release"];
    return mcVersions.filter((v) => allowed.includes(v.versionType)).map((v) => v.id);
  }, [mcVersions, showSnapshots]);

  const filteredLoaderVersions = useMemo(
    () =>
      (showOnlyStable ? loaderVersions.filter((v) => v.stable) : loaderVersions).map(
        (v) => v.version,
      ),
    [loaderVersions, showOnlyStable],
  );

  // Progress bar — 4 steps for Vanilla (skip loader_version), 5 for everything else.
  const effectiveSteps = useMemo<CreateStep[]>(
    () =>
      draftLoader === "vanilla"
        ? ["loader", "version", "color", "confirm"]
        : ["loader", "version", "loader_version", "color", "confirm"],
    [draftLoader],
  );

  const resetDraft = useCallback(() => {
    setCreateStep("loader");
    setCreateItemIndex(0);
    setDraftLoader("");
    setDraftVersion("");
    setDraftLoaderVersion("");
    setDraftColor(INSTANCE_COLORS[0]);
    setDraftName("");
    setShowSnapshots(false);
    setLoaderVersions([]);
    setShowOnlyStable(true);
  }, []);

  const startLoaderVersionFetch = useCallback(
    (loader: string, mcVersion: string) => {
      setLoaderVersions([]);
      setIsLoadingLoaderVersions(true);
      fetchLoaderVersions(loader as LoaderType, mcVersion)
        .then((versions) => {
          setLoaderVersions(versions);
          setIsLoadingLoaderVersions(false);
        })
        .catch(() => {
          setLoaderVersions([]);
          setIsLoadingLoaderVersions(false);
        });
    },
    [fetchLoaderVersions],
  );

  const selectItem = useCallback(
    (i: number) => {
      if (createStep === "loader") {
        const loader = LOADERS[i];
        setDraftLoader(loader.id);
        setDraftColor(LOADER_COLORS[loader.id] ?? INSTANCE_COLORS[0]);
        setCreateStep("version");
        setCreateItemIndex(0);
      } else if (createStep === "version") {
        const ver = filteredMcVersions[i];
        setDraftVersion(ver);
        const next = nextStepFor("version", draftLoader);
        setCreateStep(next);
        setCreateItemIndex(0);
        if (next === "loader_version") startLoaderVersionFetch(draftLoader, ver);
      } else if (createStep === "loader_version") {
        setDraftLoaderVersion(filteredLoaderVersions[i] ?? "");
        setCreateStep(nextStepFor("loader_version", draftLoader));
        setCreateItemIndex(0);
      } else if (createStep === "color") {
        const selectedColor = INSTANCE_COLORS[i];
        setDraftColor(selectedColor);
        const loaderOpt = LOADERS.find((l) => l.id === draftLoader);
        const autoName = `${loaderOpt?.label ?? "Custom"} ${draftVersion}`;
        openOSK(
          autoName,
          (name) => {
            setDraftName(name.trim() || autoName);
            setCreateStep("confirm");
            setCreateItemIndex(0);
          },
          () => {
            setDraftName(autoName);
            setCreateStep("confirm");
            setCreateItemIndex(0);
          },
        );
      } else {
        // confirm step — create the instance
        const loaderType = draftLoader as LoaderType;
        const now = Math.floor(Date.now() / 1000);
        const newInstance: GameInstance = {
          id: crypto.randomUUID(),
          name: draftName,
          loaderType,
          loaderVersion: draftLoaderVersion,
          minecraftVersion: draftVersion,
          color: draftColor,
          javaVersion: requiredJavaVersion(draftVersion),
          ramMb: 2048,
          jvmArgs: "",
          notes: "",
          lastPlayedAt: null,
          playTimeSecs: 0,
          modCount: 0,
          sortOrder: 0,
          createdAt: now,
        };
        void onCreated(newInstance).then(() => {
          pop();
          resetDraft();
        });
      }
    },
    [
      createStep, draftLoader, draftVersion, draftLoaderVersion, draftColor, draftName,
      filteredMcVersions, filteredLoaderVersions, onCreated, pop, resetDraft, openOSK,
      startLoaderVersionFetch,
    ],
  );

  const handleInput = useCallback(
    (input: GamepadInput) => {
      // Step-specific toggles on X
      if (input === "X") {
        if (createStep === "version") {
          setShowSnapshots((p) => !p);
          setCreateItemIndex(0);
          return;
        }
        if (createStep === "loader_version") {
          setShowOnlyStable((p) => !p);
          setCreateItemIndex(0);
          return;
        }
      }

      const cols = getCreateCols(createStep);
      const count =
        createStep === "loader"
          ? LOADERS.length
          : createStep === "version"
            ? Math.max(filteredMcVersions.length, 1)
            : createStep === "loader_version"
              ? Math.max(filteredLoaderVersions.length, 1)
              : createStep === "color"
                ? INSTANCE_COLORS.length
                : 1;

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
          const prev = prevStepFor(createStep, draftLoader);
          if (prev === null) {
            pop();
            resetDraft();
          } else {
            setCreateStep(prev);
            setCreateItemIndex(0);
          }
          break;
        }
      }
    },
    [
      createStep, createItemIndex, draftLoader,
      filteredMcVersions.length, filteredLoaderVersions.length,
      selectItem, pop, resetDraft,
    ],
  );

  return {
    createStep,
    createItemIndex,
    draftLoader,
    draftVersion,
    draftLoaderVersion,
    draftColor,
    draftName,
    effectiveSteps,
    filteredMcVersions,
    filteredLoaderVersions,
    showSnapshots,
    showOnlyStable,
    isLoadingLoaderVersions,
    handleInput,
    onMoveFocus: setCreateItemIndex,
    onSelect: selectItem,
  };
}

// ─── component ───────────────────────────────────────────────────────────────

interface CreateInstancePageProps {
  step: CreateStep;
  effectiveSteps: CreateStep[];
  focusedIndex: number;
  draftLoader: string;
  draftVersion: string;
  draftLoaderVersion: string;
  draftColor: string;
  draftName: string;
  mcVersions: string[];
  loaderVersions: string[];
  showSnapshots: boolean;
  showOnlyStable: boolean;
  isLoadingMcVersions: boolean;
  isLoadingLoaderVersions: boolean;
  hasFocus: boolean;
  onMoveFocus: (index: number) => void;
  onSelect: (index: number) => void;
}

export function CreateInstancePage({
  step,
  effectiveSteps,
  focusedIndex,
  draftLoader,
  draftVersion,
  draftLoaderVersion,
  draftColor,
  draftName,
  mcVersions,
  loaderVersions,
  showSnapshots,
  showOnlyStable,
  isLoadingMcVersions,
  isLoadingLoaderVersions,
  hasFocus,
  onMoveFocus,
  onSelect,
}: CreateInstancePageProps) {
  const stepNumber = effectiveSteps.indexOf(step) + 1;
  const currentLoader = LOADERS.find((l) => l.id === draftLoader);
  const instanceName =
    draftName ||
    (draftLoader && draftVersion
      ? `${currentLoader?.label ?? ""} ${draftVersion}`
      : draftLoader
        ? `${currentLoader?.label ?? ""} Instance`
        : "New Instance");

  const isFocused = (i: number) => hasFocus && focusedIndex === i;

  return (
    <section className="grid min-h-0 flex-1 grid-cols-[minmax(0,0.95fr)_minmax(20rem,0.7fr)] gap-6">
      <div className="flex min-h-0 flex-col gap-5">
        {/* Progress bar */}
        <div className="flex items-center gap-2">
          {effectiveSteps.map((s, i) => (
            <div
              key={s}
              className={`h-[3px] flex-1 rounded-full transition-all duration-300 ${
                i <= effectiveSteps.indexOf(step) ? "bg-lime-300" : "bg-white/10"
              }`}
            />
          ))}
        </div>

        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-stone-500">
            Step {stepNumber} of {effectiveSteps.length}
          </p>
          <h2 className="mt-2 font-display text-4xl tracking-[-0.05em] text-white">
            {STEP_LABELS[step]}
          </h2>
        </div>

        {/* ── Loader ── */}
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

        {/* ── Minecraft Version ── */}
        {step === "version" && (
          <div className="flex min-h-0 flex-col gap-3">
            {/* Filter toggle */}
            <div className="flex items-center gap-3">
              <div
                className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition duration-200 ${
                  !showSnapshots
                    ? "border-lime-300/60 bg-lime-300/10 text-lime-300"
                    : "border-white/10 bg-white/5 text-stone-400"
                }`}
              >
                Releases
              </div>
              <div
                className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition duration-200 ${
                  showSnapshots
                    ? "border-lime-300/60 bg-lime-300/10 text-lime-300"
                    : "border-white/10 bg-white/5 text-stone-400"
                }`}
              >
                + Snapshots
              </div>
              <span className="ml-auto text-xs text-stone-600">X to toggle</span>
            </div>

            {isLoadingMcVersions ? (
              <div className="flex flex-1 items-center justify-center gap-4 text-stone-400">
                <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-lime-300/60 border-t-transparent" />
                <span className="text-lg">Loading versions…</span>
              </div>
            ) : (
              <div className="grid auto-rows-max grid-cols-4 gap-3 overflow-y-auto">
                {mcVersions.map((version, i) => (
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
          </div>
        )}

        {/* ── Loader Version ── */}
        {step === "loader_version" && (
          <div className="flex min-h-0 flex-col gap-3">
            {/* Stability filter */}
            <div className="flex items-center gap-3">
              <div
                className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition duration-200 ${
                  showOnlyStable
                    ? "border-lime-300/60 bg-lime-300/10 text-lime-300"
                    : "border-white/10 bg-white/5 text-stone-400"
                }`}
              >
                Stable only
              </div>
              <div
                className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition duration-200 ${
                  !showOnlyStable
                    ? "border-lime-300/60 bg-lime-300/10 text-lime-300"
                    : "border-white/10 bg-white/5 text-stone-400"
                }`}
              >
                All versions
              </div>
              <span className="ml-auto text-xs text-stone-600">X to toggle</span>
            </div>

            {isLoadingLoaderVersions ? (
              <div className="flex flex-1 items-center justify-center gap-4 text-stone-400">
                <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-lime-300/60 border-t-transparent" />
                <span className="text-lg">Loading loader versions…</span>
              </div>
            ) : loaderVersions.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
                <p className="text-lg text-stone-400">No versions found for this combination.</p>
                <p className="text-sm text-stone-600">Press B to go back and choose a different Minecraft version.</p>
              </div>
            ) : (
              <div className="grid auto-rows-max grid-cols-4 gap-3 overflow-y-auto">
                {loaderVersions.map((version, i) => (
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
                    <p className="text-lg font-semibold tracking-[-0.03em]">{version}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Color ── */}
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
                Press A to confirm color. You'll name the instance next.
              </p>
            </div>
          </div>
        )}

        {/* ── Confirm ── */}
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
              <div className="mt-5 grid grid-cols-4 gap-3">
                {[
                  { label: "Loader", value: currentLoader?.label ?? "" },
                  { label: "MC Version", value: draftVersion },
                  ...(draftLoader !== "vanilla"
                    ? [{ label: "Loader Ver.", value: draftLoaderVersion || "Latest" }]
                    : []),
                  { label: "Java", value: `Java ${requiredJavaVersion(draftVersion)}` },
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
              <p className={`mt-2 text-base ${isFocused(0) ? "text-slate-900/70" : "text-stone-400"}`}>
                Add {instanceName} to your launcher. Install mods and adjust settings after.
              </p>
            </button>
          </div>
        )}
      </div>

      {/* ── Inspector sidebar ── */}
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
            { label: "MC Version", value: draftVersion || null },
            ...(draftLoader && draftLoader !== "vanilla"
              ? [{ label: "Loader Ver.", value: draftLoaderVersion || null }]
              : []),
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
                  <div className="h-5 w-5 rounded-full border border-white/10" style={{ background: draftColor }} />
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
