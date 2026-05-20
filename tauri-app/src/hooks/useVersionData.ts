import { useState, useEffect, useRef, useCallback } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import type { LoaderType, LoaderVersionInfo, McVersionInfo } from "../types";
import { MC_VERSIONS } from "../constants";

// Fallback for non-Tauri (browser dev) or when the API is unreachable.
const FALLBACK_MC_VERSIONS: McVersionInfo[] = MC_VERSIONS.map((id) => ({
    id,
    versionType: "release" as const,
}));

export function useVersionData() {
    const [mcVersions, setMcVersions] = useState<McVersionInfo[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // In-session cache keyed by "loader:mcVersion"
    const loaderCache = useRef(new Map<string, LoaderVersionInfo[]>());

    useEffect(() => {
        if (!isTauri()) {
            setMcVersions(FALLBACK_MC_VERSIONS);
            setIsLoading(false);
            return;
        }

        invoke<McVersionInfo[]>("fetch_mc_versions")
            .then((versions) => {
                setMcVersions(versions);
                setIsLoading(false);
            })
            .catch(() => {
                setMcVersions(FALLBACK_MC_VERSIONS);
                setIsLoading(false);
            });
    }, []);

    const fetchLoaderVersions = useCallback(
        async (
            loader: LoaderType,
            mcVersion: string,
        ): Promise<LoaderVersionInfo[]> => {
            if (loader === "vanilla") return [];

            const key = `${loader}:${mcVersion}`;
            const cached = loaderCache.current.get(key);
            if (cached) return cached;

            if (!isTauri()) return [];

            try {
                const versions = await invoke<LoaderVersionInfo[]>(
                    "fetch_loader_versions",
                    {
                        loader,
                        mcVersion,
                    },
                );
                loaderCache.current.set(key, versions);
                return versions;
            } catch {
                return [];
            }
        },
        [],
    );

    return { mcVersions, isLoading, fetchLoaderVersions };
}
