import { useState, useEffect, useCallback } from "react";
import type { McAccount } from "../types";
import type { AuthStatus, DeviceCodeInfo } from "../hooks/useAuth";
import type { GamepadInput } from "../hooks/useGamepad";

// ─── hook ────────────────────────────────────────────────────────────────────

interface UseAccountPageOptions {
  status: AuthStatus;
  account: McAccount | null;
  deviceCode: DeviceCodeInfo | null;
  authError: string | null;
  startSignIn: () => Promise<void>;
  cancelSignIn: () => void;
  signOut: () => Promise<void>;
  toSidebar: () => void;
}

export function useAccountPage({
  status,
  startSignIn,
  cancelSignIn,
  signOut,
  toSidebar,
}: UseAccountPageOptions) {
  // 0 = primary action, 1 = secondary (sign out page: 0=back, 1=sign out)
  const [actionIndex, setActionIndex] = useState(0);

  const handleInput = useCallback(
    (input: GamepadInput) => {
      switch (status) {
        case "unauthenticated":
          switch (input) {
            case "A":
              void startSignIn();
              break;
            case "B":
            case "LEFT":
              toSidebar();
              break;
          }
          break;

        case "signing-in":
          switch (input) {
            case "B":
            case "A":
              cancelSignIn();
              break;
          }
          break;

        case "authenticated":
          switch (input) {
            case "UP":
              setActionIndex(0);
              break;
            case "DOWN":
              setActionIndex(1);
              break;
            case "A":
              if (actionIndex === 1) void signOut();
              else toSidebar();
              break;
            case "B":
            case "LEFT":
              toSidebar();
              break;
          }
          break;
      }
    },
    [status, actionIndex, startSignIn, cancelSignIn, signOut, toSidebar],
  );

  return { actionIndex, setActionIndex, handleInput };
}

// ─── component ────────────────────────────────────────────────────────────────

interface AccountPageProps {
  status: AuthStatus;
  account: McAccount | null;
  deviceCode: DeviceCodeInfo | null;
  authError: string | null;
  actionIndex: number;
  hasFocus: boolean;
  onSignIn: () => void;
  onCancel: () => void;
  onSignOut: () => void;
  onSelectAction: (i: number) => void;
}

