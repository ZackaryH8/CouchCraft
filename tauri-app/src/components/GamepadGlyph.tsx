import { ControllerType, LogicalButton, getGlyph } from "../gamepad/glyphs";

type Props = {
    controller: ControllerType;
    button: LogicalButton;
    size?: number;
};

export function GamepadGlyph({ controller, button, size = 32 }: Props) {
    return (
        <img
            src={getGlyph(controller, button)}
            alt={`${controller}-${button}`}
            width={size}
            height={size}
            draggable={false}
            className="select-none object-contain"
        />
    );
}
