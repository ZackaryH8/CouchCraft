import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { useGamepad } from "./hooks/useGamepad";
import { useNavStack } from "./hooks/useNavStack";
import { useInstances } from "./hooks/useInstances";
import { useVersionData } from "./hooks/useVersionData";
import { useSettings } from "./hooks/useSettings";
import { useLauncher } from "./hooks/useLauncher";
import { useSidebar } from "./hooks/useSidebar";
import { useUiSound } from "./hooks/useUiSound";
import { useViewportScale } from "./hooks/useViewportScale";
import { useHomePage, HomePage } from "./pages/HomePage";
import { useSettingsPage, SettingsPage } from "./pages/SettingsPage";
import { useCreatePage, CreateInstancePage } from "./pages/CreateInstancePage";
import { useLibraryPage, LibraryPage } from "./pages/LibraryPage";
import { useAccountPage, AccountPage } from "./pages/AccountPage";
import { useUpdatesPage, UpdatesPage } from "./pages/UpdatesPage";
import { useInstancePage, InstancePage } from "./pages/InstancePage";
import { useAuth } from "./hooks/useAuth";
import { useUnlockHold } from "./hooks/useUnlockHold";
import { Sidebar } from "./components/Sidebar";
import { OSK } from "./components/OSK";
import { WelcomeOverlay } from "./components/WelcomeOverlay";
import {
    GameRunningOverlay,
    LaunchingOverlay,
    LaunchErrorOverlay,
} from "./components/LaunchOverlays";
import { GamepadGlyph } from "./components/GamepadGlyph";
import { type ControllerType, type LogicalButton } from "./gamepad/glyphs";
import { buildSettingsSections } from "./constants";
import { formatLastPlayed } from "./utils/format";
import { SplashScreen } from "./components/SplashScreen";
import { useOSK } from "./hooks/useOSK";
import { getPageTitle, getPageDesc } from "./utils/pageHeader";
import { getFooterHints } from "./utils/footerHints";
import type { HapticGamepad } from "./types";

