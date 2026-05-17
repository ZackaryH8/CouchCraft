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
import { useAuth, type DeviceCodeInfo } from "./hooks/useAuth";
import { Sidebar } from "./components/Sidebar";
import { OSK } from "./components/OSK";
import { GamepadGlyph } from "./components/GamepadGlyph";
import { inputToGlyph, type ControllerType } from "./gamepad/glyphs";
import type { HapticGamepad } from "./types";
import { buildSettingsSections } from "./constants";
import { formatLastPlayed } from "./utils/format";
import { SplashScreen } from "./components/SplashScreen";
import { useOSK } from "./hooks/useOSK";

function App() {
  const scale = useViewportScale();
  const [showSplash, setShowSplash] = useState(true);

  // ── data & settings ──────────────────────────────────────────────────────
  const { instances, loading, createInstance, updateInstance, removeInstance, reloadInstance } = useInstances();
  const { mcVersions, isLoading: versionsLoading, fetchLoaderVersions } = useVersionData();
  const {
    uiSoundsEnabled, uiSoundVolume, controllerLayout,
    isFullscreen, motionReduced, vibrationEnabled,
    toggleSounds, setVolume, toggleControllerLayout,
    toggleFullscreen, toggleMotionReduced, toggleVibration,
  } = useSettings();
  const controllerType: ControllerType = controllerLayout;
  const { isLaunching, isGameRunning, launchingName, progress, launchError, launchInstance, dismissError, forceUnlock } = useLauncher({
    onLaunched: (id) => void reloadInstance(id),
    onGameExited: (id) => void reloadInstance(id),
  });
  const { playSound } = useUiSound({ enabled: uiSoundsEnabled, volume: uiSoundVolume });

  // ── navigation ───────────────────────────────────────────────────────────
  const { current, push, pop, reset } = useNavStack({ id: "home" });
  const [globalFocus, setGlobalFocus] = useState<"sidebar" | "page">("page");
  const toSidebar = useCallback(() => setGlobalFocus("sidebar"), []);
  const toPage = useCallback(() => setGlobalFocus("page"), []);

  const sidebar = useSidebar({ reset, toPage, toSidebar });
  const osk = useOSK();

  // Hold START for 5 s while game is running to force-unlock the UI
  const HOLD_DURATION_MS = 5000;
  const [unlockProgress, setUnlockProgress] = useState(0); // 0–1
  const holdStartRef = useRef<number | null>(null);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearUnlockHold = useCallback(() => {
    holdStartRef.current = null;
    if (holdIntervalRef.current) { clearInterval(holdIntervalRef.current); holdIntervalRef.current = null; }
    setUnlockProgress(0);
  }, []);

  useEffect(() => {
    if (!isGameRunning) clearUnlockHold();
  }, [isGameRunning, clearUnlockHold]);

  // ── page hooks (always mounted so state survives nav) ─────────────────────
  const settingsSections = useMemo(
    () => buildSettingsSections(uiSoundsEnabled, uiSoundVolume, controllerLayout, motionReduced, vibrationEnabled, isFullscreen),
    [uiSoundsEnabled, uiSoundVolume, controllerLayout, motionReduced, vibrationEnabled, isFullscreen],
  );

  const auth = useAuth();

  // Bind active account so page hooks don't need to know about auth
  const launch = useCallback(
    (instance: Parameters<typeof launchInstance>[0], opts?: Parameters<typeof launchInstance>[2]) =>
      launchInstance(instance, auth.activeAccount, opts),
    [launchInstance, auth.activeAccount],
  );

  const home = useHomePage({ instances, launchInstance: launch, toSidebar, push });
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
  });
  const createPage = useCreatePage({
    pop,
    onCreated: createInstance,
    openOSK: osk.open,
    mcVersions,
    fetchLoaderVersions,
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

  // ── quick actions (real state) ────────────────────────────────────────────
  const quickActions = useMemo(
    () => [
      { label: "Account", value: auth.activeAccount ? auth.activeAccount.mcUsername : "Not signed in" },
      { label: "Instances", value: `${instances.length} installed` },
      { label: "Last Played", value: formatLastPlayed(instances[0]?.lastPlayedAt ?? null) },
    ],
    [auth.activeAccount, instances],
  );

  // ── ui sound: play on any nav state change ────────────────────────────────
  const prevNavRef = useRef({ current, globalFocus, sidebarIndex: sidebar.sidebarIndex });
  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      prevNavRef.current = { current, globalFocus, sidebarIndex: sidebar.sidebarIndex };
      return;
    }
    const prev = prevNavRef.current;
    if (
      prev.current !== current ||
      prev.globalFocus !== globalFocus ||
      prev.sidebarIndex !== sidebar.sidebarIndex
    ) {
      playSound();
      prevNavRef.current = { current, globalFocus, sidebarIndex: sidebar.sidebarIndex };
    }
  }, [current, globalFocus, sidebar.sidebarIndex, playSound]);

  // ── haptic (wired up once rumble pulse is fixed) ──────────────────────────
  const playUiMoveRumble = useCallback(() => {
    if (isTauri()) {
      void invoke("rumble_gamepad", {
        weakMagnitude: 0.18,
        strongMagnitude: 0.08,
        durationMs: 16,
      }).catch(() => {});
      return;
    }
    if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") return;
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

  // ── first-launch welcome (no accounts yet) ───────────────────────────────
  const showWelcome = auth.status === "ready" && auth.accounts.length === 0 && !showSplash;

  // ── input routing ─────────────────────────────────────────────────────────
  const handleInput = useCallback(
    (input: Parameters<typeof home.handleInput>[0]) => {
      if (showWelcome) {
        if (auth.signingIn) {
          if (input === "B" || input === "A") auth.cancelSignIn();
        } else {
          if (input === "A") void auth.startSignIn();
        }
        return;
      }
      if (isGameRunning) {
        if (input === "START" && holdStartRef.current === null) {
          holdStartRef.current = Date.now();
          holdIntervalRef.current = setInterval(() => {
            const elapsed = Date.now() - (holdStartRef.current ?? Date.now());
            const p = Math.min(elapsed / HOLD_DURATION_MS, 1);
            setUnlockProgress(p);
            if (p >= 1) { clearUnlockHold(); forceUnlock(); }
          }, 50);
        }
        return;
      }
      if (launchError) { if (input === "B" || input === "A") dismissError(); return; }
      if (osk.isOpenRef.current) { osk.handleInput(input); return; }
      if (vibrationEnabled && ["UP", "DOWN", "LEFT", "RIGHT"].includes(input)) {
        playUiMoveRumble();
      }
      if (globalFocus === "sidebar") sidebar.handleInput(input);
      else if (current.id === "home") home.handleInput(input);
      else if (current.id === "settings") settings.handleInput(input);
      else if (current.id === "create") createPage.handleInput(input);
      else if (current.id === "library") library.handleInput(input);
      else if (current.id === "instance") instancePage.handleInput(input);
      else if (current.id === "account") accountPage.handleInput(input);
      else if (current.id === "updates") updatesPage.handleInput(input);
    },
    [showWelcome, auth.signingIn, auth.cancelSignIn, auth.startSignIn, isGameRunning, forceUnlock, clearUnlockHold, launchError, dismissError, osk.handleInput, vibrationEnabled, playUiMoveRumble, globalFocus, current.id, sidebar, home, settings, createPage, library, instancePage, accountPage, updatesPage],
  );

  const handleRelease = useCallback((input: Parameters<typeof handleInput>[0]) => {
    if (input === "START") clearUnlockHold();
  }, [clearUnlockHold]);

  const handleRightStick = useCallback((ry: number) => {
    if (current.id === "instance" && instancePage.activeTab === 8) {
      instancePage.logsTab.scrollBy(ry * 18);
    }
  }, [current.id, instancePage.activeTab, instancePage.logsTab.scrollBy]);

  useGamepad(handleInput, handleRelease, handleRightStick);

  // ── page header ───────────────────────────────────────────────────────────
  const instanceName = current.id === "instance"
    ? (instances.find((i) => i.id === current.instanceId)?.name ?? "Instance")
    : "";

  const pageTitle =
    current.id === "instance" ? (
      instanceName.toUpperCase()
    ) : current.id === "settings" ? (
      "SETTINGS"
    ) : current.id === "create" ? (
      <>
        CREATE <span className="text-lime-300">INSTANCE</span>
      </>
    ) : current.id === "library" ? (
      <>
        INSTANCE <span className="text-lime-300">LIBRARY</span>
      </>
    ) : current.id === "account" ? (
      <>
        MICROSOFT <span className="text-lime-300">ACCOUNT</span>
      </>
    ) : current.id === "updates" ? (
      <>
        UPDATES <span className="text-lime-300">&amp; ASSETS</span>
      </>
    ) : (
      <>
        COUCH<span className="text-lime-300">CRAFT</span>
      </>
    );

  const pageDesc =
    current.id === "instance"
      ? "Manage mods, settings, files, worlds, and logs for this instance."
      : current.id === "settings"
      ? "Launcher, display, and controller preferences."
      : current.id === "create"
        ? "Choose a loader, version, and color to add a new Minecraft instance."
        : current.id === "library"
          ? "Browse, launch, recolor, and delete your Minecraft instances."
          : current.id === "account"
            ? "Sign in with Microsoft to launch Minecraft with your profile."
            : current.id === "updates"
              ? "Check for asset, library, and mod pack updates."
              : "Browse instances, launch profiles, and manage your Minecraft setup with gamepad-friendly navigation.";

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 overflow-hidden bg-[#0b0d0c]">
    <main
      className="overflow-hidden bg-[#0b0d0c] text-stone-100"
      data-reduced-motion={motionReduced ? "" : undefined}
      style={{ width: 1920, height: 1080, transform: `scale(${scale})`, transformOrigin: "top left" }}
    >
      {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
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
      {osk.isOpen && <OSK value={osk.value} cursorPos={osk.cursorPos} focus={osk.focus} isShift={osk.isShift} flashKey={osk.flashKey} controllerType={controllerType} />}
      {isGameRunning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
          <div className="simple-panel flex min-w-[40rem] flex-col items-center gap-6 rounded-[2rem] px-14 py-12 text-center">
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 animate-pulse rounded-full bg-lime-300" />
              <p className="text-xs font-semibold uppercase tracking-[0.5em] text-lime-300/70">Game Running</p>
            </div>
            <div className="space-y-2">
              <h1 className="font-display text-4xl text-white">Controls Locked</h1>
              <p className="text-lg text-stone-400">The launcher is paused while Minecraft is open.</p>
            </div>
            <div className="w-full space-y-3">
              <div className="flex items-center justify-center gap-2 text-sm text-stone-500">
                {unlockProgress > 0 ? (
                  <span>Keep holding…</span>
                ) : (
                  <>
                    <span>Hold</span>
                    {(() => { const g = inputToGlyph("START", controllerType); return g ? <GamepadGlyph controller={controllerType} button={g} size={28} /> : null; })()}
                    <span>for 5 seconds to force unlock</span>
                  </>
                )}
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-lime-300 transition-none"
                  style={{ width: `${unlockProgress * 100}%`, opacity: unlockProgress > 0 ? 1 : 0 }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {isLaunching && (
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
                  <p className="text-sm text-stone-400">{progress.message}</p>
                  {progress.total > 1 && (
                    <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-lime-300 transition-all duration-300"
                        style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {launchError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
          <div className="simple-panel flex min-w-[36rem] max-w-[52rem] flex-col gap-5 rounded-[2rem] px-12 py-10">
            <p className="text-xs font-semibold uppercase tracking-[0.5em] text-red-400/80">Launch Failed</p>
            <p className="font-mono text-sm leading-6 text-stone-300 break-all">{launchError}</p>
            <button
              type="button"
              onClick={dismissError}
              className="mt-2 self-start rounded-[1rem] border border-white/10 bg-white/[0.05] px-6 py-3 text-sm font-semibold text-stone-300 hover:text-white"
            >
              Dismiss (B)
            </button>
          </div>
        </div>
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
              <p className="mt-4 max-w-3xl text-xl leading-8 text-stone-300/75">{pageDesc}</p>
            </div>

            <div className="flex min-w-[28rem] items-start justify-end gap-4">
              <div className="simple-panel flex min-w-[16rem] flex-col rounded-[1.4rem] px-5 py-4 text-right">
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-stone-500">
                  Active controller
                </p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {controllerType === "xbox" ? "Xbox Wireless" : "DualSense"}
                </p>
              </div>
              <div className="simple-panel flex min-w-[20rem] flex-col rounded-[1.4rem] px-5 py-4 text-right">
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-stone-500">
                  Microsoft account
                </p>
                {auth.activeAccount ? (
                  <>
                    <p className="mt-2 text-2xl font-semibold text-white">{auth.activeAccount.mcUsername}</p>
                    <p className="mt-2 text-sm text-lime-300">
                      {auth.accounts.length > 1 ? `${auth.accounts.length} accounts` : "Connected"}
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-lg font-semibold text-stone-500">Not signed in</p>
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
              {current.id === "home" && home.selectedInstance && (
                <HomePage
                  instances={instances}
                  selectedInstance={home.selectedInstance}
                  activeIndex={home.activeIndex}
                  homeFocus={home.homeFocus}
                  hasFocus={globalFocus === "page"}
                  account={auth.activeAccount}
                  quickActions={quickActions}
                  heroRef={home.heroRef}
                  gridRef={home.gridRef}
                  instanceRefs={home.instanceRefs}
                  onMoveToHero={home.onMoveToHero}
                  onMoveToGrid={home.onMoveToGrid}
                  onLaunch={launch}
                  onCreateNew={() => push({ id: "create" })}
                />
              )}

              {current.id === "library" && (
                <LibraryPage
                  instances={instances}
                  selectedIndex={library.selectedIndex}
                  libFocus={library.libFocus}
                  actionIndex={library.actionIndex}
                  overlay={library.overlay}
                  colorIndex={library.colorIndex}
                  deleteChoice={library.deleteChoice}
                  selectedInstance={library.selectedInstance}
                  listRefs={library.listRefs}
                  hasFocus={globalFocus === "page"}
                  onSelectInstance={library.onSelectInstance}
                  onSetLibFocus={library.onSetLibFocus}
                  onCreateNew={() => push({ id: "create" })}
                />
              )}

              {current.id === "settings" && (
                <SettingsPage
                  sections={settingsSections}
                  sectionIndex={settings.sectionIndex}
                  itemIndex={settings.itemIndex}
                  settingsFocus={settings.settingsFocus}
                  overlay={settings.overlay}
                  draftToggle={settings.draftToggle}
                  draftVolume={settings.draftVolume}
                  selectedSection={settings.selectedSection}
                  selectedItem={settings.selectedItem}
                  hasFocus={globalFocus === "page"}
                  sectionRefs={settings.sectionRefs}
                  itemRefs={settings.itemRefs}
                  onSelectSection={settings.onSelectSection}
                  onSelectItem={settings.onSelectItem}
                  onSetFocus={settings.onSetFocus}
                  onOpenOverlay={settings.onOpenOverlay}
                />
              )}

              {current.id === "create" && (
                <CreateInstancePage
                  step={createPage.createStep}
                  effectiveSteps={createPage.effectiveSteps}
                  focusedIndex={createPage.createItemIndex}
                  draftLoader={createPage.draftLoader}
                  draftVersion={createPage.draftVersion}
                  draftLoaderVersion={createPage.draftLoaderVersion}
                  draftColor={createPage.draftColor}
                  draftName={createPage.draftName}
                  mcVersions={createPage.filteredMcVersions}
                  loaderVersions={createPage.filteredLoaderVersions}
                  showSnapshots={createPage.showSnapshots}
                  showOnlyStable={createPage.showOnlyStable}
                  isLoadingMcVersions={versionsLoading}
                  isLoadingLoaderVersions={createPage.isLoadingLoaderVersions}
                  modpackQuery={createPage.modpackQuery}
                  modpackResults={createPage.modpackResults}
                  modpackLoading={createPage.modpackLoading}
                  selectedModpack={createPage.selectedModpack}
                  modpackVersions={createPage.modpackVersions}
                  modpackVersionsLoading={createPage.modpackVersionsLoading}
                  isInstalling={createPage.isInstalling}
                  installProgress={createPage.installProgress}
                  installError={createPage.installError}
                  hasFocus={globalFocus === "page"}
                  controllerType={controllerType}
                  onMoveFocus={createPage.onMoveFocus}
                  onSelect={createPage.onSelect}
                  onDismissError={createPage.onDismissError}
                />
              )}

              {current.id === "instance" && (
                <InstancePage
                  instance={instancePage.instance}
                  activeTab={instancePage.activeTab}
                  availableTabs={instancePage.availableTabs}
                  actionIndex={instancePage.actionIndex}
                  overlay={instancePage.overlay}
                  colorIndex={instancePage.colorIndex}
                  ramIndex={instancePage.ramIndex}
                  deleteChoice={instancePage.deleteChoice}
                  contentTabs={instancePage.contentTabs}
                  filesTab={instancePage.filesTab}
                  worldsTab={instancePage.worldsTab}
                  serversTab={instancePage.serversTab}
                  logsTab={instancePage.logsTab}
                  controllerType={controllerType}
                  hasFocus={globalFocus === "page"}
                  onSelectTab={instancePage.onSelectTab}
                  onSelectAction={instancePage.onSelectAction}
                />
              )}

              {current.id === "account" && (
                <AccountPage
                  accounts={auth.accounts}
                  activeAccountId={auth.activeAccountId}
                  signingIn={auth.signingIn}
                  deviceCode={auth.deviceCode}
                  authError={auth.authError}
                  items={accountPage.items}
                  focusedIndex={accountPage.focusedIndex}
                  actionIndex={accountPage.actionIndex}
                  hasFocus={globalFocus === "page"}
                  onMoveFocus={accountPage.setFocusedIndex}
                  onSetActionIndex={accountPage.setActionIndex}
                  onSignIn={() => void auth.startSignIn()}
                  onCancel={auth.cancelSignIn}
                  onSwitch={(id) => void auth.switchAccount(id)}
                  onRemove={(id) => void auth.removeAccount(id)}
                />
              )}

              {current.id === "updates" && (
                <UpdatesPage hasFocus={globalFocus === "page"} />
              )}
            </>
          )}
        </section>

        <footer className="flex-none">
          <div className="simple-panel flex items-center justify-between rounded-[1.4rem] px-6 py-4">
            <div className="flex items-center gap-8 text-lg font-semibold text-stone-300">
              <div className="flex items-center gap-3">
                <GamepadGlyph controller={controllerType} button="south" />
                <span>
                  {current.id === "settings"
                    ? "Select"
                    : current.id === "create"
                      ? "Confirm"
                      : current.id === "library"
                        ? "Action"
                        : current.id === "instance"
                          ? "Confirm"
                          : current.id === "account"
                            ? "Confirm"
                            : current.id === "updates"
                              ? "Refresh"
                              : "Launch"}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <GamepadGlyph controller={controllerType} button="east" />
                <span>Back</span>
              </div>
              {current.id === "instance" ? (
                <>
                  <div className="flex items-center gap-3">
                    <GamepadGlyph controller={controllerType} button="lb" />
                    <GamepadGlyph controller={controllerType} button="rb" />
                    <span>Switch Tab</span>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-3">
                  <GamepadGlyph controller={controllerType} button="dpad" />
                  <span>Navigate</span>
                </div>
              )}
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

// ─── WelcomeOverlay ───────────────────────────────────────────────────────────

import QRCode from "react-qr-code";
import { useState as useCountdownState, useEffect as useCountdownEffect } from "react";

function WelcomeOverlay({
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
  const [secondsLeft, setSecondsLeft] = useCountdownState(deviceCode?.expiresIn ?? 0);
  useCountdownEffect(() => {
    if (!deviceCode) return;
    setSecondsLeft(deviceCode.expiresIn);
    const t = setInterval(() => setSecondsLeft((s) => Math.max(s - 1, 0)), 1000);
    return () => clearInterval(t);
  }, [deviceCode]);

  const mins = Math.floor(secondsLeft / 60);
  const secs = String(secondsLeft % 60).padStart(2, "0");
  const aGlyph = inputToGlyph("A", controllerType);
  const bGlyph = inputToGlyph("B", controllerType);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#0b0d0c]">
      <div className="flex flex-col items-center gap-10">
        {/* Wordmark */}
        <div className="text-center">
          <h1 className="font-display text-6xl font-bold tracking-[-0.04em] text-white">
            Couch<span className="text-lime-300">Craft</span>
          </h1>
          <p className="mt-3 text-lg text-stone-500">A 10-foot Minecraft launcher built for the couch</p>
        </div>

        {signingIn && deviceCode ? (
          /* ── Device code flow ── */
          <div className="simple-panel flex w-[56rem] gap-10 rounded-[2rem] px-12 py-10">
            <div className="flex shrink-0 flex-col items-center justify-center gap-4">
              <div className="rounded-[1.25rem] bg-white p-4">
                <QRCode value={deviceCode.verificationUri} size={180} />
              </div>
              <p className="text-sm text-stone-500">Scan to open on your phone</p>
            </div>
            <div className="w-px self-stretch bg-white/8" />
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-stone-500">Or open manually</p>
                <p className="mt-2 text-xl text-stone-400">
                  Go to <span className="font-semibold text-lime-300">{deviceCode.verificationUri}</span>
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-stone-500">Then enter this code</p>
                <div className="mt-3 inline-block rounded-[1.25rem] border border-white/10 bg-black/30 px-8 py-5">
                  <p className="font-mono text-6xl font-bold tracking-[0.15em] text-lime-300">{deviceCode.userCode}</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 animate-pulse rounded-full bg-lime-300" />
                  <p className="text-lg text-stone-400">Waiting for sign-in…</p>
                </div>
                <p className="text-base text-stone-500">Expires in {mins}:{secs}</p>
              </div>
              <button type="button" onClick={onCancel}
                className="rounded-[1.25rem] border border-white/8 bg-transparent px-6 py-4 text-left"
              >
                <p className="font-semibold text-stone-300">Cancel</p>
                {bGlyph && <p className="mt-0.5 text-sm text-stone-500">Press B to cancel</p>}
              </button>
            </div>
          </div>
        ) : (
          /* ── Sign-in prompt ── */
          <div className="simple-panel flex w-[36rem] flex-col items-center gap-8 rounded-[2rem] px-12 py-10 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-lime-300/30 bg-lime-300/10">
              <span className="text-2xl">🎮</span>
            </div>
            <div>
              <h2 className="font-display text-3xl font-bold text-white">Sign in to play</h2>
              <p className="mt-3 text-base text-stone-500">
                Connect your Microsoft account to launch Minecraft instances with your profile.
              </p>
            </div>
            {authError && (
              <p className="rounded-[1rem] border border-red-400/30 bg-red-950/40 px-5 py-3 text-sm text-red-300">{authError}</p>
            )}
            <button type="button" onClick={onSignIn}
              className="flex w-full items-center justify-center gap-4 rounded-[1.5rem] border border-lime-300/40 bg-lime-300/10 px-8 py-5 transition duration-200 hover:bg-lime-300/20"
            >
              {aGlyph && <GamepadGlyph controller={controllerType} button={aGlyph} size={32} />}
              <div className="text-left">
                <p className="text-lg font-bold text-white">Sign in with Microsoft</p>
                <p className="text-sm text-stone-400">Opens device code flow</p>
              </div>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
