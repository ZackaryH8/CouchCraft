import { useState, useEffect, useCallback } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getSetting, setSetting } from "../services/db";
import {
  UI_SOUND_STORAGE_KEY,
  UI_SOUND_VOLUME_STORAGE_KEY,
  DEFAULT_UI_SOUND_VOLUME,
  UI_SOUND_VOLUME_STEP,
} from "../constants";

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

  useEffect(() => {
    const applyValues = (sounds: string | null, volume: string | null) => {
      if (sounds !== null) setUiSoundsEnabled(sounds === "true");
      if (volume !== null) {
        const parsed = Number(volume);
        if (Number.isFinite(parsed)) setUiSoundVolume(clampVolume(parsed));
      }
    };

    if (isTauri()) {
      Promise.all([getSetting(UI_SOUND_STORAGE_KEY), getSetting(UI_SOUND_VOLUME_STORAGE_KEY)])
        .then(([sounds, volume]) => applyValues(sounds, volume))
        .catch(() =>
          applyValues(readLocalStorage(UI_SOUND_STORAGE_KEY), readLocalStorage(UI_SOUND_VOLUME_STORAGE_KEY)),
        );
    } else {
      applyValues(readLocalStorage(UI_SOUND_STORAGE_KEY), readLocalStorage(UI_SOUND_VOLUME_STORAGE_KEY));
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

  return { uiSoundsEnabled, uiSoundVolume, toggleSounds, adjustVolume, setVolume };
}
