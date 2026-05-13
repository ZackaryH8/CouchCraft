import type { GameInstance, LoaderOption, SettingsSection } from "./types";

export const LOADER_COLORS: Record<string, string> = {
  fabric: "#dbb69b",
  quilt: "#c796f9",
  forge: "#959eef",
  neoforge: "#f99e6b",
  vanilla: "#7ec850",
};

export const MICROSOFT_ACCOUNT = {
  gamertag: "CouchPlayer",
  email: "couchplayer@example.com",
  status: "Microsoft account connected",
};

export const MOCK_INSTANCES: GameInstance[] = [
  {
    id: "survival-fabric",
    name: "Survival Fabric",
    loader: "Fabric",
    minecraftVersion: "1.20.1",
    color: LOADER_COLORS.fabric,
    modCount: "24 mods",
    lastPlayed: "Today",
    playtime: "46h",
    status: "Installed",
    summary: "Main survival instance with a lightweight Fabric mod set.",
    details:
      "Built around performance and quality-of-life mods. Good default instance for everyday play.",
  },
  {
    id: "vanilla-1-21",
    name: "Vanilla 1.21",
    loader: "Vanilla",
    minecraftVersion: "1.21",
    color: LOADER_COLORS.vanilla,
    modCount: "No mods",
    lastPlayed: "2 days ago",
    playtime: "12h",
    status: "Ready",
    summary:
      "Clean vanilla instance for snapshots, testing, or playing without a loader.",
    details:
      "Useful baseline instance for testing resource packs, comparing performance, or joining servers that expect stock Minecraft.",
  },
  {
    id: "forge-rpg",
    name: "Forge RPG",
    loader: "Forge",
    minecraftVersion: "1.19.2",
    color: LOADER_COLORS.forge,
    modCount: "118 mods",
    lastPlayed: "Last week",
    playtime: "31h",
    status: "Synced",
    summary: "Heavier Forge instance for long-form modded worlds.",
    details:
      "Separate profile for larger content mods with its own saves, configs, and longer startup time.",
  },
  {
    id: "quilt-testing",
    name: "Quilt Testing",
    loader: "Quilt",
    minecraftVersion: "1.20.4",
    color: LOADER_COLORS.quilt,
    modCount: "8 mods",
    lastPlayed: "Never",
    playtime: "4h",
    status: "Needs assets",
    summary: "Small test instance for loader compatibility and config checks.",
    details:
      "Useful for trying new mods in isolation before adding them to a main instance.",
  },
];

export const SIDEBAR_ITEMS = [
  { label: "Home", meta: "Recent instances" },
  { label: "Library", meta: "Installed instances" },
  { label: "Updates", meta: "Assets and mod updates" },
  { label: "Settings", meta: "Controller + video" },
  { label: "Account", meta: "Microsoft account" },
];

export const QUICK_ACTIONS = [
  { label: "Account", value: "Microsoft connected" },
  { label: "Updates", value: "3 queued" },
  { label: "Default Loader", value: "Fabric" },
];

export const UI_SOUND_STORAGE_KEY = "couchcraft-ui-sounds-enabled";
export const UI_SOUND_VOLUME_STORAGE_KEY = "couchcraft-ui-sound-volume";
export const DEFAULT_UI_SOUND_VOLUME = 0.45;
export const UI_SOUND_VOLUME_STEP = 0.1;
export const GRID_COLUMNS = 2;

export const LOADERS: LoaderOption[] = [
  {
    id: "fabric",
    label: "Fabric",
    description: "Lightweight and fast. Best for performance mods and most modern content.",
    color: LOADER_COLORS.fabric,
  },
  {
    id: "quilt",
    label: "Quilt",
    description: "A Fabric fork with improved mod interoperability and continued active development.",
    color: LOADER_COLORS.quilt,
  },
  {
    id: "forge",
    label: "Forge",
    description: "The original mod platform. Required for most legacy and large content packs.",
    color: LOADER_COLORS.forge,
  },
  {
    id: "neoforge",
    label: "NeoForge",
    description: "A modern Forge fork with better performance and a more active upstream.",
    color: LOADER_COLORS.neoforge,
  },
  {
    id: "vanilla",
    label: "Vanilla",
    description: "No loader. Clean, unmodified Minecraft — great for vanilla play and servers.",
    color: LOADER_COLORS.vanilla,
  },
];

export const MC_VERSIONS = [
  "1.21.4", "1.21.3", "1.21.1", "1.21",
  "1.20.6", "1.20.4", "1.20.1", "1.20",
  "1.19.4", "1.19.2", "1.18.2", "1.17.1",
  "1.16.5", "1.12.2", "1.8.9",
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
): SettingsSection[] {
  return [
    {
      title: "Display",
      description: "Video output and interface sizing.",
      items: [
        { label: "UI Scale", value: "Large", hint: "Larger text and cards" },
        { label: "Fullscreen", value: "Enabled", hint: "Open in fullscreen mode" },
        { label: "Motion", value: "Reduced", hint: "Lower animation intensity" },
      ],
    },
    {
      title: "Controller",
      description: "Gamepad prompts and navigation behavior.",
      items: [
        { label: "Primary Layout", value: "Xbox", hint: "Prompt style used in the UI" },
        { label: "Repeat Delay", value: "180 ms", hint: "Time between repeated inputs" },
        { label: "Vibration", value: "Subtle", hint: "Launcher feedback strength" },
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
        { label: "Menu Feedback", value: "Enabled", hint: "Audio plays on navigation changes" },
      ],
    },
    {
      title: "Launcher",
      description: "Startup defaults and instance behavior.",
      items: [
        { label: "Default Instance", value: "Survival Fabric", hint: "Used for quick launch" },
        { label: "Auto Update Packs", value: "On Wi-Fi", hint: "Download updates automatically" },
        { label: "Cloud Saves", value: "Enabled", hint: "Sync saves before launch" },
      ],
    },
  ];
}
