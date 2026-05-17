import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  loadContent,
  insertContent,
  setContentEnabled,
  deleteContent,
} from "../services/db";
import type {
  ContentCategory,
  ContentItem,
  LoaderType,
  ModrinthHit,
  ModrinthVersionFile,
} from "../types";
import type { GamepadInput } from "./useGamepad";

// ─── button assignments ───────────────────────────────────────────────────────
// Change a value here and both the handler and JSX labels update together.

export const CONTENT_TAB_BTNS = {
  toggle: "A",
  delete: "X",
  browse: "Y",
  search: "Y",
} as const satisfies Record<string, import("./useGamepad").GamepadInput>;

// ─── category helpers ─────────────────────────────────────────────────────────

const CATEGORY_TO_PROJECT_TYPE: Record<ContentCategory, string> = {
  mod:          "mod",
  resourcepack: "resourcepack",
  datapack:     "datapack",
  shader:       "shader",
};

// ─── types ────────────────────────────────────────────────────────────────────

type ContentView = "installed" | "browse";

interface VersionOverlay {
  hit: ModrinthHit;
  file: ModrinthVersionFile | null;
  isFetching: boolean;
}

export interface ContentTabState {
  items: ContentItem[];
  installedProjectIds: Set<string>;
  view: ContentView;
  installedIndex: number;
  searchResults: ModrinthHit[];
  isSearching: boolean;
  browseIndex: number;
  versionOverlay: VersionOverlay | null;
  deleteOverlay: ContentItem | null;
  deleteChoice: number;
  isInstalling: boolean;
  handleInput: (input: GamepadInput) => boolean;
  onSelectInstalled: (i: number) => void;
  onSelectBrowse: (i: number) => void;
  onOpenBrowse: () => void;
  onOpenSearch: () => void;
}

interface UseContentTabOptions {
  instanceId: string | null;
  category: ContentCategory;
  mcVersion: string;
  loaderType: LoaderType;
  isActive: boolean;
  openOSK: (
    initial: string,
    onConfirm: (value: string) => void,
    onCancel?: () => void,
  ) => void;
}

// ─── hook ─────────────────────────────────────────────────────────────────────

