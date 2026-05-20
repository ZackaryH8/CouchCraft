import { useState, useCallback, useEffect, useRef } from "react";
import QRCode from "react-qr-code";
import type { McAccount } from "../types";
import type { DeviceCodeInfo } from "../hooks/useAuth";
import type { GamepadInput } from "../hooks/useGamepad";

// ─── hook ────────────────────────────────────────────────────────────────────

interface UseAccountPageOptions {
    accounts: McAccount[];
    activeAccountId: string | null;
    signingIn: boolean;
    deviceCode: DeviceCodeInfo | null;
    authError: string | null;
    startSignIn: () => Promise<void>;
    cancelSignIn: () => void;
    switchAccount: (id: string) => Promise<void>;
    removeAccount: (id: string) => Promise<void>;
    toSidebar: () => void;
}

// Items in the list: account entries + "Add Account" button
type ListItem = { type: "account"; account: McAccount } | { type: "add" };

export function useAccountPage({
    accounts,
    activeAccountId: _activeAccountId,
    signingIn,
    startSignIn,
    cancelSignIn,
    switchAccount,
    removeAccount,
    toSidebar,
}: UseAccountPageOptions) {
    const items: ListItem[] = [
        ...accounts.map((a): ListItem => ({ type: "account", account: a })),
        { type: "add" },
    ];

    const [focusedIndex, setFocusedIndex] = useState(0);
    // Per-account action focus: 0 = set active, 1 = remove
    const [actionIndex, setActionIndex] = useState(0);

    // Reset action index when focused item changes
    useEffect(() => {
        setActionIndex(0);
    }, [focusedIndex]);

    const focusedItem = items[focusedIndex] ?? items[0];

    const handleInput = useCallback(
        (input: GamepadInput) => {
            if (signingIn) {
                if (input === "B" || input === "A") cancelSignIn();
                return;
            }

            switch (input) {
                case "UP":
                    setFocusedIndex((i) => Math.max(i - 1, 0));
                    break;
                case "DOWN":
                    setFocusedIndex((i) => Math.min(i + 1, items.length - 1));
                    break;
                case "LEFT":
                    if (focusedItem?.type === "account")
                        setActionIndex((i) => Math.max(i - 1, 0));
                    else toSidebar();
                    break;
                case "RIGHT":
                    if (focusedItem?.type === "account")
                        setActionIndex((i) => Math.min(i + 1, 1));
                    break;
                case "B":
                    toSidebar();
                    break;
                case "A":
                    if (focusedItem?.type === "add") {
                        void startSignIn();
                    } else if (focusedItem?.type === "account") {
                        if (actionIndex === 0)
                            void switchAccount(focusedItem.account.id);
                        else void removeAccount(focusedItem.account.id);
                    }
                    break;
            }
        },
        [
            signingIn,
            focusedItem,
            focusedIndex,
            actionIndex,
            items.length,
            cancelSignIn,
            startSignIn,
            switchAccount,
            removeAccount,
            toSidebar,
        ],
    );

    return {
        items,
        focusedIndex,
        setFocusedIndex,
        actionIndex,
        setActionIndex,
        handleInput,
    };
}

// ─── component ────────────────────────────────────────────────────────────────

interface AccountPageProps {
    accounts: McAccount[];
    activeAccountId: string | null;
    signingIn: boolean;
    deviceCode: DeviceCodeInfo | null;
    authError: string | null;
    items: ReturnType<typeof useAccountPage>["items"];
    focusedIndex: number;
    actionIndex: number;
    hasFocus: boolean;
    onMoveFocus: (i: number) => void;
    onSetActionIndex: (i: number) => void;
    onSignIn: () => void;
    onCancel: () => void;
    onSwitch: (id: string) => void;
    onRemove: (id: string) => void;
}

