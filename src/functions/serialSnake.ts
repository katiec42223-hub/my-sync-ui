import { FunctionDescriptor } from "../types";

export type SerialSnakeParams = {
  noteValue: "1/1" | "1/2" | "1/4" | "1/8" | "1/16" | "custom";
  customBeatValue: number;
  pixelJump: number;
  colorPattern: string[];
  direction: "forward" | "backward" | "bounce";
  trailMode: "snake" | "fill";
  fixtureMode: "per-fixture" | "continuous";
  durationBeats?: number; 
  durationMs?: number;
};

export const serialSnake: FunctionDescriptor<SerialSnakeParams> = {
  id: "fuse:serialSnake",
  label: "🐍 Serial Snake",
  
  defaultParams: {
    noteValue: "1/4",
    customBeatValue: 1,
    pixelJump: 1,
    colorPattern: ["#ff0000"],
    direction: "forward",
    trailMode: "snake",
    fixtureMode: "per-fixture",

  },
  
  buildTimeline: ({
    params,
    tempoBpm,
    fixtureIds,
    fixtures,
    durationMs: ctxDurationMs,
  }) => {
    // safe defaults & helpers
    const noteValueToBeats: Record<string, number> = {
      "1/1": 4,
      "1/2": 2,
      "1/4": 1,
      "1/8": 0.5,
      "1/16": 0.25,
    };

    const beatInterval =
      params?.noteValue === "custom"
        ? Number(params?.customBeatValue) || 1
        : noteValueToBeats[params?.noteValue] ?? 0.25;

    const tempo = Number(tempoBpm) || 120;
const msPerBeat = 60000 / tempo;

// params.noteValue comes from UI as:
// "4" (whole), "2" (half), "1" (quarter), "0.5" (eighth), "0.25" (sixteenth), or "custom"
const rawNote = params?.noteValue ?? "1";

let noteFactor: number;
if (rawNote === "custom") {
  const custom = Number(params?.customBeatValue);
  noteFactor = isFinite(custom) && custom > 0 ? custom : 1;
} else {
  const parsed = Number(rawNote);
  noteFactor = isFinite(parsed) && parsed > 0 ? parsed : 1;
}

// Convention: 1 = 1 beat, 2 = 2 beats (slower), 0.5 = half a beat (faster), etc.
const intervalMs = noteFactor * msPerBeat;

if (!intervalMs || !isFinite(intervalMs) || intervalMs <= 0) {
  // invalid timing - nothing to schedule
  return [];
}
    
     // DURATION RESOLUTION:
    // priority: ctxDurationMs > params.durationBeats (converted from beats) > params.durationMs > fallback 60s
    const durationFromBeats =
      params?.durationBeats ? Number(params.durationBeats) * msPerBeat : 0;

    const durationMs =
      Number(ctxDurationMs) ||
      durationFromBeats ||
      Number(params?.durationMs) ||
      60000;

    // protect against absurdly large step counts
    const numSteps = Math.min(
      Math.max(1, Math.ceil(durationMs / intervalMs)),
      10000
    );
    

    // resolve fixtures robustly: fixtures may be a map keyed by id; assignments may use name or id
    const resolveFixture = (id: string) => {
      if (!fixtures) return undefined;
      // direct lookup
      const direct = (fixtures as any)[id];
      if (direct) return direct;
      // try to find by name (some assignments use display name)
      const found = Object.values(fixtures as any).find(
        (f: any) => f && (f.id === id || f.name === id)
      );
      return found;
    };

    // build per-fixture info from requested fixtureIds, or fallback to all fixtures
    let requested = Array.isArray(fixtureIds) ? [...fixtureIds] : [];
    if (requested.length === 0) {
      requested = Object.values(fixtures as any)
        .filter((f: any) => f && (f.pixelCount || f.pixelCount === 0))
        .map((f: any) => f.id);
    }

    const perFixtureInfo = requested.map((fid) => {
      const f = resolveFixture(fid);
      return {
        requestedId: fid,
        fixtureId: f?.id ?? fid,
        total: Number(f?.pixelCount ?? 0),
      };
    });

    // if no pixels at all -> nothing to do
    if (perFixtureInfo.length === 0 || perFixtureInfo.every((p) => p.total === 0)) {
      return [];
    }



    const timeline: Array<{
      timeMs: number;
      pixelsOn: Array<{ fixtureId: string; pixelIndices: number[] }>;
    }> = [];

    for (let step = 0; step < numSteps; step++) {
      const timestampMs = Math.round(step * intervalMs);

      if (params?.fixtureMode === "per-fixture") {
        const framePixels = perFixtureInfo.map((info) => {
          if (info.total <= 0) return { fixtureId: info.fixtureId, pixelIndices: [] };

          let position = (step * (Number(params?.pixelJump) || 1)) % info.total;
          if (params?.direction === "backward") {
            position = info.total - 1 - position;
          } else if (params?.direction === "bounce") {
            const cycle = Math.max(1, info.total * 2 - 2);
            const pos = (step * (Number(params?.pixelJump) || 1)) % cycle;
            position = pos < info.total ? pos : cycle - pos;
          }

          if (params?.trailMode === "fill") {
            const indices: number[] = [];
            for (let i = 0; i <= position; i += Math.max(1, Number(params?.pixelJump) || 1)) {
              indices.push(i);
            }
            return { fixtureId: info.fixtureId, pixelIndices: indices };
          }

          // default snake (single pixel)
          return { fixtureId: info.fixtureId, pixelIndices: [position] };
        });

        timeline.push({ timeMs: timestampMs, pixelsOn: framePixels });
      } else {
        // continuous mode: treat all fixtures as one strip
        const totalPixels = perFixtureInfo.reduce((sum, f) => sum + (f.total || 0), 0);
        if (totalPixels === 0) {
          timeline.push({ timeMs: timestampMs, pixelsOn: perFixtureInfo.map(p => ({ fixtureId: p.fixtureId, pixelIndices: [] })) });
          continue;
        }

        let position = (step * (Number(params?.pixelJump) || 1)) % totalPixels;
        if (params?.direction === "backward") {
          position = totalPixels - 1 - position;
        } else if (params?.direction === "bounce") {
          const cycle = Math.max(1, totalPixels * 2 - 2);
          const pos = (step * (Number(params?.pixelJump) || 1)) % cycle;
          position = pos < totalPixels ? pos : cycle - pos;
        }

        let cumulative = 0;
        const framePixels = perFixtureInfo.map((info) => {
          if (info.total <= 0) {
            return { fixtureId: info.fixtureId, pixelIndices: [] };
          }
          const indices: number[] = [];

          if (params?.trailMode === "fill") {
            for (let i = 0; i <= position; i += Math.max(1, Number(params?.pixelJump) || 1)) {
              if (i >= cumulative && i < cumulative + info.total) {
                indices.push(i - cumulative);
              }
            }
          } else {
            if (position >= cumulative && position < cumulative + info.total) {
              indices.push(position - cumulative);
            }
          }

          cumulative += info.total;
          return { fixtureId: info.fixtureId, pixelIndices: indices };
        });

        timeline.push({ timeMs: timestampMs, pixelsOn: framePixels });
      }
    }

    return timeline;
  },
};