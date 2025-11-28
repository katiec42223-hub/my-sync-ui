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
  buildTimeline: ({
    params,
    tempoBpm,
    fixtureIds,
    fixtures,
  }) => {
    // Decide pixel extents (convert fractions if <=1)
    const perFixtureInfo = fixtureIds.map(fid => {
      const f = fixtures[fid];
      const total = f?.pixelCount ?? 0;
      const left = params.extentLeft <= 1 ? Math.round(params.extentLeft * (total - 1)) : params.extentLeft;
      const right = params.extentRight <= 1 ? Math.round(params.extentRight * (total - 1)) : params.extentRight;
      return { fid, total, left: Math.max(0, left), right: Math.min(total - 1, right), serpentine: !!f?.serpentine };
    });

    const timeline: Array<{ timeMs: number; pixelsOn: Array<{ fixtureId: string; pixelIndices: number[] }> }> = [];

    if (params.mode === "smooth") {
      // Smooth: sample at discrete frames based on pixel resolution (one frame per pixel step)
      const steps = Math.abs(perFixtureInfo[0].right - perFixtureInfo[0].left) + 1; // width
      const traversalMs = params.beatsPerTraversal * msPerBeat(tempoBpm);
      const msPerStep = traversalMs / steps;

      let directionForward = params.direction === "left-to-right";
      let currentTime = 0;
      const totalTraverseLoops = params.reverseAtEnds ? 2 : 1; // forward + backward if reverse
      for (let loop = 0; loop < totalTraverseLoops; loop++) {
        for (let s = 0; s < steps; s++) {
          const progress = directionForward ? s : (steps - 1 - s);
          const framePixels = perFixtureInfo.map(info => {
            if (info.total <= 0) return { fixtureId: info.fid, pixelIndices: [] };
            const logicalIndex = info.left + progress;
            // serpentine: if row reversed (every other row) you'd have row-level orientation; lacking row concept here, treat serpentine flag as reverse direction
            const actualIndex = info.serpentine ? (info.total - 1 - logicalIndex) : logicalIndex;
            return { fixtureId: info.fid, pixelIndices: [actualIndex] };
          });
          timeline.push({ timeMs: Math.round(currentTime), pixelsOn: framePixels });
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
      const width = Math.abs(perFixtureInfo[0].right - perFixtureInfo[0].left) + 1;
      const jumpBeat = params.jumpSubdivision ?? 1; // quarter note default
      const jumpMs = jumpBeat * msPerBeat(tempoBpm);
      let directionForward = params.direction === "left-to-right";
      let currentPos = directionForward ? 0 : width - 1;
      let currentTime = 0;
      for (let step = 0; step < width; step++) {
        const logicalOffset = directionForward ? currentPos : (width - 1 - currentPos);
        const framePixels = perFixtureInfo.map(info => {
            const logicalIndex = info.left + logicalOffset;
            const actualIndex = info.serpentine ? (info.total - 1 - logicalIndex) : logicalIndex;
            return { fixtureId: info.fid, pixelIndices: [actualIndex] };
        });
        timeline.push({ timeMs: Math.round(currentTime), pixelsOn: framePixels });
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