export function AccountPage({
    accounts,
    activeAccountId,
    signingIn,
    deviceCode,
    authError,
    items,
    focusedIndex,
    actionIndex,
    hasFocus,
    onMoveFocus,
    onSetActionIndex,
    onSignIn,
    onCancel,
    onSwitch,
    onRemove,
}: AccountPageProps) {
    // Countdown for device code expiry
    const [secondsLeft, setSecondsLeft] = useState(deviceCode?.expiresIn ?? 0);
    useEffect(() => {
        if (!deviceCode) return;
        setSecondsLeft(deviceCode.expiresIn);
        const t = setInterval(
            () => setSecondsLeft((s) => Math.max(s - 1, 0)),
            1000,
        );
        return () => clearInterval(t);
    }, [deviceCode]);

    // Scroll focused item into view
    const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
    useEffect(() => {
        itemRefs.current[focusedIndex]?.scrollIntoView({ block: "nearest" });
    }, [focusedIndex]);

    const mins = Math.floor(secondsLeft / 60);
    const secs = String(secondsLeft % 60).padStart(2, "0");

    // ── Sign-in flow ──
    if (signingIn && deviceCode) {
        return (
            <section className="flex flex-1 flex-col items-center justify-center">
                <div className="simple-panel flex w-full max-w-4xl gap-10 rounded-[2rem] px-12 py-10">
                    <div className="flex shrink-0 flex-col items-center justify-center gap-4">
                        <div className="rounded-[1.25rem] bg-white p-4">
                            <QRCode
                                value={deviceCode.verificationUri}
                                size={180}
                            />
                        </div>
                        <p className="text-sm text-stone-500">
                            Scan to open on your phone
                        </p>
                    </div>

                    <div className="w-px self-stretch bg-white/8" />

                    <div className="flex min-w-0 flex-1 flex-col gap-6 justify-center">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-stone-500">
                                Or open manually
                            </p>
                            <p className="mt-2 text-xl text-stone-400">
                                Go to{" "}
                                <span className="font-semibold text-lime-300">
                                    {deviceCode.verificationUri}
                                </span>
                            </p>
                        </div>
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-stone-500">
                                Then enter this code
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
                                <p className="text-lg text-stone-400">
                                    Waiting for you to sign in…
                                </p>
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
                            <p className="mt-0.5 text-sm text-stone-500">
                                Press B to cancel
                            </p>
                        </button>
                    </div>
                </div>
            </section>
        );
    }

    // ── Account list ──
    const focusedItem = items[focusedIndex];

    return (
        <section className="grid min-h-0 flex-1 grid-cols-[26rem_1fr] gap-6">
            {/* Account list */}
            <div className="simple-panel flex min-h-0 flex-col rounded-[2rem] px-4 py-5 gap-2 overflow-y-auto">
                <p className="px-2 text-xs font-semibold uppercase tracking-[0.35em] text-stone-500 mb-1">
                    Accounts
                </p>

                {items.map((item, i) => {
                    const isFocused = hasFocus && i === focusedIndex;

                    if (item.type === "add") {
                        return (
                            <div
                                key="add"
                                ref={(el) => {
                                    itemRefs.current[i] = el;
                                }}
                                onClick={onSignIn}
                                onMouseEnter={() => onMoveFocus(i)}
                                className={`flex cursor-default items-center gap-3 rounded-[1.25rem] border px-4 py-3 transition duration-200 ${
                                    isFocused
                                        ? "border-lime-300/60 bg-lime-300/10"
                                        : "border-dashed border-white/10 bg-transparent"
                                }`}
                            >
                                <div
                                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.75rem] border text-xl ${
                                        isFocused
                                            ? "border-lime-300/40 text-lime-300"
                                            : "border-white/10 text-stone-500"
                                    }`}
                                >
                                    +
                                </div>
                                <p
                                    className={`text-base font-semibold ${isFocused ? "text-lime-300" : "text-stone-500"}`}
                                >
                                    Add Account
                                </p>
                            </div>
                        );
                    }

                    const { account } = item;
                    const isActive = account.id === activeAccountId;
                    return (
                        <div
                            key={account.id}
                            ref={(el) => {
                                itemRefs.current[i] = el;
                            }}
                            onClick={() => onMoveFocus(i)}
                            onMouseEnter={() => onMoveFocus(i)}
                            className={`flex cursor-default items-center gap-3 rounded-[1.25rem] border px-4 py-3 transition duration-200 ${
                                isFocused
                                    ? "border-lime-300/60 bg-[#171c1a]"
                                    : "border-white/8 bg-[#121514]"
                            }`}
                        >
                            <div className="relative shrink-0">
                                <img
                                    src={`https://api.mineatar.io/face/${account.mcUuid}`}
                                    alt=""
                                    className="h-10 w-10 rounded-[0.75rem]"
                                />
                                {isActive && (
                                    <div className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-[#121514] bg-lime-300" />
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-base font-semibold text-white">
                                    {account.mcUsername}
                                </p>
                                {isActive && (
                                    <p className="text-xs text-lime-300">
                                        Active
                                    </p>
                                )}
                            </div>
                        </div>
                    );
                })}

                {authError && (
                    <p className="mt-2 px-2 text-sm text-red-400">
                        {authError}
                    </p>
                )}
            </div>

            {/* Detail / actions panel */}
            <div className="flex flex-col gap-4">
                {focusedItem?.type === "account" ? (
                    (() => {
                        const { account } = focusedItem;
                        const isActive = account.id === activeAccountId;
                        const actions = [
                            {
                                label: isActive
                                    ? "Active Account"
                                    : "Set as Active",
                                description: isActive
                                    ? "This account is currently active"
                                    : "Use this account when launching",
                                danger: false,
                                disabled: isActive,
                            },
                            {
                                label: "Remove",
                                description:
                                    "Sign this account out of CouchCraft",
                                danger: true,
                                disabled: false,
                            },
                        ];

                        return (
                            <>
                                {/* Account card */}
                                <div className="simple-panel flex flex-col rounded-[2rem] px-6 py-6">
                                    <div className="flex items-center gap-4">
                                        <img
                                            src={`https://api.mineatar.io/face/${account.mcUuid}`}
                                            alt=""
                                            className="h-16 w-16 rounded-[1.25rem]"
                                        />
                                        <div>
                                            <p className="text-2xl font-semibold text-white">
                                                {account.mcUsername}
                                            </p>
                                            <p className="mt-0.5 font-mono text-sm text-stone-500">
                                                {account.mcUuid}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="mt-5 grid grid-cols-2 gap-3">
                                        <div className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-4 py-3">
                                            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-stone-500">
                                                Status
                                            </p>
                                            <p
                                                className={`mt-1 text-base font-semibold ${isActive ? "text-lime-300" : "text-stone-400"}`}
                                            >
                                                {isActive
                                                    ? "Active"
                                                    : "Inactive"}
                                            </p>
                                        </div>
                                        <div className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-4 py-3">
                                            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-stone-500">
                                                Token expires
                                            </p>
                                            <p className="mt-1 text-base font-semibold text-white">
                                                {new Date(
                                                    account.expiresAt * 1000,
                                                ).toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex flex-col gap-3">
                                    {actions.map((action, i) => {
                                        const isActionFocused =
                                            hasFocus &&
                                            i === actionIndex &&
                                            !action.disabled;
                                        return (
                                            <div
                                                key={action.label}
                                                onClick={() => {
                                                    if (action.disabled) return;
                                                    onSetActionIndex(i);
                                                    if (i === 0)
                                                        onSwitch(account.id);
                                                    else onRemove(account.id);
                                                }}
                                                onMouseEnter={() => {
                                                    if (!action.disabled)
                                                        onSetActionIndex(i);
                                                }}
                                                className={`flex cursor-default items-center justify-between rounded-[1.25rem] border px-6 py-5 transition duration-200 ${
                                                    action.disabled
                                                        ? "border-white/5 bg-transparent opacity-40"
                                                        : isActionFocused
                                                          ? action.danger
                                                              ? "border-red-400/50 bg-red-950/60"
                                                              : "border-lime-300/60 bg-lime-300"
                                                          : "border-white/8 bg-[#121514]"
                                                }`}
                                            >
                                                <div>
                                                    <p
                                                        className={`text-xl font-semibold ${
                                                            isActionFocused &&
                                                            !action.danger
                                                                ? "text-slate-950"
                                                                : "text-white"
                                                        }`}
                                                    >
                                                        {action.label}
                                                    </p>
                                                    <p
                                                        className={`mt-1 text-sm ${
                                                            isActionFocused
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
                            </>
                        );
                    })()
                ) : (
                    /* "Add Account" selected */
                    <div className="simple-panel flex flex-1 flex-col items-center justify-center gap-6 rounded-[2rem] px-14 py-12 text-center">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-white/15 text-3xl">
                            🎮
                        </div>
                        <div>
                            <h2 className="font-display text-4xl tracking-[-0.05em] text-white">
                                Add an Account
                            </h2>
                            <p className="mt-3 text-lg leading-7 text-stone-400">
                                {accounts.length === 0
                                    ? "Connect your Microsoft account to launch Minecraft."
                                    : "Add another Microsoft account to switch between players."}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={onSignIn}
                            className={`w-full rounded-[1.25rem] border px-8 py-5 transition duration-200 ${
                                hasFocus && focusedIndex === items.length - 1
                                    ? "border-lime-300/60 bg-lime-300 text-slate-950"
                                    : "border-white/10 bg-white/5 text-white"
                            }`}
                        >
                            <p className="text-xl font-semibold">
                                Sign In with Microsoft
                            </p>
                            <p
                                className={`mt-1 text-sm ${
                                    hasFocus &&
                                    focusedIndex === items.length - 1
                                        ? "text-slate-900/65"
                                        : "text-stone-400"
                                }`}
                            >
                                Uses your phone — no typing on the TV
                            </p>
                        </button>
                    </div>
                )}
            </div>
        </section>
    );
}
