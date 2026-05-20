import type { JavaVersion } from "../types";

export function formatLastPlayed(lastPlayedAt: number | null): string {
    if (lastPlayedAt === null) return "Never";
    const diffSecs = Math.floor(Date.now() / 1000) - lastPlayedAt;
    if (diffSecs < 86400) return "Today";
    if (diffSecs < 172800) return "Yesterday";
    const days = Math.floor(diffSecs / 86400);
    if (days < 7) return `${days} days ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `${weeks}w ago`;
    return new Date(lastPlayedAt * 1000).toLocaleDateString();
}

export function formatPlaytime(secs: number): string {
    if (secs === 0) return "0h";
    const hours = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    if (hours === 0) return `${mins}m`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
}

export function formatModCount(count: number): string {
    if (count === 0) return "No mods";
    return `${count} mod${count === 1 ? "" : "s"}`;
}

export function formatRam(mb: number): string {
    if (mb >= 1024 && mb % 1024 === 0) return `${mb / 1024}GB`;
    return `${mb}MB`;
}

export function formatBytes(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Maps a Minecraft version string to the minimum required Java version.
// Handles both the legacy format ("1.21.1") and the new naming convention ("26.1.0").
export function requiredJavaVersion(mcVersion: string): JavaVersion {
    const parts = mcVersion.split(".").map(Number);
    // New naming convention: major part is not 1 (e.g. "26.1.0") — requires Java 25+
    if ((parts[0] ?? 1) !== 1) return 25;
    const minor = parts[1] ?? 0;
    const patch = parts[2] ?? 0;
    // 1.20.5+ and all 1.21+ require Java 21
    if (minor > 20 || (minor === 20 && patch >= 5)) return 21;
    // 1.17–1.20.4 require Java 17
    if (minor >= 17) return 17;
    // Everything older works on Java 8
    return 8;
}
