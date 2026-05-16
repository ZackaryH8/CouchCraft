import { useState, useCallback, useEffect, useRef } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { GameInstance, McAccount, PrepareProgress } from "../types";
import { upsertAccount, loadJavaRuntimes, touchLastPlayed, addPlayTime } from "../services/db";

export interface LaunchState {
  isLaunching: boolean;
  isGameRunning: boolean;
  launchingName: string | null;
  progress: PrepareProgress | null;
  launchError: string | null;
}

interface UseLauncherOptions {
  onLaunched?: (instanceId: string) => void;
  onGameExited?: (instanceId: string, elapsedSecs: number) => void;
}

export function useLauncher({ onLaunched, onGameExited }: UseLauncherOptions = {}) {
  const [state, setState] = useState<LaunchState>({
    isLaunching: false,
    isGameRunning: false,
    launchingName: null,
    progress: null,
    launchError: null,
  });

  const onGameExitedRef = useRef(onGameExited);
  useEffect(() => { onGameExitedRef.current = onGameExited; }, [onGameExited]);

  // Register the game-exited listener once — using a ref for the callback
  // so changes to onGameExited never cause a new listener to be added.
  useEffect(() => {
    if (!isTauri()) return;
    const unlisten = listen<{ instanceId: string; elapsedSecs: number }>(
      "game-exited",
      async (event) => {
        const { instanceId, elapsedSecs } = event.payload;
        setState((s) => ({ ...s, isGameRunning: false }));
        await addPlayTime(instanceId, elapsedSecs);
        onGameExitedRef.current?.(instanceId, elapsedSecs);
      },
    );
    return () => { void unlisten.then((fn) => fn()); };
  }, []); // intentional: listener registered once on mount; onGameExited is accessed via ref above to avoid re-registration // eslint-disable-line react-hooks/exhaustive-deps

  const launchInstance = useCallback(async (
    instance: GameInstance,
    activeAccount: McAccount | null,
    opts?: { quickplayWorld?: string; quickplayServer?: string },
  ) => {
    if (!isTauri()) {
      console.log("Launch (mock):", instance.name, opts);
      return;
    }

    setState((s) => ({ ...s, isLaunching: true, launchingName: instance.name, progress: null, launchError: null }));

    const unlisten = await listen<PrepareProgress>("prepare-progress", (event) => {
      setState((s) => ({ ...s, progress: event.payload }));
    });

    try {
      let account = activeAccount;

      // Silently refresh if token expires within 5 minutes
      if (account && account.expiresAt - Math.floor(Date.now() / 1000) < 300) {
        try {
          const raw = await invoke<{
            ms_refresh_token: string; mc_access_token: string;
            mc_username: string; mc_uuid: string; expires_at: number;
          }>("refresh_mc_auth", { refreshToken: account.msRefreshToken });
          account = {
            ...account,
            msRefreshToken: raw.ms_refresh_token,
            mcAccessToken: raw.mc_access_token,
            mcUsername: raw.mc_username,
            mcUuid: raw.mc_uuid,
            expiresAt: raw.expires_at,
          };
          await upsertAccount(account);
        } catch {
          // Refresh failed — proceed with existing token; game launches in offline mode
        }
      }

      const runtimes = await loadJavaRuntimes();
      const runtime = runtimes
        .filter((r) => r.version >= instance.javaVersion)
        .sort((a, b) => b.version - a.version)[0];
      const javaPath = runtime?.path ?? "";

      await invoke("prepare_instance", {
        config: {
          instanceId: instance.id,
          mcVersion: instance.minecraftVersion,
          loaderType: instance.loaderType,
          loaderVersion: instance.loaderVersion,
        },
      });

      await invoke("launch_game", {
        config: {
          instanceId: instance.id,
          mcVersion: instance.minecraftVersion,
          loaderType: instance.loaderType,
          loaderVersion: instance.loaderVersion,
          ramMb: instance.ramMb,
          jvmArgs: instance.jvmArgs,
          javaPath,
          username: account?.mcUsername ?? "Player",
          uuid: account?.mcUuid ?? "00000000-0000-0000-0000-000000000000",
          accessToken: account?.mcAccessToken ?? "",
          quickplayWorld: opts?.quickplayWorld ?? null,
          quickplayServer: opts?.quickplayServer ?? null,
        },
      });

      // Update last played immediately on successful launch
      await touchLastPlayed(instance.id);
      onLaunched?.(instance.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setState((s) => ({ ...s, isLaunching: false, launchError: msg }));
      return;
    } finally {
      unlisten();
    }

    setState({ isLaunching: false, isGameRunning: true, launchingName: null, progress: null, launchError: null });
  }, [onLaunched]);

  const dismissError = useCallback(() => {
    setState((s) => ({ ...s, launchError: null }));
  }, []);

  const forceUnlock = useCallback(() => {
    setState((s) => ({ ...s, isGameRunning: false }));
  }, []);

  return { ...state, launchInstance, dismissError, forceUnlock };
}
