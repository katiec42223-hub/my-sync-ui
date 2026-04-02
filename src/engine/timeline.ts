import type { ShowEvent } from "../types";
import type { Fixture } from "../components/ModelLayoutEditor/modelTypes";
import { getFunctionDescriptor } from "../functions/registry";

function _resolveColorPattern(params: any, descriptor: any): string[] {
  const raw = params?.colorPattern ?? descriptor?.defaultParams?.colorPattern;
  if (!raw) return ["#ffffff"];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return raw
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((s: string) => s.trim().replace(/^"|"$/g, ""))
        .filter(Boolean);
    }
  }
  return ["#ffffff"];
}

export function computePixelColorsForEvent(
  ev: ShowEvent | null,
  tMs: number,
  tempo: number,
  fixturesList: Fixture[] | null | undefined,
  getDesc: typeof getFunctionDescriptor,
  pixelPositions?: Record<string, Float32Array>
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (!ev) return out;

  const fuseFunc = ev.fuselage?.func;
  if (!fuseFunc) return out;

  const desc = getDesc(fuseFunc);
  if (!desc) return out;

  const fixtureIds = ev.fuselage?.assignments?.fixtureIds ?? [];
  const fixtureMap: Record<string, any> = {};
  const fixturesArr = fixturesList ?? [];
  fixturesArr.forEach((f) => (fixtureMap[f.id] = f));

  let timeline: any[] = [];
  try {
    timeline =
      desc.buildTimeline({
        params: ev.fuselage?.params ?? {},
        tempoBpm: tempo,
        durationMs: ev.durationMs,
        fixtureIds,
        channelIds: ev.fuselage?.assignments?.channelIds ?? [],
        groupIds: ev.fuselage?.assignments?.groupIds ?? [],
        fixtures: fixtureMap,
        pixelPositions,
      }) || [];
  } catch (err) {
    console.error("buildTimeline error for", fuseFunc, err);
    return out;
  }

  if (!Array.isArray(timeline) || timeline.length === 0) return out;

  let current = timeline.find((frame: any, idx: number) =>
    frame.timeMs <= tMs && (timeline[idx + 1]?.timeMs ?? Infinity) > tMs
  );
  if (!current) current = timeline[timeline.length - 1];

  const colorPattern = _resolveColorPattern(ev.fuselage?.params ?? {}, desc);

  (current.pixelsOn ?? []).forEach((fixtureData: any) => {
    const fx = fixtureMap[fixtureData.fixtureId];
    if (!fx) return;
    const pixelCount = fx.pixelCount ?? 0;
    const colors = new Array(Math.max(0, pixelCount)).fill("#000000");
    (fixtureData.pixelIndices ?? []).forEach((pixelIdx: number) => {
      if (pixelIdx < 0 || pixelIdx >= pixelCount) return;
      const color = colorPattern[pixelIdx % colorPattern.length] ?? "#ffffff";
      colors[pixelIdx] = color;
    });
    out.set(fixtureData.fixtureId, colors);
  });

  return out;
}

export function computePixelColorsForAll(
  eventsList: ShowEvent[] | null | undefined,
  tMs: number,
  tempo: number,
  fixturesList: Fixture[] | null | undefined,
  getDesc: typeof getFunctionDescriptor,
  pixelPositions?: Record<string, Float32Array>
): Map<string, string[]> {
  const merged = new Map<string, string[]>();
  const evs = eventsList ?? [];
  if (evs.length === 0) return merged;

  for (const ev of evs) {
    const map = computePixelColorsForEvent(ev, tMs, tempo, fixturesList, getDesc, pixelPositions);
    for (const [fid, colors] of map.entries()) {
      if (!merged.has(fid)) {
        merged.set(fid, colors.slice());
        continue;
      }
      const target = merged.get(fid)!;
      for (let i = 0; i < colors.length && i < target.length; i++) {
        if (colors[i] && colors[i] !== "#000000") target[i] = colors[i];
      }
    }
  }

  return merged;
}

