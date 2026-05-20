import type { ReactNode } from "react";

export function getPageTitle(
    currentId: string,
    instanceName: string,
): ReactNode {
    if (currentId === "instance") return instanceName.toUpperCase();
    if (currentId === "settings") return "SETTINGS";
    if (currentId === "create")
        return (
            <>
                CREATE <span className="text-lime-300">INSTANCE</span>
            </>
        );
    if (currentId === "library")
        return (
            <>
                INSTANCE <span className="text-lime-300">LIBRARY</span>
            </>
        );
    if (currentId === "account")
        return (
            <>
                MICROSOFT <span className="text-lime-300">ACCOUNT</span>
            </>
        );
    if (currentId === "updates")
        return (
            <>
                UPDATES <span className="text-lime-300">&amp; ASSETS</span>
            </>
        );
    return (
        <>
            COUCH<span className="text-lime-300">CRAFT</span>
        </>
    );
}

export function getPageDesc(currentId: string): string {
    if (currentId === "instance")
        return "Manage mods, settings, files, worlds, and logs for this instance.";
    if (currentId === "settings")
        return "Launcher, display, and controller preferences.";
    if (currentId === "create")
        return "Choose a loader, version, and color to add a new Minecraft instance.";
    if (currentId === "library")
        return "Browse, launch, recolor, and delete your Minecraft instances.";
    if (currentId === "account")
        return "Sign in with Microsoft to launch Minecraft with your profile.";
    if (currentId === "updates")
        return "Check for asset, library, and mod pack updates.";
    return "Browse instances, launch profiles, and manage your Minecraft setup with gamepad-friendly navigation.";
}
