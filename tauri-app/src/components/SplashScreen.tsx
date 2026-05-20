import { useEffect, useState } from "react";

type Phase = "enter" | "hold" | "exit";

export function SplashScreen({ onDone }: { onDone: () => void }) {
    const [phase, setPhase] = useState<Phase>("enter");

    useEffect(() => {
        const t1 = setTimeout(() => setPhase("hold"), 50);
        const t2 = setTimeout(() => setPhase("exit"), 2000);
        const t3 = setTimeout(onDone, 2550);
        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
            clearTimeout(t3);
        };
    }, [onDone]);

    const isExiting = phase === "exit";
    const isVisible = phase === "hold" || phase === "exit";

    return (
        <div
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-0 bg-[#060807]"
            style={{
                opacity: isExiting ? 0 : 1,
                transform: isExiting
                    ? "scale(1.04)"
                    : isVisible
                      ? "scale(1)"
                      : "scale(0.96)",
                transition: isExiting
                    ? "opacity 0.55s cubic-bezier(0.4, 0, 1, 1), transform 0.55s cubic-bezier(0.4, 0, 1, 1)"
                    : "opacity 0.45s cubic-bezier(0, 0, 0.2, 1), transform 0.45s cubic-bezier(0, 0, 0.2, 1)",
            }}
        >
            {/* Logo */}
            <h1 className="select-none font-display text-[8.5rem] font-bold leading-none tracking-[-0.06em]">
                <span className="text-white">COUCH</span>
                <span className="text-lime-300">CRAFT</span>
            </h1>

            {/* Tagline */}
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.55em] text-stone-600">
                Minecraft Launcher
            </p>

            {/* Loading dots */}
            <div className="mt-14 flex items-center gap-3">
                {[0, 1, 2].map((i) => (
                    <div
                        key={i}
                        className="h-2 w-2 rounded-full bg-lime-300"
                        style={{
                            animation: `splash-dot 1.4s ease-in-out ${i * 0.22}s infinite`,
                        }}
                    />
                ))}
            </div>
        </div>
    );
}
