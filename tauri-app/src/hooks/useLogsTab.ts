import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { GamepadInput } from "./useGamepad";

export type LogFilter = "all" | "info" | "warn" | "error";

export interface LogsTabState {
  rawLog: string;
  filter: LogFilter;
  crashReport: string | null;
  showCrash: boolean;
  isLoading: boolean;
  handleInput: (input: GamepadInput) => boolean;
  onSetFilter: (f: LogFilter) => void;
  onDismissCrash: () => void;
}

export function useLogsTab(instanceId: string | null, isActive: boolean): LogsTabState {
  const [rawLog, setRawLog]         = useState("");
  const [filter, setFilter]         = useState<LogFilter>("all");
  const [crashReport, setCrash]     = useState<string | null>(null);
  const [showCrash, setShowCrash]   = useState(false);
  const [isLoading, setIsLoading]   = useState(false);

  useEffect(() => {
    if (!instanceId || !isActive) return;
    setIsLoading(true);
    Promise.all([
      invoke<string>("read_instance_log", { instanceId }),
      invoke<string | null>("get_latest_crash_report", { instanceId }),
    ]).then(([log, crash]) => {
      setRawLog(log);
      setCrash(crash);
      setShowCrash(!!crash);
    }).catch(() => {
      setRawLog("");
      setCrash(null);
    }).finally(() => setIsLoading(false));
  }, [instanceId, isActive]); // eslint-disable-line react-hooks/exhaustive-deps

  const FILTERS: LogFilter[] = ["all", "info", "warn", "error"];

  const handleInput = useCallback((input: GamepadInput): boolean => {
    if (showCrash) {
      if (input === "B" || input === "A") { setShowCrash(false); return true; }
      return true;
    }
    if (input === "LEFT") {
      setFilter((f) => { const i = FILTERS.indexOf(f); return FILTERS[Math.max(i - 1, 0)]; });
      return true;
    }
    if (input === "RIGHT") {
      setFilter((f) => { const i = FILTERS.indexOf(f); return FILTERS[Math.min(i + 1, FILTERS.length - 1)]; });
      return true;
    }
    if (input === "Y" && crashReport) { setShowCrash(true); return true; }
    if (input === "B") return false;
    return false;
  }, [showCrash, crashReport]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    rawLog, filter, crashReport, showCrash, isLoading,
    handleInput,
    onSetFilter: setFilter,
    onDismissCrash: () => setShowCrash(false),
  };
}
