import { useState, useCallback, useMemo, useEffect, useRef, type CSSProperties } from "react";
import type { GameInstance } from "../types";
import { INSTANCE_COLORS, LOADER_COLORS, LOADER_LABELS } from "../constants";
import { formatLastPlayed, formatModCount, formatPlaytime, formatRam, formatBytes } from "../utils/format";
import type { GamepadInput } from "../hooks/useGamepad";
import { useContentTab, type ContentTabState } from "../hooks/useContentTab";
import { useFilesTab, type FilesTabState } from "../hooks/useFilesTab";
import { useWorldsTab, type WorldsTabState } from "../hooks/useWorldsTab";
import { useServersTab, type ServersTabState } from "../hooks/useServersTab";
import { useLogsTab, type LogsTabState, type LogFilter } from "../hooks/useLogsTab";
import { GamepadGlyph } from "../components/GamepadGlyph";
import { inputToGlyph, type ControllerType } from "../gamepad/glyphs";
import { ConfirmDialog } from "../components/ConfirmDialog";

// ─── constants ────────────────────────────────────────────────────────────────

const TABS = [
  "Overview",
  "Mods",
  "Resource Packs",
  "Data Packs",
  "Shaders",
  "Files",
  "Worlds",
  "Servers",
  "Logs",
] as const;

// Tabs that require a mod loader (hidden for vanilla instances)
const LOADER_ONLY_TABS = new Set([1, 4]); // Mods, Shaders

const RAM_OPTIONS = [512, 1024, 2048, 3072, 4096, 6144, 8192, 12288, 16384];

const OVERVIEW_ACTIONS = [
  { id: "launch",  label: "Launch",          description: "Start this instance with your Microsoft account", danger: false },
  { id: "rename",  label: "Rename",           description: "Change the display name of this instance",        danger: false },
  { id: "color",   label: "Edit Color",       description: "Change the accent color for this instance",       danger: false },
  { id: "ram",     label: "Edit RAM",         description: "Set how much memory this instance can use",       danger: false },
  { id: "jvm",     label: "Edit JVM Args",    description: "Customize Java launch arguments",                 danger: false },
  { id: "notes",   label: "Edit Notes",       description: "Add a short description to this instance",        danger: false },
  { id: "delete",  label: "Delete Instance",  description: "Permanently remove this instance and all files",  danger: true  },
] as const;

type OverviewActionId = (typeof OVERVIEW_ACTIONS)[number]["id"];
type InstanceOverlay  = "none" | "color" | "ram" | "delete";

// ─── hook ─────────────────────────────────────────────────────────────────────

interface UseInstancePageOptions {
  instanceId: string | null;
  instances: GameInstance[];
  launchInstance: (instance: GameInstance, opts?: { quickplayWorld?: string; quickplayServer?: string }) => Promise<void>;
  updateInstance: (instance: GameInstance) => Promise<void>;
  removeInstance: (id: string) => Promise<void>;
  pop: () => void;
  toSidebar: () => void;
  openOSK: (initial: string, onConfirm: (value: string) => void, onCancel?: () => void) => void;
}

