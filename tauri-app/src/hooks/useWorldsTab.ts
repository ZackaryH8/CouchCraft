import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { WorldInfo } from "../types";
import type { GamepadInput } from "./useGamepad";

export interface WorldsTabState {
  worlds: WorldInfo[];
  selectedIndex: number;
  isLoading: boolean;
  handleInput: (input: GamepadInput) => boolean;
  onSelectWorld: (i: number) => void;
  onLaunchWorld: (folder: string) => void;
}

interface UseWorldsTabOptions {
  instanceId: string | null;
  isActive: boolean;
  onLaunch: (quickplayWorld: string) => void;
}

export function useWorldsTab({ instanceId, isActive, onLaunch }: UseWorldsTabOptions): WorldsTabState {
  const [worlds, setWorlds]         = useState<WorldInfo[]>([]);
  const [selectedIndex, setSelected] = useState(0);
  const [isLoading, setIsLoading]   = useState(false);

  useEffect(() => {
    if (!instanceId || !isActive) return;
    setIsLoading(true);
    setSelected(0);
    invoke<WorldInfo[]>("list_worlds", { instanceId })
      .then(setWorlds)
      .catch(() => setWorlds([]))
      .finally(() => setIsLoading(false));
  }, [instanceId, isActive]); // eslint-disable-line react-hooks/exhaustive-deps

  const onLaunchWorld = useCallback((folder: string) => { onLaunch(folder); }, [onLaunch]);

  const handleInput = useCallback((input: GamepadInput): boolean => {
    switch (input) {
      case "UP":   setSelected((i) => Math.max(i - 1, 0)); return true;
      case "DOWN": setSelected((i) => Math.min(i + 1, worlds.length - 1)); return true;
      case "A":    if (worlds[selectedIndex]) onLaunchWorld(worlds[selectedIndex].folder); return true;
      case "B":    return false;
    }
    return false;
  }, [worlds, selectedIndex, onLaunchWorld]);

  return { worlds, selectedIndex, isLoading, handleInput, onSelectWorld: setSelected, onLaunchWorld };
}
