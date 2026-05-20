import { useState, useCallback } from "react";
import type { NavFrame } from "../types";

export type NavStack = {
    current: NavFrame;
    canGoBack: boolean;
    push: (frame: NavFrame) => void;
    pop: () => void;
    replace: (frame: NavFrame) => void;
    reset: (frame: NavFrame) => void;
};

export function useNavStack(initial: NavFrame = { id: "home" }): NavStack {
    const [stack, setStack] = useState<NavFrame[]>([initial]);

    const push = useCallback(
        (frame: NavFrame) => setStack((p) => [...p, frame]),
        [],
    );
    const pop = useCallback(
        () => setStack((p) => (p.length > 1 ? p.slice(0, -1) : p)),
        [],
    );
    const replace = useCallback(
        (frame: NavFrame) => setStack((p) => [...p.slice(0, -1), frame]),
        [],
    );
    const reset = useCallback((frame: NavFrame) => setStack([frame]), []);

    return {
        current: stack[stack.length - 1],
        canGoBack: stack.length > 1,
        push,
        pop,
        replace,
        reset,
    };
}
