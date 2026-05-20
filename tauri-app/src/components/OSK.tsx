import { MAIN_ROWS, type OskFocus, type FlashKey } from "../hooks/useOSK";
import { GamepadGlyph } from "./GamepadGlyph";
import type { ControllerType, LogicalButton } from "../gamepad/glyphs";

interface OSKProps {
    label: string;
    value: string;
    cursorPos: number;
    focus: OskFocus;
    isShift: boolean;
    flashKey: FlashKey;
    controllerType: ControllerType;
}

// Per-controller icon for caps (L3 on Xbox, L2 on PS) and enter (Menu on Xbox, R2 on PS)
function capsIcon(ct: ControllerType): LogicalButton {
    return ct === "ps" ? "lt" : "l3";
}
function enterIcon(ct: ControllerType): LogicalButton {
    return ct === "ps" ? "rt" : "start";
}
// Xbox kernel quirk: physical X fires North, physical Y fires West (BTN_X=BTN_NORTH in uapi).
// PS/Switch have correct positional mapping so west=Square/Y, north=Triangle/X.
function spaceIcon(ct: ControllerType): LogicalButton {
    return ct === "xbox" ? "north" : "west";
}
function backspaceIcon(ct: ControllerType): LogicalButton {
    return ct === "xbox" ? "west" : "north";
}

function keyBase(active: boolean) {
    return `flex items-center justify-center rounded-[0.75rem] border h-14 transition-colors duration-100 ${
        active
            ? "border-lime-300/60 bg-lime-300 text-slate-950"
            : "border-white/8 bg-white/[0.04] text-stone-200"
    }`;
}

function sideBase(active: boolean, capsOn?: boolean) {
    if (active)
        return "flex w-full flex-col items-center justify-center gap-1.5 rounded-[0.9rem] border border-lime-300/60 bg-lime-300 text-slate-950 font-semibold text-sm transition-colors duration-100";
    if (capsOn)
        return "flex w-full flex-col items-center justify-center gap-1.5 rounded-[0.9rem] border border-lime-300/30 bg-lime-300/10 text-lime-300 font-semibold text-sm transition-colors duration-100";
    return "flex w-full flex-col items-center justify-center gap-1.5 rounded-[0.9rem] border border-white/8 bg-white/[0.04] text-stone-300 font-semibold text-sm transition-colors duration-100";
}

// Single-row sidebar key (backspace): icon + label side-by-side
function sideRowBase(active: boolean) {
    if (active)
        return "flex w-full items-center justify-center gap-2 rounded-[0.9rem] border border-lime-300/60 bg-lime-300 text-slate-950 font-semibold text-sm transition-colors duration-100";
    return "flex w-full items-center justify-center gap-2 rounded-[0.9rem] border border-white/8 bg-white/[0.04] text-stone-300 font-semibold text-sm transition-colors duration-100";
}