function App() {
    const scale = useViewportScale();
    const [showSplash, setShowSplash] = useState(true);

    // ── data & settings ──────────────────────────────────────────────────────
    const {
        instances,
        loading,
        createInstance,
        updateInstance,
        removeInstance,
        reloadInstance,
    } = useInstances();
    const {
        mcVersions,
        isLoading: versionsLoading,
        fetchLoaderVersions,
    } = useVersionData();
    const {
        uiSoundsEnabled,
        uiSoundVolume,
        controllerLayout,
        isFullscreen,
        motionReduced,
        vibrationEnabled,
        defaultRamMb,
        toggleSounds,
        setVolume,
        setDefaultRamMb,
        toggleControllerLayout,
        toggleFullscreen,
        toggleMotionReduced,
        toggleVibration,
    } = useSettings();
    const controllerType: ControllerType = controllerLayout;
    const {
        isLaunching,
        isGameRunning,
        launchingName,
        progress,
        launchError,
        launchInstance,
        dismissError,
        forceUnlock,
    } = useLauncher({
        onLaunched: (id) => void reloadInstance(id),
        onGameExited: (id) => void reloadInstance(id),
    });
    const { playSound } = useUiSound({
        enabled: uiSoundsEnabled,
        volume: uiSoundVolume,
    });

    // ── navigation ───────────────────────────────────────────────────────────
    const { current, push, pop, reset } = useNavStack({ id: "home" });
    const [globalFocus, setGlobalFocus] = useState<"sidebar" | "page">("page");
    const toSidebar = useCallback(() => setGlobalFocus("sidebar"), []);
    const toPage = useCallback(() => setGlobalFocus("page"), []);

    const sidebar = useSidebar({ reset, toPage, toSidebar });
    const osk = useOSK();

    const { unlockProgress, clearUnlockHold, startUnlockHold } = useUnlockHold({
        isGameRunning,
        forceUnlock,
    });

    // ── page hooks (always mounted so state survives nav) ─────────────────────
    const settingsSections = useMemo(
        () =>
            buildSettingsSections(
                uiSoundsEnabled,
                uiSoundVolume,
                controllerLayout,
                motionReduced,
                vibrationEnabled,
                isFullscreen,
                defaultRamMb,
            ),
        [
            uiSoundsEnabled,
            uiSoundVolume,
            controllerLayout,
            motionReduced,
            vibrationEnabled,
            isFullscreen,
            defaultRamMb,
        ],
    );

    const auth = useAuth();

    const launch = useCallback(
        (
            instance: Parameters<typeof launchInstance>[0],
            opts?: Parameters<typeof launchInstance>[2],
        ) => launchInstance(instance, auth.activeAccount, opts),
        [launchInstance, auth.activeAccount],
    );

    const home = useHomePage({
        instances,
        launchInstance: launch,
        toSidebar,
        push,
    });
    const settings = useSettingsPage({
        sections: settingsSections,
        toSidebar,
        uiSoundsEnabled,
        uiSoundVolume,
        controllerLayout,
        motionReduced,
        vibrationEnabled,
        isFullscreen,
        toggleSounds,
        toggleControllerLayout,
        toggleMotionReduced,
        toggleVibration,
        toggleFullscreen,
        setVolume,
        setDefaultRamMb,
    });
    const createPage = useCreatePage({
        pop,
        onCreated: createInstance,
        openOSK: osk.open,
        mcVersions,
        fetchLoaderVersions,
        defaultRamMb,
    });
    const library = useLibraryPage({
        instances,
        launchInstance: launch,
        updateInstance,
        removeInstance,
        toSidebar,
        push,
        openOSK: osk.open,
    });
    const instancePage = useInstancePage({
        instanceId: current.id === "instance" ? current.instanceId : null,
        instances,
        launchInstance: launch,
        updateInstance,
        removeInstance,
        pop,
        toSidebar,
        openOSK: osk.open,
    });
    const updatesPage = useUpdatesPage({ toSidebar });
    const accountPage = useAccountPage({
        accounts: auth.accounts,
        activeAccountId: auth.activeAccountId,
        signingIn: auth.signingIn,
        deviceCode: auth.deviceCode,
        authError: auth.authError,
        startSignIn: auth.startSignIn,
        cancelSignIn: auth.cancelSignIn,
        switchAccount: auth.switchAccount,
        removeAccount: auth.removeAccount,
        toSidebar,
    });

    // ── quick actions ─────────────────────────────────────────────────────────
    const quickActions = useMemo(
        () => [
            {
                label: "Account",
                value: auth.activeAccount
                    ? auth.activeAccount.mcUsername
                    : "Not signed in",
            },
            { label: "Instances", value: `${instances.length} installed` },
            {
                label: "Last Played",
                value: formatLastPlayed(instances[0]?.lastPlayedAt ?? null),
            },
        ],
        [auth.activeAccount, instances],
    );

    // ── ui sound: play on any nav state change ────────────────────────────────
    const prevNavRef = useRef({
        current,
        globalFocus,
        sidebarIndex: sidebar.sidebarIndex,
    });
    const hasMountedRef = useRef(false);
    useEffect(() => {
        if (!hasMountedRef.current) {
            hasMountedRef.current = true;
            prevNavRef.current = {
                current,
                globalFocus,
                sidebarIndex: sidebar.sidebarIndex,
            };
            return;
        }
        const prev = prevNavRef.current;
        if (
            prev.current !== current ||
            prev.globalFocus !== globalFocus ||
            prev.sidebarIndex !== sidebar.sidebarIndex
        ) {
            playSound();
            prevNavRef.current = {
                current,
                globalFocus,
                sidebarIndex: sidebar.sidebarIndex,
            };
        }
    }, [current, globalFocus, sidebar.sidebarIndex, playSound]);

    // ── haptic ────────────────────────────────────────────────────────────────
    const playUiMoveRumble = useCallback(() => {
        if (isTauri()) {
            void invoke("rumble_gamepad", {
                weakMagnitude: 0.18,
                strongMagnitude: 0.08,
                durationMs: 16,
            }).catch(() => {});
            return;
        }
        if (
            typeof navigator === "undefined" ||
            typeof navigator.getGamepads !== "function"
        )
            return;
        const gamepad = Array.from(navigator.getGamepads()).find(
            (pad): pad is HapticGamepad => Boolean(pad),
        );
        if (!gamepad) return;
        const fallback = gamepad.hapticActuators?.[0];
        if (fallback?.pulse) {
            void fallback.pulse(0.35, 30).catch(() => {});
            return;
        }
        if (gamepad.vibrationActuator?.playEffect) {
            void gamepad.vibrationActuator
                .playEffect("dual-rumble", {
                    startDelay: 0,
                    duration: 16,
                    weakMagnitude: 0.18,
                    strongMagnitude: 0.08,
                })
                .catch(() => {});
        }
    }, []);

    // ── first-launch welcome ──────────────────────────────────────────────────
    const showWelcome =
        auth.status === "ready" && auth.accounts.length === 0 && !showSplash;

    // ── input routing ─────────────────────────────────────────────────────────
    const handleInput = useCallback(
        (raw: Parameters<typeof home.handleInput>[0]) => {
            // On Linux, Xbox controllers fire BTN_WEST for physical Y and BTN_NORTH for physical X.
            const input =
                controllerType === "xbox" && (raw === "X" || raw === "Y")
                    ? raw === "X"
                        ? "Y"
                        : "X"
                    : raw;
            if (showWelcome) {
                if (auth.signingIn) {
                    if (input === "B" || input === "A") auth.cancelSignIn();
                } else {
                    if (input === "A") void auth.startSignIn();
                }
                return;
            }
            if (isGameRunning) {
                if (input === "START") startUnlockHold();
                return;
            }
            if (launchError) {
                if (input === "B" || input === "A") dismissError();
                return;
            }
            if (osk.isOpenRef.current) {
                osk.handleInput(input);
                return;
            }
            if (
                vibrationEnabled &&
                ["UP", "DOWN", "LEFT", "RIGHT"].includes(input)
            )
                playUiMoveRumble();
            if (globalFocus === "sidebar") sidebar.handleInput(input);
            else if (current.id === "home") home.handleInput(input);
            else if (current.id === "settings") settings.handleInput(input);
            else if (current.id === "create") createPage.handleInput(input);
            else if (current.id === "library") library.handleInput(input);
            else if (current.id === "instance") instancePage.handleInput(input);
            else if (current.id === "account") accountPage.handleInput(input);
            else if (current.id === "updates") updatesPage.handleInput(input);
        },
        [
            controllerType,
            showWelcome,
            auth.signingIn,
            auth.cancelSignIn,
            auth.startSignIn,
            isGameRunning,
            startUnlockHold,
            launchError,
            dismissError,
            osk.handleInput,
            vibrationEnabled,
            playUiMoveRumble,
            globalFocus,
            current.id,
            sidebar,
            home,
            settings,
            createPage,
            library,
            instancePage,
            accountPage,
            updatesPage,
        ],
    );

    const handleRelease = useCallback(
        (input: Parameters<typeof handleInput>[0]) => {
            if (input === "START") clearUnlockHold();
        },
        [clearUnlockHold],
    );

    const handleRightStick = useCallback(
        (ry: number) => {
            if (current.id === "instance" && instancePage.activeTab === 8) {
                instancePage.logsTab.scrollBy(ry * 18);
            }
        },
        [current.id, instancePage.activeTab, instancePage.logsTab.scrollBy],
    );

    useGamepad(handleInput, handleRelease, handleRightStick);

    // ── derived ───────────────────────────────────────────────────────────────
    const instanceName =
        current.id === "instance"
            ? (instances.find((i) => i.id === current.instanceId)?.name ??
              "Instance")
            : "";
    const pageTitle = getPageTitle(current.id, instanceName);
    const pageDesc = getPageDesc(current.id);
    const footerHints = getFooterHints({
        isGameRunning,
        launchError,
        oskIsOpen: osk.isOpen,
        currentId: current.id,
        instancePage,
        createStep: createPage.createStep,
    });

    // ── render ────────────────────────────────────────────────────────────────
    return (
        <div className="fixed inset-0 overflow-hidden bg-[#0b0d0c]">
            <main
                className="overflow-hidden bg-[#0b0d0c] text-stone-100"
                data-reduced-motion={motionReduced ? "" : undefined}
                style={{
                    width: 1920,
                    height: 1080,
                    transform: `scale(${scale})`,
                    transformOrigin: "top left",
                }}
            >
                {showSplash && (
                    <SplashScreen onDone={() => setShowSplash(false)} />
                )}
                {showWelcome && (
                    <WelcomeOverlay
                        signingIn={auth.signingIn}
                        deviceCode={auth.deviceCode}
                        authError={auth.authError}
                        onSignIn={() => void auth.startSignIn()}
                        onCancel={auth.cancelSignIn}
                        controllerType={controllerType}
                    />
                )}
                {osk.isOpen && (
                    <OSK
                        label={osk.label}
                        value={osk.value}
                        cursorPos={osk.cursorPos}
                        focus={osk.focus}
                        isShift={osk.isShift}
                        flashKey={osk.flashKey}
                        controllerType={controllerType}
                    />
                )}
                {isGameRunning && (
                    <GameRunningOverlay
                        unlockProgress={unlockProgress}
                        controllerType={controllerType}
                    />
                )}
                {isLaunching && (
                    <LaunchingOverlay
                        launchingName={launchingName}
                        progress={progress}
                    />
                )}
                {launchError && (
                    <LaunchErrorOverlay
                        launchError={launchError}
                        onDismiss={dismissError}
                    />
                )}

                <div className="relative flex h-full gap-8 px-8 py-8">
                    <Sidebar
                        sidebarIndex={sidebar.sidebarIndex}
                        globalFocus={globalFocus}
                        sidebarRefs={sidebar.sidebarRefs}
                        onClickItem={sidebar.onClickItem}
                        onHoverItem={sidebar.onHoverItem}
                    />

                    <div className="flex min-w-0 flex-1 flex-col gap-4">
                        <section className="relative flex flex-1 flex-col gap-7 overflow-y-auto pr-2 pt-2">
                            <header className="flex items-start justify-between gap-6">
                                <div>
                                    <h1 className="font-display text-6xl leading-none tracking-[-0.08em] text-white">
                                        {pageTitle}
                                    </h1>
                                    <p className="mt-4 max-w-3xl text-xl leading-8 text-stone-300/75">
                                        {pageDesc}
                                    </p>
                                </div>

                                <div className="flex min-w-[28rem] items-start justify-end gap-4">
                                    <div className="simple-panel flex min-w-[16rem] flex-col rounded-[1.4rem] px-5 py-4 text-right">
                                        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-stone-500">
                                            Active controller
                                        </p>
                                        <p className="mt-2 text-2xl font-semibold text-white">
                                            {controllerType === "xbox"
                                                ? "Xbox Wireless"
                                                : "DualSense"}
                                        </p>
                                    </div>
                                    <div className="simple-panel flex min-w-[20rem] flex-col rounded-[1.4rem] px-5 py-4 text-right">
                                        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-stone-500">
                                            Microsoft account
                                        </p>
                                        {auth.activeAccount ? (
                                            <>
                                                <p className="mt-2 text-2xl font-semibold text-white">
                                                    {
                                                        auth.activeAccount
                                                            .mcUsername
                                                    }
                                                </p>
                                                <p className="mt-2 text-sm text-lime-300">
                                                    {auth.accounts.length > 1
                                                        ? `${auth.accounts.length} accounts`
                                                        : "Connected"}
                                                </p>
                                            </>
                                        ) : (
                                            <p className="mt-2 text-lg font-semibold text-stone-500">
                                                Not signed in
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </header>

                            {loading ? (
                                <div className="flex flex-1 items-center justify-center">
                                    <div className="h-14 w-14 animate-spin rounded-full border-[5px] border-lime-300/90 border-t-transparent" />
                                </div>
                            ) : (
                                <>
                                    {current.id === "home" &&
                                        home.selectedInstance && (
                                            <HomePage
                                                instances={instances}
                                                selectedInstance={
                                                    home.selectedInstance
                                                }
                                                activeIndex={home.activeIndex}
                                                homeFocus={home.homeFocus}
                                                hasFocus={
                                                    globalFocus === "page"
                                                }
                                                account={auth.activeAccount}
                                                quickActions={quickActions}
                                                heroRef={home.heroRef}
                                                gridRef={home.gridRef}
                                                instanceRefs={home.instanceRefs}
                                                onMoveToHero={home.onMoveToHero}
                                                onMoveToGrid={home.onMoveToGrid}
                                                onLaunch={launch}
                                                onCreateNew={() =>
                                                    push({ id: "create" })
                                                }
                                            />
                                        )}

                                    {current.id === "library" && (
                                        <LibraryPage
                                            instances={instances}
                                            selectedIndex={
                                                library.selectedIndex
                                            }
                                            libFocus={library.libFocus}
                                            actionIndex={library.actionIndex}
                                            overlay={library.overlay}
                                            colorIndex={library.colorIndex}
                                            deleteChoice={library.deleteChoice}
                                            selectedInstance={
                                                library.selectedInstance
                                            }
                                            listRefs={library.listRefs}
                                            hasFocus={globalFocus === "page"}
                                            onSelectInstance={
                                                library.onSelectInstance
                                            }
                                            onSetLibFocus={
                                                library.onSetLibFocus
                                            }
                                            onCreateNew={() =>
                                                push({ id: "create" })
                                            }
                                        />
                                    )}

                                    {current.id === "settings" && (
                                        <SettingsPage
                                            sections={settingsSections}
                                            sectionIndex={settings.sectionIndex}
                                            itemIndex={settings.itemIndex}
                                            settingsFocus={
                                                settings.settingsFocus
                                            }
                                            overlay={settings.overlay}
                                            draftToggle={settings.draftToggle}
                                            draftVolume={settings.draftVolume}
                                            draftSelectIndex={
                                                settings.draftSelectIndex
                                            }
                                            selectedSection={
                                                settings.selectedSection
                                            }
                                            selectedItem={settings.selectedItem}
                                            hasFocus={globalFocus === "page"}
                                            sectionRefs={settings.sectionRefs}
                                            itemRefs={settings.itemRefs}
                                            onSelectSection={
                                                settings.onSelectSection
                                            }
                                            onSelectItem={settings.onSelectItem}
                                            onSetFocus={settings.onSetFocus}
                                            onOpenOverlay={
                                                settings.onOpenOverlay
                                            }
                                        />
                                    )}

                                    {current.id === "create" && (
                                        <CreateInstancePage
                                            step={createPage.createStep}
                                            effectiveSteps={
                                                createPage.effectiveSteps
                                            }
                                            focusedIndex={
                                                createPage.createItemIndex
                                            }
                                            draftLoader={createPage.draftLoader}
                                            draftVersion={
                                                createPage.draftVersion
                                            }
                                            draftLoaderVersion={
                                                createPage.draftLoaderVersion
                                            }
                                            draftColor={createPage.draftColor}
                                            draftName={createPage.draftName}
                                            mcVersions={
                                                createPage.filteredMcVersions
                                            }
                                            loaderVersions={
                                                createPage.filteredLoaderVersions
                                            }
                                            showSnapshots={
                                                createPage.showSnapshots
                                            }
                                            showOnlyStable={
                                                createPage.showOnlyStable
                                            }
                                            isLoadingMcVersions={
                                                versionsLoading
                                            }
                                            isLoadingLoaderVersions={
                                                createPage.isLoadingLoaderVersions
                                            }
                                            modpackQuery={
                                                createPage.modpackQuery
                                            }
                                            modpackResults={
                                                createPage.modpackResults
                                            }
                                            modpackLoading={
                                                createPage.modpackLoading
                                            }
                                            selectedModpack={
                                                createPage.selectedModpack
                                            }
                                            modpackVersions={
                                                createPage.modpackVersions
                                            }
                                            modpackVersionsLoading={
                                                createPage.modpackVersionsLoading
                                            }
                                            importFiles={createPage.importFiles}
                                            importLoading={
                                                createPage.importLoading
                                            }
                                            isInstalling={
                                                createPage.isInstalling
                                            }
                                            installProgress={
                                                createPage.installProgress
                                            }
                                            installError={
                                                createPage.installError
                                            }
                                            hasFocus={globalFocus === "page"}
                                            onMoveFocus={createPage.onMoveFocus}
                                            onSelect={createPage.onSelect}
                                            onDismissError={
                                                createPage.onDismissError
                                            }
                                        />
                                    )}

                                    {current.id === "instance" && (
                                        <InstancePage
                                            instance={instancePage.instance}
                                            activeTab={instancePage.activeTab}
                                            availableTabs={
                                                instancePage.availableTabs
                                            }
                                            actionIndex={
                                                instancePage.actionIndex
                                            }
                                            overlay={instancePage.overlay}
                                            colorIndex={instancePage.colorIndex}
                                            ramIndex={instancePage.ramIndex}
                                            deleteChoice={
                                                instancePage.deleteChoice
                                            }
                                            contentTabs={
                                                instancePage.contentTabs
                                            }
                                            filesTab={instancePage.filesTab}
                                            worldsTab={instancePage.worldsTab}
                                            serversTab={instancePage.serversTab}
                                            logsTab={instancePage.logsTab}
                                            hasFocus={globalFocus === "page"}
                                            onSelectTab={
                                                instancePage.onSelectTab
                                            }
                                            onSelectAction={
                                                instancePage.onSelectAction
                                            }
                                        />
                                    )}

                                    {current.id === "account" && (
                                        <AccountPage
                                            accounts={auth.accounts}
                                            activeAccountId={
                                                auth.activeAccountId
                                            }
                                            signingIn={auth.signingIn}
                                            deviceCode={auth.deviceCode}
                                            authError={auth.authError}
                                            items={accountPage.items}
                                            focusedIndex={
                                                accountPage.focusedIndex
                                            }
                                            actionIndex={
                                                accountPage.actionIndex
                                            }
                                            hasFocus={globalFocus === "page"}
                                            onMoveFocus={
                                                accountPage.setFocusedIndex
                                            }
                                            onSetActionIndex={
                                                accountPage.setActionIndex
                                            }
                                            onSignIn={() =>
                                                void auth.startSignIn()
                                            }
                                            onCancel={auth.cancelSignIn}
                                            onSwitch={(id) =>
                                                void auth.switchAccount(id)
                                            }
                                            onRemove={(id) =>
                                                void auth.removeAccount(id)
                                            }
                                        />
                                    )}

                                    {current.id === "updates" && (
                                        <UpdatesPage
                                            hasFocus={globalFocus === "page"}
                                        />
                                    )}
                                </>
                            )}
                        </section>

                        <footer className="relative z-[60] flex-none">
                            <div className="simple-panel flex items-center justify-between rounded-[1.4rem] px-6 py-4">
                                <div className="flex items-center gap-8 text-lg font-semibold text-stone-300">
                                    {footerHints.map(({ btns, label }, i) => (
                                        <div
                                            key={i}
                                            className="flex items-center gap-3"
                                        >
                                            {btns.map((b) => (
                                                <GamepadGlyph
                                                    key={b}
                                                    controller={controllerType}
                                                    button={b as LogicalButton}
                                                />
                                            ))}
                                            <span>{label}</span>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-sm font-semibold uppercase tracking-[0.35em] text-stone-500">
                                    Focus: {globalFocus} · {current.id}
                                </p>
                            </div>
                        </footer>
                    </div>
                </div>
            </main>
        </div>
    );
}

export default App;
