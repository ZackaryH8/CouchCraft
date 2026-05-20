import { useState, useCallback, useEffect, useRef } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { SIDEBAR_ITEMS } from "../constants";
import type { NavFrame } from "../types";
import type { GamepadInput } from "./useGamepad";

interface UseSidebarOptions {
    reset: (frame: NavFrame) => void;
    toPage: () => void;
    toSidebar: () => void;
}

function frameForLabel(label: string): NavFrame {
    if (label === "Settings") return { id: "settings" };
    if (label === "Library") return { id: "library" };
    if (label === "Account") return { id: "account" };
    if (label === "Updates") return { id: "updates" };
    return { id: "home" };
}

export function useSidebar({ reset, toPage, toSidebar }: UseSidebarOptions) {
    const [sidebarIndex, setSidebarIndex] = useState(0);
    const sidebarRefs = useRef<Array<HTMLDivElement | null>>([]);

    useEffect(() => {
        sidebarRefs.current[sidebarIndex]?.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
            inline: "nearest",
        });
    }, [sidebarIndex]);

    const navigate = useCallback(
        (label: string) => {
            if (label === "Quit") {
                if (isTauri()) void invoke("quit_app");
                return;
            }
            reset(frameForLabel(label));
            toPage();
        },
        [reset, toPage],
    );

    const handleInput = useCallback(
        (input: GamepadInput) => {
            switch (input) {
                case "UP":
                    setSidebarIndex((i) => Math.max(i - 1, 0));
                    break;
                case "DOWN":
                    setSidebarIndex((i) =>
                        Math.min(i + 1, SIDEBAR_ITEMS.length - 1),
                    );
                    break;
                case "RIGHT":
                case "A":
                    navigate(SIDEBAR_ITEMS[sidebarIndex].label);
                    break;
            }
        },
        [sidebarIndex, navigate],
    );

    const onClickItem = useCallback(
        (i: number) => {
            setSidebarIndex(i);
            navigate(SIDEBAR_ITEMS[i].label);
        },
        [navigate],
    );

    const onHoverItem = useCallback(
        (i: number) => {
            setSidebarIndex(i);
            toSidebar();
        },
        [toSidebar],
    );

    return { sidebarIndex, sidebarRefs, handleInput, onClickItem, onHoverItem };
}