/**
 * Build world-space pixel positions for all fixtures that have
 * worldPosition + worldDirection set. Fixtures without these fields
 * are silently skipped (verticalSweep falls back to index mode).
 */
export function buildPixelPositions(
  fixtures: Fixture[]
): Record<string, Float32Array> {
  const result: Record<string, Float32Array> = {};
  for (const f of fixtures) {
    if (!f.worldPosition || !f.worldDirection || !f.pixelCount) continue;
    const count = f.pixelCount;
    const spacing = 1 / (f.pixelDensity ?? 144); // meters per pixel
    const pos = f.worldPosition;
    const dir = f.worldDirection;
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = pos.x + i * spacing * dir.x;
      arr[i * 3 + 1] = pos.y + i * spacing * dir.y;
      arr[i * 3 + 2] = pos.z + i * spacing * dir.z;
    }
    result[f.id] = arr;
  }
  return result;
}

/**
 * Compute the base rotation angle (degrees) for a blade line pattern
 * given its params, current tempo, and elapsed time.
 */
export function computeBaseAngle(params: any, tempo: number, tMs: number): number {
  const msPerBeat = 60000 / Math.max(1, tempo);
  const effectiveDegPerBeat =
    typeof params.degreesPerBeat === "number" && params.degreesPerBeat > 0
      ? params.degreesPerBeat
      : typeof params.beatsPerRev === "number" && params.beatsPerRev > 0
      ? 360 / params.beatsPerRev
      : params.rotationSpeed ?? 45;

  if (params.stationary) return 0;

  const beatsElapsed = tMs / msPerBeat;
  const timingMode = params.timingMode ?? "smooth";
  const beatPhase =
    timingMode === "beat-jump" ? Math.floor(beatsElapsed) : beatsElapsed;

  let angle = beatPhase * Math.max(1, effectiveDegPerBeat);
  if (params.rotationDirection === "ccw") angle = -angle;
  return ((angle % 360) + 360) % 360;
}

const PIXELS_PER_BLADE = 72;

/**
 * Build POV unrolled blade slices for visualization.
 * Returns array of slicesPerRev entries, each an array of PIXELS_PER_BLADE hex colors.
 */
export function buildBladeSlices(
  ev: ShowEvent | null,
  tempoBpm: number,
  tMs: number,
  blade: "top" | "bottom",
  slicesPerRev: number = 180
): string[][] {
  const black = new Array(PIXELS_PER_BLADE).fill("#000000");
  const allBlack = () => Array.from({ length: slicesPerRev }, () => [...black]);

  if (!ev?.blade) return allBlack();

  const bladeData = blade === "top" ? ev.blade.top : ev.blade.bottom;
  if (!bladeData?.func) return allBlack();

  const params = bladeData.params ?? {};
  const slices = allBlack();

  // bladeLine: compute line positions across all angular slices
  if (bladeData.func === "blade:line") {
    const baseAngle = computeBaseAngle(params, tempoBpm, tMs);
    const lineCount = Math.max(1, Number(params.lineCount ?? 1));
    const thicknessDeg = Math.max(1, Math.ceil((Number(params.thicknessCm ?? 1) / PIXELS_PER_BLADE) * slicesPerRev));
    const degreesPerLine = 360 / lineCount;
    const color = params.solidColor ?? (blade === "top" ? "#66d9ef" : "#f7b955");
    const degreesPerSlice = 360 / slicesPerRev;

    for (let line = 0; line < lineCount; line++) {
      const lineAngle = ((baseAngle + line * degreesPerLine) % 360);
      const centerSlice = Math.round(lineAngle / degreesPerSlice) % slicesPerRev;

      for (let t = -Math.floor(thicknessDeg / 2); t <= Math.floor(thicknessDeg / 2); t++) {
        const sliceIdx = ((centerSlice + t) % slicesPerRev + slicesPerRev) % slicesPerRev;
        for (let p = 0; p < PIXELS_PER_BLADE; p++) {
          slices[sliceIdx][p] = color;
        }
      }
    }
  }

  return slices;
}
