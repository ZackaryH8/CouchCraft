import {
    useState,
    useCallback,
    useMemo,
    useRef,
    useEffect,
    type CSSProperties,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
    CreateStep,
    GameInstance,
    LoaderType,
    McVersionInfo,
    LoaderVersionInfo,
    ModrinthHit,
    ModpackVersionInfo,
    MrpackInstallResult,
    PrepareProgress,
    ImportFile,
} from "../types";
import { LOADERS, INSTANCE_COLORS, LOADER_COLORS } from "../constants";
import { requiredJavaVersion } from "../utils/format";
import { insertContent } from "../services/db";
import type { ContentItem } from "../types";
import type { GamepadInput } from "../hooks/useGamepad";

// ─── step ordering ────────────────────────────────────────────────────────────

const CUSTOM_STEPS: CreateStep[] = [
    "loader",
    "version",
    "loader_version",
    "color",
    "confirm",
];

const STEP_LABELS: Record<CreateStep, string> = {
    source: "Create Instance",
    loader: "Mod Loader",
    version: "Minecraft Version",
    loader_version: "Loader Version",
    color: "Instance Color",
    confirm: "Confirm",
    modpack_search: "Browse Modpacks",
    modpack_version: "Choose Version",
    imports: "Import Pack",
};

const STEP_HINTS: Record<CreateStep, string> = {
    source: "Up/Down to choose. A to confirm. B to cancel.",
    loader: "D-pad to choose a loader. A to confirm. B to go back.",
    version:
        "D-pad to pick a version. A to confirm. X to toggle snapshots. B to go back.",
    loader_version:
        "D-pad to pick a loader version. A to confirm. X to toggle stable-only. B to go back.",
    color: "D-pad to choose a color. A to confirm. B to go back.",
    confirm: "A to create the instance. B to go back.",
    modpack_search:
        "D-pad to browse. A to select. X to search by name. B to go back.",
    modpack_version:
        "Press A to install the latest version, or D-pad down to choose an older one. B to go back.",
    imports: "D-pad to browse. A to install. B to go back.",
};

function getCreateCols(step: CreateStep): number {
    if (step === "version" || step === "color" || step === "loader_version")
        return 4;
    if (step === "loader" || step === "modpack_search") return 2;
    return 1;
}

function nextCustomStep(step: CreateStep, loader: string): CreateStep {
    const idx = CUSTOM_STEPS.indexOf(step);
    const next = CUSTOM_STEPS[idx + 1] ?? "confirm";
    if (next === "loader_version" && loader === "vanilla")
        return CUSTOM_STEPS[idx + 2] ?? "confirm";
    return next;
}

function prevCustomStep(step: CreateStep, loader: string): CreateStep | null {
    const idx = CUSTOM_STEPS.indexOf(step);
    if (idx <= 0) return null;
    const prev = CUSTOM_STEPS[idx - 1];
    if (prev === "loader_version" && loader === "vanilla")
        return CUSTOM_STEPS[idx - 2] ?? null;
    return prev ?? null;
}

// ─── hook ────────────────────────────────────────────────────────────────────

interface UseCreatePageOptions {
    pop: () => void;
    onCreated: (instance: GameInstance) => Promise<void>;
    openOSK: (
        label: string,
        initial: string,
        onConfirm: (value: string) => void,
        onCancel?: () => void,
    ) => void;
    mcVersions: McVersionInfo[];
    fetchLoaderVersions: (
        loader: LoaderType,
        mcVersion: string,
    ) => Promise<LoaderVersionInfo[]>;
    defaultRamMb: number;
}

