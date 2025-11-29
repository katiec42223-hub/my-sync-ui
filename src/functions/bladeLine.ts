import { FunctionDescriptor, BladeLineParams } from "../types";

// Helper: convert hex to RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  return {
    r: parseInt(clean.substr(0, 2), 16),
    g: parseInt(clean.substr(2, 2), 16),
    b: parseInt(clean.substr(4, 2), 16)
  };
}

// Helper: interpolate between two colors
function lerpColor(c1: string, c2: string, t: number): { r: number; g: number; b: number } {
  const rgb1 = hexToRgb(c1);
  const rgb2 = hexToRgb(c2);
  return {
    r: Math.round(rgb1.r + (rgb2.r - rgb1.r) * t),
    g: Math.round(rgb1.g + (rgb2.g - rgb1.g) * t),
    b: Math.round(rgb1.b + (rgb2.b - rgb1.b) * t)
  };
}

export const bladeLine: FunctionDescriptor<BladeLineParams> = {
  id: "blade:line",
  label: "Blade Line Pattern",
  defaultParams: {
    thicknessCm: 1,
    colorMode: "solid",
    solidColor: "#ffffff",
    gradientStart: "#ff0000",
    gradientEnd: "#0000ff",
    rainbowStart: "#ff0000",
    rainbowEnd: "#ff00ff",
    stationary: true,
    rotationSpeed: 45,              // degrees per beat
    rotationDirection: "cw",
    lineCount: 1,
    timingMode: "smooth",
    degreesPerBeat: 45,
    beatsPerRev: 4,
  },
  buildTimeline: ({ params, tempoBpm, durationMs }) => {
    const timeline: Array<{
      timeMs: number;
      pixelsOn: Array<{ fixtureId: string; pixelIndices: number[]}>;
    }> = [];

    // Blade config: 2 blades × 2 segments × 36 pixels
    const PIXELS_PER_SEGMENT = 36;
    const SEGMENTS = ["A1", "A2", "B1", "B2"]; // top blade: A1+A2, bottom blade: B1+B2
    
    // Assume 1cm ≈ 1 pixel for now (adjust based on actual blade length)
    const thicknessPx = Math.max(1, Math.round(params.thicknessCm));

        // Degrees per line (evenly spaced around 360°)
    const degreesPerLine = 360 / params.lineCount;

    // Angle sampling
    const SLICE_DEGREES = 3; // visual resolution (3° per frame)
    const msPerBeat = 60000 / tempoBpm;

    // Effective rotation in degrees per beat:
    // priority: explicit `degreesPerBeat` → derived from `beatsPerRev` → legacy `rotationSpeed`
    const effectiveDegPerBeat =
      (typeof params.degreesPerBeat === "number" && params.degreesPerBeat > 0)
        ? params.degreesPerBeat
        : (typeof params.beatsPerRev === "number" && params.beatsPerRev! > 0)
          ? (360 / params.beatsPerRev!)
          : (params.rotationSpeed ?? 45);

    // Time per 3° slice when rotating; otherwise use a modest fixed time step
    const sliceMs = params.stationary
      ? 50 // ~20 FPS for stationary visuals
      : msPerBeat * (SLICE_DEGREES / Math.max(1, effectiveDegPerBeat));

    const totalSlices = Math.ceil(durationMs / sliceMs);

    for (let slice = 0; slice < totalSlices; slice++) {
      const t = slice * sliceMs;
      if (t > durationMs) break;

      // Base angle from timing parameters
      let baseAngle = 0;

      if (!params.stationary) {
        const beatsElapsed = t / msPerBeat;
        const beatPhase = params.timingMode === "beat-jump"
          ? Math.floor(beatsElapsed)                  // quantize at whole beats
          : beatsElapsed;                              // smooth progression

        let angle = beatPhase * effectiveDegPerBeat;   // degrees progressed
        if (params.rotationDirection === "ccw") angle = -angle;

        // Normalize to [0, 360)
        baseAngle = ((angle % 360) + 360) % 360;
      }

const pixelsOn: Array<{ fixtureId: string; pixelIndices: number[] }> = [];

      // For each line
      for (let lineIdx = 0; lineIdx < params.lineCount; lineIdx++) {
        const lineAngle = (baseAngle + lineIdx * degreesPerLine) % 360;

        // Determine which pixels to light based on line angle and thickness
        const centerPixel = Math.round((lineAngle / 360) * PIXELS_PER_SEGMENT);

        const pixelsToLight: number[] = [];
        for (let offset = -Math.floor(thicknessPx / 2); offset <= Math.floor(thicknessPx / 2); offset++) {
          const px = (centerPixel + offset + PIXELS_PER_SEGMENT) % PIXELS_PER_SEGMENT;
          pixelsToLight.push(px);
        }

        // Apply to all segments equally for now
        SEGMENTS.forEach(segId => {
          pixelsOn.push({
            fixtureId: segId,
            pixelIndices: pixelsToLight,
          });
        });
      }

      timeline.push({
        timeMs: Math.round(t),
        pixelsOn
      });
    }

    return timeline;
  },
};