export function useContentTab({
  instanceId,
  category,
  mcVersion,
  loaderType,
  isActive,
  openOSK,
}: UseContentTabOptions): ContentTabState {
  const [items, setItems]                     = useState<ContentItem[]>([]);
  const [view, setView]                       = useState<ContentView>("installed");
  const [installedIndex, setInstalledIndex]   = useState(0);
  const [searchResults, setSearchResults]     = useState<ModrinthHit[]>([]);
  const [isSearching, setIsSearching]         = useState(false);
  const [browseIndex, setBrowseIndex]         = useState(0);
  const [versionOverlay, setVersionOverlay]   = useState<VersionOverlay | null>(null);
  const [deleteOverlay, setDeleteOverlay]     = useState<ContentItem | null>(null);
  const [deleteChoice, setDeleteChoice]       = useState(0); // 0 = Cancel, 1 = Delete
  const [isInstalling, setIsInstalling]       = useState(false);
  const searchQueryRef                        = useRef("");

  // Load installed items when the tab becomes active for this instance.
  useEffect(() => {
    if (!instanceId || !isActive) return;
    loadContent(instanceId, category).then(setItems).catch(console.error);
  }, [instanceId, category, isActive]);

  // Reset browse/overlay state when the instance or category changes.
  useEffect(() => {
    setView("installed");
    setSearchResults([]);
    setBrowseIndex(0);
    setVersionOverlay(null);
    setDeleteOverlay(null);
    setInstalledIndex(0);
    searchQueryRef.current = "";
  }, [instanceId, category]);

  const doSearch = useCallback(
    async (query: string) => {
      setIsSearching(true);
      try {
        const hits = await invoke<ModrinthHit[]>("search_modrinth", {
          query,
          projectType: CATEGORY_TO_PROJECT_TYPE[category],
          mcVersion,
          loader: loaderType,
          offset: 0,
        });
        setSearchResults(hits);
        setBrowseIndex(0);
      } finally {
        setIsSearching(false);
      }
    },
    [category, mcVersion, loaderType],
  );

  const openBrowse = useCallback(() => {
    setView("browse");
    if (searchResults.length === 0) {
      void doSearch(searchQueryRef.current);
    }
  }, [doSearch, searchResults.length]);

  const openSearch = useCallback(() => {
    openOSK(searchQueryRef.current, (query) => {
      searchQueryRef.current = query;
      void doSearch(query);
    });
  }, [openOSK, doSearch]);

  const selectResult = useCallback(
    async (hit: ModrinthHit) => {
      setVersionOverlay({ hit, file: null, isFetching: true });
      try {
        const file = await invoke<ModrinthVersionFile | null>("get_modrinth_best_version", {
          projectId:   hit.projectId,
          mcVersion,
          loader:      loaderType,
          projectType: CATEGORY_TO_PROJECT_TYPE[category],
        });
        setVersionOverlay({ hit, file, isFetching: false });
      } catch {
        setVersionOverlay(null);
      }
    },
    [category, mcVersion, loaderType],
  );

  const confirmInstall = useCallback(async () => {
    if (!versionOverlay?.file || !instanceId || isInstalling) return;
    setIsInstalling(true);
    try {
      const { hit, file } = versionOverlay;
      await invoke("download_content", {
        url:        file.url,
        instanceId,
        filename:   file.filename,
        category,
      });
      const item: ContentItem = {
        id:                crypto.randomUUID(),
        instanceId,
        category,
        name:              hit.title,
        filename:          file.filename,
        version:           file.versionNumber,
        source:            "modrinth",
        modrinthProjectId: hit.projectId,
        modrinthVersionId: file.versionId,
        enabled:           true,
        installedAt:       Math.floor(Date.now() / 1000),
        updateCheckedAt:   null,
        updateAvailable:   false,
        fromModpack:       false,
      };
      await insertContent(item);
      setItems((prev) =>
        [...prev, item].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setVersionOverlay(null);
    } catch (e) {
      console.error("Install failed:", e);
    } finally {
      setIsInstalling(false);
    }
  }, [versionOverlay, instanceId, category, isInstalling]);

  const confirmDelete = useCallback(
    async (item: ContentItem) => {
      try {
        await invoke("delete_content_file", {
          instanceId: item.instanceId,
          filename:   item.filename,
          category:   item.category,
        });
        await deleteContent(item.id);
        setItems((prev) => prev.filter((i) => i.id !== item.id));
        setInstalledIndex((prev) => Math.max(0, prev - 1));
      } catch (e) {
        console.error("Delete failed:", e);
      }
      setDeleteOverlay(null);
    },
    [],
  );

  const toggleItem = useCallback(async (item: ContentItem) => {
    const next = !item.enabled;
    await invoke("set_content_enabled", {
      instanceId: item.instanceId,
      filename:   item.filename,
      category:   item.category,
      enabled:    next,
    });
    await setContentEnabled(item.id, next);
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, enabled: next } : i)),
    );
  }, []);

  // Returns true if the input was consumed; false lets the parent handle it.
  const handleInput = useCallback(
    (input: GamepadInput): boolean => {
      // ── version overlay ───────────────────────────────────────────────────
      if (versionOverlay) {
        if (input === "A" && !versionOverlay.isFetching && !isInstalling) {
          void confirmInstall();
        } else if (input === "B") {
          setVersionOverlay(null);
        }
        return true;
      }

      // ── delete overlay ────────────────────────────────────────────────────
      if (deleteOverlay) {
        switch (input) {
          case "LEFT":  setDeleteChoice(0); break;
          case "RIGHT": setDeleteChoice(1); break;
          case "A":
            if (deleteChoice === 1) void confirmDelete(deleteOverlay);
            else setDeleteOverlay(null);
            break;
          case "B": setDeleteOverlay(null); break;
        }
        return true;
      }

      // ── browse view ───────────────────────────────────────────────────────
      if (view === "browse") {
        switch (input) {
          case "UP":
            setBrowseIndex((i) => Math.max(i - 1, 0));
            return true;
          case "DOWN":
            setBrowseIndex((i) => Math.min(i + 1, searchResults.length - 1));
            return true;
          case "A": {
            const hit = searchResults[browseIndex];
            if (hit && !installedProjectIds.has(hit.projectId)) void selectResult(hit);
            return true;
          }
          case CONTENT_TAB_BTNS.search:
            openSearch();
            return true;
          case "B":
            setView("installed");
            return true;
        }
        return false;
      }

      // ── installed view ────────────────────────────────────────────────────
      switch (input) {
        case "UP":
          setInstalledIndex((i) => Math.max(i - 1, 0));
          return true;
        case "DOWN":
          setInstalledIndex((i) => Math.min(i + 1, items.length - 1));
          return true;
        case "A": {
          const item = items[installedIndex];
          if (item) void toggleItem(item);
          return true;
        }
        case CONTENT_TAB_BTNS.delete: {
          const item = items[installedIndex];
          if (item) { setDeleteChoice(0); setDeleteOverlay(item); }
          return true;
        }
        case CONTENT_TAB_BTNS.browse:
          openBrowse();
          return true;
      }
      return false;
    },
    [
      versionOverlay, deleteOverlay, view, searchResults, browseIndex,
      items, installedIndex, isInstalling,
      confirmInstall, confirmDelete, toggleItem, selectResult, openSearch, openBrowse,
    ],
  );

  const installedProjectIds = useMemo(
    () => new Set(items.map((i) => i.modrinthProjectId).filter((id): id is string => id !== null)),
    [items],
  );

  return {
    items,
    installedProjectIds,
    view,
    installedIndex,
    searchResults,
    isSearching,
    browseIndex,
    versionOverlay,
    deleteOverlay,
    deleteChoice,
    isInstalling,
    handleInput,
    onSelectInstalled: setInstalledIndex,
    onSelectBrowse:    setBrowseIndex,
    onOpenBrowse:      openBrowse,
    onOpenSearch:      openSearch,
  };
}