export function AccountPage({
  status,
  account,
  deviceCode,
  authError,
  actionIndex,
  hasFocus,
  onSignIn,
  onCancel,
  onSignOut,
  onSelectAction,
}: AccountPageProps) {
  // Countdown timer for device code expiry
  const [secondsLeft, setSecondsLeft] = useState(deviceCode?.expiresIn ?? 0);
  useEffect(() => {
    if (!deviceCode) return;
    setSecondsLeft(deviceCode.expiresIn);
    const timer = setInterval(() => setSecondsLeft((s) => Math.max(s - 1, 0)), 1000);
    return () => clearInterval(timer);
  }, [deviceCode]);

  const mins = Math.floor(secondsLeft / 60);
  const secs = String(secondsLeft % 60).padStart(2, "0");

  if (status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-14 w-14 animate-spin rounded-full border-[5px] border-lime-300/90 border-t-transparent" />
      </div>
    );
  }

  if (status === "signing-in" && deviceCode) {
    return (
      <section className="flex flex-1 flex-col items-center justify-center gap-0">
        <div className="simple-panel flex w-full max-w-2xl flex-col gap-8 rounded-[2rem] px-14 py-12">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-stone-500">
              Step 1
            </p>
            <h2 className="mt-2 font-display text-4xl tracking-[-0.05em] text-white">
              Open on your phone
            </h2>
            <p className="mt-3 text-xl text-stone-400">
              Go to{" "}
              <span className="font-semibold text-lime-300">{deviceCode.verificationUri}</span>
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-stone-500">
              Step 2 — Enter this code
            </p>
            <div className="mt-3 inline-block rounded-[1.25rem] border border-white/10 bg-black/30 px-8 py-5">
              <p className="font-mono text-6xl font-bold tracking-[0.15em] text-lime-300">
                {deviceCode.userCode}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 animate-pulse rounded-full bg-lime-300" />
              <p className="text-lg text-stone-400">Waiting for you to sign in…</p>
            </div>
            <p className="text-base text-stone-500">
              Expires in {mins}:{secs}
            </p>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className={`rounded-[1.25rem] border px-6 py-4 text-center transition duration-200 ${
              hasFocus
                ? "border-white/15 bg-white/[0.04] text-stone-300"
                : "border-white/8 bg-transparent text-stone-500"
            }`}
          >
            <p className="text-lg font-semibold">Cancel</p>
            <p className="mt-0.5 text-sm text-stone-500">Press B to cancel</p>
          </button>
        </div>
      </section>
    );
  }

  if (status === "authenticated" && account) {
    const actions = [
      { label: "Back", description: "Return to the launcher", danger: false },
      { label: "Sign Out", description: "Remove this account from CouchCraft", danger: true },
    ];

    return (
      <section className="grid min-h-0 flex-1 grid-cols-[26rem_1fr] gap-6">
        {/* Account card */}
        <div className="simple-panel flex flex-col rounded-[2rem] px-6 py-7">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-stone-500">
            Signed in as
          </p>
          <div className="mt-5 flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-[1.25rem] bg-lime-300/10 text-2xl font-bold text-lime-300">
              <img src={`https://api.mineatar.io/face/${account.mcUuid}`} alt="Avatar" className="h-full w-full rounded-[1.25rem]" />
            </div>
            <div>
              <p className="text-2xl font-semibold text-white">{account.mcUsername}</p>
              <p className="mt-0.5 font-mono text-sm text-stone-500">{account.mcUuid}</p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <div className="rounded-[1.25rem] border border-white/8 bg-white/[0.03] px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-stone-500">
                Status
              </p>
              <p className="mt-1 text-lg font-semibold text-lime-300">Connected</p>
            </div>
            <div className="rounded-[1.25rem] border border-white/8 bg-white/[0.03] px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-stone-500">
                Token expires
              </p>
              <p className="mt-1 text-lg font-semibold text-white">
                {new Date(account.expiresAt * 1000).toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.35em] text-stone-500">
            Actions
          </p>
          {actions.map((action, i) => {
            const isActive = hasFocus && i === actionIndex;
            return (
              <div
                key={action.label}
                onClick={() => {
                  onSelectAction(i);
                  if (i === 0) return;
                  if (i === 1) onSignOut();
                }}
                onMouseEnter={() => onSelectAction(i)}
                className={`flex cursor-default items-center justify-between rounded-[1.25rem] border px-6 py-5 transition duration-200 ${
                  isActive
                    ? action.danger
                      ? "border-red-400/50 bg-red-950/60"
                      : "border-lime-300/60 bg-lime-300"
                    : "border-white/8 bg-[#121514]"
                }`}
              >
                <div>
                  <p
                    className={`text-xl font-semibold ${
                      isActive
                        ? action.danger
                          ? "text-red-200"
                          : "text-slate-950"
                        : "text-white"
                    }`}
                  >
                    {action.label}
                  </p>
                  <p
                    className={`mt-1 text-sm ${
                      isActive
                        ? action.danger
                          ? "text-red-300/70"
                          : "text-slate-900/65"
                        : "text-stone-500"
                    }`}
                  >
                    {action.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  // Unauthenticated
  return (
    <section className="flex flex-1 flex-col items-center justify-center">
      <div className="simple-panel flex w-full max-w-xl flex-col items-center gap-6 rounded-[2rem] px-14 py-12 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-white/15">
          <span className="text-3xl">🎮</span>
        </div>
        <div>
          <h2 className="font-display text-4xl tracking-[-0.05em] text-white">
            Sign in to Microsoft
          </h2>
          <p className="mt-3 text-lg leading-7 text-stone-400">
            Connect your Microsoft account to launch Minecraft with your profile.
          </p>
          {authError && (
            <p className="mt-3 text-base text-red-400">{authError}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onSignIn}
          className={`w-full rounded-[1.25rem] border px-8 py-5 transition duration-200 ${
            hasFocus
              ? "border-lime-300/60 bg-lime-300 text-slate-950"
              : "border-white/10 bg-white/5 text-white"
          }`}
        >
          <p className="text-xl font-semibold">Sign In with Microsoft</p>
          <p className={`mt-1 text-sm ${hasFocus ? "text-slate-900/65" : "text-stone-400"}`}>
            Uses your phone — no typing on the TV
          </p>
        </button>
      </div>
    </section>
  );
}
