// v0.1 – simple, stable header: "SYNC", version=1, count=events
// record: t_ms(u32), channel_id(u8), len(u16), payload[len]
export type RawEvent = {
  t_ms: number;
  channel: string;          // e.g., "start", "bladeTopImage", etc.
  payload?: Uint8Array;     // or build from value/params below
  value?: number | string;
  asset?: string;
  name?: string;
  param?: Record<string, any>;
};

const CHANNEL_IDS: Record<string, number> = {
  start: 1,
  brightnessGlobal: 2,
  bladeTopImage: 10,
  bladeBottomImage: 11,
  bladeBottomPattern: 12,
  // add as needed…
};

function encodePayload(ev: RawEvent): Uint8Array {
  if (ev.payload) return ev.payload;
  if (ev.asset)   return new TextEncoder().encode(JSON.stringify({ asset: ev.asset }));
  if (ev.name)    return new TextEncoder().encode(JSON.stringify({ name: ev.name, param: ev.param ?? {} }));
  if (ev.value!==undefined) return new TextEncoder().encode(JSON.stringify({ value: ev.value }));
  return new Uint8Array();
}

export function buildShowBlob(events: RawEvent[]): Uint8Array {
  const sorted = [...events].sort((a,b)=>a.t_ms-b.t_ms);
  const payloads = sorted.map(encodePayload);
  const sizes = payloads.map(p => p.length);

  // header 4+1+4 = 9 bytes
  const total = 9 + sorted.reduce((acc,_,i)=> acc + (4 + 1 + 2 + sizes[i]), 0);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);

  // magic "SYNC"
  out.set([0x53,0x59,0x4e,0x43], 0);
  dv.setUint8(4, 1);              // version
  dv.setUint32(5, sorted.length, true);

  let off = 9;
  for (let i=0;i<sorted.length;i++){
    const ev = sorted[i];
    const ch = CHANNEL_IDS[ev.channel] ?? 0xff;
    const pl = payloads[i];

    dv.setUint32(off, ev.t_ms >>> 0, true); off += 4;
    dv.setUint8(off, ch); off += 1;
    dv.setUint16(off, pl.length, true); off += 2;
    out.set(pl, off); off += pl.length;
  }
  return out;
}
