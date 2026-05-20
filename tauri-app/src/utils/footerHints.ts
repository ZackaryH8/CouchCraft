import type { LogicalButton } from "../gamepad/glyphs";
import type { ContentTabState } from "../hooks/useContentTab";
import type { FilesTabState } from "../hooks/useFilesTab";
import type { LogsTabState } from "../hooks/useLogsTab";

export type FooterHint = { btns: LogicalButton[]; label: string };

export interface FooterHintsOptions {
    isGameRunning: boolean;
    launchError: string | null;
    oskIsOpen: boolean;
    currentId: string;
    instancePage: {
        activeTab: number;
        overlay: string;
        contentTabs: ContentTabState[];
        filesTab: FilesTabState;
        logsTab: LogsTabState;
    };
    createStep: string;
}

export function getFooterHints({
    isGameRunning,
    launchError,
    oskIsOpen,
    currentId,
    instancePage,
    createStep,
}: FooterHintsOptions): FooterHint[] {
    const lbrb: LogicalButton[] = ["lb", "rb"];

    if (isGameRunning) return [{ btns: ["start"], label: "Hold to Unlock" }];
    if (launchError) return [{ btns: ["east"], label: "Dismiss" }];
    if (oskIsOpen)
        return [
            { btns: ["start"], label: "Done" },
            { btns: ["east"], label: "Cancel" },
            { btns: ["north"], label: "Space" },
            { btns: ["west"], label: "Delete" },
            { btns: ["lb", "rb"], label: "Cursor" },
        ];

    if (currentId === "instance") {
        const tabBtn: FooterHint = { btns: lbrb, label: "Tab" };
        const t = instancePage.activeTab;

        if (instancePage.overlay === "delete")
            return [
                tabBtn,
                { btns: ["south"], label: "Confirm" },
                { btns: ["east"], label: "Cancel" },
            ];
        if (instancePage.overlay !== "none")
            return [
                tabBtn,
                { btns: ["south"], label: "Apply" },
                { btns: ["east"], label: "Cancel" },
                { btns: ["dpad"], label: "Navigate" },
            ];

        if (t >= 1 && t <= 4) {
            const ct = instancePage.contentTabs[t - 1];
            if (ct.deleteOverlay)
                return [
                    tabBtn,
                    { btns: ["south"], label: "Confirm" },
                    { btns: ["east"], label: "Cancel" },
                ];
            if (ct.versionOverlay)
                return [
                    tabBtn,
                    { btns: ["south"], label: "Install" },
                    { btns: ["east"], label: "Cancel" },
                ];
            if (ct.view === "browse")
                return [
                    tabBtn,
                    { btns: ["south"], label: "Install" },
                    { btns: ["east"], label: "Back" },
                    { btns: ["north"], label: "Search" },
                ];
            return [
                tabBtn,
                { btns: ["south"], label: "Toggle" },
                { btns: ["east"], label: "Back" },
                { btns: ["west"], label: "Delete" },
                { btns: ["north"], label: "Browse" },
            ];
        }
        if (t === 5) {
            if (instancePage.filesTab.deleteOverlay)
                return [
                    tabBtn,
                    { btns: ["south"], label: "Confirm" },
                    { btns: ["east"], label: "Cancel" },
                ];
            return [
                tabBtn,
                { btns: ["south"], label: "Open" },
                { btns: ["east"], label: "Up / Back" },
                { btns: ["west"], label: "Rename" },
                { btns: ["north"], label: "Delete" },
            ];
        }
        if (t === 6)
            return [
                tabBtn,
                { btns: ["south"], label: "Quick-play" },
                { btns: ["east"], label: "Back" },
            ];
        if (t === 7)
            return [
                tabBtn,
                { btns: ["south"], label: "Connect" },
                { btns: ["east"], label: "Back" },
            ];
        if (t === 8) {
            if (instancePage.logsTab.showCrash)
                return [
                    tabBtn,
                    { btns: ["east"], label: "Dismiss" },
                    { btns: ["dpad"], label: "Scroll" },
                ];
            const logHints: FooterHint[] = [
                tabBtn,
                { btns: ["east"], label: "Back" },
                { btns: ["dpad"], label: "Scroll / Filter" },
            ];
            if (instancePage.logsTab.crashReport)
                logHints.push({ btns: ["north"], label: "Crash Report" });
            return logHints;
        }
        return [
            tabBtn,
            { btns: ["south"], label: "Confirm" },
            { btns: ["east"], label: "Back" },
            { btns: ["dpad"], label: "Navigate" },
        ];
    }

    if (currentId === "create") {
        const hints: FooterHint[] = [
            { btns: ["south"], label: "Confirm" },
            { btns: ["east"], label: "Back" },
            { btns: ["dpad"], label: "Navigate" },
        ];
        if (createStep === "version")
            hints.push({ btns: ["west"], label: "Snapshots" });
        else if (createStep === "loader_version")
            hints.push({ btns: ["west"], label: "Stable Only" });
        else if (createStep === "modpack_search")
            hints.push({ btns: ["west"], label: "Search" });
        return hints;
    }

    const aLabel =
        currentId === "settings"
            ? "Select"
            : currentId === "library"
              ? "Action"
              : currentId === "account"
                ? "Sign In"
                : currentId === "updates"
                  ? "Refresh"
                  : "Launch";
    return [
        { btns: ["south"], label: aLabel },
        { btns: ["east"], label: "Back" },
        { btns: ["dpad"], label: "Navigate" },
    ];
}
