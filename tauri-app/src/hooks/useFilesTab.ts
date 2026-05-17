import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { FileEntry } from "../types";
import type { GamepadInput } from "./useGamepad";

export const FILES_TAB_BTNS = {
  enter:  "A",
  up:     "B",
  rename: "X",
  delete: "Y",
} as const satisfies Record<string, GamepadInput>;

export interface FilesTabState {
  entries: FileEntry[];
  currentPath: string;
  selectedIndex: number;
  isLoading: boolean;
  deleteOverlay: FileEntry | null;
  handleInput: (input: GamepadInput) => boolean;
  onSelectEntry: (i: number) => void;
}

interface UseFilesTabOptions {
  instanceId: string | null;
  isActive: boolean;
  openOSK: (
    label: string,
    initial: string,
    onConfirm: (value: string) => void,
    onCancel?: () => void,
  ) => void;
}

// Returns the parent of a slash-separated subpath ("" if already at root).
function parentPath(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "" : path.slice(0, slash);
}

// Appends a child name to a subpath.
function childPath(path: string, name: string): string {
  return path ? `${path}/${name}` : name;
}

export function useFilesTab({
  instanceId,
  isActive,
  openOSK,
}: UseFilesTabOptions): FilesTabState {
  const [entries, setEntries]           = useState<FileEntry[]>([]);
  const [currentPath, setCurrentPath]   = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading]       = useState(false);
  const [deleteOverlay, setDeleteOverlay] = useState<FileEntry | null>(null);

  const loadDir = useCallback(
    async (path: string) => {
      if (!instanceId) return;
      setIsLoading(true);
      try {
        const result = await invoke<FileEntry[]>("list_instance_files", {
          instanceId,
          subpath: path,
        });
        setEntries(result);
        setSelectedIndex(0);
        setCurrentPath(path);
      } catch (e) {
        console.error("list_instance_files error:", e);
        setEntries([]);
      } finally {
        setIsLoading(false);
      }
    },
    [instanceId],
  );

  // Load root whenever the tab becomes active for this instance.
  useEffect(() => {
    if (!instanceId || !isActive) return;
    setCurrentPath("");
    setSelectedIndex(0);
    setDeleteOverlay(null);
    void loadDir("");
  }, [instanceId, isActive]); // intentional: loadDir excluded — its identity changes with instanceId which is already a dep // eslint-disable-line react-hooks/exhaustive-deps

  const confirmDelete = useCallback(
    async (entry: FileEntry) => {
      if (!instanceId) return;
      const subpath = childPath(currentPath, entry.name);
      try {
        await invoke("delete_instance_path", { instanceId, subpath });
        setEntries((prev) => prev.filter((e) => e.name !== entry.name));
        setSelectedIndex((i) => Math.max(0, i - 1));
      } catch (e) {
        console.error("delete_instance_path error:", e);
      }
      setDeleteOverlay(null);
    },
    [instanceId, currentPath],
  );

  const renameEntry = useCallback(
    (entry: FileEntry) => {
      const subpath = childPath(currentPath, entry.name);
      openOSK("Rename", entry.name, async (newName) => {
        const trimmed = newName.trim();
        if (!trimmed || trimmed === entry.name || !instanceId) return;
        try {
          await invoke("rename_instance_file", { instanceId, subpath, newName: trimmed });
          setEntries((prev) =>
            prev
              .map((e) => (e.name === entry.name ? { ...e, name: trimmed } : e))
              .sort((a, b) =>
                // Re-sort after rename: dirs first then alpha
                Number(b.isDir) - Number(a.isDir) ||
                a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
              ),
          );
        } catch (e) {
          console.error("rename_instance_file error:", e);
        }
      });
    },
    [instanceId, currentPath, openOSK],
  );

  // Returns true if the input was consumed.
  const handleInput = useCallback(
    (input: GamepadInput): boolean => {
      // ── delete overlay ────────────────────────────────────────────────────
      if (deleteOverlay) {
        if (input === "A") void confirmDelete(deleteOverlay);
        else if (input === "B") setDeleteOverlay(null);
        return true;
      }

      const entry = entries[selectedIndex];

      switch (input) {
        case "UP":
          setSelectedIndex((i) => Math.max(i - 1, 0));
          return true;

        case "DOWN":
          setSelectedIndex((i) => Math.min(i + 1, entries.length - 1));
          return true;

        case "A":
          if (entry?.isDir) {
            void loadDir(childPath(currentPath, entry.name));
            return true;
          }
          return true; // Consume A on files too (no-op, hints shown in UI)

        case "B":
          if (currentPath !== "") {
            void loadDir(parentPath(currentPath));
            return true;
          }
          return false; // At root — let instance page pop

        case FILES_TAB_BTNS.rename:
          if (entry) renameEntry(entry);
          return true;

        case FILES_TAB_BTNS.delete:
          if (entry) setDeleteOverlay(entry);
          return true;
      }

      return false;
    },
    [deleteOverlay, entries, selectedIndex, currentPath, loadDir, renameEntry, confirmDelete],
  );

  return {
    entries,
    currentPath,
    selectedIndex,
    isLoading,
    deleteOverlay,
    handleInput,
    onSelectEntry: setSelectedIndex,
  };
}
