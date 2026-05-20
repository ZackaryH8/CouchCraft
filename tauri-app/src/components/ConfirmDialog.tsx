import type { ReactNode } from "react";

interface ConfirmDialogProps {
    title: string;
    message: string;
    choice: number; // 0 = cancel, 1 = confirm
    confirmLabel?: string;
    danger?: boolean;
    warning?: ReactNode;
}

export function ConfirmDialog({
    title,
    message,
    choice,
    confirmLabel = "Confirm",
    danger = true,
    warning,
}: ConfirmDialogProps) {
    return (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[2rem] bg-black/70 backdrop-blur-sm">
            <div className="simple-panel w-[34rem] rounded-[2rem] px-10 py-9">
                <p
                    className={`text-xs font-semibold uppercase tracking-[0.35em] ${danger ? "text-red-400/80" : "text-lime-300/80"}`}
                >
                    Confirm
                </p>
                <h2 className="mt-3 font-display text-4xl tracking-[-0.05em] text-white">
                    {title}
                </h2>
                <p className="mt-3 text-lg leading-7 text-stone-400">
                    {message}
                </p>
                {warning && <div className="mt-4">{warning}</div>}
                <div className="mt-8 flex gap-4">
                    {["Cancel", confirmLabel].map((label, i) => (
                        <div
                            key={label}
                            className={`flex-1 rounded-[1.25rem] border px-6 py-4 text-center transition duration-200 ${
                                i === choice
                                    ? i === 1
                                        ? danger
                                            ? "border-red-400/60 bg-red-950 text-red-200"
                                            : "border-lime-300/60 bg-lime-300 text-slate-950"
                                        : "border-lime-300/60 bg-lime-300 text-slate-950"
                                    : "border-white/8 bg-white/[0.03] text-stone-400"
                            }`}
                        >
                            <p className="text-xl font-semibold">{label}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
