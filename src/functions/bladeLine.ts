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
  },
  buildTimeline: ({ params, tempoBpm, durationMs }) => {
    const msPerBeat = 60000 / tempoBpm;
    const timeline: Array<{
      timeMs: number;
      pixelsOn: Array<{ fixtureId: string; pixelIndices: number[]; color: string }>;
    }> = [];

    // Blade config: 2 blades × 2 segments × 36 pixels
    const PIXELS_PER_SEGMENT = 36;
    const SEGMENTS = ["A1", "A2", "B1", "B2"]; // top blade: A1+A2, bottom blade: B1+B2
    
    // Assume 1cm ≈ 1 pixel for now (adjust based on actual blade length)
    const thicknessPx = Math.max(1, Math.round(params.thicknessCm));

    // Degrees per line (evenly spaced around 360°)
    const degreesPerLine = 360 / params.lineCount;

    // Sample at 3° slices (120 frames per revolution)
    const SLICE_DEGREES = 3;
    const slicesPerRev = 360 / SLICE_DEGREES;
    
    // Estimate RPM from tempo (rough heuristic: 1 beat ≈ 1 rev at moderate tempo)
    // For now, assume show duration maps to rotations; refine later with actual RPM
    const estimatedRevs = durationMs / (msPerBeat * 4); // assume 4 beats per rev
    const totalSlices = Math.ceil(estimatedRevs * slicesPerRev);

    for (let slice = 0; slice < totalSlices; slice++) {
      const t = (slice / slicesPerRev) * (msPerBeat * 4); // time for this slice
      if (t > durationMs) break;

      // Current angle of this slice
      let baseAngle = (slice * SLICE_DEGREES) % 360;

      // If rotating, offset by rotation speed
      if (!params.stationary) {
        const rotationOffset = (t / msPerBeat) * params.rotationSpeed!;
        baseAngle = (baseAngle + (params.rotationDirection === "cw" ? rotationOffset : -rotationOffset)) % 360;
      }

const pixelsOn: Array<{ fixtureId: string; pixelIndices: number[]; color: string }> = [];

      // For each line
      for (let lineIdx = 0; lineIdx < params.lineCount; lineIdx++) {
        const lineAngle = (baseAngle + lineIdx * degreesPerLine) % 360;

        // Determine which pixels to light based on line angle and thickness
        // Line spans from lineAngle - thickness/2 to lineAngle + thickness/2
        // For simplicity, map angle directly to pixel position (0-35 for each segment)
        const centerPixel = Math.round((lineAngle / 360) * PIXELS_PER_SEGMENT);

        const pixelsToLight: number[] = [];
        for (let offset = -Math.floor(thicknessPx / 2); offset <= Math.floor(thicknessPx / 2); offset++) {
          const px = (centerPixel + offset + PIXELS_PER_SEGMENT) % PIXELS_PER_SEGMENT;
          pixelsToLight.push(px);
        }

        // Determine color based on mode
        let color = params.solidColor || "#ffffff";
        if (params.colorMode === "gradient") {
          const t = lineAngle / 360;
          const rgb = lerpColor(params.gradientStart!, params.gradientEnd!, t);
          color = `#${rgb.r.toString(16).padStart(2, '0')}${rgb.g.toString(16).padStart(2, '0')}${rgb.b.toString(16).padStart(2, '0')}`;
        } else if (params.colorMode.startsWith("rainbow")) {
          const t = lineAngle / 360;
          const rgb = lerpColor(params.rainbowStart!, params.rainbowEnd!, t);
          color = `#${rgb.r.toString(16).padStart(2, '0')}${rgb.g.toString(16).padStart(2, '0')}${rgb.b.toString(16).padStart(2, '0')}`;
        }

        // Apply to all segments (this is a blade function, lights all segments equally for now)
        SEGMENTS.forEach(segId => {
          pixelsOn.push({
            fixtureId: segId,
            pixelIndices: pixelsToLight,
            color
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