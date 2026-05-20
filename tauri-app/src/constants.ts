import type {
    GameInstance,
    LoaderOption,
    LoaderType,
    SettingsSection,
} from "./types";
import type { ControllerType } from "./gamepad/glyphs";

export const LOADER_COLORS: Record<LoaderType, string> = {
    fabric: "#dbb69b",
    quilt: "#c796f9",
    forge: "#959eef",
    neoforge: "#f99e6b",
    vanilla: "#7ec850",
};

export const LOADER_LABELS: Record<LoaderType, string> = {
    fabric: "Fabric",
    quilt: "Quilt",
    forge: "Forge",
    neoforge: "NeoForge",
    vanilla: "Vanilla",
};

const NOW = Math.floor(Date.now() / 1000);

export const MOCK_INSTANCES: GameInstance[] = [
    {
        id: "survival-fabric",
        name: "Survival Fabric",
        loaderType: "fabric",
        loaderVersion: "0.16.9",
        minecraftVersion: "1.20.1",
        color: LOADER_COLORS.fabric,
        iconData: null,
        javaVersion: 17,
        ramMb: 4096,
        jvmArgs: "",
        notes: "Main survival instance with a lightweight Fabric mod set.",
        lastPlayedAt: NOW - 3600,
        playTimeSecs: 46 * 3600,
        modCount: 24,
        sortOrder: 0,
        createdAt: NOW - 30 * 86400,
    },
    {
        id: "vanilla-1-21",
        name: "Vanilla 1.21",
        loaderType: "vanilla",
        loaderVersion: "",
        minecraftVersion: "1.21",
        color: LOADER_COLORS.vanilla,
        iconData: null,
        javaVersion: 21,
        ramMb: 2048,
        jvmArgs: "",
        notes: "Clean vanilla instance for snapshots, testing, or playing without a loader.",
        lastPlayedAt: NOW - 2 * 86400,
        playTimeSecs: 12 * 3600,
        modCount: 0,
        sortOrder: 1,
        createdAt: NOW - 60 * 86400,
    },
    {
        id: "forge-rpg",
        name: "Forge RPG",
        loaderType: "forge",
        loaderVersion: "47.3.0",
        minecraftVersion: "1.19.2",
        color: LOADER_COLORS.forge,
        iconData: null,
        javaVersion: 17,
        ramMb: 6144,
        jvmArgs: "",
        notes: "Heavier Forge instance for long-form modded worlds.",
        lastPlayedAt: NOW - 7 * 86400,
        playTimeSecs: 31 * 3600,
        modCount: 118,
        sortOrder: 2,
        createdAt: NOW - 90 * 86400,
    },
    {
        id: "quilt-testing",
        name: "Quilt Testing",
        loaderType: "quilt",
        loaderVersion: "0.26.4",
        minecraftVersion: "1.20.4",
        color: LOADER_COLORS.quilt,
        iconData: null,
        javaVersion: 17,
        ramMb: 2048,
        jvmArgs: "",
        notes: "Small test instance for loader compatibility and config checks.",
        lastPlayedAt: null,
        playTimeSecs: 4 * 3600,
        modCount: 8,
        sortOrder: 3,
        createdAt: NOW - 14 * 86400,
    },
];

export const SIDEBAR_ITEMS = [
    { label: "Home", meta: "Recent instances" },
    { label: "Library", meta: "Installed instances" },
    { label: "Updates", meta: "Assets and mod updates" },
    { label: "Settings", meta: "Controller + video" },
    { label: "Account", meta: "Microsoft account" },
    { label: "Quit", meta: "Close the launcher", danger: true },
];

export const QUICK_ACTIONS = [
    { label: "Account", value: "Microsoft connected" },
    { label: "Updates", value: "3 queued" },
    { label: "Default Loader", value: "Fabric" },
];

export const UI_SOUND_STORAGE_KEY = "couchcraft-ui-sounds-enabled";
export const UI_SOUND_VOLUME_STORAGE_KEY = "couchcraft-ui-sound-volume";
export const CONTROLLER_LAYOUT_STORAGE_KEY = "controller.layout";
export const FULLSCREEN_STORAGE_KEY = "display.fullscreen";
export const MOTION_STORAGE_KEY = "display.motion-reduced";
export const VIBRATION_STORAGE_KEY = "controller.vibration";
export const DEFAULT_RAM_STORAGE_KEY = "instance.default_ram_mb";

