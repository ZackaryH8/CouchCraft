import {
    useState,
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
} from "react";
import type { RefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { GamepadInput } from "./useGamepad";

export type LogFilter = "all" | "info" | "warn" | "error";

export interface LogsTabState {
    rawLog: string;
    filter: LogFilter;
    crashReport: string | null;
    showCrash: boolean;
    isLoading: boolean;
    scrollRef: RefObject<HTMLDivElement | null>;
    crashScrollRef: RefObject<HTMLPreElement | null>;
    handleInput: (input: GamepadInput) => boolean;
    scrollBy: (delta: number) => void;
    onSetFilter: (f: LogFilter) => void;
    onDismissCrash: () => void;
}

export function useLogsTab(
    instanceId: string | null,
    isActive: boolean,
): LogsTabState {
    const [rawLog, setRawLog] = useState("");
    const [filter, setFilter] = useState<LogFilter>("all");
    const [crashReport, setCrash] = useState<string | null>(null);
    const [showCrash, setShowCrash] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const crashScrollRef = useRef<HTMLPreElement | null>(null);
    // Use showCrashRef so scrollBy doesn't need showCrash in deps and stays stable.
    const showCrashRef = useRef(false);
    // Set to true by the load effect; consumed by useLayoutEffect to scroll after commit.
    const pendingScrollRef = useRef(false);

    const scrollBy = useCallback((delta: number) => {
        const target = showCrashRef.current
            ? crashScrollRef.current
            : scrollRef.current;
        if (target) target.scrollTop += delta;
    }, []);

    // After the log renders, scroll to the bottom so the latest entries are visible.
    useLayoutEffect(() => {
        if (pendingScrollRef.current && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
            pendingScrollRef.current = false;
        }
    }, [rawLog]);

    useEffect(() => {
        if (!instanceId || !isActive) return;
        setIsLoading(true);
        Promise.all([
            invoke<string>("read_instance_log", { instanceId }),
            invoke<string | null>("get_latest_crash_report", { instanceId }),
        ])
            .then(([log, crash]) => {
                setRawLog(log);
                setCrash(crash);
                const hasCrash = !!crash;
                showCrashRef.current = hasCrash;
                setShowCrash(hasCrash);
                if (!hasCrash && log.length > 0)
                    pendingScrollRef.current = true;
            })
            .catch(() => {
                setRawLog("");
                setCrash(null);
            })
            .finally(() => setIsLoading(false));
    }, [instanceId, isActive]); // intentional: setState fns are stable refs and not needed as deps // eslint-disable-line react-hooks/exhaustive-deps

    const FILTERS: LogFilter[] = ["all", "info", "warn", "error"];

    const setShowCrashSync = useCallback((val: boolean) => {
        showCrashRef.current = val;
        setShowCrash(val);
    }, []);

    const SCROLL_STEP = 120;

    const handleInput = useCallback(
        (input: GamepadInput): boolean => {
            if (showCrash) {
                if (input === "UP") {
                    if (crashScrollRef.current)
                        crashScrollRef.current.scrollTop -= SCROLL_STEP;
                    return true;
                }
                if (input === "DOWN") {
                    if (crashScrollRef.current)
                        crashScrollRef.current.scrollTop += SCROLL_STEP;
                    return true;
                }
                if (input === "B" || input === "A") {
                    setShowCrashSync(false);
                    return true;
                }
                return true;
            }
            if (input === "UP") {
                if (scrollRef.current)
                    scrollRef.current.scrollTop -= SCROLL_STEP;
                return true;
            }
            if (input === "DOWN") {
                if (scrollRef.current)
                    scrollRef.current.scrollTop += SCROLL_STEP;
                return true;
            }
            if (input === "LEFT") {
                setFilter((f) => {
                    const i = FILTERS.indexOf(f);
                    return FILTERS[Math.max(i - 1, 0)];
                });
                return true;
            }
            if (input === "RIGHT") {
                setFilter((f) => {
                    const i = FILTERS.indexOf(f);
                    return FILTERS[Math.min(i + 1, FILTERS.length - 1)];
                });
                return true;
            }
            if (input === "Y" && crashReport) {
                setShowCrashSync(true);
                return true;
            }
            if (input === "B") return false;
            return false;
        },
        [showCrash, crashReport, setShowCrashSync],
    ); // intentional: FILTERS/SCROLL_STEP are stable constants // eslint-disable-line react-hooks/exhaustive-deps

    return {
        rawLog,
        filter,
        crashReport,
        showCrash,
        isLoading,
        scrollRef,
        crashScrollRef,
        scrollBy,
        handleInput,
        onSetFilter: setFilter,
        onDismissCrash: () => setShowCrashSync(false),
    };
}
