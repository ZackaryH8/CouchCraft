import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { useGamepad } from "./hooks/useGamepad";
import { useNavStack } from "./hooks/useNavStack";
import { useInstances } from "./hooks/useInstances";
import { useSettings } from "./hooks/useSettings";
import { useLauncher } from "./hooks/useLauncher";
import { useSidebar } from "./hooks/useSidebar";
import { useUiSound } from "./hooks/useUiSound";
import { useHomePage, HomePage } from "./pages/HomePage";
import { useSettingsPage, SettingsPage } from "./pages/SettingsPage";
import { useCreatePage, CreateInstancePage } from "./pages/CreateInstancePage";
import { useLibraryPage, LibraryPage } from "./pages/LibraryPage";
import { useAccountPage, AccountPage } from "./pages/AccountPage";
import { useAuth } from "./hooks/useAuth";
import { Sidebar } from "./components/Sidebar";
import { GamepadGlyph } from "./components/GamepadGlyph";
import type { ControllerType } from "./gamepad/glyphs";
import type { HapticGamepad } from "./types";
import { buildSettingsSections } from "./constants";

const controllerType: ControllerType = "xbox";

function App() {
  // ── data & settings ──────────────────────────────────────────────────────
  const { instances, loading, createInstance, updateInstance, removeInstance } = useInstances();
  const { uiSoundsEnabled, uiSoundVolume, toggleSounds, setVolume } = useSettings();
  const { isLaunching, launchingName, launchInstance } = useLauncher();
  const { playSound } = useUiSound({ enabled: uiSoundsEnabled, volume: uiSoundVolume });

  // ── navigation ───────────────────────────────────────────────────────────
  const { current, push, pop, reset } = useNavStack({ id: "home" });
  const [globalFocus, setGlobalFocus] = useState<"sidebar" | "page">("page");
  const toSidebar = useCallback(() => setGlobalFocus("sidebar"), []);
  const toPage = useCallback(() => setGlobalFocus("page"), []);

  const sidebar = useSidebar({ reset, toPage, toSidebar });

  // ── page hooks (always mounted so state survives nav) ─────────────────────
  const settingsSections = useMemo(
    () => buildSettingsSections(uiSoundsEnabled, uiSoundVolume),
    [uiSoundsEnabled, uiSoundVolume],
  );

  const auth = useAuth();

  const home = useHomePage({ instances, launchInstance, toSidebar, push });
  const settings = useSettingsPage({
    sections: settingsSections,
    toSidebar,
    uiSoundsEnabled,
    uiSoundVolume,
    toggleSounds,
    setVolume,
  });
  const createPage = useCreatePage({ pop, onCreated: createInstance });
  const library = useLibraryPage({
    instances,
    launchInstance,
    updateInstance,
    removeInstance,
    toSidebar,
    push,
  });
  const accountPage = useAccountPage({
    status: auth.status,
    account: auth.account,
    deviceCode: auth.deviceCode,
    authError: auth.authError,
    startSignIn: auth.startSignIn,
    cancelSignIn: auth.cancelSignIn,
    signOut: auth.signOut,
    toSidebar,
  });

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
  void playUiMoveRumble;

  // ── input routing ─────────────────────────────────────────────────────────
  const handleInput = useCallback(
    (input: Parameters<typeof home.handleInput>[0]) => {
      if (globalFocus === "sidebar") sidebar.handleInput(input);
      else if (current.id === "home") home.handleInput(input);
      else if (current.id === "settings") settings.handleInput(input);
      else if (current.id === "create") createPage.handleInput(input);
      else if (current.id === "library") library.handleInput(input);
      else if (current.id === "account") accountPage.handleInput(input);
    },
    [globalFocus, current.id, sidebar, home, settings, createPage, library, accountPage],
  );

  useGamepad(handleInput);

  // ── page header ───────────────────────────────────────────────────────────
  const pageTitle =
    current.id === "settings" ? (
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
    ) : (
      <>
        COUCH<span className="text-lime-300">CRAFT</span>
      </>
    );

  const pageDesc =
    current.id === "settings"
      ? "Launcher, display, and controller preferences."
      : current.id === "create"
        ? "Choose a loader, version, and color to add a new Minecraft instance."
        : current.id === "library"
          ? "Browse, launch, recolor, and delete your Minecraft instances."
          : current.id === "account"
            ? "Sign in with Microsoft to launch Minecraft with your profile."
            : "Browse instances, launch profiles, and manage your Minecraft setup with gamepad-friendly navigation.";

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <main className="h-screen overflow-hidden bg-[#0b0d0c] text-stone-100">
      {isLaunching && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
          <div className="simple-panel flex min-w-[30rem] flex-col items-center gap-6 rounded-[2rem] px-14 py-12 text-center">
            <div className="h-14 w-14 animate-spin rounded-full border-[5px] border-lime-300/90 border-t-transparent" />
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.5em] text-lime-300/60">
                Launching
              </p>
              <h1 className="font-display text-4xl text-white">
                Starting {launchingName ?? "instance"}
              </h1>
              <p className="max-w-lg text-lg text-stone-300/75">
                Checking files, preparing the game instance, and starting Minecraft.
              </p>
            </div>
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
                <p className="mt-2 text-2xl font-semibold text-white">Xbox Wireless</p>
              </div>
              <div className="simple-panel flex min-w-[20rem] flex-col rounded-[1.4rem] px-5 py-4 text-right">
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-stone-500">
                  Microsoft account
                </p>
                {auth.account ? (
                  <>
                    <p className="mt-2 text-2xl font-semibold text-white">{auth.account.mcUsername}</p>
                    <p className="mt-2 text-sm text-lime-300">Connected</p>
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
                  heroRef={home.heroRef}
                  gridRef={home.gridRef}
                  instanceRefs={home.instanceRefs}
                  onMoveToHero={home.onMoveToHero}
                  onMoveToGrid={home.onMoveToGrid}
                  onLaunch={launchInstance}
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
                  focusedIndex={createPage.createItemIndex}
                  draftLoader={createPage.draftLoader}
                  draftVersion={createPage.draftVersion}
                  draftColor={createPage.draftColor}
                  hasFocus={globalFocus === "page"}
                  onMoveFocus={createPage.onMoveFocus}
                  onSelect={createPage.onSelect}
                />
              )}

              {current.id === "account" && (
                <AccountPage
                  status={auth.status}
                  account={auth.account}
                  deviceCode={auth.deviceCode}
                  authError={auth.authError}
                  actionIndex={accountPage.actionIndex}
                  hasFocus={globalFocus === "page"}
                  onSignIn={() => void auth.startSignIn()}
                  onCancel={auth.cancelSignIn}
                  onSignOut={() => void auth.signOut()}
                  onSelectAction={accountPage.setActionIndex}
                />
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
                        : current.id === "account"
                          ? "Confirm"
                          : "Launch"}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <GamepadGlyph controller={controllerType} button="east" />
                <span>Back</span>
              </div>
              <div className="flex items-center gap-3">
                <GamepadGlyph controller={controllerType} button="dpad" />
                <span>Navigate</span>
              </div>
            </div>
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-stone-500">
              Focus: {globalFocus} · {current.id}
            </p>
          </div>
        </footer>
        </div>
      </div>
    </main>
  );
}

export default App;
