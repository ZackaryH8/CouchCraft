export type ControllerType =
  | "xbox"
  | "ps"
  | "switch";

export type LogicalButton =
  | "south" | "east" | "west" | "north" | "dpad"
  | "lb" | "rb" | "lt" | "rt" | "l3" | "start";

const glyphMap = {
  xbox: {
    south: "a",        east: "b",       west: "x",     north: "y",    dpad: "dpad",
    lb: "left-bumper", rb: "right-bumper",
    lt: "left-trigger",  rt: "right-trigger",
    l3: "left-joystick-press",
    start: "menu",
  },
  ps: {
    south: "cross",    east: "circle",  west: "square", north: "triangle", dpad: "dpad",
    lb: "plain-L1",    rb: "plain-R1",
    lt: "plain-L2",    rt: "plain-R2",
    l3: "plain-L3",
    start: "plain-big-option",
  },
  switch: {
    south: "b",        east: "a",       west: "y",     north: "x",    dpad: "dpad",
    lb: "left-bumper", rb: "right-bumper",
    lt: "left-trigger",  rt: "right-trigger",
    l3: "left-joystick-press",
    start: "menu",
  },
} as const;

export function getGlyph(
  controller: ControllerType,
  button: LogicalButton
) {
  const fileName = glyphMap[controller][button];

  return `/gamepad/${controller}/${fileName}.png`;
}

export function inputToGlyph(input: string): LogicalButton | null {
  switch (input) {
    case "A":   return "south";
    case "B":   return "east";
    case "X":   return "west";
    case "Y":   return "north";
    case "LB":  return "lb";
    case "RB":  return "rb";
    case "L2":  return "lt";
    case "R2":  return "rt";
    case "START": return "start";
    default:    return null;
  }
}
