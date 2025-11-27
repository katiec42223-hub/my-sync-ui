// src/components/ModelLayoutEditor/autopixel.ts
import { ChannelChain, Fixture } from "./modelTypes";

/**
 * Computes pixelOffset per fixture using channel fixtureOrder + each fixture's pixelCount.
 * Returns { nextFixtures, warnings[] }
 */
export function computeAutoPixelIndex(
  channels: ChannelChain[],
  fixtures: Fixture[]
): { nextFixtures: Fixture[]; warnings: string[] } {
  const byId = new Map(fixtures.map((f) => [f.id, f]));
  const warnings: string[] = [];
  const updated = new Map<string, number>(); // fixtureId -> new offset

  for (const ch of channels) {
    let cursor = 0;
    for (const fid of ch.fixtureOrder) {
      const f = byId.get(fid);
      if (!f) {
        warnings.push(`Channel ${ch.controllerChannel}: fixture "${fid}" not found`);
        continue;
      }
      if (f.pixelCount == null || Number.isNaN(f.pixelCount)) {
        warnings.push(`Fixture "${f.id}" has no pixelCount; leaving offset unchanged`);
        continue;
      }

      // Set this fixture's offset to current cursor
      updated.set(f.id, cursor);

      // Advance cursor by this fixture's length
      cursor += f.pixelCount;
    }
  }

  // Build the next array
  const nextFixtures = fixtures.map((f) =>
    updated.has(f.id) ? { ...f, pixelOffset: updated.get(f.id)! } : f
  );

  return { nextFixtures, warnings };
}
