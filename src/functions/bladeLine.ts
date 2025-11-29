import { FunctionDescriptor } from "../types";

export interface BladeLineParams {
  thickness: number;              // pixel width of each line
  colorMode: "solid" | "gradient" | "rainbow-line" | "rainbow-rotating";
  solidColor?: string;            // hex color if colorMode=solid
  gradientStart?: string;         // if gradient
  gradientEnd?: string;
  stationary: boolean;            // true = fixed, false = rotating
  rotationSpeed?: number;         // degrees per beat (if rotating)
  rotationDirection?: "cw" | "ccw";
  lineCount: number;              // number of lines (evenly spaced)
}

export const bladeLine: FunctionDescriptor<BladeLineParams> = {
  id: "blade:line",
  label: "Blade Line Pattern",
  defaultParams: {
    thickness: 1,
    colorMode: "solid",
    solidColor: "#ffffff",
    gradientStart: "#ff0000",
    gradientEnd: "#0000ff",
    stationary: true,
    rotationSpeed: 45,              // degrees per beat
    rotationDirection: "cw",
    lineCount: 1,
  },
  buildTimeline: ({ params, tempoBpm, fixtureIds, fixtures }) => {
    // Stub timeline builder — implement rendering logic later
    const msPerBeat = 60000 / tempoBpm;
    const timeline: Array<{ timeMs: number; pixelsOn: Array<{ fixtureId: string; pixelIndices: number[]; color?: string }> }> = [];
    
    // Placeholder: emit one frame at t=0
    timeline.push({
      timeMs: 0,
      pixelsOn: fixtureIds.map(fid => ({
        fixtureId: fid,
        pixelIndices: [0], // stub
        color: params.solidColor
      }))
    });
    
    return timeline;
  },
};