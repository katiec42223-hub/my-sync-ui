import { FunctionDescriptor, VerticalSweepParams } from "../types";

// Helper: correct ms per beat
function msPerBeat(bpm: number) {
  return 60000 / bpm;
}

export const verticalSweep: FunctionDescriptor<VerticalSweepParams> = {
  id: "fuse:verticalSweep",
  label: "Vertical Line Sweep",
  defaultParams: {
    mode: "smooth",
    beatsPerTraversal: 4,
    jumpSubdivision: 1,
    direction: "left-to-right",
    reverseAtEnds: true,
    endHoldBeats: 0,
    extentLeft: 0,
    extentRight: 1, // if treated as fraction initially
    smoothing: "linear",
  },
  buildTimeline: ({ params, tempoBpm, fixtureIds, fixtures, pixelPositions }) => {
    if (!fixtureIds || fixtureIds.length === 0 || !fixtures) {
      return [];
    }

    // Two modes:
    // 1. World-space mode (pixelPositions provided): group pixels by their
    //    world-space X angle (atan2(x, z)) so the sweep follows real geometry.
    // 2. Index-based mode (fallback): sweep linearly across pixel indices.
    //    This preserves backward compatibility when no positions are available.
    const useWorldSpace = !!pixelPositions;

    // Build per-fixture pixel angle bins when world-space positions are available.
    // angleBins: for each fixture, an array of { angle (radians), pixelIndex } sorted by angle.
    const angleBins: Record<string, Array<{ angle: number; idx: number }>> = {};
    if (useWorldSpace) {
      for (const fid of fixtureIds) {
        const pos = pixelPositions![fid];
        if (!pos) continue;
        const count = pos.length / 3;
        const bins: Array<{ angle: number; idx: number }> = [];
        for (let i = 0; i < count; i++) {
          const x = pos[i * 3];
          const z = pos[i * 3 + 2];
          bins.push({ angle: Math.atan2(x, z), idx: i });
        }
        bins.sort((a, b) => a.angle - b.angle);
        angleBins[fid] = bins;
      }
    }

    // Decide pixel extents (convert fractions if <=1)
    const perFixtureInfo = fixtureIds.map((fid) => {
      const f = fixtures[fid];
      const total = f?.pixelCount ?? 0;

      // In world-space mode, extents span the full angle-sorted array
      if (useWorldSpace && angleBins[fid]) {
        const binCount = angleBins[fid].length;
        return {
          fid,
          total,
          left: 0,
          right: Math.max(0, binCount - 1),
          serpentine: false,
          worldSpace: true,
        };
      }

      const left =
        params.extentLeft <= 1
          ? Math.round(params.extentLeft * (total - 1))
          : params.extentLeft;
      const right =
        params.extentRight <= 1
          ? Math.round(params.extentRight * (total - 1))
          : params.extentRight;
      return {
        fid,
        total,
        left: Math.max(0, left),
        right: Math.min(total - 1, right),
        serpentine: !!f?.serpentine,
        worldSpace: false,
      };
    });

    // ADD THIS GUARD:
    if (!perFixtureInfo.length || perFixtureInfo[0].total <= 0) {
      return [];
    }

    const timeline: Array<{
      timeMs: number;
      pixelsOn: Array<{ fixtureId: string; pixelIndices: number[] }>;
    }> = [];

    if (params.mode === "smooth") {
      // Smooth: sample at discrete frames based on pixel resolution (one frame per pixel step)
      const steps =
        Math.abs(perFixtureInfo[0].right - perFixtureInfo[0].left) + 1; // width
      const traversalMs = params.beatsPerTraversal * msPerBeat(tempoBpm);
      const msPerStep = traversalMs / steps;

      let directionForward = params.direction === "left-to-right";
      let currentTime = 0;
      const totalTraverseLoops = params.reverseAtEnds ? 2 : 1; // forward + backward if reverse
      for (let loop = 0; loop < totalTraverseLoops; loop++) {
        for (let s = 0; s < steps; s++) {
          const progress = directionForward ? s : steps - 1 - s;
          const framePixels = perFixtureInfo.map((info) => {
            if (info.total <= 0)
              return { fixtureId: info.fid, pixelIndices: [] };
            if (info.worldSpace && angleBins[info.fid]) {
              // World-space mode: index into the angle-sorted bin
              const bin = angleBins[info.fid][info.left + progress];
              return { fixtureId: info.fid, pixelIndices: bin ? [bin.idx] : [] };
            }
            const logicalIndex = info.left + progress;
            const actualIndex = info.serpentine
              ? info.total - 1 - logicalIndex
              : logicalIndex;
            return { fixtureId: info.fid, pixelIndices: [actualIndex] };
          });
          timeline.push({
            timeMs: Math.round(currentTime),
            pixelsOn: framePixels,
          });
          currentTime += msPerStep;
        }
        if (params.reverseAtEnds) {
          // optional hold at end
          if (params.endHoldBeats > 0) {
            currentTime += params.endHoldBeats * msPerBeat(tempoBpm);
          }
          directionForward = !directionForward;
        }
      }
    } else {
      // Beat-jump mode
      const width =
        Math.abs(perFixtureInfo[0].right - perFixtureInfo[0].left) + 1;
      const jumpBeat = params.jumpSubdivision ?? 1; // quarter note default
      const jumpMs = jumpBeat * msPerBeat(tempoBpm);
      let directionForward = params.direction === "left-to-right";
      let currentPos = directionForward ? 0 : width - 1;
      let currentTime = 0;
      for (let step = 0; step < width; step++) {
        const logicalOffset = directionForward
          ? currentPos
          : width - 1 - currentPos;
        const framePixels = perFixtureInfo.map((info) => {
          if (info.worldSpace && angleBins[info.fid]) {
            const bin = angleBins[info.fid][info.left + logicalOffset];
            return { fixtureId: info.fid, pixelIndices: bin ? [bin.idx] : [] };
          }
          const logicalIndex = info.left + logicalOffset;
          const actualIndex = info.serpentine
            ? info.total - 1 - logicalIndex
            : logicalIndex;
          return { fixtureId: info.fid, pixelIndices: [actualIndex] };
        });
        timeline.push({
          timeMs: Math.round(currentTime),
          pixelsOn: framePixels,
        });
        currentTime += jumpMs;
        currentPos++;
      }
      if (params.reverseAtEnds && params.endHoldBeats) {
        currentTime += params.endHoldBeats * msPerBeat(tempoBpm);
      }
    }

    return timeline;
  },
};
