export type ShowEvent = {
  id: string;
  songId: number;
  durationMs: number;
  func: string;
  payload?: any;
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

export interface FunctionDescriptor<P> {
  id: string;
  label: string;
  buildTimeline: (ctx: {
    params: P;
    tempoBpm: number;
    // selected elements:
    fixtureIds: string[];
    channelIds: string[];
    groupIds: string[];
    // lookup maps:
    fixtures: Record<string, { pixelCount: number; serpentine?: boolean }>;
  }) => Array<{ timeMs: number; pixelsOn: Array<{ fixtureId: string; pixelIndices: number[] }> }>;
  defaultParams: P;
}