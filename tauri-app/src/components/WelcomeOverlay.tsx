import { useState, useEffect } from "react";
import QRCode from "react-qr-code";
import { GamepadGlyph } from "./GamepadGlyph";
import { inputToGlyph, type ControllerType } from "../gamepad/glyphs";
import type { DeviceCodeInfo } from "../hooks/useAuth";

export function WelcomeOverlay({
    signingIn,
    deviceCode,
    authError,
    onSignIn,
    onCancel,
    controllerType,
}: {
    signingIn: boolean;
    deviceCode: DeviceCodeInfo | null;
    authError: string | null;
    onSignIn: () => void;
    onCancel: () => void;
    controllerType: ControllerType;
}) {
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

    const mins = Math.floor(secondsLeft / 60);
    const secs = String(secondsLeft % 60).padStart(2, "0");
    const aGlyph = inputToGlyph("A");
    const bGlyph = inputToGlyph("B");

    return (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#0b0d0c]">
            <div className="flex flex-col items-center gap-10">
                <div className="text-center">
                    <h1 className="font-display text-6xl font-bold tracking-[-0.04em] text-white">
                        Couch<span className="text-lime-300">Craft</span>
                    </h1>
                    <p className="mt-3 text-lg text-stone-500">
                        A 10-foot Minecraft launcher built for the couch
                    </p>
                </div>

                {signingIn && deviceCode ? (
                    <div className="simple-panel flex w-[56rem] gap-10 rounded-[2rem] px-12 py-10">
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
                        <div className="flex min-w-0 flex-1 flex-col justify-center gap-6">
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
                                        Waiting for sign-in…
                                    </p>
                                </div>
                                <p className="text-base text-stone-500">
                                    Expires in {mins}:{secs}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={onCancel}
                                className="rounded-[1.25rem] border border-white/8 bg-transparent px-6 py-4 text-left"
                            >
                                <p className="font-semibold text-stone-300">
                                    Cancel
                                </p>
                                {bGlyph && (
                                    <p className="mt-0.5 text-sm text-stone-500">
                                        Press B to cancel
                                    </p>
                                )}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="simple-panel flex w-[36rem] flex-col items-center gap-8 rounded-[2rem] px-12 py-10 text-center">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-lime-300/30 bg-lime-300/10">
                            <span className="text-2xl">🎮</span>
                        </div>
                        <div>
                            <h2 className="font-display text-3xl font-bold text-white">
                                Sign in to play
                            </h2>
                            <p className="mt-3 text-base text-stone-500">
                                Connect your Microsoft account to launch
                                Minecraft instances with your profile.
                            </p>
                        </div>
                        {authError && (
                            <p className="rounded-[1rem] border border-red-400/30 bg-red-950/40 px-5 py-3 text-sm text-red-300">
                                {authError}
                            </p>
                        )}
                        <button
                            type="button"
                            onClick={onSignIn}
                            className="flex w-full items-center justify-center gap-4 rounded-[1.5rem] border border-lime-300/40 bg-lime-300/10 px-8 py-5 transition duration-200 hover:bg-lime-300/20"
                        >
                            {aGlyph && (
                                <GamepadGlyph
                                    controller={controllerType}
                                    button={aGlyph}
                                    size={32}
                                />
                            )}
                            <div className="text-left">
                                <p className="text-lg font-bold text-white">
                                    Sign in with Microsoft
                                </p>
                                <p className="text-sm text-stone-400">
                                    Opens device code flow
                                </p>
                            </div>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
