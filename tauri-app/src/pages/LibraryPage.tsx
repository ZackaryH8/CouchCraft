import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type MutableRefObject,
} from "react";
import type { GameInstance, NavFrame } from "../types";
import { INSTANCE_COLORS, LOADER_LABELS } from "../constants";
import { formatLastPlayed, formatModCount, formatPlaytime } from "../utils/format";
import type { GamepadInput } from "../hooks/useGamepad";

// ─── constants ────────────────────────────────────────────────────────────────

const LIBRARY_ACTIONS = [
  {
    id: "open" as const,
    label: "Open",
    description: "Manage mods, settings, worlds, and logs for this instance",
  },
  {
    id: "launch" as const,
    label: "Launch",
    description: "Start this instance with your Microsoft account",
  },
  {
    id: "rename" as const,
    label: "Rename",
    description: "Change the name of this instance",
  },
  {
    id: "edit-color" as const,
    label: "Edit Color",
    description: "Change the accent color for this instance",
  },
  {
    id: "delete" as const,
    label: "Delete Instance",
    description: "Permanently remove this instance from the launcher",
  },
];

type LibFocus = "list" | "actions";
type LibOverlay = "none" | "delete-confirm" | "color-picker";

// ─── hook ────────────────────────────────────────────────────────────────────

interface UseLibraryPageOptions {
  instances: GameInstance[];
  launchInstance: (instance: GameInstance) => Promise<void>;
  updateInstance: (instance: GameInstance) => Promise<void>;
  removeInstance: (id: string) => Promise<void>;
  toSidebar: () => void;
  push: (frame: NavFrame) => void;
  openOSK: (initial: string, onConfirm: (value: string) => void, onCancel?: () => void) => void;
}

