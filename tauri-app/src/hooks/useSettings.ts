import { useState, useEffect, useCallback } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getSetting, setSetting } from "../services/db";
import {
  UI_SOUND_STORAGE_KEY,
  UI_SOUND_VOLUME_STORAGE_KEY,
  DEFAULT_UI_SOUND_VOLUME,
  UI_SOUND_VOLUME_STEP,
  CONTROLLER_LAYOUT_STORAGE_KEY,
  FULLSCREEN_STORAGE_KEY,
  MOTION_STORAGE_KEY,
  VIBRATION_STORAGE_KEY,
} from "../constants";
import type { ControllerType } from "../gamepad/glyphs";

export { UI_SOUND_VOLUME_STEP };

function clampVolume(v: number) {
  return Math.min(1, Math.max(0, Number(v.toFixed(2))));
}

function readLocalStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function useSettings() {
  const [uiSoundsEnabled, setUiSoundsEnabled] = useState(true);
  const [uiSoundVolume, setUiSoundVolume] = useState(DEFAULT_UI_SOUND_VOLUME);
  const [controllerLayout, setControllerLayout] = useState<ControllerType>("xbox");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [motionReduced, setMotionReduced] = useState(false);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);

  useEffect(() => {
    const applyValues = (sounds: string | null, volume: string | null, layout: string | null, fullscreen: string | null, motion: string | null, vibration: string | null) => {
      if (sounds !== null) setUiSoundsEnabled(sounds === "true");
      if (volume !== null) {
        const parsed = Number(volume);
        if (Number.isFinite(parsed)) setUiSoundVolume(clampVolume(parsed));
      }
      if (layout === "ps") setControllerLayout("ps");
      if (fullscreen !== null) setIsFullscreen(fullscreen === "true");
      if (motion !== null) setMotionReduced(motion === "true");
      if (vibration !== null) setVibrationEnabled(vibration !== "false");
    };

    if (isTauri()) {
      Promise.all([
        getSetting(UI_SOUND_STORAGE_KEY),
        getSetting(UI_SOUND_VOLUME_STORAGE_KEY),
        getSetting(CONTROLLER_LAYOUT_STORAGE_KEY),
        getSetting(FULLSCREEN_STORAGE_KEY),
        getSetting(MOTION_STORAGE_KEY),
        getSetting(VIBRATION_STORAGE_KEY),
      ])
        .then(([sounds, volume, layout, fullscreen, motion, vibration]) =>
          applyValues(sounds, volume, layout, fullscreen, motion, vibration),
        )
        .catch(() =>
          applyValues(
            readLocalStorage(UI_SOUND_STORAGE_KEY),
            readLocalStorage(UI_SOUND_VOLUME_STORAGE_KEY),
            readLocalStorage(CONTROLLER_LAYOUT_STORAGE_KEY),
            readLocalStorage(FULLSCREEN_STORAGE_KEY),
            readLocalStorage(MOTION_STORAGE_KEY),
            readLocalStorage(VIBRATION_STORAGE_KEY),
          ),
        );
    } else {
      applyValues(
        readLocalStorage(UI_SOUND_STORAGE_KEY),
        readLocalStorage(UI_SOUND_VOLUME_STORAGE_KEY),
        readLocalStorage(CONTROLLER_LAYOUT_STORAGE_KEY),
        readLocalStorage(FULLSCREEN_STORAGE_KEY),
        readLocalStorage(MOTION_STORAGE_KEY),
        readLocalStorage(VIBRATION_STORAGE_KEY),
      );
    }
  }, []);

  const persist = useCallback((key: string, value: string) => {
    if (isTauri()) {
      setSetting(key, value).catch(() => localStorage.setItem(key, value));
    } else {
      localStorage.setItem(key, value);
    }
  }, []);

  const toggleSounds = useCallback(() => {
    setUiSoundsEnabled((v) => {
      persist(UI_SOUND_STORAGE_KEY, String(!v));
      return !v;
    });
  }, [persist]);

  const adjustVolume = useCallback(
    (delta: number) => {
      setUiSoundVolume((v) => {
        const next = clampVolume(v + delta);
        persist(UI_SOUND_VOLUME_STORAGE_KEY, String(next));
        return next;
      });
    },
    [persist],
  );

  const setVolume = useCallback(
    (v: number) => {
      const clamped = clampVolume(v);
      setUiSoundVolume(clamped);
      persist(UI_SOUND_VOLUME_STORAGE_KEY, String(clamped));
    },
    [persist],
  );

  const toggleControllerLayout = useCallback(() => {
    setControllerLayout((v) => {
      const next: ControllerType = v === "xbox" ? "ps" : "xbox";
      persist(CONTROLLER_LAYOUT_STORAGE_KEY, next);
      return next;
    });
  }, [persist]);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((v) => {
      const next = !v;
      persist(FULLSCREEN_STORAGE_KEY, String(next));
      if (isTauri()) getCurrentWindow().setFullscreen(next).catch(() => {});
      return next;
    });
  }, [persist]);

  const toggleMotionReduced = useCallback(() => {
    setMotionReduced((v) => {
      const next = !v;
      persist(MOTION_STORAGE_KEY, String(next));
      return next;
    });
  }, [persist]);

  const toggleVibration = useCallback(() => {
    setVibrationEnabled((v) => {
      const next = !v;
      persist(VIBRATION_STORAGE_KEY, String(next));
      return next;
    });
  }, [persist]);

  return {
    uiSoundsEnabled, uiSoundVolume, controllerLayout,
    isFullscreen, motionReduced, vibrationEnabled,
    toggleSounds, adjustVolume, setVolume,
    toggleControllerLayout, toggleFullscreen, toggleMotionReduced, toggleVibration,
  };
}