export function useInstancePage({
  instanceId,
  instances,
  launchInstance,
  updateInstance,
  removeInstance,
  pop,
  toSidebar,
  openOSK,
}: UseInstancePageOptions) {
  const [activeTab, setActiveTab]       = useState(0);
  const [actionIndex, setActionIndex]   = useState(0);
  const [overlay, setOverlay]           = useState<InstanceOverlay>("none");
  const [colorIndex, setColorIndex]     = useState(0);
  const [ramIndex, setRamIndex]         = useState(RAM_OPTIONS.indexOf(4096));
  const [deleteChoice, setDeleteChoice] = useState(0);

  const instance = useMemo(
    () => instances.find((i) => i.id === instanceId) ?? null,
    [instances, instanceId],
  );

  const availableTabs = useMemo(() => {
    const s = new Set(TABS.map((_, i) => i));
    if (instance?.loaderType === "vanilla") {
      LOADER_ONLY_TABS.forEach((i) => s.delete(i));
    }
    return s;
  }, [instance?.loaderType]);

  // Content tabs — always mounted; each lazy-loads when it becomes active.
  const contentTabArgs = useMemo(
    () => ({
      instanceId,
      mcVersion:  instance?.minecraftVersion ?? "",
      loaderType: instance?.loaderType ?? "fabric",
      openOSK,
    }),
    [instanceId, instance?.minecraftVersion, instance?.loaderType, openOSK],
  );

  const modsTab         = useContentTab({ ...contentTabArgs, category: "mod",          isActive: activeTab === 1 });
  const resourcepackTab = useContentTab({ ...contentTabArgs, category: "resourcepack", isActive: activeTab === 2 });
  const datapackTab     = useContentTab({ ...contentTabArgs, category: "datapack",     isActive: activeTab === 3 });
  const shaderTab       = useContentTab({ ...contentTabArgs, category: "shader",       isActive: activeTab === 4 });

  const contentTabs: ContentTabState[] = [modsTab, resourcepackTab, datapackTab, shaderTab];

  const filesTab = useFilesTab({
    instanceId,
    isActive: activeTab === 5,
    openOSK,
  });

  const worldsTab = useWorldsTab({
    instanceId,
    isActive: activeTab === 6,
    onLaunch: (folder) => instance && void launchInstance(instance, { quickplayWorld: folder }),
  });

  const serversTab = useServersTab({
    instanceId,
    isActive: activeTab === 7,
    onLaunch: (ip) => instance && void launchInstance(instance, { quickplayServer: ip }),
  });

  const logsTab = useLogsTab(instanceId, activeTab === 8);

  // Reset per-instance state when the target instance changes.
  useEffect(() => {
    setActiveTab(0);
    setActionIndex(0);
    setOverlay("none");
    if (instance) {
      const ci = (INSTANCE_COLORS as readonly string[]).indexOf(instance.color);
      setColorIndex(ci >= 0 ? ci : 0);
      const ri = RAM_OPTIONS.indexOf(instance.ramMb);
      setRamIndex(ri >= 0 ? ri : RAM_OPTIONS.indexOf(4096));
    }
  }, [instanceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleInput = useCallback(
    (input: GamepadInput) => {
      if (!instance) return;

      // ── overview overlays ─────────────────────────────────────────────────
      if (overlay === "color") {
        const cols = 4;
        const count = INSTANCE_COLORS.length;
        switch (input) {
          case "UP":    setColorIndex((i) => Math.max(i - cols, 0)); break;
          case "DOWN":  setColorIndex((i) => Math.min(i + cols, count - 1)); break;
          case "LEFT":  setColorIndex((i) => (i % cols === 0 ? i : i - 1)); break;
          case "RIGHT": setColorIndex((i) => Math.min(i + 1, count - 1)); break;
          case "A":
            void updateInstance({ ...instance, color: INSTANCE_COLORS[colorIndex] as string });
            setOverlay("none");
            break;
          case "B": setOverlay("none"); break;
        }
        return;
      }
      if (overlay === "ram") {
        switch (input) {
          case "UP":   setRamIndex((i) => Math.max(i - 1, 0)); break;
          case "DOWN": setRamIndex((i) => Math.min(i + 1, RAM_OPTIONS.length - 1)); break;
          case "A":
            void updateInstance({ ...instance, ramMb: RAM_OPTIONS[ramIndex] ?? instance.ramMb });
            setOverlay("none");
            break;
          case "B": setOverlay("none"); break;
        }
        return;
      }
      if (overlay === "delete") {
        switch (input) {
          case "LEFT":  setDeleteChoice(0); break;
          case "RIGHT": setDeleteChoice(1); break;
          case "A":
            if (deleteChoice === 1) {
              void removeInstance(instance.id).then(() => { setOverlay("none"); pop(); });
            } else {
              setOverlay("none");
            }
            break;
          case "B": setOverlay("none"); break;
        }
        return;
      }

      // ── content tabs: delegate first so B/browse-back works correctly ─────
      if (activeTab >= 1 && activeTab <= 4) {
        const tab = contentTabs[activeTab - 1];
        if (tab?.handleInput(input)) return;
      }

      // ── files tab: delegate so B navigates up before popping ─────────────
      if (activeTab === 5) {
        if (filesTab.handleInput(input)) return;
      }

      // ── worlds / servers / logs tabs ──────────────────────────────────────
      if (activeTab === 6) { if (worldsTab.handleInput(input)) return; }
      if (activeTab === 7) { if (serversTab.handleInput(input)) return; }
      if (activeTab === 8) { if (logsTab.handleInput(input)) return; }

      // ── top-level: tab switch & back ──────────────────────────────────────
      switch (input) {
        case "B":  pop(); return;
        case "LB": setActiveTab((t) => {
          for (let i = t - 1; i >= 0; i--) { if (availableTabs.has(i)) return i; }
          return t;
        }); return;
        case "RB": setActiveTab((t) => {
          for (let i = t + 1; i < TABS.length; i++) { if (availableTabs.has(i)) return i; }
          return t;
        }); return;
      }

      // ── overview tab inputs ───────────────────────────────────────────────
      if (activeTab === 0) {
        switch (input) {
          case "UP":   setActionIndex((i) => Math.max(i - 1, 0)); break;
          case "DOWN": setActionIndex((i) => Math.min(i + 1, OVERVIEW_ACTIONS.length - 1)); break;
          case "LEFT": toSidebar(); break;
          case "A": {
            const action = OVERVIEW_ACTIONS[actionIndex];
            if (!action) break;
            const id = action.id as OverviewActionId;
            if (id === "launch") {
              void launchInstance(instance);
            } else if (id === "rename") {
              openOSK(instance.name, (name) => {
                const trimmed = name.trim();
                if (trimmed) void updateInstance({ ...instance, name: trimmed });
              });
            } else if (id === "color") {
              const ci = (INSTANCE_COLORS as readonly string[]).indexOf(instance.color);
              setColorIndex(ci >= 0 ? ci : 0);
              setOverlay("color");
            } else if (id === "ram") {
              const ri = RAM_OPTIONS.indexOf(instance.ramMb);
              setRamIndex(ri >= 0 ? ri : RAM_OPTIONS.indexOf(4096));
              setOverlay("ram");
            } else if (id === "jvm") {
              openOSK(instance.jvmArgs, (args) => {
                void updateInstance({ ...instance, jvmArgs: args });
              });
            } else if (id === "notes") {
              openOSK(instance.notes, (notes) => {
                void updateInstance({ ...instance, notes });
              });
            } else if (id === "delete") {
              setDeleteChoice(0);
              setOverlay("delete");
            }
            break;
          }
        }
      }
    },
    [
      instance, overlay, activeTab, actionIndex, colorIndex, ramIndex, deleteChoice,
      availableTabs, contentTabs, filesTab, worldsTab, serversTab, logsTab,
      launchInstance, updateInstance, removeInstance, pop, toSidebar, openOSK,
    ],
  );

  return {
    instance,
    activeTab,
    availableTabs,
    actionIndex,
    overlay,
    colorIndex,
    ramIndex,
    deleteChoice,
    contentTabs,
    filesTab,
    worldsTab,
    serversTab,
    logsTab,
    handleInput,
    onSelectTab:    setActiveTab,
    onSelectAction: setActionIndex,
  };
}

// ─── content tab UI ───────────────────────────────────────────────────────────

interface ContentTabViewProps {
  tab: ContentTabState;
  tabName: string;
  hasFocus: boolean;
  ct: ControllerType;
}

function ContentTabView({ tab, tabName, hasFocus, ct }: ContentTabViewProps) {
  const Btn = ({ input, label }: { input: string; label: string }) => {
    const glyph = inputToGlyph(input, ct);
    return (
      <span className="inline-flex items-center gap-1">
        {glyph && <GamepadGlyph controller={ct} button={glyph} size={14} />}
        <span>{label}</span>
      </span>
    );
  };
  const {
    items, installedProjectIds, view, installedIndex, searchResults, isSearching,
    browseIndex, versionOverlay, deleteOverlay, deleteChoice, isInstalling,
    onSelectInstalled, onSelectBrowse, onOpenBrowse, onOpenSearch,
  } = tab;

  const installedRefs = useRef<(HTMLDivElement | null)[]>([]);
  const browseRefs    = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => { installedRefs.current[installedIndex]?.scrollIntoView({ block: "nearest" }); }, [installedIndex]);
  useEffect(() => { browseRefs.current[browseIndex]?.scrollIntoView({ block: "nearest" }); }, [browseIndex]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-4">

      {/* ── Version install overlay ─────────────────────────────────────── */}
      {versionOverlay && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[2rem] bg-black/70 backdrop-blur-sm">
          <div className="simple-panel w-[36rem] rounded-[2rem] px-10 py-9">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-stone-500">
              Install {tabName}
            </p>
            <h2 className="mt-2 font-display text-4xl tracking-[-0.05em] text-white">
              {versionOverlay.hit.title}
            </h2>

            {versionOverlay.isFetching ? (
              <div className="mt-6 flex items-center gap-4 text-stone-400">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-lime-300 border-t-transparent" />
                <span>Finding best compatible version…</span>
              </div>
            ) : versionOverlay.file ? (
              <div className="mt-5 space-y-3">
                <div className="rounded-[1rem] border border-white/8 bg-[#121514] px-5 py-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-stone-500">Version</p>
                  <p className="mt-1 font-semibold text-white">{versionOverlay.file.versionName}</p>
                  <p className="text-sm text-stone-500">{versionOverlay.file.versionNumber}</p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-[1rem] border border-white/8 bg-[#121514] px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-stone-500">Size</p>
                    <p className="mt-1 font-semibold text-white">{formatBytes(versionOverlay.file.sizeBytes)}</p>
                  </div>
                  <div className="rounded-[1rem] border border-white/8 bg-[#121514] px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-stone-500">Type</p>
                    <p className="mt-1 font-semibold capitalize text-white">{versionOverlay.file.versionType}</p>
                  </div>
                  <div className="rounded-[1rem] border border-white/8 bg-[#121514] px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-stone-500">Loaders</p>
                    <p className="mt-1 font-semibold capitalize text-white">
                      {versionOverlay.file.loaders.join(", ") || "Any"}
                    </p>
                  </div>
                </div>
                <div className="mt-6 flex gap-4">
                  <div
                    className={`flex-1 rounded-[1.25rem] border px-6 py-4 text-center transition duration-200 ${
                      isInstalling
                        ? "border-lime-300/30 bg-lime-300/20 text-slate-950/50"
                        : "border-lime-300/60 bg-lime-300 text-slate-950"
                    }`}
                  >
                    <p className="text-xl font-semibold">
                      {isInstalling ? "Installing…" : "Install"}
                    </p>
                  </div>
                  <div className="flex-1 rounded-[1.25rem] border border-white/8 bg-white/[0.03] px-6 py-4 text-center text-stone-400">
                    <p className="text-xl font-semibold">Cancel</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-5">
                <p className="text-stone-400">No compatible version found for this Minecraft version and loader.</p>
                <div className="mt-5">
                  <div className="rounded-[1.25rem] border border-white/8 bg-white/[0.03] px-6 py-4 text-center text-stone-400">
                    <p className="text-xl font-semibold">Cancel (B)</p>
                  </div>
                </div>
              </div>
            )}

            {!versionOverlay.isFetching && (
              <p className="mt-4 text-sm text-stone-600">
                {versionOverlay.file ? "A to install · B to cancel" : "B to go back"}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Delete confirm overlay ──────────────────────────────────────── */}
      {deleteOverlay && (
        <ConfirmDialog
          title="Delete?"
          message={`"${deleteOverlay.name}" will be permanently removed.`}
          choice={deleteChoice}
          confirmLabel="Delete"
          warning={deleteOverlay.fromModpack ? (
            <div className="rounded-[1rem] border border-amber-400/30 bg-amber-950/40 px-4 py-3">
              <p className="text-sm font-semibold text-amber-300">Part of modpack</p>
              <p className="mt-1 text-sm text-amber-200/70">
                This mod was installed as part of the modpack. Removing it may break things or cause crashes.
              </p>
            </div>
          ) : undefined}
        />
      )}

      {/* ── Main content ────────────────────────────────────────────────── */}
      {view === "installed" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {/* Header row */}
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-stone-500">
              {items.length > 0
                ? `${items.length} installed`
                : `No ${tabName.toLowerCase()} installed`}
            </p>
            <button
              type="button"
              onClick={onOpenBrowse}
              className="rounded-[0.8rem] border border-white/8 bg-[#121514] px-4 py-2 text-sm font-semibold text-stone-300 transition duration-200 hover:border-lime-300/40 hover:text-white"
            >
              Browse Modrinth <Btn input="X" label="" />
            </button>
          </div>

          {items.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
              <div className="simple-panel flex w-[32rem] flex-col items-center gap-4 rounded-[2rem] px-12 py-10">
                <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-stone-600/40 bg-stone-800/40">
                  <span className="text-xl font-light text-stone-500">+</span>
                </div>
                <div>
                  <h2 className="font-display text-2xl tracking-[-0.04em] text-white">
                    No {tabName} Installed
                  </h2>
                  <p className="mt-2 text-base leading-7 text-stone-500">
                    Browse Modrinth to find and install compatible {tabName.toLowerCase()}.
                  </p>
                </div>
                <p className="text-sm text-stone-600">Press <Btn input="X" label="" /> to browse Modrinth.</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 overflow-y-auto">
              {items.map((item, i) => {
                const isSelected = hasFocus && view === "installed" && i === installedIndex;
                return (
                  <div
                    key={item.id}
                    ref={(el) => { installedRefs.current[i] = el; }}
                    onClick={() => onSelectInstalled(i)}
                    onMouseEnter={() => onSelectInstalled(i)}
                    className={`flex cursor-default items-center gap-4 rounded-[1.25rem] border px-5 py-4 transition duration-200 ${
                      isSelected ? "border-lime-300/60 bg-[#171c1a]" : "border-white/8 bg-[#121514]"
                    }`}
                  >
                    {/* Enable/disable indicator */}
                    <div
                      className={`h-3 w-3 shrink-0 rounded-full ${
                        item.enabled ? "bg-lime-300" : "bg-stone-600"
                      }`}
                    />
                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-white">{item.name}</p>
                      <p className="mt-0.5 text-sm text-stone-500">
                        {item.version && `v${item.version} · `}
                        {item.enabled ? "Enabled" : "Disabled"}
                      </p>
                    </div>
                    {/* Badges */}
                    <div className="flex shrink-0 gap-1.5">
                      {item.fromModpack && (
                        <span className="rounded-[0.6rem] border border-amber-400/30 bg-amber-950/40 px-2.5 py-1 text-xs font-semibold text-amber-300">
                          modpack
                        </span>
                      )}
                      <span className="rounded-[0.6rem] border border-white/8 bg-white/[0.04] px-2.5 py-1 text-xs font-semibold text-stone-500">
                        {item.source}
                      </span>
                    </div>
                    {/* Hint when selected */}
                    {isSelected && (
                      <div className="flex shrink-0 items-center gap-2 text-xs text-stone-600">
                        <Btn input="A" label="toggle" />
                        <Btn input="Y" label="delete" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ── Browse view ──────────────────────────────────────────────── */
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {/* Header row */}
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-stone-500">
              Modrinth · {isSearching ? "Searching…" : `${searchResults.length} results`}
            </p>
            <button
              type="button"
              onClick={onOpenSearch}
              className="rounded-[0.8rem] border border-white/8 bg-[#121514] px-4 py-2 text-sm font-semibold text-stone-300 transition duration-200 hover:border-lime-300/40 hover:text-white"
            >
              Search <Btn input="X" label="" />
            </button>
          </div>

          {isSearching ? (
            <div className="flex flex-1 items-center justify-center">
              <div className="h-12 w-12 animate-spin rounded-full border-[3px] border-lime-300/90 border-t-transparent" />
            </div>
          ) : searchResults.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <p className="text-lg font-semibold text-stone-500">No results</p>
              <p className="text-sm text-stone-600">Press <Btn input="X" label="" /> to search for {tabName.toLowerCase()}.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 overflow-y-auto">
              {searchResults.map((hit, i) => {
                const isSelected = hasFocus && i === browseIndex;
                const alreadyInstalled = installedProjectIds.has(hit.projectId);
                return (
                  <div
                    key={hit.projectId}
                    ref={(el) => { browseRefs.current[i] = el; }}
                    onClick={() => onSelectBrowse(i)}
                    onMouseEnter={() => onSelectBrowse(i)}
                    className={`flex cursor-default items-start gap-4 rounded-[1.25rem] border px-5 py-4 transition duration-200 ${
                      alreadyInstalled ? "opacity-70" : ""
                    } ${
                      isSelected ? "border-lime-300/60 bg-[#171c1a]" : "border-white/8 bg-[#121514]"
                    }`}
                  >
                    {/* Icon */}
                    <div className="relative h-12 w-12 shrink-0">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-stone-800 text-lg font-bold text-stone-400">
                        {hit.title[0]?.toUpperCase() ?? "?"}
                      </div>
                      {hit.iconUrl && (
                        <img
                          src={hit.iconUrl}
                          alt=""
                          className="absolute inset-0 h-12 w-12 rounded-xl object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      )}
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-white">{hit.title}</p>
                      <p className="mt-0.5 line-clamp-1 text-sm text-stone-500">{hit.description}</p>
                    </div>

                    {/* Downloads + installed badge */}
                    <div className="shrink-0 text-right">
                      {installedProjectIds.has(hit.projectId) ? (
                        <span className="inline-block rounded-[0.5rem] border border-lime-300/40 bg-lime-300/10 px-2.5 py-1 text-xs font-semibold text-lime-300">
                          Installed
                        </span>
                      ) : (
                        <>
                          <p className="text-sm font-semibold text-stone-300">
                            {hit.downloads >= 1_000_000
                              ? `${(hit.downloads / 1_000_000).toFixed(1)}M`
                              : hit.downloads >= 1_000
                                ? `${(hit.downloads / 1_000).toFixed(0)}K`
                                : String(hit.downloads)}
                          </p>
                          <p className="mt-0.5 text-xs text-stone-600">downloads</p>
                        </>
                      )}
                    </div>

                    {/* Select hint */}
                    {isSelected && !alreadyInstalled && (
                      <p className="shrink-0 self-center text-xs text-stone-600">A to install</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── files tab UI ─────────────────────────────────────────────────────────────

interface FilesTabViewProps {
  tab: FilesTabState;
  hasFocus: boolean;
  ct: ControllerType;
}

function FilesTabView({ tab, hasFocus, ct }: FilesTabViewProps) {
  const {
    entries, currentPath, selectedIndex, isLoading, deleteOverlay, onSelectEntry,
  } = tab;
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => { itemRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest" }); }, [selectedIndex]);

  const breadcrumb = currentPath ? `.minecraft/${currentPath.replace(/\//g, " / ")}` : ".minecraft";

  const Btn = ({ input, label }: { input: string; label: string }) => {
    const glyph = inputToGlyph(input, ct);
    return (
      <span className="inline-flex items-center gap-1">
        {glyph && <GamepadGlyph controller={ct} button={glyph} size={14} />}
        <span>{label}</span>
      </span>
    );
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-3">
      {/* Delete confirm overlay */}
      {deleteOverlay && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[2rem] bg-black/70 backdrop-blur-sm">
          <div className="simple-panel w-[32rem] rounded-[2rem] px-10 py-9">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-red-400/80">Confirm Delete</p>
            <h2 className="mt-3 font-display text-4xl tracking-[-0.05em] text-white">
              Delete {deleteOverlay.isDir ? "Folder" : "File"}?
            </h2>
            <p className="mt-3 text-lg leading-7 text-stone-400">
              "{deleteOverlay.name}" will be permanently removed.
              {deleteOverlay.isDir && " All contents will be deleted."}
            </p>
            <div className="mt-8 flex gap-4">
              <div className="flex-1 rounded-[1.25rem] border border-lime-300/60 bg-lime-300 px-6 py-4 text-center">
                <p className="text-xl font-semibold text-slate-950">Cancel (B)</p>
              </div>
              <div className="flex-1 rounded-[1.25rem] border border-red-400/50 bg-red-950 px-6 py-4 text-center">
                <p className="text-xl font-semibold text-red-200">Delete (A)</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Breadcrumb header */}
      <div className="flex items-center justify-between">
        <p className="font-mono text-sm font-semibold text-stone-400">{breadcrumb}/</p>
        <div className="flex items-center gap-3 text-xs text-stone-600">
          <Btn input="A" label="open" />
          <Btn input="X" label="rename" />
          <Btn input="Y" label="delete" />
          <Btn input="B" label="up" />
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-lime-300/90 border-t-transparent" />
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-lg font-semibold text-stone-500">Empty folder</p>
          <p className="text-sm text-stone-600">Press B to go up.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 overflow-y-auto">
          {entries.map((entry, i) => {
            const isSelected = hasFocus && i === selectedIndex;
            return (
              <div
                key={entry.name}
                ref={(el) => { itemRefs.current[i] = el; }}
                onClick={() => onSelectEntry(i)}
                onMouseEnter={() => onSelectEntry(i)}
                className={`flex cursor-default items-center gap-4 rounded-[1.25rem] border px-5 py-3.5 transition duration-200 ${
                  isSelected ? "border-lime-300/60 bg-[#171c1a]" : "border-white/8 bg-[#121514]"
                }`}
              >
                {/* Icon: folder or file */}
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.75rem] ${
                    entry.isDir ? "bg-lime-300/10 text-lime-300" : "bg-white/[0.04] text-stone-500"
                  }`}
                >
                  <span className="text-sm font-bold">{entry.isDir ? "/" : "f"}</span>
                </div>

                {/* Name + meta */}
                <div className="min-w-0 flex-1">
                  <p className={`truncate font-semibold ${entry.isDir ? "text-white" : "text-stone-300"}`}>
                    {entry.name}
                  </p>
                  {!entry.isDir && (
                    <p className="mt-0.5 text-xs text-stone-600">{formatBytes(entry.sizeBytes)}</p>
                  )}
                </div>

                {/* Hint when selected */}
                {isSelected && (
                  <div className="flex shrink-0 items-center gap-2 text-xs text-stone-600">
                    {entry.isDir ? (
                      <><Btn input="A" label="enter" /><Btn input="Y" label="delete" /></>
                    ) : (
                      <><Btn input="X" label="rename" /><Btn input="Y" label="delete" /></>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── worlds tab UI ────────────────────────────────────────────────────────────

function WorldsTabView({ tab, hasFocus, ct }: { tab: WorldsTabState; hasFocus: boolean; ct: ControllerType }) {
  const { worlds, selectedIndex, isLoading, onSelectWorld, onLaunchWorld } = tab;
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => { itemRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest" }); }, [selectedIndex]);
  if (isLoading) return <div className="flex flex-1 items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-[3px] border-lime-300/90 border-t-transparent" /></div>;
  if (worlds.length === 0) return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
      <p className="text-lg font-semibold text-stone-500">No worlds found</p>
      <p className="text-sm text-stone-600">Launch the instance once to create a world.</p>
    </div>
  );
  const aGlyph = inputToGlyph("A", ct);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
      <p className="mb-1 inline-flex items-center gap-1 text-xs text-stone-600">
        {aGlyph && <GamepadGlyph controller={ct} button={aGlyph} size={14} />} Quick-play world
      </p>
      {worlds.map((world, i) => {
        const isSelected = hasFocus && i === selectedIndex;
        return (
          <div key={world.folder} ref={(el) => { itemRefs.current[i] = el; }} onClick={() => onSelectWorld(i)} onDoubleClick={() => onLaunchWorld(world.folder)}
            className={`flex cursor-default items-center gap-4 rounded-[1.25rem] border px-5 py-4 transition duration-200 ${isSelected ? "border-lime-300/60 bg-[#171c1a]" : "border-white/8 bg-[#121514]"}`}
          >
            {world.icon ? (
              <img src={`data:image/png;base64,${world.icon}`} alt="" className="h-10 w-10 shrink-0 rounded-[0.75rem] object-cover" />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.75rem] bg-white/[0.04] text-stone-500">
                <span className="text-base font-bold">S</span>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-white">{world.levelName}</p>
              <p className="mt-0.5 text-xs text-stone-500">{world.gameMode}{world.mcVersion ? ` · ${world.mcVersion}` : ""}</p>
            </div>
            {isSelected && aGlyph && (
              <span className="inline-flex shrink-0 items-center gap-1 text-xs text-stone-600">
                <GamepadGlyph controller={ct} button={aGlyph} size={14} /> play
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── servers tab UI ───────────────────────────────────────────────────────────

function ServersTabView({ tab, hasFocus, ct }: { tab: ServersTabState; hasFocus: boolean; ct: ControllerType }) {
  const { servers, selectedIndex, isLoading, onSelectServer, onLaunchServer } = tab;
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => { itemRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest" }); }, [selectedIndex]);
  if (isLoading) return <div className="flex flex-1 items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-[3px] border-lime-300/90 border-t-transparent" /></div>;
  if (servers.length === 0) return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
      <p className="text-lg font-semibold text-stone-500">No servers found</p>
      <p className="text-sm text-stone-600">Add servers in-game and they'll appear here.</p>
    </div>
  );
  const aGlyph = inputToGlyph("A", ct);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
      <p className="mb-1 inline-flex items-center gap-1 text-xs text-stone-600">
        {aGlyph && <GamepadGlyph controller={ct} button={aGlyph} size={14} />} Quick-connect
      </p>
      {servers.map((server, i) => {
        const isSelected = hasFocus && i === selectedIndex;
        return (
          <div key={server.ip} ref={(el) => { itemRefs.current[i] = el; }} onClick={() => onSelectServer(i)} onDoubleClick={() => onLaunchServer(server.ip)}
            className={`flex cursor-default items-center gap-4 rounded-[1.25rem] border px-5 py-4 transition duration-200 ${isSelected ? "border-lime-300/60 bg-[#171c1a]" : "border-white/8 bg-[#121514]"}`}
          >
            {server.icon ? (
              <img src={`data:image/png;base64,${server.icon}`} alt="" className="h-10 w-10 shrink-0 rounded-[0.75rem] object-cover" />
            ) : (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.75rem] bg-white/[0.04] text-stone-500">
                <span className="text-base font-bold">S</span>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-white">{server.name}</p>
              <p className="mt-0.5 font-mono text-xs text-stone-500">{server.ip}</p>
            </div>
            {isSelected && aGlyph && (
              <span className="inline-flex shrink-0 items-center gap-1 text-xs text-stone-600">
                <GamepadGlyph controller={ct} button={aGlyph} size={14} /> connect
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── logs tab UI ──────────────────────────────────────────────────────────────

const LOG_FILTERS: LogFilter[] = ["all", "info", "warn", "error"];

function LogsTabView({ tab }: { tab: LogsTabState }) {
  const { rawLog, filter, crashReport, showCrash, isLoading, onSetFilter, onDismissCrash } = tab;

  const lines = rawLog.split("\n").filter((line) => {
    if (filter === "all") return line.trim().length > 0;
    return line.toLowerCase().includes(`[${filter}]`) || line.toLowerCase().includes(`/${filter}]`);
  });

  const lineColor = (line: string) => {
    const l = line.toLowerCase();
    if (l.includes("[error]") || l.includes("/error]") || l.includes("exception") || l.includes("caused by")) return "text-red-400";
    if (l.includes("[warn]") || l.includes("/warn]")) return "text-yellow-400";
    if (l.includes("[info]") || l.includes("/info]")) return "text-stone-300";
    return "text-stone-500";
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-3">
      {/* Crash report overlay */}
      {showCrash && crashReport && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[2rem] bg-black/80 backdrop-blur-sm">
          <div className="simple-panel flex h-[70%] w-[90%] flex-col rounded-[2rem] px-8 py-7">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-red-400/80">Crash Report</p>
              <button type="button" onClick={onDismissCrash} className="text-xs text-stone-500 hover:text-white">Close (B)</button>
            </div>
            <pre className="mt-4 flex-1 overflow-y-auto font-mono text-xs leading-5 text-stone-400 whitespace-pre-wrap">{crashReport}</pre>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-3">
        {LOG_FILTERS.map((f) => (
          <button key={f} type="button" onClick={() => onSetFilter(f)}
            className={`rounded-[0.75rem] border px-4 py-2 text-sm font-semibold capitalize transition duration-200 ${filter === f ? "border-lime-300/60 bg-lime-300 text-slate-950" : "border-white/8 bg-[#121514] text-stone-400"}`}
          >{f}</button>
        ))}
        {crashReport && (
          <button type="button" onClick={() => tab.onDismissCrash()}
            className="ml-auto rounded-[0.75rem] border border-red-400/40 bg-red-950 px-4 py-2 text-sm font-semibold text-red-300"
          >View Crash (Y)</button>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center"><div className="h-10 w-10 animate-spin rounded-full border-[3px] border-lime-300/90 border-t-transparent" /></div>
      ) : rawLog.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2">
          <p className="text-stone-500">No log file yet. Launch the instance to generate one.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto rounded-[1.25rem] border border-white/8 bg-black/40 px-5 py-4">
          {lines.map((line, i) => (
            <p key={i} className={`font-mono text-xs leading-5 ${lineColor(line)}`}>{line}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── component ────────────────────────────────────────────────────────────────

interface InstancePageProps {
  instance: GameInstance | null;
  activeTab: number;
  availableTabs: Set<number>;
  actionIndex: number;
  overlay: InstanceOverlay;
  colorIndex: number;
  ramIndex: number;
  deleteChoice: number;
  contentTabs: ContentTabState[];
  filesTab: FilesTabState;
  worldsTab: WorldsTabState;
  serversTab: ServersTabState;
  logsTab: LogsTabState;
  controllerType: ControllerType;
  hasFocus: boolean;
  onSelectTab: (i: number) => void;
  onSelectAction: (i: number) => void;
}

export function InstancePage({
  instance,
  activeTab,
  availableTabs,
  actionIndex,
  overlay,
  colorIndex,
  ramIndex,
  deleteChoice,
  contentTabs,
  filesTab,
  worldsTab,
  serversTab,
  logsTab,
  controllerType,
  hasFocus,
  onSelectTab,
  onSelectAction,
}: InstancePageProps) {
  if (!instance) return null;

  const accentColor = instance.color;
  const loaderColor = LOADER_COLORS[instance.loaderType];

  return (
    <section
      className="relative flex min-h-0 flex-1 flex-col gap-4"
      style={{ "--accent": accentColor } as CSSProperties}
    >
      {/* ── Color picker overlay ─────────────────────────────────────────── */}
      {overlay === "color" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[2rem] bg-black/70 backdrop-blur-sm">
          <div className="simple-panel w-[28rem] rounded-[2rem] px-10 py-9">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-stone-500">Edit Instance</p>
            <h2 className="mt-3 font-display text-4xl tracking-[-0.05em] text-white">Change Color</h2>
            <div className="mt-6 grid grid-cols-4 gap-4">
              {INSTANCE_COLORS.map((color, i) => (
                <button
                  key={color}
                  type="button"
                  className={`aspect-square rounded-[1.25rem] border-2 transition duration-200 ${
                    i === colorIndex ? "scale-110 border-lime-300" : "border-transparent"
                  }`}
                  style={{ background: color }}
                />
              ))}
            </div>
            <p className="mt-5 text-sm text-stone-500">D-pad to choose · A to apply · B to cancel</p>
          </div>
        </div>
      )}

      {/* ── RAM picker overlay ───────────────────────────────────────────── */}
      {overlay === "ram" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[2rem] bg-black/70 backdrop-blur-sm">
          <div className="simple-panel w-[24rem] rounded-[2rem] px-10 py-9">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-stone-500">Edit Instance</p>
            <h2 className="mt-3 font-display text-4xl tracking-[-0.05em] text-white">Set RAM</h2>
            <div className="mt-5 flex flex-col gap-2">
              {RAM_OPTIONS.map((mb, i) => (
                <div
                  key={mb}
                  className={`flex items-center justify-between rounded-[1rem] border px-5 py-3 transition duration-200 ${
                    i === ramIndex
                      ? "border-lime-300/60 bg-lime-300"
                      : "border-white/8 bg-[#121514]"
                  }`}
                >
                  <span className={`font-semibold ${i === ramIndex ? "text-slate-950" : "text-white"}`}>
                    {formatRam(mb)}
                  </span>
                  {i === ramIndex && <div className="h-2 w-2 rounded-full bg-slate-950" />}
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-stone-500">Up/Down to choose · A to apply · B to cancel</p>
          </div>
        </div>
      )}

      {/* ── Delete confirm overlay ───────────────────────────────────────── */}
      {overlay === "delete" && (
        <ConfirmDialog
          title="Delete Instance?"
          message={`"${instance.name}" will be permanently removed including all mods, saves, and configuration.`}
          choice={deleteChoice}
          confirmLabel="Delete"
        />
      )}

      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <div className="flex gap-1 overflow-x-auto">
        {TABS.map((tab, i) => {
          if (!availableTabs.has(i)) return null;
          const isActive = i === activeTab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => onSelectTab(i)}
              className={`shrink-0 rounded-[1rem] border px-5 py-2.5 text-sm font-semibold transition duration-200 ${
                isActive && hasFocus
                  ? "border-lime-300/60 bg-lime-300 text-slate-950"
                  : isActive
                    ? "border-white/15 bg-white/8 text-white"
                    : "border-transparent text-stone-500 hover:text-stone-300"
              }`}
            >
              {tab}
              {/* Installed count badge for content tabs */}
              {i >= 1 && i <= 4 && (contentTabs[i - 1]?.items.length ?? 0) > 0 && (
                <span className={`ml-2 rounded-full px-1.5 text-xs font-bold ${isActive && hasFocus ? "bg-slate-950/20 text-slate-950" : "bg-white/10 text-stone-400"}`}>
                  {contentTabs[i - 1]?.items.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab content ──────────────────────────────────────────────────── */}
      {activeTab === 0 ? (
        /* Overview ──────────────────────────────────────────────────────── */
        <div className="grid min-h-0 flex-1 grid-cols-[1fr_26rem] gap-6 overflow-y-auto">
          {/* Left: instance info */}
          <div className="flex flex-col gap-4 overflow-y-auto">
            <div className="relative overflow-hidden rounded-[1.75rem] border border-white/8 p-6">
              <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[var(--accent)] opacity-15 blur-3xl" />
              <div className="relative flex items-center gap-6">
                {instance.iconData ? (
                  <img
                    src={`data:image/png;base64,${instance.iconData}`}
                    alt=""
                    className="h-24 w-24 shrink-0 rounded-[1.75rem] border border-white/10 object-cover shadow-[inset_0_1px_30px_rgba(255,255,255,0.08)]"
                  />
                ) : (
                  <div
                    className="h-24 w-24 shrink-0 rounded-[1.75rem] border border-white/10 shadow-[inset_0_1px_30px_rgba(255,255,255,0.08)]"
                    style={{ background: `linear-gradient(145deg, rgba(255,255,255,0.14), rgba(0,0,0,0.18)), ${accentColor}` }}
                  />
                )}
                <div>
                  <h2 className="font-display text-5xl tracking-[-0.06em] text-white">{instance.name}</h2>
                  <div className="mt-2 flex items-center gap-3">
                    <span
                      className="rounded-[0.6rem] px-3 py-1 text-sm font-semibold"
                      style={{ background: `${loaderColor}22`, color: loaderColor }}
                    >
                      {LOADER_LABELS[instance.loaderType]}
                    </span>
                    <span className="text-stone-400">Minecraft {instance.minecraftVersion}</span>
                    {instance.loaderVersion && (
                      <span className="text-stone-500">· Loader {instance.loaderVersion}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="relative mt-5 grid grid-cols-4 gap-3">
                {[
                  { label: "Mods",        value: formatModCount(instance.modCount) },
                  { label: "Playtime",    value: formatPlaytime(instance.playTimeSecs) },
                  { label: "Last Played", value: formatLastPlayed(instance.lastPlayedAt) },
                  { label: "Java",        value: `Java ${instance.javaVersion}` },
                  { label: "RAM",         value: formatRam(instance.ramMb) },
                  { label: "Loader",      value: LOADER_LABELS[instance.loaderType] },
                  { label: "MC Version",  value: instance.minecraftVersion },
                  { label: "Loader Ver.", value: instance.loaderVersion || "—" },
                ].map((item) => (
                  <div key={item.label} className="rounded-[1rem] border border-white/8 bg-black/20 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-stone-500">{item.label}</p>
                    <p className="mt-1 text-lg font-semibold text-white">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {instance.notes && (
              <div className="rounded-[1.25rem] border border-white/8 bg-[#121514] px-6 py-5">
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-stone-500">Notes</p>
                <p className="mt-2 text-base leading-7 text-stone-300">{instance.notes}</p>
              </div>
            )}
            {instance.jvmArgs && (
              <div className="rounded-[1.25rem] border border-white/8 bg-[#121514] px-6 py-5">
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-stone-500">JVM Arguments</p>
                <p className="mt-2 font-mono text-sm text-stone-400">{instance.jvmArgs}</p>
              </div>
            )}
          </div>

          {/* Right: actions */}
          <div className="flex flex-col gap-2 overflow-y-auto">
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.35em] text-stone-500">Actions</p>
            {OVERVIEW_ACTIONS.map((action, i) => {
              const isActive = hasFocus && i === actionIndex;
              return (
                <div
                  key={action.id}
                  onClick={() => onSelectAction(i)}
                  onMouseEnter={() => onSelectAction(i)}
                  className={`flex cursor-default items-center justify-between rounded-[1.25rem] border px-6 py-5 transition duration-200 ${
                    isActive
                      ? action.danger
                        ? "border-red-400/50 bg-red-950/60"
                        : "border-lime-300/60 bg-lime-300"
                      : "border-white/8 bg-[#121514]"
                  }`}
                >
                  <div>
                    <p className={`text-xl font-semibold ${isActive ? (action.danger ? "text-red-200" : "text-slate-950") : "text-white"}`}>
                      {action.label}
                    </p>
                    <p className={`mt-0.5 text-sm ${isActive ? (action.danger ? "text-red-300/70" : "text-slate-900/65") : "text-stone-500"}`}>
                      {action.description}
                    </p>
                  </div>
                  {isActive && (
                    <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${action.danger ? "bg-red-400" : "bg-slate-950"}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : activeTab >= 1 && activeTab <= 4 ? (
        /* Content tabs: Mods, Resource Packs, Data Packs, Shaders ──────── */
        <ContentTabView
          tab={contentTabs[activeTab - 1]!}
          tabName={TABS[activeTab]!}
          hasFocus={hasFocus}
          ct={controllerType}
        />
      ) : activeTab === 5 ? (
        /* Files tab ─────────────────────────────────────────────────────── */
        <FilesTabView tab={filesTab} hasFocus={hasFocus} ct={controllerType} />
      ) : activeTab === 6 ? (
        /* Worlds tab ────────────────────────────────────────────────────── */
        <WorldsTabView tab={worldsTab} hasFocus={hasFocus} ct={controllerType} />
      ) : activeTab === 7 ? (
        /* Servers tab ───────────────────────────────────────────────────── */
        <ServersTabView tab={serversTab} hasFocus={hasFocus} ct={controllerType} />
      ) : activeTab === 8 ? (
        /* Logs tab ──────────────────────────────────────────────────────── */
        <LogsTabView tab={logsTab} />
      ) : null}
    </section>
  );
}