export function useCreatePage({
    pop,
    onCreated,
    openOSK,
    mcVersions,
    fetchLoaderVersions,
    defaultRamMb,
}: UseCreatePageOptions) {
    const [createStep, setCreateStep] = useState<CreateStep>("source");
    const [createItemIndex, setCreateItemIndex] = useState(0);

    // Custom flow state
    const [draftLoader, setDraftLoader] = useState("");
    const [draftVersion, setDraftVersion] = useState("");
    const [draftLoaderVersion, setDraftLoaderVersion] = useState("");
    const [draftColor, setDraftColor] = useState<string>(INSTANCE_COLORS[0]);
    const [draftName, setDraftName] = useState("");
    const [showSnapshots, setShowSnapshots] = useState(false);
    const [loaderVersions, setLoaderVersions] = useState<LoaderVersionInfo[]>(
        [],
    );
    const [isLoadingLoaderVersions, setIsLoadingLoaderVersions] =
        useState(false);
    const [showOnlyStable, setShowOnlyStable] = useState(true);

    // Imports flow state
    const [importFiles, setImportFiles] = useState<ImportFile[]>([]);
    const [importLoading, setImportLoading] = useState(false);

    // Modpack flow state
    const [modpackQuery, setModpackQuery] = useState("");
    const [modpackResults, setModpackResults] = useState<ModrinthHit[]>([]);
    const [modpackLoading, setModpackLoading] = useState(false);
    const [selectedModpack, setSelectedModpack] = useState<ModrinthHit | null>(
        null,
    );
    const [modpackVersions, setModpackVersions] = useState<
        ModpackVersionInfo[]
    >([]);
    const [modpackVersionsLoading, setModpackVersionsLoading] = useState(false);
    const [isInstalling, setIsInstalling] = useState(false);
    const [installProgress, setInstallProgress] =
        useState<PrepareProgress | null>(null);
    const [installError, setInstallError] = useState<string | null>(null);

    // Load featured packs on first visit to modpack_search
    const loadModpacks = useCallback((query: string) => {
        setModpackLoading(true);
        void invoke<ModrinthHit[]>("search_modrinth", {
            query,
            projectType: "modpack",
            mcVersion: "",
            loader: "",
            offset: 0,
        })
            .then((results) => {
                setModpackResults(results);
                setModpackLoading(false);
            })
            .catch(() => {
                setModpackResults([]);
                setModpackLoading(false);
            });
    }, []);

    // Derived lists
    const filteredMcVersions = useMemo(() => {
        const allowed = showSnapshots ? ["release", "snapshot"] : ["release"];
        return mcVersions
            .filter((v) => allowed.includes(v.versionType))
            .map((v) => v.id);
    }, [mcVersions, showSnapshots]);

    const filteredLoaderVersions = useMemo(
        () =>
            (showOnlyStable
                ? loaderVersions.filter((v) => v.stable)
                : loaderVersions
            ).map((v) => v.version),
        [loaderVersions, showOnlyStable],
    );

    const effectiveSteps = useMemo<CreateStep[]>(() => {
        if (createStep === "source") return ["source"];
        if (createStep === "imports") return ["source", "imports"];
        if (["modpack_search", "modpack_version"].includes(createStep))
            return ["source", "modpack_search", "modpack_version"];
        const custom =
            draftLoader === "vanilla"
                ? ["source", "loader", "version", "color", "confirm"]
                : [
                      "source",
                      "loader",
                      "version",
                      "loader_version",
                      "color",
                      "confirm",
                  ];
        return custom as CreateStep[];
    }, [createStep, draftLoader]);

    const resetDraft = useCallback(() => {
        setCreateStep("source");
        setCreateItemIndex(0);
        setDraftLoader("");
        setDraftVersion("");
        setDraftLoaderVersion("");
        setDraftColor(INSTANCE_COLORS[0]);
        setDraftName("");
        setShowSnapshots(false);
        setLoaderVersions([]);
        setShowOnlyStable(true);
        setImportFiles([]);
        setImportLoading(false);
        setModpackQuery("");
        setModpackResults([]);
        setModpackLoading(false);
        setSelectedModpack(null);
        setModpackVersions([]);
        setModpackVersionsLoading(false);
        setIsInstalling(false);
        setInstallProgress(null);
        setInstallError(null);
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
            // Shared post-install handler for both modpack and local import paths.
            const finishMrpackInstall = async (
                result: MrpackInstallResult,
                instanceId: string,
                now: number,
            ) => {
                const loaderType =
                    (result.loaderType as LoaderType) in LOADER_COLORS
                        ? (result.loaderType as LoaderType)
                        : "fabric";
                await Promise.all(
                    result.installedMods.map((mod) => {
                        const name = mod.filename
                            .replace(/\.jar$/i, "")
                            .replace(/[-_]/g, " ");
                        const item: ContentItem = {
                            id: crypto.randomUUID(),
                            instanceId,
                            category: "mod",
                            name,
                            filename: mod.filename,
                            version: "",
                            source: "modrinth",
                            modrinthProjectId: mod.modrinthProjectId,
                            modrinthVersionId: mod.modrinthVersionId,
                            enabled: true,
                            installedAt: now,
                            updateCheckedAt: null,
                            updateAvailable: false,
                            fromModpack: true,
                        };
                        return insertContent(item);
                    }),
                );
                const newInstance: GameInstance = {
                    id: instanceId,
                    name: result.name,
                    loaderType,
                    loaderVersion: result.loaderVersion,
                    minecraftVersion: result.mcVersion,
                    color: LOADER_COLORS[loaderType],
                    iconData: result.iconData,
                    javaVersion: requiredJavaVersion(result.mcVersion),
                    ramMb: defaultRamMb,
                    jvmArgs: "",
                    notes: "",
                    lastPlayedAt: null,
                    playTimeSecs: 0,
                    modCount: result.installedMods.length,
                    sortOrder: 0,
                    createdAt: now,
                };
                return onCreated(newInstance);
            };

            if (createStep === "source") {
                if (i === 0) {
                    setCreateStep("loader");
                    setCreateItemIndex(0);
                } else if (i === 1) {
                    // Modpack
                    setCreateStep("modpack_search");
                    setCreateItemIndex(0);
                    loadModpacks("");
                } else {
                    // Import
                    setCreateStep("imports");
                    setCreateItemIndex(0);
                    setImportLoading(true);
                    void invoke<ImportFile[]>("list_import_files")
                        .then((files) => {
                            setImportFiles(files);
                            setImportLoading(false);
                        })
                        .catch(() => {
                            setImportFiles([]);
                            setImportLoading(false);
                        });
                }
            } else if (createStep === "loader") {
                const loader = LOADERS[i];
                setDraftLoader(loader.id);
                setDraftColor(LOADER_COLORS[loader.id] ?? INSTANCE_COLORS[0]);
                setCreateStep("version");
                setCreateItemIndex(0);
            } else if (createStep === "version") {
                const ver = filteredMcVersions[i];
                setDraftVersion(ver);
                const next = nextCustomStep("version", draftLoader);
                setCreateStep(next);
                setCreateItemIndex(0);
                if (next === "loader_version")
                    startLoaderVersionFetch(draftLoader, ver);
            } else if (createStep === "loader_version") {
                setDraftLoaderVersion(filteredLoaderVersions[i] ?? "");
                setCreateStep(nextCustomStep("loader_version", draftLoader));
                setCreateItemIndex(0);
            } else if (createStep === "color") {
                const selectedColor = INSTANCE_COLORS[i];
                setDraftColor(selectedColor);
                const loaderOpt = LOADERS.find((l) => l.id === draftLoader);
                const autoName = `${loaderOpt?.label ?? "Custom"} ${draftVersion}`;
                openOSK(
                    "Instance Name",
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
            } else if (createStep === "confirm") {
                const loaderType = draftLoader as LoaderType;
                const now = Math.floor(Date.now() / 1000);
                const newInstance: GameInstance = {
                    id: crypto.randomUUID(),
                    name: draftName,
                    loaderType,
                    loaderVersion: draftLoaderVersion,
                    minecraftVersion: draftVersion,
                    color: draftColor,
                    iconData: null,
                    javaVersion: requiredJavaVersion(draftVersion),
                    ramMb: defaultRamMb,
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
            } else if (createStep === "modpack_search") {
                const pack = modpackResults[i];
                if (!pack) return;
                setSelectedModpack(pack);
                setModpackVersions([]);
                setModpackVersionsLoading(true);
                setCreateStep("modpack_version");
                setCreateItemIndex(0);
                void invoke<ModpackVersionInfo[]>("list_modpack_versions", {
                    projectId: pack.projectId,
                })
                    .then((versions) => {
                        setModpackVersions(versions);
                        setModpackVersionsLoading(false);
                    })
                    .catch(() => {
                        setModpackVersions([]);
                        setModpackVersionsLoading(false);
                    });
            } else if (createStep === "imports") {
                const importFile = importFiles[i];
                if (!importFile) return;
                const instanceId = crypto.randomUUID();
                setIsInstalling(true);
                setInstallProgress(null);
                setInstallError(null);
                const unlisten = listen<PrepareProgress>(
                    "prepare-progress",
                    (event) => {
                        setInstallProgress(event.payload);
                    },
                );
                void invoke<string>("create_instance_dirs", { instanceId })
                    .then(() =>
                        invoke<MrpackInstallResult>(
                            "install_mrpack_from_file",
                            {
                                instanceId,
                                filePath: importFile.path,
                            },
                        ),
                    )
                    .then(async (result) => {
                        await finishMrpackInstall(
                            result,
                            instanceId,
                            Math.floor(Date.now() / 1000),
                        );
                    })
                    .then(() => {
                        void unlisten.then((u) => u());
                        setIsInstalling(false);
                        pop();
                        resetDraft();
                    })
                    .catch((err: unknown) => {
                        void unlisten.then((u) => u());
                        setIsInstalling(false);
                        setInstallError(String(err));
                    });
            } else if (createStep === "modpack_version") {
                const version = modpackVersions[i];
                if (!version || !selectedModpack) return;
                const instanceId = crypto.randomUUID();
                setIsInstalling(true);
                setInstallProgress(null);
                setInstallError(null);
                const unlisten = listen<PrepareProgress>(
                    "prepare-progress",
                    (event) => {
                        setInstallProgress(event.payload);
                    },
                );
                void invoke<string>("create_instance_dirs", { instanceId })
                    .then(() =>
                        invoke<MrpackInstallResult>("install_mrpack", {
                            instanceId,
                            versionId: version.versionId,
                            iconUrl: selectedModpack.iconUrl,
                        }),
                    )
                    .then(async (result) => {
                        await finishMrpackInstall(
                            result,
                            instanceId,
                            Math.floor(Date.now() / 1000),
                        );
                    })
                    .then(() => {
                        void unlisten.then((u) => u());
                        setIsInstalling(false);
                        pop();
                        resetDraft();
                    })
                    .catch((err: unknown) => {
                        void unlisten.then((u) => u());
                        setIsInstalling(false);
                        setInstallError(String(err));
                    });
            }
        },
        [
            createStep,
            draftLoader,
            draftVersion,
            draftLoaderVersion,
            draftColor,
            draftName,
            filteredMcVersions,
            filteredLoaderVersions,
            modpackResults,
            modpackVersions,
            importFiles,
            selectedModpack,
            onCreated,
            pop,
            resetDraft,
            openOSK,
            startLoaderVersionFetch,
            loadModpacks,
        ],
    );

    const handleInput = useCallback(
        (input: GamepadInput) => {
            if (isInstalling) return;

            if (installError && input === "B") {
                setInstallError(null);
                return;
            }

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
                if (createStep === "modpack_search") {
                    openOSK("Search", modpackQuery, (query) => {
                        setModpackQuery(query);
                        loadModpacks(query);
                    });
                    return;
                }
            }

            const cols = getCreateCols(createStep);
            const count =
                createStep === "source"
                    ? 3
                    : createStep === "loader"
                      ? LOADERS.length
                      : createStep === "version"
                        ? Math.max(filteredMcVersions.length, 1)
                        : createStep === "loader_version"
                          ? Math.max(filteredLoaderVersions.length, 1)
                          : createStep === "color"
                            ? INSTANCE_COLORS.length
                            : createStep === "modpack_search"
                              ? Math.max(modpackResults.length, 1)
                              : createStep === "modpack_version"
                                ? Math.max(modpackVersions.length, 1)
                                : createStep === "imports"
                                  ? Math.max(importFiles.length, 1)
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
                    if (createStep === "source") {
                        pop();
                        resetDraft();
                    } else if (createStep === "imports") {
                        setCreateStep("source");
                        setCreateItemIndex(2);
                    } else if (createStep === "modpack_search") {
                        setCreateStep("source");
                        setCreateItemIndex(1);
                    } else if (createStep === "modpack_version") {
                        setCreateStep("modpack_search");
                        setCreateItemIndex(0);
                    } else {
                        const prev = prevCustomStep(createStep, draftLoader);
                        if (prev === null) {
                            setCreateStep("source");
                            setCreateItemIndex(0);
                        } else {
                            setCreateStep(prev);
                            setCreateItemIndex(0);
                        }
                    }
                    break;
                }
            }
        },
        [
            createStep,
            createItemIndex,
            draftLoader,
            isInstalling,
            installError,
            modpackQuery,
            filteredMcVersions.length,
            filteredLoaderVersions.length,
            modpackResults.length,
            modpackVersions.length,
            importFiles.length,
            selectItem,
            pop,
            resetDraft,
            openOSK,
            loadModpacks,
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
        modpackQuery,
        modpackResults,
        modpackLoading,
        selectedModpack,
        modpackVersions,
        modpackVersionsLoading,
        importFiles,
        importLoading,
        isInstalling,
        installProgress,
        installError,
        handleInput,
        onMoveFocus: setCreateItemIndex,
        onSelect: selectItem,
        onDismissError: () => setInstallError(null),
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
    modpackQuery: string;
    modpackResults: ModrinthHit[];
    modpackLoading: boolean;
    selectedModpack: ModrinthHit | null;
    modpackVersions: ModpackVersionInfo[];
    modpackVersionsLoading: boolean;
    importFiles: ImportFile[];
    importLoading: boolean;
    isInstalling: boolean;
    installProgress: PrepareProgress | null;
    installError: string | null;
    hasFocus: boolean;
    onMoveFocus: (index: number) => void;
    onSelect: (index: number) => void;
    onDismissError: () => void;
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
    modpackQuery,
    modpackResults,
    modpackLoading,
    selectedModpack,
    modpackVersions,
    modpackVersionsLoading,
    importFiles,
    importLoading,
    isInstalling,
    installProgress,
    installError,
    hasFocus,
    onMoveFocus,
    onSelect,
    onDismissError,
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

    // Scroll focused item into view for list-based steps
    const itemRefs = useRef<Array<HTMLElement | null>>([]);
    useEffect(() => {
        itemRefs.current = [];
    }, [step]);
    useEffect(() => {
        itemRefs.current[focusedIndex]?.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
        });
    }, [focusedIndex, step]);

    return (
        <section className="relative grid min-h-0 flex-1 grid-cols-[minmax(0,0.95fr)_minmax(20rem,0.7fr)] gap-6">
            {/* Installing overlay */}
            {isInstalling && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 rounded-[1.75rem] bg-[#0d0f0e]/90 backdrop-blur-sm">
                    <div className="h-12 w-12 animate-spin rounded-full border-4 border-lime-300/40 border-t-lime-300" />
                    {installProgress && (
                        <>
                            <p className="text-xl font-semibold text-white">
                                {installProgress.message}
                            </p>
                            <div className="w-96 overflow-hidden rounded-full bg-white/10">
                                <div
                                    className="h-2 rounded-full bg-lime-300 transition-all duration-200"
                                    style={{
                                        width: `${installProgress.total > 0 ? (installProgress.done / installProgress.total) * 100 : 0}%`,
                                    }}
                                />
                            </div>
                            <p className="text-sm text-stone-500 uppercase tracking-widest">
                                {installProgress.stage}
                            </p>
                        </>
                    )}
                </div>
            )}

            {/* Error overlay */}
            {installError && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 rounded-[1.75rem] bg-[#0d0f0e]/90 backdrop-blur-sm">
                    <p className="text-xl font-semibold text-red-400">
                        Installation failed
                    </p>
                    <p className="max-w-xl text-center text-sm text-stone-400">
                        {installError}
                    </p>
                    <button
                        type="button"
                        onClick={onDismissError}
                        className="rounded-[1.25rem] border border-white/10 bg-white/5 px-8 py-4 text-white transition duration-200 hover:bg-white/10"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            <div className="flex min-h-0 flex-col gap-5">
                {/* Progress bar */}
                <div className="flex items-center gap-2">
                    {effectiveSteps.map((s, i) => (
                        <div
                            key={s}
                            className={`h-[3px] flex-1 rounded-full transition-all duration-300 ${
                                i <= effectiveSteps.indexOf(step)
                                    ? "bg-lime-300"
                                    : "bg-white/10"
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

                {/* ── Source ── */}
                {step === "source" && (
                    <div className="flex flex-1 flex-col gap-3">
                        {[
                            {
                                label: "Custom",
                                sub: "Choose your loader, Minecraft version, and colors from scratch.",
                                accent: "#a3e635",
                            },
                            {
                                label: "Modpack",
                                sub: "Browse and install a Modrinth modpack. Mods come pre-bundled.",
                                accent: "#818cf8",
                            },
                            {
                                label: "Import",
                                sub: "Install a .mrpack file you've placed in the imports folder.",
                                accent: "#f59e0b",
                            },
                        ].map((opt, i) => (
                            <article
                                key={opt.label}
                                onClick={() => onSelect(i)}
                                onMouseEnter={() => onMoveFocus(i)}
                                style={
                                    { "--accent": opt.accent } as CSSProperties
                                }
                                className={`relative cursor-default overflow-hidden rounded-[1.75rem] border p-6 transition duration-200 ${
                                    isFocused(i)
                                        ? "border-lime-300/60 bg-[#171c1a]"
                                        : "border-white/8 bg-[#121514]"
                                }`}
                            >
                                <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[var(--accent)] opacity-20 blur-2xl" />
                                <div className="relative">
                                    <div
                                        className="h-10 w-10 rounded-[0.75rem]"
                                        style={{ background: opt.accent }}
                                    />
                                    <h3 className="mt-4 font-display text-3xl tracking-[-0.04em] text-white">
                                        {opt.label}
                                    </h3>
                                    <p className="mt-2 text-base leading-6 text-stone-400">
                                        {opt.sub}
                                    </p>
                                </div>
                                {isFocused(i) && (
                                    <div className="absolute right-5 top-5 h-3 w-3 rounded-full bg-lime-300" />
                                )}
                            </article>
                        ))}
                    </div>
                )}

                {/* ── Loader ── */}
                {step === "loader" && (
                    <div className="grid flex-1 auto-rows-max grid-cols-2 gap-3">
                        {LOADERS.map((loader, i) => (
                            <article
                                key={loader.id}
                                onClick={() => onSelect(i)}
                                onMouseEnter={() => onMoveFocus(i)}
                                style={
                                    {
                                        "--accent": loader.color,
                                    } as CSSProperties
                                }
                                className={`relative cursor-default overflow-hidden rounded-[1.75rem] border p-6 transition duration-200 ${
                                    isFocused(i)
                                        ? "border-lime-300/60 bg-[#171c1a]"
                                        : "border-white/8 bg-[#121514]"
                                }`}
                            >
                                <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[var(--accent)] opacity-20 blur-2xl" />
                                <div className="relative">
                                    <div
                                        className="h-10 w-10 rounded-[0.75rem]"
                                        style={{ background: loader.color }}
                                    />
                                    <h3 className="mt-4 font-display text-3xl tracking-[-0.04em] text-white">
                                        {loader.label}
                                    </h3>
                                    <p className="mt-2 text-base leading-6 text-stone-400">
                                        {loader.description}
                                    </p>
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
                        <div className="flex items-center gap-3">
                            <div
                                className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition duration-200 ${!showSnapshots ? "border-lime-300/60 bg-lime-300/10 text-lime-300" : "border-white/10 bg-white/5 text-stone-400"}`}
                            >
                                Releases
                            </div>
                            <div
                                className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition duration-200 ${showSnapshots ? "border-lime-300/60 bg-lime-300/10 text-lime-300" : "border-white/10 bg-white/5 text-stone-400"}`}
                            >
                                + Snapshots
                            </div>
                            <span className="ml-auto text-xs text-stone-600">
                                X to toggle
                            </span>
                        </div>
                        {isLoadingMcVersions ? (
                            <div className="flex flex-1 items-center justify-center gap-4 text-stone-400">
                                <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-lime-300/60 border-t-transparent" />
                                <span className="text-lg">
                                    Loading versions…
                                </span>
                            </div>
                        ) : (
                            <div className="grid auto-rows-max grid-cols-4 gap-3 overflow-y-auto">
                                {mcVersions.map((version, i) => (
                                    <button
                                        key={version}
                                        type="button"
                                        onClick={() => onSelect(i)}
                                        onMouseEnter={() => onMoveFocus(i)}
                                        className={`rounded-[1.25rem] border px-4 py-5 text-center transition duration-200 ${isFocused(i) ? "border-lime-300/60 bg-[#171c1a] text-white" : "border-white/8 bg-[#121514] text-stone-300"}`}
                                    >
                                        <p className="text-xl font-semibold tracking-[-0.03em]">
                                            {version}
                                        </p>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Loader Version ── */}
                {step === "loader_version" && (
                    <div className="flex min-h-0 flex-col gap-3">
                        <div className="flex items-center gap-3">
                            <div
                                className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition duration-200 ${showOnlyStable ? "border-lime-300/60 bg-lime-300/10 text-lime-300" : "border-white/10 bg-white/5 text-stone-400"}`}
                            >
                                Stable only
                            </div>
                            <div
                                className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition duration-200 ${!showOnlyStable ? "border-lime-300/60 bg-lime-300/10 text-lime-300" : "border-white/10 bg-white/5 text-stone-400"}`}
                            >
                                All versions
                            </div>
                            <span className="ml-auto text-xs text-stone-600">
                                X to toggle
                            </span>
                        </div>
                        {isLoadingLoaderVersions ? (
                            <div className="flex flex-1 items-center justify-center gap-4 text-stone-400">
                                <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-lime-300/60 border-t-transparent" />
                                <span className="text-lg">
                                    Loading loader versions…
                                </span>
                            </div>
                        ) : loaderVersions.length === 0 ? (
                            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
                                <p className="text-lg text-stone-400">
                                    No versions found for this combination.
                                </p>
                                <p className="text-sm text-stone-600">
                                    Press B to go back and choose a different
                                    Minecraft version.
                                </p>
                            </div>
                        ) : (
                            <div className="grid auto-rows-max grid-cols-4 gap-3 overflow-y-auto">
                                {loaderVersions.map((version, i) => (
                                    <button
                                        key={version}
                                        type="button"
                                        onClick={() => onSelect(i)}
                                        onMouseEnter={() => onMoveFocus(i)}
                                        className={`rounded-[1.25rem] border px-4 py-5 text-center transition duration-200 ${isFocused(i) ? "border-lime-300/60 bg-[#171c1a] text-white" : "border-white/8 bg-[#121514] text-stone-300"}`}
                                    >
                                        <p className="text-lg font-semibold tracking-[-0.03em]">
                                            {version}
                                        </p>
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
                            This color identifies your instance in the launcher
                            and on the grid.
                        </p>
                        <div className="grid grid-cols-4 gap-4 p-2 -m-2">
                            {INSTANCE_COLORS.map((color, i) => (
                                <button
                                    key={color}
                                    type="button"
                                    onClick={() => onSelect(i)}
                                    onMouseEnter={() => onMoveFocus(i)}
                                    className={`aspect-square rounded-[1.5rem] border-2 transition duration-200 ${isFocused(i) ? "relative z-10 scale-110 border-lime-300" : "border-transparent"}`}
                                    style={{ background: color }}
                                />
                            ))}
                        </div>
                        <div className="rounded-[1.25rem] border border-white/8 bg-white/[0.03] px-5 py-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-stone-500">
                                Instance Name
                            </p>
                            <p className="mt-2 text-xl font-semibold text-white">
                                {instanceName}
                            </p>
                            <p className="mt-1 text-sm text-stone-500">
                                Press A to confirm color. You'll name the
                                instance next.
                            </p>
                        </div>
                    </div>
                )}

                {/* ── Confirm (custom) ── */}
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
                                        {currentLoader?.label} · Minecraft{" "}
                                        {draftVersion}
                                    </p>
                                </div>
                            </div>
                            <div className="mt-5 grid grid-cols-4 gap-3">
                                {[
                                    {
                                        label: "Loader",
                                        value: currentLoader?.label ?? "",
                                    },
                                    {
                                        label: "MC Version",
                                        value: draftVersion,
                                    },
                                    ...(draftLoader !== "vanilla"
                                        ? [
                                              {
                                                  label: "Loader Ver.",
                                                  value:
                                                      draftLoaderVersion ||
                                                      "Latest",
                                              },
                                          ]
                                        : []),
                                    {
                                        label: "Java",
                                        value: `Java ${requiredJavaVersion(draftVersion)}`,
                                    },
                                ].map((item) => (
                                    <div
                                        key={item.label}
                                        className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-4 py-3"
                                    >
                                        <p className="text-xs font-semibold uppercase tracking-[0.32em] text-stone-500">
                                            {item.label}
                                        </p>
                                        <p className="mt-1 text-lg font-semibold text-white">
                                            {item.value}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => onSelect(0)}
                            onMouseEnter={() => onMoveFocus(0)}
                            className={`rounded-[1.75rem] border px-8 py-6 text-left transition duration-200 ${isFocused(0) ? "border-lime-300/60 bg-lime-300 text-slate-950" : "border-white/8 bg-[#121514] text-white"}`}
                        >
                            <p
                                className={`text-xs font-semibold uppercase tracking-[0.34em] ${isFocused(0) ? "text-slate-900/60" : "text-stone-500"}`}
                            >
                                Ready to create
                            </p>
                            <p className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
                                Create Instance
                            </p>
                            <p
                                className={`mt-2 text-base ${isFocused(0) ? "text-slate-900/70" : "text-stone-400"}`}
                            >
                                Add {instanceName} to your launcher. Install
                                mods and adjust settings after.
                            </p>
                        </button>
                    </div>
                )}

                {/* ── Modpack Search ── */}
                {step === "modpack_search" && (
                    <div className="flex min-h-0 flex-1 flex-col gap-3">
                        <div className="flex items-center gap-3">
                            <div className="flex-1 rounded-[1rem] border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-stone-300">
                                {modpackQuery || (
                                    <span className="text-stone-600">
                                        Search modpacks…
                                    </span>
                                )}
                            </div>
                        </div>
                        {modpackLoading ? (
                            <div className="flex flex-1 items-center justify-center gap-4 text-stone-400">
                                <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-lime-300/60 border-t-transparent" />
                                <span className="text-lg">Loading packs…</span>
                            </div>
                        ) : modpackResults.length === 0 ? (
                            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
                                <p className="text-lg text-stone-400">
                                    No packs found.
                                </p>
                                <p className="text-sm text-stone-600">
                                    Press X to search by name.
                                </p>
                            </div>
                        ) : (
                            <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-2 gap-3 overflow-y-auto">
                                {modpackResults.map((pack, i) => (
                                    <article
                                        key={pack.projectId}
                                        ref={(node) => {
                                            itemRefs.current[i] = node;
                                        }}
                                        onClick={() => onSelect(i)}
                                        onMouseEnter={() => onMoveFocus(i)}
                                        className={`relative cursor-default overflow-hidden rounded-[1.75rem] border p-5 transition duration-200 ${isFocused(i) ? "border-lime-300/60 bg-[#171c1a]" : "border-white/8 bg-[#121514]"}`}
                                    >
                                        <div className="flex items-start gap-4">
                                            {pack.iconUrl ? (
                                                <img
                                                    src={pack.iconUrl}
                                                    alt=""
                                                    className="h-14 w-14 shrink-0 rounded-[1rem] border border-white/10 object-cover"
                                                />
                                            ) : (
                                                <div className="h-14 w-14 shrink-0 rounded-[1rem] border border-white/10 bg-white/5" />
                                            )}
                                            <div className="min-w-0">
                                                <h3 className="font-display text-xl leading-none tracking-[-0.04em] text-white">
                                                    {pack.title}
                                                </h3>
                                                <p className="mt-1.5 line-clamp-2 text-sm leading-5 text-stone-400">
                                                    {pack.description}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="mt-3 flex gap-3 text-xs text-stone-500">
                                            <span>
                                                {pack.downloads.toLocaleString()}{" "}
                                                downloads
                                            </span>
                                            {pack.versions[0] && (
                                                <span>
                                                    · {pack.versions[0]}
                                                </span>
                                            )}
                                        </div>
                                        {isFocused(i) && (
                                            <div className="absolute right-4 top-4 h-2.5 w-2.5 rounded-full bg-lime-300" />
                                        )}
                                    </article>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Modpack Version ── */}
                {step === "modpack_version" && (
                    <div className="flex min-h-0 flex-col gap-3">
                        {selectedModpack && (
                            <div className="flex items-center gap-3 rounded-[1rem] border border-white/8 bg-white/[0.03] px-4 py-3">
                                {selectedModpack.iconUrl && (
                                    <img
                                        src={selectedModpack.iconUrl}
                                        alt=""
                                        className="h-10 w-10 shrink-0 rounded-[0.75rem] object-cover"
                                    />
                                )}
                                <div>
                                    <p className="font-semibold text-white">
                                        {selectedModpack.title}
                                    </p>
                                    <p className="text-xs text-stone-500">
                                        {selectedModpack.description}
                                    </p>
                                </div>
                            </div>
                        )}
                        {modpackVersionsLoading ? (
                            <div className="flex flex-1 items-center justify-center gap-4 text-stone-400">
                                <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-lime-300/60 border-t-transparent" />
                                <span className="text-lg">
                                    Loading versions…
                                </span>
                            </div>
                        ) : modpackVersions.length === 0 ? (
                            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
                                <p className="text-lg text-stone-400">
                                    No versions available.
                                </p>
                                <p className="text-sm text-stone-600">
                                    Press B to go back.
                                </p>
                            </div>
                        ) : (
                            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
                                {modpackVersions.map((ver, i) => (
                                    <button
                                        key={ver.versionId}
                                        ref={(node) => {
                                            itemRefs.current[i] = node;
                                        }}
                                        type="button"
                                        onClick={() => onSelect(i)}
                                        onMouseEnter={() => onMoveFocus(i)}
                                        className={`flex shrink-0 items-center justify-between rounded-[1.25rem] border px-5 py-4 text-left transition duration-200 ${isFocused(i) ? "border-lime-300/60 bg-[#171c1a]" : "border-white/8 bg-[#121514]"}`}
                                    >
                                        <div>
                                            <div className="flex items-center gap-2.5">
                                                <p className="text-lg font-semibold text-white">
                                                    {ver.versionName}
                                                </p>
                                                {i === 0 && (
                                                    <span className="rounded-full bg-lime-300/15 px-2.5 py-0.5 text-xs font-semibold text-lime-300">
                                                        Latest
                                                    </span>
                                                )}
                                            </div>
                                            <p className="mt-0.5 text-sm text-stone-400">
                                                {ver.mcVersions
                                                    .slice(0, 3)
                                                    .join(", ")}
                                                {ver.mcVersions.length > 3 &&
                                                    "…"}
                                                {" · "}
                                                {ver.loaderType}
                                            </p>
                                        </div>
                                        <p className="text-xs text-stone-600">
                                            {(
                                                ver.fileSize /
                                                1024 /
                                                1024
                                            ).toFixed(1)}{" "}
                                            MB
                                        </p>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Imports ── */}
                {step === "imports" && (
                    <div className="flex min-h-0 flex-1 flex-col gap-3">
                        {importLoading ? (
                            <div className="flex flex-1 items-center justify-center gap-4 text-stone-400">
                                <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-lime-300/60 border-t-transparent" />
                                <span className="text-lg">
                                    Scanning imports folder…
                                </span>
                            </div>
                        ) : importFiles.length === 0 ? (
                            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                                <p className="text-lg text-stone-400">
                                    No .mrpack files found.
                                </p>
                                <p className="text-sm text-stone-600">
                                    Drop .mrpack files into the{" "}
                                    <span className="font-mono text-stone-500">
                                        imports/
                                    </span>{" "}
                                    folder inside the app data directory, then
                                    come back.
                                </p>
                            </div>
                        ) : (
                            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
                                {importFiles.map((file, i) => (
                                    <button
                                        key={file.path}
                                        ref={(node) => {
                                            itemRefs.current[i] = node;
                                        }}
                                        type="button"
                                        onClick={() => onSelect(i)}
                                        onMouseEnter={() => onMoveFocus(i)}
                                        className={`flex shrink-0 items-center justify-between rounded-[1.25rem] border px-5 py-4 text-left transition duration-200 ${isFocused(i) ? "border-lime-300/60 bg-[#171c1a]" : "border-white/8 bg-[#121514]"}`}
                                    >
                                        <p className="font-semibold text-white">
                                            {file.name.replace(
                                                /\.mrpack$/i,
                                                "",
                                            )}
                                        </p>
                                        <p className="font-mono text-xs text-stone-600">
                                            .mrpack
                                        </p>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Inspector sidebar ── */}
            <aside className="simple-panel flex flex-col rounded-[1.75rem] px-6 py-6">
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-stone-500">
                    Preview
                </p>

                {step === "modpack_search" ||
                step === "modpack_version" ||
                step === "imports" ? (
                    <div className="mt-4">
                        {selectedModpack ? (
                            <>
                                {selectedModpack.iconUrl ? (
                                    <img
                                        src={selectedModpack.iconUrl}
                                        alt=""
                                        className="h-16 w-16 rounded-[1.25rem] border border-white/10 object-cover"
                                    />
                                ) : (
                                    <div className="h-16 w-16 rounded-[1.25rem] border border-white/10 bg-white/5" />
                                )}
                                <h3 className="mt-3 font-display text-2xl leading-none tracking-[-0.05em] text-white">
                                    {selectedModpack.title}
                                </h3>
                                <p className="mt-2 text-sm leading-5 text-stone-400">
                                    {selectedModpack.description}
                                </p>
                                <div className="mt-4 space-y-2 text-sm text-stone-500">
                                    <p>
                                        {selectedModpack.downloads.toLocaleString()}{" "}
                                        downloads
                                    </p>
                                    <p>
                                        {selectedModpack.follows.toLocaleString()}{" "}
                                        follows
                                    </p>
                                </div>
                            </>
                        ) : (
                            <p className="mt-4 text-sm text-stone-600">
                                Select a modpack to see details.
                            </p>
                        )}
                    </div>
                ) : (
                    <>
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
                                {
                                    label: "Loader",
                                    value: currentLoader?.label,
                                },
                                {
                                    label: "MC Version",
                                    value: draftVersion || null,
                                },
                                ...(draftLoader && draftLoader !== "vanilla"
                                    ? [
                                          {
                                              label: "Loader Ver.",
                                              value: draftLoaderVersion || null,
                                          },
                                      ]
                                    : []),
                                {
                                    label: "Color",
                                    value: draftColor,
                                    isColor: true,
                                },
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
                                                style={{
                                                    background: draftColor,
                                                }}
                                            />
                                            <p className="font-mono text-lg font-semibold text-white">
                                                {draftColor}
                                            </p>
                                        </div>
                                    ) : (
                                        <p className="mt-2 text-xl font-semibold text-white">
                                            {item.value ?? (
                                                <span className="text-stone-600">
                                                    Not selected
                                                </span>
                                            )}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </>
                )}

                <div className="mt-auto rounded-[1.25rem] border border-lime-300/20 bg-lime-300/8 px-5 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.32em] text-lime-300/70">
                        Navigation
                    </p>
                    <p className="mt-2 text-sm leading-6 text-stone-400">
                        {STEP_HINTS[step]}
                    </p>
                </div>
            </aside>
        </section>
    );
}