export function OSK({
    label,
    value,
    cursorPos,
    focus,
    isShift,
    flashKey,
    controllerType,
}: OSKProps) {
    const mainActive = (r: number, c: number) =>
        focus.section === "main" && focus.row === r && focus.col === c;
    const leftActive = (i: number) =>
        (focus.section === "left" && focus.sideIdx === i) ||
        (i === 0 && flashKey === "cur_left") ||
        (i === 1 && flashKey === "caps");
    const rightActive = (i: number) =>
        (focus.section === "right" && focus.sideIdx === i) ||
        (i === 0 && flashKey === "backspace") ||
        (i === 1 && flashKey === "cur_right");
    const spaceActive =
        (focus.section === "main" && focus.row === 4) || flashKey === "space";

    // Each key row is h-14 (56px) tall with gap-2 (8px) between rows.
    // A sidebar key spanning 2 rows must be 56+8+56 = 120px to align flush.
    const SPAN2 = "h-[120px]";
    // Spacebar width = 10 keys × 64px + 9 gaps × 8px = 712px, matching the QWERTY row exactly.
    const SPACE_W = "w-[712px]";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75">
            <div className="simple-panel w-fit rounded-[2rem] px-8 py-8">
                {/* Value display */}
                <div className="mb-5 rounded-[1.25rem] border border-white/10 bg-black/30 px-6 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.35em] text-stone-500">
                        {label}
                    </p>
                    <p className="mt-2 min-h-10 whitespace-pre font-mono text-3xl tracking-tight text-white">
                        {value.length === 0 ? (
                            <>
                                <span className="text-stone-600">
                                    Start typing…
                                </span>
                                <span className="animate-pulse text-lime-300">
                                    |
                                </span>
                            </>
                        ) : (
                            <>
                                {value.slice(0, cursorPos)}
                                <span className="animate-pulse text-lime-300">
                                    |
                                </span>
                                {value.slice(cursorPos)}
                            </>
                        )}
                    </p>
                </div>

                <div className="flex gap-3">
                    {/* ── Left sidebar ── */}
                    <div className="flex w-32 flex-col gap-2">
                        {/* Spacer — aligns with numbers row */}
                        <div className="h-14" />

                        {/* ← Cursor: LB / L1 */}
                        <div className={`${sideBase(leftActive(0))} ${SPAN2}`}>
                            <GamepadGlyph
                                controller={controllerType}
                                button="lb"
                                size={24}
                            />
                            <span>← Cursor</span>
                        </div>

                        {/* Caps: L3 (Xbox) / L2 (PS) */}
                        <div
                            className={`${sideBase(leftActive(1), isShift)} ${SPAN2}`}
                        >
                            <GamepadGlyph
                                controller={controllerType}
                                button={capsIcon(controllerType)}
                                size={24}
                            />
                            <span>Caps{isShift ? " ▲" : ""}</span>
                        </div>
                    </div>

                    {/* ── Main keyboard grid ── */}
                    <div className="flex flex-col gap-2">
                        {MAIN_ROWS.map((keyRow, ri) => (
                            <div key={ri} className="flex gap-2">
                                {ri === 4 ? (
                                    <div
                                        className={`${keyBase(spaceActive)} ${SPACE_W} gap-3 text-sm font-semibold`}
                                    >
                                        <GamepadGlyph
                                            controller={controllerType}
                                            button={spaceIcon(controllerType)}
                                            size={22}
                                        />
                                        <span>Space</span>
                                    </div>
                                ) : (
                                    keyRow.map((key, ci) => (
                                        <div
                                            key={key}
                                            className={`${keyBase(mainActive(ri, ci))} w-16`}
                                        >
                                            <span className="text-lg font-semibold">
                                                {isShift && /^[a-z]$/.test(key)
                                                    ? key.toUpperCase()
                                                    : key}
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>
                        ))}
                    </div>

                    {/* ── Right sidebar ── */}
                    <div className="flex w-32 flex-col gap-2">
                        {/* ⌫ Backspace: X (Xbox) / Square (PS) — single row */}
                        <div className={`${sideRowBase(rightActive(0))} h-14`}>
                            <GamepadGlyph
                                controller={controllerType}
                                button={backspaceIcon(controllerType)}
                                size={22}
                            />
                            <span>Backspace</span>
                        </div>

                        {/* → Cursor: RB / R1 */}
                        <div className={`${sideBase(rightActive(1))} ${SPAN2}`}>
                            <GamepadGlyph
                                controller={controllerType}
                                button="rb"
                                size={24}
                            />
                            <span>Cursor Right</span>
                        </div>

                        {/* Enter: Menu (Xbox) / R2 (PS) */}
                        <div className={`${sideBase(rightActive(2))} ${SPAN2}`}>
                            <GamepadGlyph
                                controller={controllerType}
                                button={enterIcon(controllerType)}
                                size={24}
                            />
                            <span>Enter</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
