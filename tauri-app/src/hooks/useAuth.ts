import { useState, useEffect, useCallback, useRef } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import {
  loadAccounts, upsertAccount, deleteAccount,
  getActiveAccountId, setActiveAccountId, migrateLegacyAuth,
} from "../services/db";
import type { McAccount } from "../types";

export type AuthStatus = "loading" | "ready";

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

function rawToAccount(raw: RawAccount, existingId?: string, existingAddedAt?: number): McAccount {
  return {
    id: existingId ?? crypto.randomUUID(),
    msRefreshToken: raw.ms_refresh_token,
    mcAccessToken: raw.mc_access_token,
    mcUsername: raw.mc_username,
    mcUuid: raw.mc_uuid,
    expiresAt: raw.expires_at,
    addedAt: existingAddedAt ?? Math.floor(Date.now() / 1000),
  };
}

export function useAuth() {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [accounts, setAccounts] = useState<McAccount[]>([]);
  const [activeAccountId, setActiveAccountIdState] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [deviceCode, setDeviceCode] = useState<DeviceCodeInfo | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const activeAccount = accounts.find((a) => a.id === activeAccountId) ?? null;

  // Load all accounts on mount, migrate legacy single-account if needed
  useEffect(() => {
    if (!isTauri()) { setStatus("ready"); return; }
    (async () => {
      await migrateLegacyAuth();
      const [accs, activeId] = await Promise.all([loadAccounts(), getActiveAccountId()]);

      // Silently refresh any account whose token is within 5 minutes of expiry
      const now = Math.floor(Date.now() / 1000);
      const refreshed = await Promise.all(
        accs.map(async (acc) => {
          if (acc.expiresAt > now + 300) return acc;
          try {
            const raw = await invoke<RawAccount>("refresh_mc_auth", { refreshToken: acc.msRefreshToken });
            const updated = rawToAccount(raw, acc.id, acc.addedAt);
            await upsertAccount(updated);
            return updated;
          } catch {
            return acc;
          }
        }),
      );

      setAccounts(refreshed);
      setActiveAccountIdState(activeId ?? refreshed[0]?.id ?? null);
      setStatus("ready");
    })();
  }, []);

  const startSignIn = useCallback(async () => {
    if (!isTauri()) return;
    setAuthError(null);
    setSigningIn(true);
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
      setSigningIn(false);
    }
  }, []);

  const cancelSignIn = useCallback(() => {
    stopPolling();
    setDeviceCode(null);
    setAuthError(null);
    setSigningIn(false);
  }, [stopPolling]);

  // Polling loop during device code sign-in
  useEffect(() => {
    if (!deviceCode) return;

    const poll = async () => {
      try {
        const result = await invoke<RawAccount | null>("poll_device_code", {
          deviceCode: deviceCode.deviceCode,
        });
        if (!result) return;

        stopPolling();
        const account = rawToAccount(result);
        await upsertAccount(account);
        await setActiveAccountId(account.id);
        setAccounts((prev) => {
          const filtered = prev.filter((a) => a.mcUuid !== account.mcUuid);
          return [...filtered, account];
        });
        setActiveAccountIdState(account.id);
        setDeviceCode(null);
        setSigningIn(false);
      } catch (e) {
        stopPolling();
        setAuthError(String(e));
        setDeviceCode(null);
        setSigningIn(false);
      }
    };

    pollRef.current = setInterval(poll, Math.max(deviceCode.interval, 5) * 1000);
    return stopPolling;
  }, [deviceCode, stopPolling]);

  const switchAccount = useCallback(async (id: string) => {
    await setActiveAccountId(id);
    setActiveAccountIdState(id);
  }, []);

  const removeAccount = useCallback(async (id: string) => {
    await deleteAccount(id);
    setAccounts((prev) => {
      const next = prev.filter((a) => a.id !== id);
      // If we removed the active account, switch to first remaining
      if (id === activeAccountId) {
        const next0 = next[0]?.id ?? null;
        void setActiveAccountId(next0);
        setActiveAccountIdState(next0);
      }
      return next;
    });
  }, [activeAccountId]);

  return {
    status,
    accounts,
    activeAccount,
    activeAccountId,
    signingIn,
    deviceCode,
    authError,
    startSignIn,
    cancelSignIn,
    switchAccount,
    removeAccount,
  };
}
