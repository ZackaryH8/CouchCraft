export type ControllerType =
  | "xbox"
  | "ps"
  | "switch";

export type LogicalButton =
  | "south"
  | "east"
  | "west"
  | "north"
  | "dpad";

const glyphMap = {
  xbox: {
    south: "a",
    east: "b",
    west: "x",
    north: "y",
    dpad: "dpad"
  },

  ps: {
    south: "cross",
    east: "circle",
    west: "square",
    north: "triangle",
    dpad: "dpad"
  },

  switch: {
    south: "b",
    east: "a",
    west: "y",
    north: "x",
    dpad: "dpad"
  },
} as const;

export function getGlyph(
  controller: ControllerType,
  button: LogicalButton
) {
  const fileName = glyphMap[controller][button];

  return `/gamepad/${controller}/${fileName}.png`;
}
