import { useState, useEffect, useCallback, useRef } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { saveAuth, loadAuth, clearAuth } from "../services/db";
import type { McAccount } from "../types";

export type AuthStatus = "loading" | "unauthenticated" | "signing-in" | "authenticated";

export interface DeviceCodeInfo {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

type RawAccount = {
  ms_refresh_token: string;
  mc_access_token: string;
  mc_username: string;
  mc_uuid: string;
  expires_at: number;
};

function rawToAccount(raw: RawAccount): McAccount {
  return {
    mcUsername: raw.mc_username,
    mcUuid: raw.mc_uuid,
    mcAccessToken: raw.mc_access_token,
    expiresAt: raw.expires_at,
  };
}

export function useAuth() {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [account, setAccount] = useState<McAccount | null>(null);
  const [deviceCode, setDeviceCode] = useState<DeviceCodeInfo | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const applyAccount = useCallback(
    async (raw: RawAccount) => {
      stopPolling();
      await saveAuth(raw);
      setAccount(rawToAccount(raw));
      setDeviceCode(null);
      setStatus("authenticated");
    },
    [stopPolling],
  );

  // Load saved auth on mount, refresh if expired
  useEffect(() => {
    if (!isTauri()) {
      setStatus("unauthenticated");
      return;
    }
    loadAuth()
      .then(async (stored) => {
        if (!stored) {
          setStatus("unauthenticated");
          return;
        }
        const now = Math.floor(Date.now() / 1000);
        if (stored.expires_at > now + 300) {
          setAccount(rawToAccount(stored));
          setStatus("authenticated");
          return;
        }
        // Token expired — try silent refresh
        try {
          const refreshed = await invoke<RawAccount>("refresh_mc_auth", {
            refreshToken: stored.ms_refresh_token,
          });
          await applyAccount(refreshed);
        } catch {
          setStatus("unauthenticated");
        }
      })
      .catch(() => setStatus("unauthenticated"));
  }, [applyAccount]);

  // Polling loop — runs while device code is active
  useEffect(() => {
    if (!deviceCode) return;

    const poll = async () => {
      try {
        const result = await invoke<RawAccount | null>("poll_device_code", {
          deviceCode: deviceCode.deviceCode,
        });
        if (result) await applyAccount(result);
      } catch (e) {
        setAuthError(String(e));
        stopPolling();
        setDeviceCode(null);
        setStatus("unauthenticated");
      }
    };

    pollRef.current = setInterval(poll, Math.max(deviceCode.interval, 5) * 1000);
    return stopPolling;
  }, [deviceCode, applyAccount, stopPolling]);

  const startSignIn = useCallback(async () => {
    if (!isTauri()) return;
    setAuthError(null);
    setStatus("signing-in");
    try {
      const info = await invoke<{
        device_code: string;
        user_code: string;
        verification_uri: string;
        expires_in: number;
        interval: number;
      }>("start_device_code_flow");
      setDeviceCode({
        deviceCode: info.device_code,
        userCode: info.user_code,
        verificationUri: info.verification_uri,
        expiresIn: info.expires_in,
        interval: info.interval,
      });
    } catch (e) {
      setAuthError(String(e));
      setStatus("unauthenticated");
    }
  }, []);

  const cancelSignIn = useCallback(() => {
    stopPolling();
    setDeviceCode(null);
    setAuthError(null);
    setStatus("unauthenticated");
  }, [stopPolling]);

  const signOut = useCallback(async () => {
    await clearAuth();
    setAccount(null);
    setStatus("unauthenticated");
  }, []);

  return { status, account, deviceCode, authError, startSignIn, cancelSignIn, signOut };
}
