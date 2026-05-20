import { useRef, useCallback, useEffect } from "react";

interface UseUiSoundOptions {
    enabled: boolean;
    volume: number;
}

export function useUiSound({ enabled, volume }: UseUiSoundOptions) {
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        audioRef.current = new Audio("/sounds/click.mp3");
        audioRef.current.preload = "auto";
        return () => {
            audioRef.current?.pause();
            audioRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (audioRef.current) audioRef.current.volume = volume;
    }, [volume]);

    const playSound = useCallback(() => {
        if (!enabled) return;
        const audio = audioRef.current;
        if (!audio) return;
        audio.currentTime = 0;
        void audio.play().catch(() => {});
    }, [enabled]);

    return { playSound };
}
