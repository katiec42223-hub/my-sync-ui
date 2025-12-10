// src/components/ModelLayoutEditor/modelTypes.ts

export type Zone = "MAIN_BODY" | "TAIL_BOOM" | "TAIL_FIN" | "UNDEFINED_ZONE";

export type Side = "LEFT" | "RIGHT" | "TOP" | "BOTTOM" | null;

export type AlignmentMode = "CENTER" | "HEAD" | "TAIL";

export interface AlignmentMember {
  fixtureId: string;
  flipRelativeToGroup: boolean;
  pixelOffsetInGroup: number;
}

export interface AlignmentGroup {
  id: string;
  name: string;
  mode: AlignmentMode;
  members: AlignmentMember[];
}

// LED strip specifications
export type LEDType = {
  name: string;
  pixelDiameter: number;  // millimeters
  pixelSpacing: number;   // millimeters (center-to-center)
};

export const LED_TYPES: Record<string, LEDType> = {
  SK9822: {
    name: "SK9822 (5mm)",
    pixelDiameter: 5,
    pixelSpacing: 30,  // 3cm spacing typical
  },
  WS2812B: {
    name: "WS2812B (5mm)",
    pixelDiameter: 5,
    pixelSpacing: 33,
  },
  APA102: {
    name: "APA102 (5mm)",
    pixelDiameter: 5,
    pixelSpacing: 30,
  },
  CUSTOM: {
    name: "Custom",
    pixelDiameter: 5,
    pixelSpacing: 30,
  },
};

export type FixtureVisualConfig = {
  fixtureId: string;
  layout: "linear" | "circle" | "wrapped" | "spline"; // how pixels are arranged
  position: [number, number, number];      // x, y, z in meters
  rotation: [number, number, number];      // euler angles (deg)
  scale?: number;                          // optional length multiplier
  circleRadius?: number;                   // if layout=circle
  wrapAxis?: "x" | "y" | "z";             // if layout=wrapped
   splinePoints?: Array<[number, number, number]>;
  splineTension?: number;
};

export type VisualizerConfig = {
  fixtures: FixtureVisualConfig[];
  camera: {
    position: [number, number, number];
    target: [number, number, number];
  };
};

export type Orientation =
  | "LEFT"
  | "RIGHT"
  | "UP"
  | "DOWN"
  | "FORWARD"
  | "BACKWARD"
  | null;

export interface Fixture {
  id: string;
  name: string;
  zone: Zone | string;
  controllerChannel: number | null;
  pixelOffset: number | null;
  pixelCount: number | null;
  physicalLengthMm: number | null;
  side: Side;
  orientation: Orientation;
  alignmentGroupIds: string[];
  
  // LED specifications (ADD THESE THREE LINES)
  ledType: keyof typeof LED_TYPES;
  customSpacing?: number;    // for CUSTOM type only
  customDiameter?: number;   // for CUSTOM type only
}

export interface ChannelChain {
  controllerChannel: number;   // e.g., 0, 1, 2...
  fixtureOrder: string[];      // ordered fixture IDs (serial order)
}