export const RAM_OPTIONS = [1024, 2048, 3072, 4096, 6144, 8192] as const;
export type RamOption = (typeof RAM_OPTIONS)[number];

export function ramLabel(mb: number): string {
    return mb < 1024 ? `${mb} MB` : `${mb / 1024} GB`;
}
export const DEFAULT_UI_SOUND_VOLUME = 0.45;
export const UI_SOUND_VOLUME_STEP = 0.1;
export const GRID_COLUMNS = 2;

export const LOADERS: LoaderOption[] = [
    {
        id: "fabric",
        label: "Fabric",
        description:
            "Lightweight and fast. Best for performance mods and most modern content.",
        color: LOADER_COLORS.fabric,
    },
    {
        id: "quilt",
        label: "Quilt",
        description:
            "A Fabric fork with improved mod interoperability and continued active development.",
        color: LOADER_COLORS.quilt,
    },
    {
        id: "forge",
        label: "Forge",
        description:
            "The original mod platform. Required for most legacy and large content packs.",
        color: LOADER_COLORS.forge,
    },
    {
        id: "neoforge",
        label: "NeoForge",
        description:
            "A modern Forge fork with better performance and a more active upstream.",
        color: LOADER_COLORS.neoforge,
    },
    {
        id: "vanilla",
        label: "Vanilla",
        description:
            "No loader. Clean, unmodified Minecraft — great for vanilla play and servers.",
        color: LOADER_COLORS.vanilla,
    },
];

export const MC_VERSIONS = [
    "1.21.4",
    "1.21.3",
    "1.21.1",
    "1.21",
    "1.20.6",
    "1.20.4",
    "1.20.1",
    "1.20",
    "1.19.4",
    "1.19.2",
    "1.18.2",
    "1.17.1",
    "1.16.5",
    "1.12.2",
    "1.8.9",
] as const;

export const INSTANCE_COLORS = [
    "#53d769",
    "#7c8cff",
    "#cfa25e",
    "#ff6b6b",
    "#4ecdc4",
    "#f7d56f",
    "#c084fc",
    "#fb923c",
] as const;

export function buildSettingsSections(
    uiSoundsEnabled: boolean,
    uiSoundVolume: number,
    controllerLayout: ControllerType,
    motionReduced: boolean,
    vibrationEnabled: boolean,
    isFullscreen: boolean,
    defaultRamMb: number,
): SettingsSection[] {
    return [
        {
            title: "Gameplay",
            description: "Defaults applied when creating new instances.",
            items: [
                {
                    label: "Default RAM",
                    value: ramLabel(defaultRamMb),
                    hint: "Memory allocated to each new instance",
                    editType: "select" as const,
                    selectOptions: RAM_OPTIONS.map(ramLabel),
                },
            ],
        },
        {
            title: "Display",
            description: "Video output and interface settings.",
            items: [
                {
                    label: "Fullscreen",
                    value: isFullscreen ? "On" : "Off",
                    hint: "Open the launcher in fullscreen mode",
                    editType: "toggle" as const,
                },
                {
                    label: "Motion",
                    value: motionReduced ? "Reduced" : "Normal",
                    hint: "Reduce animation and transition intensity",
                    editType: "toggle" as const,
                    toggleLabels: ["Normal", "Reduced"] as [string, string],
                },
            ],
        },
        {
            title: "Controller",
            description: "Gamepad prompts and navigation behavior.",
            items: [
                {
                    label: "Primary Layout",
                    value: controllerLayout === "xbox" ? "Xbox" : "PlayStation",
                    hint: "Button prompt icons shown in the UI",
                    editType: "toggle" as const,
                    toggleLabels: ["Xbox", "PlayStation"] as [string, string],
                },
                {
                    label: "Vibration",
                    value: vibrationEnabled ? "On" : "Off",
                    hint: "Haptic feedback while navigating the launcher",
                    editType: "toggle" as const,
                },
            ],
        },
        {
            title: "Audio",
            description: "Launcher sound feedback and UI interaction audio.",
            items: [
                {
                    label: "UI Click Sounds",
                    value: uiSoundsEnabled ? "On" : "Off",
                    hint: "Play the launcher click sound while moving around the UI",
                    editType: "toggle" as const,
                },
                {
                    label: "UI Click Volume",
                    value: `${Math.round(uiSoundVolume * 100)}%`,
                    hint: "Adjust the volume of UI click sounds",
                    editType: "slider" as const,
                },
            ],
        },
    ];
}
