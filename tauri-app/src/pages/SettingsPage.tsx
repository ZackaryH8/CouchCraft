import { useState, useCallback, useEffect, useRef, type MutableRefObject } from "react";
import type { SettingsItem, SettingsSection } from "../types";
import { UI_SOUND_VOLUME_STEP } from "../constants";
import type { GamepadInput } from "../hooks/useGamepad";
import type { ControllerType } from "../gamepad/glyphs";

type SettingsFocus = "sections" | "items";
type SettingsOverlay = "none" | "toggle" | "slider";

// ─── hook ────────────────────────────────────────────────────────────────────

interface UseSettingsPageOptions {
  sections: SettingsSection[];
  toSidebar: () => void;
  uiSoundsEnabled: boolean;
  uiSoundVolume: number;
  controllerLayout: ControllerType;
  motionReduced: boolean;
  vibrationEnabled: boolean;
  isFullscreen: boolean;
  toggleSounds: () => void;
  toggleControllerLayout: () => void;
  toggleMotionReduced: () => void;
  toggleVibration: () => void;
  toggleFullscreen: () => void;
  setVolume: (v: number) => void;
}

export function useSettingsPage({
  sections,
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
}: UseSettingsPageOptions) {
  const sectionRefs = useRef<Array<HTMLElement | null>>([]);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);

  const [sectionIndex, setSectionIndex] = useState(0);
  const [itemIndex, setItemIndex] = useState(0);
  const [settingsFocus, setSettingsFocus] = useState<SettingsFocus>("sections");
  const [overlay, setOverlay] = useState<SettingsOverlay>("none");
  const [draftToggle, setDraftToggle] = useState(false);
  const [draftVolume, setDraftVolume] = useState(uiSoundVolume);

  const selectedSection = sections[sectionIndex];
  const selectedItem = selectedSection?.items[itemIndex];

  useEffect(() => {
    sectionRefs.current[sectionIndex]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [sectionIndex]);

  useEffect(() => {
    itemRefs.current[itemIndex]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [itemIndex]);

  const openOverlay = useCallback(
    (item: SettingsItem) => {
      if (item.editType === "toggle") {
        let initialTrue: boolean;
        if (item.label === "Primary Layout") initialTrue = controllerLayout === "xbox";
        else if (item.label === "Motion") initialTrue = !motionReduced;
        else if (item.label === "Vibration") initialTrue = vibrationEnabled;
        else if (item.label === "Fullscreen") initialTrue = isFullscreen;
        else initialTrue = uiSoundsEnabled;
        setDraftToggle(initialTrue);
        setOverlay("toggle");
      } else if (item.editType === "slider") {
        setDraftVolume(uiSoundVolume);
        setOverlay("slider");
      }
    },
    [uiSoundsEnabled, uiSoundVolume, controllerLayout, motionReduced, vibrationEnabled, isFullscreen],
  );

  const handleInput = useCallback(
    (input: GamepadInput) => {
      // ── overlay: toggle ──────────────────────────────────────────────────
      if (overlay === "toggle") {
        switch (input) {
          case "LEFT":
            setDraftToggle(true);
            break;
          case "RIGHT":
            setDraftToggle(false);
            break;
          case "A":
            if (selectedItem?.label === "Primary Layout") {
              if (draftToggle !== (controllerLayout === "xbox")) toggleControllerLayout();
            } else if (selectedItem?.label === "Motion") {
              if (draftToggle !== !motionReduced) toggleMotionReduced();
            } else if (selectedItem?.label === "Vibration") {
              if (draftToggle !== vibrationEnabled) toggleVibration();
            } else if (selectedItem?.label === "Fullscreen") {
              if (draftToggle !== isFullscreen) toggleFullscreen();
            } else {
              if (draftToggle !== uiSoundsEnabled) toggleSounds();
            }
            setOverlay("none");
            break;
          case "B":
            setOverlay("none");
            break;
        }
        return;
      }

      // ── overlay: slider ──────────────────────────────────────────────────
      if (overlay === "slider") {
        switch (input) {
          case "LEFT":
            setDraftVolume((v) =>
              parseFloat(Math.min(1, Math.max(0, v - UI_SOUND_VOLUME_STEP)).toFixed(2)),
            );
            break;
          case "RIGHT":
            setDraftVolume((v) =>
              parseFloat(Math.min(1, Math.max(0, v + UI_SOUND_VOLUME_STEP)).toFixed(2)),
            );
            break;
          case "A":
            setVolume(draftVolume);
            setOverlay("none");
            break;
          case "B":
            setOverlay("none");
            break;
        }
        return;
      }

      // ── sections focus ───────────────────────────────────────────────────
      if (settingsFocus === "sections") {
        switch (input) {
          case "UP":
            setSectionIndex((i) => Math.max(i - 1, 0));
            setItemIndex(0);
            break;
          case "DOWN":
            setSectionIndex((i) => Math.min(i + 1, sections.length - 1));
            setItemIndex(0);
            break;
          case "LEFT":
          case "B":
            toSidebar();
            break;
          case "RIGHT":
          case "A":
            setSettingsFocus("items");
            break;
        }
        return;
      }

      // ── items focus ──────────────────────────────────────────────────────
      const itemCount = selectedSection?.items.length ?? 0;
      switch (input) {
        case "UP":
          setItemIndex((i) => Math.max(i - 1, 0));
          break;
        case "DOWN":
          setItemIndex((i) => Math.min(i + 1, itemCount - 1));
          break;
        case "LEFT":
        case "B":
          setSettingsFocus("sections");
          break;
        case "A":
          if (selectedItem?.editType) openOverlay(selectedItem);
          break;
      }
    },
    [
      overlay,
      settingsFocus,
      sections.length,
      selectedSection,
      selectedItem,
      uiSoundsEnabled,
      controllerLayout,
      motionReduced,
      vibrationEnabled,
      isFullscreen,
      draftToggle,
      draftVolume,
      toggleSounds,
      toggleControllerLayout,
      toggleMotionReduced,
      toggleVibration,
      toggleFullscreen,
      setVolume,
      toSidebar,
      openOverlay,
    ],
  );

  return {
    sectionIndex,
    itemIndex,
    settingsFocus,
    overlay,
    draftToggle,
    draftVolume,
    selectedSection,
    selectedItem,
    sectionRefs,
    itemRefs,
    handleInput,
    onSelectSection: setSectionIndex,
    onSelectItem: setItemIndex,
    onSetFocus: setSettingsFocus,
    onOpenOverlay: openOverlay,
  };
}

// ─── component ────────────────────────────────────────────────────────────────

interface SettingsPageProps {
  sections: SettingsSection[];
  sectionIndex: number;
  itemIndex: number;
  settingsFocus: SettingsFocus;
  overlay: SettingsOverlay;
  draftToggle: boolean;
  draftVolume: number;
  selectedSection: SettingsSection | undefined;
  selectedItem: SettingsItem | undefined;
  hasFocus: boolean;
  sectionRefs: MutableRefObject<Array<HTMLElement | null>>;
  itemRefs: MutableRefObject<Array<HTMLElement | null>>;
  onSelectSection: (i: number) => void;
  onSelectItem: (i: number) => void;
  onSetFocus: (focus: SettingsFocus) => void;
  onOpenOverlay: (item: SettingsItem) => void;
}

export function SettingsPage({
  sections,
  sectionIndex,
  itemIndex,
  settingsFocus,
  overlay,
  draftToggle,
  draftVolume,
  selectedSection,
  selectedItem,
  hasFocus,
  sectionRefs,
  itemRefs,
  onSelectSection,
  onSelectItem,
  onSetFocus,
  onOpenOverlay,
}: SettingsPageProps) {
  return (
    <section className="relative grid min-h-0 flex-1 grid-cols-[18rem_1fr] gap-6">
      {/* Toggle overlay */}
      {overlay === "toggle" && selectedItem && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[2rem] bg-black/70 backdrop-blur-sm">
          <div className="simple-panel w-[34rem] rounded-[2rem] px-10 py-9">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-stone-500">
              Editing Setting
            </p>
            <h2 className="mt-3 font-display text-4xl tracking-[-0.05em] text-white">
              {selectedItem.label}
            </h2>
            <p className="mt-2 text-base leading-6 text-stone-400">{selectedItem.hint}</p>
            <div className="mt-8 flex gap-4">
              {(selectedItem?.toggleLabels ?? (["On", "Off"] as [string, string])).map((label, i) => {
                const isChosen = i === 0 ? draftToggle : !draftToggle;
                return (
                  <div
                    key={label}
                    className={`flex-1 rounded-[1.25rem] border px-6 py-4 text-center transition duration-200 ${
                      isChosen
                        ? "border-lime-300/60 bg-lime-300 text-slate-950"
                        : "border-white/8 bg-white/[0.03] text-stone-400"
                    }`}
                  >
                    <p className="text-xl font-semibold">{label}</p>
                  </div>
                );
              })}
            </div>
            <p className="mt-4 text-sm text-stone-500">
              Left / right to choose · A to apply · B to cancel
            </p>
          </div>
        </div>
      )}

      {/* Slider overlay */}
      {overlay === "slider" && selectedItem && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[2rem] bg-black/70 backdrop-blur-sm">
          <div className="simple-panel w-[38rem] rounded-[2rem] px-10 py-10">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-stone-500">
              Editing Setting
            </p>
            <h2 className="mt-3 font-display text-4xl tracking-[-0.05em] text-white">
              {selectedItem.label}
            </h2>
            <p className="mt-2 text-base leading-6 text-stone-400">{selectedItem.hint}</p>
            <div className="mt-8 flex items-center gap-5">
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-lime-300 transition-all duration-100"
                  style={{ width: `${draftVolume * 100}%` }}
                />
              </div>
              <p className="w-14 shrink-0 text-right text-2xl font-semibold text-lime-300">
                {Math.round(draftVolume * 100)}%
              </p>
            </div>
            <p className="mt-5 text-sm text-stone-500">
              Left / right to adjust · A to apply · B to cancel
            </p>
          </div>
        </div>
      )}

      {/* Section list (left column) */}
      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.35em] text-stone-500">
          Categories
        </p>
        {sections.map((section, i) => {
          const isActive = hasFocus && settingsFocus === "sections" && i === sectionIndex;
          const isSelected = i === sectionIndex;
          return (
            <div
              key={section.title}
              ref={(node) => {
                sectionRefs.current[i] = node;
              }}
              onClick={() => {
                onSelectSection(i);
                onSetFocus("sections");
              }}
              onMouseEnter={() => onSelectSection(i)}
              className={`flex cursor-default items-center gap-4 rounded-[1.25rem] border px-5 py-4 transition duration-200 ${
                isActive
                  ? "border-lime-300/60 bg-[#171c1a]"
                  : isSelected
                    ? "border-white/12 bg-[#151817]"
                    : "border-white/8 bg-[#121514]"
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold text-white">{section.title}</p>
                <p className="mt-0.5 truncate text-sm text-stone-500">{section.description}</p>
              </div>
              {isSelected && (
                <div
                  className={`h-2 w-2 shrink-0 rounded-full ${isActive ? "bg-lime-300" : "bg-stone-600"}`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Items (right column) */}
      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
        {selectedSection && (
          <>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.35em] text-stone-500">
              {selectedSection.title}
            </p>
            {selectedSection.items.map((item, i) => {
              const isActive = hasFocus && settingsFocus === "items" && i === itemIndex;
              const isEditable = !!item.editType;
              return (
                <div
                  key={item.label}
                  ref={(node) => {
                    itemRefs.current[i] = node;
                  }}
                  onClick={() => {
                    onSelectItem(i);
                    onSetFocus("items");
                    if (isEditable) onOpenOverlay(item);
                  }}
                  onMouseEnter={() => {
                    onSelectItem(i);
                    onSetFocus("items");
                  }}
                  className={`flex cursor-default items-center justify-between rounded-[1.25rem] border px-5 py-4 transition duration-200 ${
                    isActive ? "border-lime-300/60 bg-[#171c1a]" : "border-white/8 bg-[#121514]"
                  }`}
                >
                  <div>
                    <p className="text-lg font-semibold text-white">{item.label}</p>
                    <p className="mt-0.5 text-sm text-stone-500">{item.hint}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <p
                      className={`text-lg font-semibold ${isEditable ? "text-lime-300" : "text-stone-500"}`}
                    >
                      {item.value}
                    </p>
                    {isEditable && isActive && (
                      <div className="rounded-lg border border-lime-300/30 bg-lime-300/10 px-2 py-1">
                        <p className="text-xs font-semibold text-lime-300">Edit</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </section>
  );
}