export function useLibraryPage({
  instances,
  launchInstance,
  updateInstance,
  removeInstance,
  toSidebar,
  push,
  openOSK,
}: UseLibraryPageOptions) {
  const listRefs = useRef<Array<HTMLElement | null>>([]);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [libFocus, setLibFocus] = useState<LibFocus>("list");
  const [actionIndex, setActionIndex] = useState(0);
  const [overlay, setOverlay] = useState<LibOverlay>("none");
  const [colorIndex, setColorIndex] = useState(0);
  const [deleteChoice, setDeleteChoice] = useState(0); // 0 = Cancel, 1 = Delete

  // Clamp when list shrinks after a delete
  useEffect(() => {
    setSelectedIndex((i) => Math.min(i, instances.length));
  }, [instances.length]);

  useEffect(() => {
    listRefs.current[selectedIndex]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [selectedIndex]);

  const selectedInstance: GameInstance | undefined = instances[selectedIndex];

  const handleInput = useCallback(
    (input: GamepadInput) => {
      // ── overlay: delete confirm ──────────────────────────────────────────
      if (overlay === "delete-confirm") {
        switch (input) {
          case "LEFT":
            setDeleteChoice(0);
            break;
          case "RIGHT":
            setDeleteChoice(1);
            break;
          case "A":
            if (deleteChoice === 1 && selectedInstance) {
              void removeInstance(selectedInstance.id).then(() => {
                setOverlay("none");
                setLibFocus("list");
              });
            } else {
              setOverlay("none");
            }
            break;
          case "B":
            setOverlay("none");
            break;
        }
        return;
      }

      // ── overlay: color picker ────────────────────────────────────────────
      if (overlay === "color-picker") {
        const cols = 4;
        const count = INSTANCE_COLORS.length;
        switch (input) {
          case "UP":
            setColorIndex((i) => Math.max(i - cols, 0));
            break;
          case "DOWN":
            setColorIndex((i) => Math.min(i + cols, count - 1));
            break;
          case "LEFT":
            setColorIndex((i) => (i % cols === 0 ? i : i - 1));
            break;
          case "RIGHT":
            setColorIndex((i) => Math.min(i + 1, count - 1));
            break;
          case "A":
            if (selectedInstance) {
              void updateInstance({ ...selectedInstance, color: INSTANCE_COLORS[colorIndex] });
            }
            setOverlay("none");
            break;
          case "B":
            setOverlay("none");
            break;
        }
        return;
      }

      // ── list focus ───────────────────────────────────────────────────────
      if (libFocus === "list") {
        switch (input) {
          case "UP":
            setSelectedIndex((i) => Math.max(i - 1, 0));
            break;
          case "DOWN":
            setSelectedIndex((i) => Math.min(i + 1, instances.length));
            break;
          case "LEFT":
            toSidebar();
            break;
          case "RIGHT":
            if (selectedIndex < instances.length) setLibFocus("actions");
            break;
          case "A":
            if (selectedIndex === instances.length) {
              push({ id: "create" });
            } else if (selectedInstance) {
              void launchInstance(selectedInstance);
            }
            break;
          case "B":
            toSidebar();
            break;
        }
        return;
      }

      // ── actions focus ────────────────────────────────────────────────────
      switch (input) {
        case "UP":
          setActionIndex((i) => Math.max(i - 1, 0));
          break;
        case "DOWN":
          setActionIndex((i) => Math.min(i + 1, LIBRARY_ACTIONS.length - 1));
          break;
        case "LEFT":
        case "B":
          setLibFocus("list");
          break;
        case "A": {
          const action = LIBRARY_ACTIONS[actionIndex];
          if (action.id === "open" && selectedInstance) {
            push({ id: "instance", instanceId: selectedInstance.id });
          } else if (action.id === "launch" && selectedInstance) {
            void launchInstance(selectedInstance);
          } else if (action.id === "rename" && selectedInstance) {
            openOSK(selectedInstance.name, (name) => {
              const trimmed = name.trim();
              if (trimmed) void updateInstance({ ...selectedInstance, name: trimmed });
            });
          } else if (action.id === "edit-color" && selectedInstance) {
            const idx = Array.from(INSTANCE_COLORS).indexOf(
              selectedInstance.color as (typeof INSTANCE_COLORS)[number],
            );
            setColorIndex(idx >= 0 ? idx : 0);
            setOverlay("color-picker");
          } else if (action.id === "delete") {
            setDeleteChoice(0);
            setOverlay("delete-confirm");
          }
          break;
        }
      }
    },
    [
      overlay,
      libFocus,
      selectedIndex,
      actionIndex,
      colorIndex,
      deleteChoice,
      instances,
      selectedInstance,
      launchInstance,
      updateInstance,
      removeInstance,
      toSidebar,
      push,
      openOSK,
    ],
  );

  return {
    selectedIndex,
    libFocus,
    actionIndex,
    overlay,
    colorIndex,
    deleteChoice,
    selectedInstance,
    listRefs,
    handleInput,
    onSelectInstance: setSelectedIndex,
    onSetLibFocus: setLibFocus,
  };
}

// ─── component ────────────────────────────────────────────────────────────────

interface LibraryPageProps {
  instances: GameInstance[];
  selectedIndex: number;
  libFocus: LibFocus;
  actionIndex: number;
  overlay: LibOverlay;
  colorIndex: number;
  deleteChoice: number;
  selectedInstance: GameInstance | undefined;
  listRefs: MutableRefObject<Array<HTMLElement | null>>;
  hasFocus: boolean;
  onSelectInstance: (index: number) => void;
  onSetLibFocus: (focus: LibFocus) => void;
  onCreateNew: () => void;
}

export function LibraryPage({
  instances,
  selectedIndex,
  libFocus,
  actionIndex,
  overlay,
  colorIndex,
  deleteChoice,
  selectedInstance,
  listRefs,
  hasFocus,
  onSelectInstance,
  onSetLibFocus,
  onCreateNew,
}: LibraryPageProps) {
  return (
    <section className="relative grid min-h-0 flex-1 grid-cols-[18rem_1fr] gap-6">
      {/* Delete confirm overlay */}
      {overlay === "delete-confirm" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[2rem] bg-black/70 backdrop-blur-sm">
          <div className="simple-panel w-[34rem] rounded-[2rem] px-10 py-9">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-red-400/80">
              Confirm Delete
            </p>
            <h2 className="mt-3 font-display text-4xl tracking-[-0.05em] text-white">
              Delete Instance?
            </h2>
            <p className="mt-3 text-lg leading-7 text-stone-400">
              "{selectedInstance?.name}" will be permanently removed from your launcher.
            </p>
            <div className="mt-8 flex gap-4">
              {["Cancel", "Delete"].map((label, i) => (
                <div
                  key={label}
                  className={`flex-1 rounded-[1.25rem] border px-6 py-4 text-center transition duration-200 ${
                    i === deleteChoice
                      ? i === 1
                        ? "border-red-400/60 bg-red-950 text-red-200"
                        : "border-lime-300/60 bg-lime-300 text-slate-950"
                      : "border-white/8 bg-white/[0.03] text-stone-400"
                  }`}
                >
                  <p className="text-xl font-semibold">{label}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-stone-500">
              Use left/right to choose, A to confirm, B to cancel.
            </p>
          </div>
        </div>
      )}

      {/* Color picker overlay */}
      {overlay === "color-picker" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[2rem] bg-black/70 backdrop-blur-sm">
          <div className="simple-panel w-[28rem] rounded-[2rem] px-10 py-9">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-stone-500">
              Edit Instance
            </p>
            <h2 className="mt-3 font-display text-4xl tracking-[-0.05em] text-white">
              Change Color
            </h2>
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
            <p className="mt-5 text-sm text-stone-500">
              D-pad to choose, A to apply, B to cancel.
            </p>
          </div>
        </div>
      )}

      {/* Instance list (left column) */}
      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.35em] text-stone-500">
          All Instances
        </p>

        {instances.map((instance, i) => {
          const isSelected = hasFocus && i === selectedIndex;
          return (
            <div
              key={instance.id}
              ref={(node) => {
                listRefs.current[i] = node;
              }}
              onClick={() => {
                onSelectInstance(i);
                onSetLibFocus("list");
              }}
              onMouseEnter={() => onSelectInstance(i)}
              className={`flex cursor-default items-center gap-4 rounded-[1.25rem] border px-5 py-4 transition duration-200 ${
                isSelected ? "border-lime-300/60 bg-[#171c1a]" : "border-white/8 bg-[#121514]"
              }`}
            >
              <div
                className="h-8 w-8 shrink-0 rounded-full border border-white/10"
                style={{ background: instance.color }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-semibold text-white">{instance.name}</p>
                <p className="text-sm text-stone-500">
                  {LOADER_LABELS[instance.loaderType]} · {instance.minecraftVersion}
                </p>
              </div>
              {isSelected && <div className="h-2 w-2 shrink-0 rounded-full bg-lime-300" />}
            </div>
          );
        })}

        {/* New instance row */}
        {(() => {
          const createIdx = instances.length;
          const isSelected = hasFocus && selectedIndex === createIdx;
          return (
            <div
              ref={(node) => {
                listRefs.current[createIdx] = node;
              }}
              onClick={onCreateNew}
              onMouseEnter={() => onSelectInstance(createIdx)}
              className={`flex cursor-default items-center gap-4 rounded-[1.25rem] border px-5 py-4 transition duration-200 ${
                isSelected
                  ? "border-lime-300/60 bg-[#171c1a]"
                  : "border-dashed border-white/10 bg-transparent"
              }`}
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition duration-200 ${
                  isSelected ? "border-lime-300/40 bg-lime-300/10" : "border-white/15"
                }`}
              >
                <span
                  className={`text-xl font-light ${isSelected ? "text-lime-300" : "text-white/30"}`}
                >
                  +
                </span>
              </div>
              <p
                className={`text-lg font-semibold transition duration-200 ${
                  isSelected ? "text-white" : "text-white/40"
                }`}
              >
                New Instance
              </p>
            </div>
          );
        })()}
      </div>

      {/* Detail + actions (right column) */}
      {selectedInstance ? (
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
          {/* Instance card */}
          <div
            className="relative overflow-hidden rounded-[1.75rem] border border-white/8 p-6"
            style={{ "--accent": selectedInstance.color } as CSSProperties}
          >
            <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-[var(--accent)] opacity-20 blur-3xl" />
            <div className="relative flex items-center gap-5">
              <div
                className="h-20 w-20 shrink-0 rounded-[1.5rem] border border-white/10 shadow-[inset_0_1px_30px_rgba(255,255,255,0.08)]"
                style={{
                  background: `linear-gradient(145deg, rgba(255,255,255,0.14), rgba(0,0,0,0.18)), ${selectedInstance.color}`,
                }}
              />
              <div>
                <h2 className="font-display text-4xl tracking-[-0.05em] text-white">
                  {selectedInstance.name}
                </h2>
                <p className="mt-1 text-stone-400">
                  {LOADER_LABELS[selectedInstance.loaderType]} · Minecraft {selectedInstance.minecraftVersion}
                </p>
              </div>
            </div>

            <div className="relative mt-5 grid grid-cols-4 gap-3">
              {[
                { label: "Mods", value: formatModCount(selectedInstance.modCount) },
                { label: "Playtime", value: formatPlaytime(selectedInstance.playTimeSecs) },
                { label: "Last Played", value: formatLastPlayed(selectedInstance.lastPlayedAt) },
                { label: "Java", value: `Java ${selectedInstance.javaVersion}` },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-[1rem] border border-white/8 bg-black/20 px-4 py-3"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-stone-500">
                    {item.label}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-white">{item.value}</p>
                </div>
              ))}
            </div>

            {selectedInstance.notes && (
              <p className="relative mt-4 text-base leading-7 text-stone-400">
                {selectedInstance.notes}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="space-y-2">
            {LIBRARY_ACTIONS.map((action, i) => {
              const isActive = hasFocus && libFocus === "actions" && i === actionIndex;
              const isDanger = action.id === "delete";
              return (
                <div
                  key={action.id}
                  onClick={() => onSetLibFocus("actions")}
                  onMouseEnter={() => onSetLibFocus("actions")}
                  className={`flex cursor-default items-center justify-between rounded-[1.25rem] border px-6 py-5 transition duration-200 ${
                    isActive
                      ? isDanger
                        ? "border-red-400/50 bg-red-950/60"
                        : "border-lime-300/60 bg-lime-300"
                      : "border-white/8 bg-[#121514]"
                  }`}
                >
                  <div>
                    <p
                      className={`text-xl font-semibold ${
                        isActive
                          ? isDanger
                            ? "text-red-200"
                            : "text-slate-950"
                          : "text-white"
                      }`}
                    >
                      {action.label}
                    </p>
                    <p
                      className={`mt-1 text-sm ${
                        isActive
                          ? isDanger
                            ? "text-red-300/70"
                            : "text-slate-900/65"
                          : "text-stone-500"
                      }`}
                    >
                      {action.description}
                    </p>
                  </div>
                  {isActive && (
                    <div
                      className={`h-2.5 w-2.5 rounded-full ${isDanger ? "bg-red-400" : "bg-slate-950"}`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* "+" row selected — show create prompt */
        <div className="simple-panel flex flex-col items-center justify-center rounded-[1.75rem] px-10 py-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-lime-300/40 bg-lime-300/10">
            <span className="text-4xl font-light text-lime-300">+</span>
          </div>
          <h2 className="mt-5 font-display text-3xl tracking-[-0.05em] text-white">
            Create Instance
          </h2>
          <p className="mt-3 text-lg leading-7 text-stone-400">
            Set up a new Minecraft instance with your choice of loader and version.
          </p>
          <p className="mt-4 text-sm text-stone-500">Press A to continue.</p>
        </div>
      )}
    </section>
  );
}
