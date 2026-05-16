import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ServerInfo } from "../types";
import type { GamepadInput } from "./useGamepad";

export interface ServersTabState {
  servers: ServerInfo[];
  selectedIndex: number;
  isLoading: boolean;
  handleInput: (input: GamepadInput) => boolean;
  onSelectServer: (i: number) => void;
  onLaunchServer: (ip: string) => void;
}

interface UseServersTabOptions {
  instanceId: string | null;
  isActive: boolean;
  onLaunch: (quickplayServer: string) => void;
}

export function useServersTab({ instanceId, isActive, onLaunch }: UseServersTabOptions): ServersTabState {
  const [servers, setServers]        = useState<ServerInfo[]>([]);
  const [selectedIndex, setSelected] = useState(0);
  const [isLoading, setIsLoading]    = useState(false);

  useEffect(() => {
    if (!instanceId || !isActive) return;
    setIsLoading(true);
    setSelected(0);
    invoke<ServerInfo[]>("list_servers", { instanceId })
      .then(setServers)
      .catch(() => setServers([]))
      .finally(() => setIsLoading(false));
  }, [instanceId, isActive]); // intentional: setState fns are stable refs and not needed as deps // eslint-disable-line react-hooks/exhaustive-deps

  const onLaunchServer = useCallback((ip: string) => { onLaunch(ip); }, [onLaunch]);

  const handleInput = useCallback((input: GamepadInput): boolean => {
    switch (input) {
      case "UP":   setSelected((i) => Math.max(i - 1, 0)); return true;
      case "DOWN": setSelected((i) => Math.min(i + 1, servers.length - 1)); return true;
      case "A":    if (servers[selectedIndex]) onLaunchServer(servers[selectedIndex].ip); return true;
      case "B":    return false;
    }
    return false;
  }, [servers, selectedIndex, onLaunchServer]);

  return { servers, selectedIndex, isLoading, handleInput, onSelectServer: setSelected, onLaunchServer };
}
