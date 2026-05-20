export type LoaderType = "fabric" | "quilt" | "forge" | "neoforge" | "vanilla";
export type McVersionType = "release" | "snapshot" | "old_beta" | "old_alpha";

export interface McVersionInfo {
    id: string;
    versionType: McVersionType;
}

export interface LoaderVersionInfo {
    version: string;
    stable: boolean;
}
export type JavaVersion = 8 | 17 | 21 | 25;
export type ContentCategory = "mod" | "resourcepack" | "datapack" | "shader";
export type ContentSource = "modrinth" | "local";

export interface GameInstance {
    id: string;
    name: string;
    loaderType: LoaderType;
    loaderVersion: string;
    minecraftVersion: string;
    color: string;
    iconData: string | null;
    javaVersion: JavaVersion;
    ramMb: number;
    jvmArgs: string;
    notes: string;
    lastPlayedAt: number | null;
    playTimeSecs: number;
    modCount: number;
    sortOrder: number;
    createdAt: number;
}

export interface ContentItem {
    id: string;
    instanceId: string;
    category: ContentCategory;
    name: string;
    filename: string;
    version: string;
    source: ContentSource;
    modrinthProjectId: string | null;
    modrinthVersionId: string | null;
    enabled: boolean;
    installedAt: number;
    updateCheckedAt: number | null;
    updateAvailable: boolean;
    fromModpack: boolean;
}

export interface JavaRuntime {
    version: JavaVersion;
    path: string;
    buildString: string;
    isSystem: boolean;
}

export interface SettingsItem {
    label: string;
    value: string;
    hint: string;
    editType?: "toggle" | "slider" | "select";
    toggleLabels?: [string, string];
    selectOptions?: string[];
}

export interface SettingsSection {
    title: string;
    description: string;
    items: SettingsItem[];
}

export interface LoaderOption {
    id: LoaderType;
    label: string;
    description: string;
    color: string;
}

export type NavFrame =
    | { id: "home" }
    | { id: "library" }
    | { id: "settings" }
    | { id: "create" }
    | { id: "account" }
    | { id: "updates" }
    | { id: "instance"; instanceId: string };

export interface McAccount {
    id: string;
    msRefreshToken: string;
    mcAccessToken: string;
    mcUsername: string;
    mcUuid: string;
    expiresAt: number;
    addedAt: number;
}

export type CreateStep =
    | "source"
    | "loader"
    | "version"
    | "loader_version"
    | "color"
    | "confirm"
    | "modpack_search"
    | "modpack_version"
    | "imports";

export interface ImportFile {
    name: string;
    path: string;
}

export interface ModpackVersionInfo {
    versionId: string;
    versionName: string;
    mcVersions: string[];
    loaderType: string;
    fileUrl: string;
    fileSize: number;
}

export interface InstalledMod {
    filename: string;
    modrinthProjectId: string | null;
    modrinthVersionId: string | null;
}

export interface MrpackInstallResult {
    name: string;
    mcVersion: string;
    loaderType: string;
    loaderVersion: string;
    iconData: string | null;
    installedMods: InstalledMod[];
}

export interface FileEntry {
    name: string;
    isDir: boolean;
    sizeBytes: number;
    modifiedSecs: number | null;
}

export interface ModrinthHit {
    projectId: string;
    slug: string;
    title: string;
    description: string;
    iconUrl: string | null;
    downloads: number;
    follows: number;
    categories: string[];
    versions: string[];
}

export interface ModrinthVersionFile {
    versionId: string;
    versionName: string;
    versionNumber: string;
    url: string;
    filename: string;
    sizeBytes: number;
    loaders: string[];
    gameVersions: string[];
    versionType: string;
}

export interface WorldInfo {
    folder: string;
    levelName: string;
    gameMode: string;
    lastPlayedMs: number | null;
    icon: string | null;
    mcVersion: string | null;
}

export interface ServerInfo {
    name: string;
    ip: string;
    icon: string | null;
}

export interface PrepareProgress {
    stage: string;
    message: string;
    done: number;
    total: number;
}

export type HapticGamepad = Gamepad & {
    id: string;
    index: number;
    vibrationActuator?: {
        playEffect?: (
            type: string,
            params: {
                startDelay?: number;
                duration?: number;
                weakMagnitude?: number;
                strongMagnitude?: number;
            },
        ) => Promise<unknown>;
    };
    hapticActuators?: Array<{
        pulse?: (value: number, duration: number) => Promise<boolean>;
    }>;
};
