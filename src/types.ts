// Add this BEFORE the ShowEvent type definition
export type SerialSnakeParams = {
  songId: string;
  noteValue: "1/1" | "1/2" | "1/4" | "1/8" | "1/16" | "custom";
  customBeatValue?: number; // Only used when noteValue is "custom"
  pixelJump: number; // 1 = every pixel, 2 = skip one, etc.
  colorPattern: string[]; // Array of hex colors to cycle through
  direction: "forward" | "backward" | "bounce";
  trailMode: "snake" | "fill"; // snake = only current pixel, fill = accumulate
  fixtureMode: "per-fixture" | "continuous"; // Per fixture or treat as one strip
  fixtureIds: string[]; // Which fixtures to apply to
};

export type ShowEvent = {
  id: string;
  songId: number;
  durationMs: number;
  
  // Legacy fields (for backward compat)
  func?: string;
  payload?: any;
  
  // New structured payload
  blade?: {
    top: {
      func: string;
      params: any;
      media?: string[];
    };
    bottom: {
      func: string;
      params: any;
      media?: string[];
    };
  };
  fuselage?: {
    func: string;
    params: any;
    assignments?: {
      fixtureIds: string[];
      channelIds: string[];
      groupIds: string[];
      pixels?: number[];
      channelPixelMap?: Record<string, number[]>;
    };
  };
  
};

export type BladeMedia = {
  sameOnBoth: boolean;
  topFiles: string[];
  bottomFiles: string[];
};

export type BeatSubdivision =
  | 4    // whole note
  | 2    // half
  | 1    // quarter
  | 0.6667  // half-triplet
  | 0.5  // eighth
  | 0.3332  // quarter-triplet
  | 0.25;   // sixteenth

export interface VerticalSweepParams {
  mode: "smooth" | "beat-jump";
  beatsPerTraversal: number;        // total beats from left extent to right extent (smooth)
  jumpSubdivision?: BeatSubdivision; // size of each jump (beat-jump mode)
  direction: "left-to-right" | "right-to-left";
  reverseAtEnds: boolean;
  endHoldBeats: number;
  extentLeft: number;   // pixel index or fraction (0..1) – we’ll treat as absolute for first pass
  extentRight: number;  // pixel index or fraction
  smoothing: "linear" | "ease-in-out";
}

export interface BladeLineParams {
  thicknessCm: number;              // line thickness in whole cm
  colorMode: "solid" | "gradient" | "rainbow-line" | "rainbow-rotating" | "rainbow-line-rotating";
  solidColor?: string;              // hex color if colorMode=solid
  gradientStart?: string;           // gradient colors
  gradientEnd?: string;
  rainbowStart?: string;            // rainbow mode colors
  rainbowEnd?: string;
  stationary: boolean;              // true = fixed, false = rotating
  rotationSpeed?: number;           // degrees per beat (if rotating)
  rotationDirection?: "cw" | "ccw";
  lineCount: number;                // number of lines (evenly spaced)
  timingMode: "smooth" | "beat-jump";
  degreesPerBeat: number;
  beatsPerRev?: number; 
}

export interface FunctionDescriptor<P> {
  id: string;
  label: string;
  buildTimeline: (ctx: {
    params: P;
    tempoBpm: number;
    durationMs: number;
    // selected elements:
    fixtureIds: string[];
    channelIds: string[];
    groupIds: string[];
    // lookup maps:
    fixtures: Record<string, { pixelCount: number; serpentine?: boolean }>;
  }) => Array<{ timeMs: number; pixelsOn: Array<{ fixtureId: string; pixelIndices: number[] }> }>;
  defaultParams: P;
}