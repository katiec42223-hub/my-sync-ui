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

// Helicopter physical attachment zones
export type HeliZone =
  | "canopy"
  | "skidStrutFront"
  | "skidStrutRear"
  | "skidPipeL"
  | "skidPipeR"
  | "tailBoom"
  | "tailFin";

// Map OBJ mesh/group names to logical helicopter zones
export const bodyNameToZone = (name: string): HeliZone | null => {
  if (name === "Body97") return "canopy";
  if (name === "Body1:5") return "skidStrutFront";
  if (name === "Body1:3") return "skidStrutRear";
  if (name === "Body1:2") return "skidPipeL";
  if (name === "Body1:4") return "skidPipeR";
  if (name === "Body1") return "tailBoom";
  if (name === "Body1:1") return "tailFin";
  return null;
};

// Helicopter surface attachment model (for turn-key fuselage placement)
export type SurfaceId =
  | "CANOPY"
  | "TAIL_BOOM"
  | "TAIL_FIN"
  | "SKID_PIPE_LEFT"
  | "SKID_PIPE_RIGHT"
  | "STRUT_FL"
  | "STRUT_FR"
  | "STRUT_RL"
  | "STRUT_RR";

export type Attachment =
  | {
      kind: "surface";
      surfaceId: SurfaceId;

      // Primary location on the surface (normalized 0..1)
      centerU?: number;
      centerV?: number; // canopy only (optional elsewhere)

      // Offsets in millimeters (small adjustments)
      tangentialOffsetMm?: number;
      lateralOffsetMm?: number;
      normalOffsetMm?: number;

      // Rotation around the surface normal (degrees)
      angleDeg?: number;
    }
  | {
      kind: "detached";
    };


export type FixtureVisualConfig = {
  fixtureId: string;
  layout: "linear" | "circle" | "wrapped" | "spline"; // how pixels are arranged
    position: [number, number, number]; // x, y, z in meters
  rotation: [number, number, number]; // euler angles (deg)
  scale?: number; // optional length multiplier
  circleRadius?: number; // if layout=circle
  wrapAxis?: "x" | "y" | "z"; // if layout=wrapped
  splinePoints?: Array<[number, number, number]>;
  splineTension?: number;

  // If present, Visualizer3D can derive splinePoints automatically from the helicopter model.
  attachment?: Attachment;
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
  
  
  // Physical data flow direction for this strip
  serialIn?: "START" | "END";

  // LED specifications
  ledType: keyof typeof LED_TYPES;
  customSpacing?: number;    // for CUSTOM type only
  customDiameter?: number;   // for CUSTOM type only
}

export interface ChannelChain {
  controllerChannel: number;   // e.g., 0, 1, 2...
  fixtureOrder: string[];      // ordered fixture IDs (serial order)
}