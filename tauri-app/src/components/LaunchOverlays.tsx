import { GamepadGlyph } from "./GamepadGlyph";
import { inputToGlyph, type ControllerType } from "../gamepad/glyphs";
import type { PrepareProgress } from "../types";

export function GameRunningOverlay({
    unlockProgress,
    controllerType,
}: {
    unlockProgress: number;
    controllerType: ControllerType;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
            <div className="simple-panel flex min-w-[40rem] flex-col items-center gap-6 rounded-[2rem] px-14 py-12 text-center">
                <div className="flex items-center gap-3">
                    <div className="h-3 w-3 animate-pulse rounded-full bg-lime-300" />
                    <p className="text-xs font-semibold uppercase tracking-[0.5em] text-lime-300/70">
                        Game Running
                    </p>
                </div>
                <div className="space-y-2">
                    <h1 className="font-display text-4xl text-white">
                        Controls Locked
                    </h1>
                    <p className="text-lg text-stone-400">
                        The launcher is paused while Minecraft is open.
                    </p>
                </div>
                <div className="w-full space-y-3">
                    <div className="flex items-center justify-center gap-2 text-sm text-stone-500">
                        {unlockProgress > 0 ? (
                            <span>Keep holding…</span>
                        ) : (
                            <>
                                <span>Hold</span>
                                {(() => {
                                    const g = inputToGlyph("START");
                                    return g ? (
                                        <GamepadGlyph
                                            controller={controllerType}
                                            button={g}
                                            size={28}
                                        />
                                    ) : null;
                                })()}
                                <span>for 5 seconds to force unlock</span>
                            </>
                        )}
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                            className="h-full rounded-full bg-lime-300 transition-none"
                            style={{
                                width: `${unlockProgress * 100}%`,
                                opacity: unlockProgress > 0 ? 1 : 0,
                            }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

export function LaunchingOverlay({
    launchingName,
    progress,
}: {
    launchingName: string | null;
    progress: PrepareProgress | null;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
            <div className="simple-panel flex min-w-[36rem] flex-col items-center gap-6 rounded-[2rem] px-14 py-12 text-center">
                <div className="h-14 w-14 animate-spin rounded-full border-[5px] border-lime-300/90 border-t-transparent" />
                <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.5em] text-lime-300/60">
                        {progress?.stage === "done" ? "Launching" : "Preparing"}
                    </p>
                    <h1 className="font-display text-4xl text-white">
                        {launchingName ?? "Instance"}
                    </h1>
                    {progress && progress.stage !== "done" && (
                        <div className="mt-4 w-full space-y-2">
                            <p className="text-sm text-stone-400">
                                {progress.message}
                            </p>
                            {progress.total > 1 && (
                                <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                                    <div
                                        className="h-full rounded-full bg-lime-300 transition-all duration-300"
                                        style={{
                                            width: `${Math.round((progress.done / progress.total) * 100)}%`,
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export function LaunchErrorOverlay({
    launchError,
    onDismiss,
}: {
    launchError: string;
    onDismiss: () => void;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
            <div className="simple-panel flex min-w-[36rem] max-w-[52rem] flex-col gap-5 rounded-[2rem] px-12 py-10">
                <p className="text-xs font-semibold uppercase tracking-[0.5em] text-red-400/80">
                    Launch Failed
                </p>
                <p className="font-mono text-sm leading-6 text-stone-300 break-all">
                    {launchError}
                </p>
                <button
                    type="button"
                    onClick={onDismiss}
                    className="mt-2 self-start rounded-[1rem] border border-white/10 bg-white/[0.05] px-6 py-3 text-sm font-semibold text-stone-300 hover:text-white"
                >
                    Dismiss (B)
                </button>
            </div>
        </div>
    );
}
