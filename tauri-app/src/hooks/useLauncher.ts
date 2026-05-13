import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { MICROSOFT_ACCOUNT } from "../constants";
import type { GameInstance } from "../types";

export function useLauncher() {
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchingName, setLaunchingName] = useState<string | null>(null);

  const launchInstance = useCallback(async (instance: GameInstance) => {
    setIsLaunching(true);
    setLaunchingName(instance.name);
    try {
      await invoke("launch_minecraft", {
        config: {
          instance_id: instance.id,
          username: MICROSOFT_ACCOUNT.gamertag,
          uuid: "550e8400-e29b-41d4-a716-446655440000",
          access_token: "demo_token",
        },
      });
    } catch (e) {
      console.error("Failed to launch:", e);
    } finally {
      setTimeout(() => {
        setIsLaunching(false);
        setLaunchingName(null);
      }, 3000);
    }
  }, []);

  return { isLaunching, launchingName, launchInstance };
}
