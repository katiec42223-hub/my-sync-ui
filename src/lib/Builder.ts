import type { ShowEvent } from "../types";

// Flash layout constants
const HEADER_SIZE = 4096;           // 0x000000 – 0x000FFF: JSON header, zero-padded
const EVENT_TABLE_OFFSET = 4096;    // 0x001000
const EVENT_ENTRY_SIZE = 10;        // bytes per event entry
const MAX_EVENTS = 819;             // floor((0x3000 - 0x1000) / 10) = 819
const PATTERN_POOL_OFFSET = 12288;  // 0x003000

/**
 * Build a binary blob matching the firmware flash layout.
 *
 * Layout:
 *   0x000000  4KB JSON header (UTF-8, zero-padded to 4096 bytes)
 *   0x001000  Event table — 10 bytes per event
 *   0x003000  Pattern pool — length-prefixed UTF-8 JSON entries
 */
export function buildShowBlob(events: ShowEvent[]): Uint8Array {
  const encoder = new TextEncoder();

  // --- Build pattern pool first so we can assign patternIndex ---
  const patternEntries: Uint8Array[] = [];
  const patternJsons: string[] = [];
  const eventPatternIndices: number[] = [];

  for (const ev of events) {
    const patternObj = {
      func: ev.fuselage?.func ?? null,
      params: ev.fuselage?.params ?? {},
    };
    const json = JSON.stringify(patternObj);
    let idx = patternJsons.indexOf(json);
    if (idx === -1) {
      idx = patternJsons.length;
      patternJsons.push(json);
      const encoded = encoder.encode(json);
      // Length-prefixed: u16 LE + UTF-8 bytes
      const entry = new Uint8Array(2 + encoded.length);
      const dv = new DataView(entry.buffer);
      dv.setUint16(0, encoded.length, true);
      entry.set(encoded, 2);
      patternEntries.push(entry);
    }
    eventPatternIndices.push(idx);
  }

  const patternPoolSize = patternEntries.reduce((acc, e) => acc + e.length, 0);

  // --- Build event table ---
  const eventCount = Math.min(events.length, MAX_EVENTS);
  const eventTableSize = eventCount * EVENT_ENTRY_SIZE;

  // --- Build JSON header ---
  const header = {
    formatVersion: "1.0",
    slicesPerRev: 180,
    eventCount,
    patternCount: patternJsons.length,
    eventTableOffset: EVENT_TABLE_OFFSET,
    patternPoolOffset: PATTERN_POOL_OFFSET,
  };
  const headerBytes = encoder.encode(JSON.stringify(header));
  if (headerBytes.length > HEADER_SIZE) {
    throw new Error(`Header JSON exceeds ${HEADER_SIZE} bytes`);
  }

  // --- Assemble blob ---
  const totalSize = PATTERN_POOL_OFFSET + patternPoolSize;
  const blob = new Uint8Array(totalSize);
  const dv = new DataView(blob.buffer);

  // Header region (zero-padded by default since Uint8Array is zeroed)
  blob.set(headerBytes, 0);

  // Event table
  for (let i = 0; i < eventCount; i++) {
    const ev = events[i];
    const off = EVENT_TABLE_OFFSET + i * EVENT_ENTRY_SIZE;
    dv.setUint32(off, ev.startMs >>> 0, true);
    dv.setUint32(off + 4, ev.durationMs >>> 0, true);
    // type: 0x01 = fuselage, 0x02 = blade, 0x03 = both
    const type = ev.fuselage && ev.blade ? 0x03 : ev.blade ? 0x02 : 0x01;
    dv.setUint8(off + 8, type);
    dv.setUint8(off + 9, eventPatternIndices[i] & 0xff);
  }

  // Pattern pool
  let poolOff = PATTERN_POOL_OFFSET;
  for (const entry of patternEntries) {
    blob.set(entry, poolOff);
    poolOff += entry.length;
  }

  return blob;
}

/**
 * Build a human-readable diagnostic log of the show blob contents.
 */
export function buildDiagnosticLog(events: ShowEvent[]): string {
  const lines: string[] = [];

  // Header
  const header = {
    formatVersion: "1.0",
    slicesPerRev: 180,
    eventCount: events.length,
    patternCount: 0,
    eventTableOffset: EVENT_TABLE_OFFSET,
    patternPoolOffset: PATTERN_POOL_OFFSET,
  };

  // Deduplicate patterns
  const patternJsons: string[] = [];
  const eventPatternIndices: number[] = [];
  for (const ev of events) {
    const patternObj = {
      func: ev.fuselage?.func ?? null,
      params: ev.fuselage?.params ?? {},
    };
    const json = JSON.stringify(patternObj);
    let idx = patternJsons.indexOf(json);
    if (idx === -1) {
      idx = patternJsons.length;
      patternJsons.push(json);
    }
    eventPatternIndices.push(idx);
  }
  header.patternCount = patternJsons.length;

  lines.push("=== SHOW BLOB DIAGNOSTIC ===");
  lines.push("");
  lines.push("--- Header (0x000000, 4096 bytes) ---");
  lines.push(JSON.stringify(header, null, 2));
  lines.push("");

  lines.push(`--- Event Table (0x001000, ${events.length} events, ${EVENT_ENTRY_SIZE} bytes each) ---`);
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const off = EVENT_TABLE_OFFSET + i * EVENT_ENTRY_SIZE;
    const type = ev.fuselage && ev.blade ? 0x03 : ev.blade ? 0x02 : 0x01;
    const hex = [
      (ev.startMs >>> 0).toString(16).padStart(8, "0"),
      (ev.durationMs >>> 0).toString(16).padStart(8, "0"),
      type.toString(16).padStart(2, "0"),
      (eventPatternIndices[i] & 0xff).toString(16).padStart(2, "0"),
    ].join(" ");
    lines.push(`  [${i.toString().padStart(3)}] @0x${off.toString(16).padStart(6, "0")}  ${hex}  (start=${ev.startMs}ms dur=${ev.durationMs}ms pat=${eventPatternIndices[i]})`);
  }
  lines.push("");

  lines.push(`--- Pattern Pool (0x003000, ${patternJsons.length} entries) ---`);
  for (let i = 0; i < patternJsons.length; i++) {
    const parsed = JSON.parse(patternJsons[i]);
    lines.push(`  [${i}] func=${parsed.func ?? "(none)"}  params=${JSON.stringify(parsed.params)}`);
  }
  lines.push("");
  lines.push(`Total blob size: ${PATTERN_POOL_OFFSET + patternJsons.reduce((acc, j) => acc + 2 + new TextEncoder().encode(j).length, 0)} bytes`);

  return lines.join("\n");
}
