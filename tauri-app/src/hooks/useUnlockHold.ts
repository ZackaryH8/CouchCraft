import { useCallback, useEffect, useRef, useState } from "react";

const HOLD_DURATION_MS = 5000;

export function useUnlockHold({
    isGameRunning,
    forceUnlock,
}: {
    isGameRunning: boolean;
    forceUnlock: () => void;
}) {
    const [unlockProgress, setUnlockProgress] = useState(0);
    const holdStartRef = useRef<number | null>(null);
    const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const clearUnlockHold = useCallback(() => {
        holdStartRef.current = null;
        if (holdIntervalRef.current) {
            clearInterval(holdIntervalRef.current);
            holdIntervalRef.current = null;
        }
        setUnlockProgress(0);
    }, []);

    const startUnlockHold = useCallback(() => {
        if (holdStartRef.current !== null) return;
        holdStartRef.current = Date.now();
        holdIntervalRef.current = setInterval(() => {
            const elapsed = Date.now() - (holdStartRef.current ?? Date.now());
            const p = Math.min(elapsed / HOLD_DURATION_MS, 1);
            setUnlockProgress(p);
            if (p >= 1) {
                clearUnlockHold();
                forceUnlock();
            }
        }, 50);
    }, [forceUnlock, clearUnlockHold]);

    useEffect(() => {
        if (!isGameRunning) clearUnlockHold();
    }, [isGameRunning, clearUnlockHold]);

    return { unlockProgress, clearUnlockHold, startUnlockHold };
}
