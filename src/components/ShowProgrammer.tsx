// src/pages/ShowProgrammer.tsx
import React, { useState, useMemo, useEffect, useRef } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import ShowEventsEditor from "../ShowEventEditor";
import SongListEditor, { Song } from "../SongListEditor";
import type {
  Fixture,
  ChannelChain,
  AlignmentGroup,
} from "./ModelLayoutEditor/modelTypes";
import { ShowEvent } from "../types";
import Visualizer3D from "./Visualizer3D/Visualizer3D";
import type { VisualizerConfig } from "./ModelLayoutEditor/modelTypes";
import { getFunctionDescriptor } from "../functions/registry";

type Timetable = {
  version: string;
  target: "blade" | "fuselage";
  duration_ms: number;
  events: any[];
};

// type ShowEvent = {
//   id: string;
//   songId: number;
//   durationMs: number;
//   func: string;
//   payload?: any;
// };

function _resolveColorPattern(params: any, descriptor: any): string[] {
      const raw =
        params?.colorPattern ?? descriptor?.defaultParams?.colorPattern;
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
            .map((s) => s.trim().replace(/^"|"$/g, ""))
            .filter(Boolean);
        }
      }
      return ["#ffffff"];
    }

function computePixelColorsForEvent(
  ev: ShowEvent | null,
  tMs: number,
  tempo: number,
  fixturesList: Fixture[] | null | undefined,
  getDesc: typeof getFunctionDescriptor
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (!ev) return out;

  const fuseFunc = ev.fuselage?.func ?? ev.func;
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
    (fixtureData.pixelIndices ?? []).forEach((pixelIdx: number, idx: number) => {
      if (pixelIdx < 0 || pixelIdx >= pixelCount) return;
      const color = colorPattern[pixelIdx % colorPattern.length] ?? "#ffffff";
      colors[pixelIdx] = color;
    });
    out.set(fixtureData.fixtureId, colors);
  });

  return out;
}

function computePixelColorsForAll(
  eventsList: ShowEvent[] | null | undefined,
  tMs: number,
  tempo: number,
  fixturesList: Fixture[] | null | undefined,
  getDesc: typeof getFunctionDescriptor
): Map<string, string[]> {
  const merged = new Map<string, string[]>();
  const evs = eventsList ?? [];
  if (evs.length === 0) return merged;

  for (const ev of evs) {
    const map = computePixelColorsForEvent(ev, tMs, tempo, fixturesList, getDesc);
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

export default function ShowProgrammer({
  fixtures = [],
  channels = [],
  alignmentGroups = [],
  songList = [],
  onSongListChange,
  events = [],
  onEventsChange,
  onPlay,
  onPause,
  onRewind,
  onForward,
  onSelectSoundtrack,
  soundtrack,
  visualizerConfig,
  playing,
  timeMs,
}: {
  fixtures?: Fixture[];
  channels?: ChannelChain[];
  alignmentGroups?: AlignmentGroup[];
  songList?: Song[];
  onSongListChange?: (songs: Song[]) => void;
  events?: ShowEvent[];
  onEventsChange?: (events: ShowEvent[]) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onRewind?: (ms?: number) => void;
  onForward?: (ms?: number) => void;
  onSelectSoundtrack?: () => void;
  soundtrack?: string;
  visualizerConfig?: VisualizerConfig;
  playing?: boolean;
  timeMs?: number;
 
}) {
  const [tt, setTt] = useState<Timetable | null>(null);
  const [status, setStatus] = useState<string>("idle");
  const [blob, setBlob] = useState<Uint8Array | null>(null);

  const [songPanelOpen, setSongPanelOpen] = useState<boolean>(false);

  const [editingEvent, setEditingEvent] = useState<ShowEvent | null>(null);

  // [ADD] row helpers
  function addRow() {
    const next: ShowEvent = {
      id: crypto.randomUUID?.() ?? String(Date.now()),
      songId: songList[0]?.id ?? 0,
      durationMs: 1000,
      func: "fuse:verticalSweep", // TODO: replace with real function enums
    };
    onEventsChange?.([...events, next]);
  }
  function removeRow(idx: number) {
    onEventsChange?.(events.filter((_, i) => i !== idx));
  }

  async function loadTimetable() {
    try {
      const path = await open({
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (typeof path !== "string") return;
      const txt = await readTextFile(path);
      const json = JSON.parse(txt);

      // Keep top-level timetable object if present, but extract events/songs too
      setTt({
        version: json.version ?? "0.1",
        target: json.target ?? "blade",
        duration_ms: json.duration_ms ?? json.durationMs ?? 0,
        events: json.events ?? json.events ?? [],
      });

      if (Array.isArray(json.events)) {
        // normalize IDs if needed
        onEventsChange?.(
          json.events.map((e: any) => ({ ...e, id: String(e.id) }))
        );
      } else {
        onEventsChange?.([]);
      }

      if (Array.isArray(json.songs)) {
        onSongListChange?.(json.songs);
      } else if (Array.isArray(json.songList)) {
        onSongListChange?.(json.songList);
      } else {
        onSongListChange?.([]);
      }
    } catch (e) {
      console.error("loadTimetable failed:", e);
    }
  }

  function buildBlob() {
    if (!tt) return;
    // Tiny demo “builder”: serialize JSON bytes with a simple header
    const body = new TextEncoder().encode(JSON.stringify(tt));
    const header = new TextEncoder().encode("SYNC0");
    const out = new Uint8Array(header.length + body.length);
    out.set(header, 0);
    out.set(body, header.length);
    setBlob(out);
    setStatus(`built ${out.length} bytes`);
  }

  async function programTarget() {
    if (!blob || !tt) return;
    setStatus("programming…");
    try {
      // Stub; wire to your Rust impl later:
      // await invoke("write_show_to_controllers", { target: tt.target, data: Array.from(blob) });
      await invoke("hello"); // placeholder sanity call
      setStatus("verify ok");
    } catch (e: any) {
      setStatus(`error: ${e?.message ?? e}`);
    }
  }

  function openNewEventEditor() {
    // If there are no songs, open the Song List so the user can add one
    if (songList.length === 0) {
      setSongPanelOpen(true);
      return;
    }

    const newEvent: ShowEvent = {
      id: crypto.randomUUID?.() ?? String(Date.now()),
      songId: songList[0].id,
      durationMs: 1000,
      func: "fuse:verticalSweep",
      payload: {},
    };

    // add to the list and open the editor with a shallow copy
    onEventsChange?.([...events, newEvent]);
    setEditingEvent({ ...newEvent });
  }

  async function saveTimetable() {
    try {
      // Default metadata; you can surface inputs to edit these later
      const payload = {
        version: tt?.version ?? "0.1",
        target: tt?.target ?? "blade",
        duration_ms:
          tt?.duration_ms ??
          events.reduce((acc, e) => acc + (e.durationMs ?? 0), 0),
        events,
        songs: songList,
      };
      const picked = await save({
        filters: [{ name: "Timetable JSON", extensions: ["json"] }],
      });
      if (!picked || typeof picked !== "string") return;
      await writeTextFile(picked, JSON.stringify(payload, null, 2));
      setStatus(`saved ${picked}`);
    } catch (e) {
      console.error("saveTimetable failed:", e);
      setStatus(`save failed: ${String(e)}`);
    }
  }

  // Preview selection: prefer currently editing event, else first blade:line, else first event
  const previewEvent: ShowEvent | null = useMemo(() => {
    if (editingEvent) return editingEvent;
    const bladeEv = events.find((e) => e.func === "blade:line");
    return bladeEv ?? (events.length ? events[0] : null);
  }, [editingEvent, events]);

  // Tempo from song list
  const tempoBpm = useMemo(() => {
    if (!previewEvent) return 120;
    const song = songList.find((s) => s.id === previewEvent.songId);
    return song?.tempo ?? 120;
  }, [previewEvent, songList]);

  // // Playback state
  // const [isPlaying, setIsPlaying] = useState(false);
  // const [playheadMs, setPlayheadMs] = useState(0);
  // const rafRef = React.useRef<number | null>(null);
  // const lastTsRef = React.useRef<number | null>(null);

  // // Controls hook into left-bottom bar callbacks if provided, but drive local state too
  // function handlePlay() {
  //   setIsPlaying(true);
  //   onPlay?.();
  // }
  // function handlePause() {
  //   setIsPlaying(false);
  //   lastTsRef.current = null;
  //   onPause?.();
  // }
  // function handleSeek(deltaMs: number) {
  //   setPlayheadMs((p) => Math.max(0, p + deltaMs));
  //   if (deltaMs < 0) onRewind?.(-deltaMs);
  //   else onForward?.(deltaMs);
  // }



   // Function to compute pixel colors for all events


  

  // Animation loop
  // Animation loop (driven by 'playing' prop)
  // Local animation state (driven by parent's playing/timeMs props)
const [localTimeMs, setLocalTimeMs] = useState(timeMs ?? 0);
const rafRef = useRef<number | null>(null);
const lastTsRef = useRef<number | null>(null);
useEffect(() => {
  if (!playing) {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    lastTsRef.current = null;
    return;
  }
  
  function tick(ts: number) {
    if (lastTsRef.current == null) lastTsRef.current = ts;
    const dt = ts - lastTsRef.current;
    lastTsRef.current = ts;
    
    // Update local state for smooth animation
    setLocalTimeMs((p) => p + dt);
    
    // Update parent state so TopCommandBar timecode updates
    onForward?.(dt);
    
    rafRef.current = requestAnimationFrame(tick);
  }
  
  rafRef.current = requestAnimationFrame(tick);
  
  return () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    lastTsRef.current = null;
  };
}, [playing, onForward]);

// Sync external timeMs to localTimeMs (for rewind/forward)
useEffect(() => {
  if (typeof timeMs === "number" && Math.abs(timeMs - localTimeMs) > 1) {
    setLocalTimeMs(timeMs);
  }
}, [timeMs, localTimeMs]);



  // Compute current base angle like bladeLine.ts
  function computeBaseAngle(params: any, tempo: number, tMs: number): number {
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

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "380px 1fr",
        height: "calc(100vh - 56px)",
      }}
    >
      {/* Left: Timetable panel */}
      <div style={{ borderRight: "1px solid #2f3136", padding: 12 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h3 style={{ margin: 0 }}>Events</h3> {/* changed label text */}
            <button
              onClick={openNewEventEditor}
              style={{ padding: "6px 10px" }}
            >
              + Add Event
            </button>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => setSongPanelOpen(true)}>Song List...</button>
          </div>
        </div>

        {/* ADD: Events table here on the left */}

        <table
          style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}
        >
          <thead>
            <tr>
              <th
                style={{
                  textAlign: "left",
                  borderBottom: "1px solid #3a3d42",
                  paddingBottom: 4,
                }}
              >
                #
              </th>
              <th
                style={{
                  textAlign: "left",
                  borderBottom: "1px solid #3a3d42",
                  paddingBottom: 4,
                }}
              >
                Song
              </th>
              <th
                style={{
                  textAlign: "left",
                  borderBottom: "1px solid #3a3d42",
                  paddingBottom: 4,
                  width: 80,
                }}
              >
                Duration
              </th>
              <th
                style={{
                  textAlign: "left",
                  borderBottom: "1px solid #3a3d42",
                  paddingBottom: 4,
                }}
              />
            </tr>
          </thead>
          <tbody>
            {events.map((ev, idx) => (
              <tr key={ev.id}>
                <td style={{ paddingTop: 4, paddingBottom: 4 }}>{idx + 1}</td>
                <td style={{ paddingTop: 4, paddingBottom: 4 }}>
                  {songList.find((s) => s.id === ev.songId)?.description ??
                    `Song ${ev.songId}`}
                </td>
                <td style={{ paddingTop: 4, paddingBottom: 4 }}>
                  {ev.durationMs}ms
                </td>
                <td
                  style={{
                    paddingTop: 4,
                    paddingBottom: 4,
                    textAlign: "right",
                    display: "flex",
                    gap: 4,
                  }}
                >
                  <button
                    onClick={() => setEditingEvent({ ...ev })}
                    style={{ padding: "2px 6px", fontSize: 11 }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => removeRow(idx)}
                    style={{ padding: "2px 6px", fontSize: 11 }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {/* [ADD] Song List modal */}
        <SongListEditor
          open={songPanelOpen}
          onClose={() => setSongPanelOpen(false)}
          songs={songList}
          onChange={(songs) => onSongListChange?.(songs)}
        />
      </div>

      {/* Right: Preview / Program panel */}
      <div style={{ padding: 12 }}>
        <h3>Preview & Program
        <button
          onClick={buildBlob}
          style={{ marginRight: 8, padding: "6px 12px" }}
        >
          Show/Hide Reference
          </button>
          </h3>

        {/* USB Protocol Test Panel */}
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            background: "#1f2023",
            border: "1px solid #3a3d42",
            borderRadius: 8,
          }}
        >
          <h4 style={{ margin: "0 0 8px 0", fontSize: 14 }}>
            USB Protocol Test
          </h4>
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <button
              onClick={async () => {
                try {
                  const resp = await invoke<any>("send_hello");
                  setStatus(
                    `HELLO: ${resp.target} v${resp.fw_version} (proto ${resp.proto_version})`
                  );
                } catch (e: any) {
                  setStatus(`HELLO failed: ${e}`);
                }
              }}
              style={{ padding: "6px 12px" }}
            >
              HELLO
            </button>

            <button
              onClick={async () => {
                try {
                  await invoke("send_erase");
                  setStatus("ERASE ok");
                } catch (e: any) {
                  setStatus(`ERASE failed: ${e}`);
                }
              }}
              style={{ padding: "6px 12px" }}
            >
              ERASE
            </button>

            <button
              onClick={async () => {
                try {
                  const testData = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
                  await invoke("send_write", {
                    offset: 0,
                    data: Array.from(testData),
                  });
                  setStatus("WRITE ok (4 bytes @ 0)");
                } catch (e: any) {
                  setStatus(`WRITE failed: ${e}`);
                }
              }}
              style={{ padding: "6px 12px" }}
            >
              WRITE (test)
            </button>

            <button
              onClick={async () => {
                try {
                  const crc = await invoke<number>("send_verify");
                  setStatus(
                    `VERIFY ok: CRC16 = 0x${crc.toString(16).padStart(4, "0")}`
                  );
                } catch (e: any) {
                  setStatus(`VERIFY failed: ${e}`);
                }
              }}
              style={{ padding: "6px 12px" }}
            >
              VERIFY
            </button>

            <button
              onClick={async () => {
                try {
                  await invoke("send_start");
                  setStatus("START ok");
                } catch (e: any) {
                  setStatus(`START failed: ${e}`);
                }
              }}
              style={{ padding: "6px 12px" }}
            >
              START
            </button>

            <span
              style={{
                fontSize: 12,
                color: status.includes("failed") ? "#e74c3c" : "#2ecc71",
                marginLeft: 8,
              }}
            >
              {status}
            </span>
          </div>
        </div>

        {/* 3D Visualizer */}
        <div
          style={{
            height: 400,
            background: "#000",
            borderRadius: 8,
            marginBottom: 16,
            position: "relative",
            border: "1px solid #3a3d42",
          }}
        >
          {visualizerConfig && visualizerConfig.fixtures.length > 0 ? (
            <Visualizer3D
              config={visualizerConfig.fixtures}
              fixtures={fixtures}
              pixelColors={computePixelColorsForAll(
                events,
                localTimeMs,
                tempoBpm,
                fixtures ?? [],
                getFunctionDescriptor
              )}
            />
          ) : (
            <div
              style={{
                display: "grid",
                placeItems: "center",
                height: "100%",
                color: "#666",
                fontSize: 14,
              }}
            >
              Configure fixtures in Model Configurator → 3D Layout tab
            </div>
          )}

          {/* Optional: show playhead time overlay */}
          <div
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              background: "rgba(0,0,0,0.7)",
              padding: "4px 8px",
              borderRadius: 4,
              fontSize: 12,
              color: "#bbb",
            }}
          >
            t={Math.round(localTimeMs)}ms • {tempoBpm} BPM
          </div>
        </div>

        {/* Existing 2D Blade Preview label */}
        <h4 style={{ marginTop: 0, marginBottom: 8, fontSize: 14 }}>
          2D Blade Preview
        </h4>

        <div
          style={{
            height: 320,
            border: "1px dashed #3a3d42",
            borderRadius: 8,
            marginBottom: 12,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
            position: "relative",
            background: "#1f2023",
            padding: 8,
          }}
        >
          {/* Top blade preview */}
          <div
            style={{
              display: "grid",
              placeItems: "center",
              position: "relative",
              borderRight: "1px solid #2f3136",
            }}
          >
            {previewEvent ? (
              (() => {
                const paramsTop =
                  previewEvent.blade?.top?.params ??
                  previewEvent.payload?.topParams ??
                  previewEvent.payload?.params ??
                  previewEvent.payload ??
                  {};
                const baseAngleTop = computeBaseAngle(
                  paramsTop,
                  tempoBpm,
                  localTimeMs
                );
                const lineCountTop = Math.max(
                  1,
                  Number(paramsTop.lineCount ?? 1)
                );
                const degreesPerLineTop = 360 / lineCountTop;

                const size = 280;
                const cx = size / 2;
                const cy = size / 2;
                const rOuter = 110;
                const rInner = 80;

                const lines = new Array(lineCountTop).fill(0).map((_, i) => {
                  const angle =
                    ((baseAngleTop + i * degreesPerLineTop) % 360) *
                    (Math.PI / 180);
                  const x1 = cx + Math.cos(angle) * rOuter;
                  const y1 = cy + Math.sin(angle) * rOuter;
                  const x2 = cx + Math.cos(angle) * rInner;
                  const y2 = cy + Math.sin(angle) * rInner;
                  return { x1, y1, x2, y2 };
                });

                return (
                  <svg width={size} height={size}>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={rOuter}
                      fill="none"
                      stroke="#444"
                    />
                    <circle
                      cx={cx}
                      cy={cy}
                      r={rInner}
                      fill="none"
                      stroke="#444"
                    />
                    {lines.map((l, idx) => (
                      <line
                        key={idx}
                        x1={l.x2}
                        y1={l.y2}
                        x2={l.x1}
                        y2={l.y1}
                        stroke="#66d9ef"
                        strokeWidth={Math.max(
                          1,
                          Number(paramsTop.thicknessCm ?? 1)
                        )}
                        strokeLinecap="round"
                      />
                    ))}
                    <text x={8} y={20} fill="#bbb" fontSize="12">
                      Top • {tempoBpm} BPM • t={Math.round(localTimeMs)}ms
                    </text>
                  </svg>
                );
              })()
            ) : (
              <span style={{ opacity: 0.6 }}>No event to preview</span>
            )}
          </div>

          {/* Bottom blade preview */}
          <div
            style={{
              display: "grid",
              placeItems: "center",
              position: "relative",
            }}
          >
            {previewEvent ? (
              (() => {
                const paramsBottom =
                  previewEvent.blade?.bottom?.params ??
                  previewEvent.payload?.bottomParams ??
                  previewEvent.payload?.params ??
                  previewEvent.payload ??
                  {};
                const baseAngleBottom = computeBaseAngle(
                  paramsBottom,
                  tempoBpm,
                  localTimeMs
                );
                const lineCountBottom = Math.max(
                  1,
                  Number(paramsBottom.lineCount ?? 1)
                );
                const degreesPerLineBottom = 360 / lineCountBottom;

                const size = 280;
                const cx = size / 2;
                const cy = size / 2;
                const rOuter = 110;
                const rInner = 80;

                const lines = new Array(lineCountBottom).fill(0).map((_, i) => {
                  const angle =
                    ((baseAngleBottom + i * degreesPerLineBottom) % 360) *
                    (Math.PI / 180);
                  const x1 = cx + Math.cos(angle) * rOuter;
                  const y1 = cy + Math.sin(angle) * rOuter;
                  const x2 = cx + Math.cos(angle) * rInner;
                  const y2 = cy + Math.sin(angle) * rInner;
                  return { x1, y1, x2, y2 };
                });

                return (
                  <svg width={size} height={size}>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={rOuter}
                      fill="none"
                      stroke="#444"
                    />
                    <circle
                      cx={cx}
                      cy={cy}
                      r={rInner}
                      fill="none"
                      stroke="#444"
                    />
                    {lines.map((l, idx) => (
                      <line
                        key={idx}
                        x1={l.x2}
                        y1={l.y2}
                        x2={l.x1}
                        y2={l.y1}
                        stroke="#f7b955"
                        strokeWidth={Math.max(
                          1,
                          Number(paramsBottom.thicknessCm ?? 1)
                        )}
                        strokeLinecap="round"
                      />
                    ))}
                    <text x={8} y={20} fill="#bbb" fontSize="12">
                      Bottom • {tempoBpm} BPM • t={Math.round(localTimeMs)}ms
                    </text>
                  </svg>
                );
              })()
            ) : (
              <span style={{ opacity: 0.6 }}>No event to preview</span>
            )}
          </div>
          </div>

        {/* [ADD] Row editor modal — blade media for the selected event */}
        {editingEvent && (
          <ShowEventsEditor
            // pass the whole event object to the editor
            event={editingEvent}
            songs={songList}
            // called when editor saves; upsert event into events[] and close modal
            fixtures={fixtures.map((f) => f.name)}
            channels={channels.map((ch) => `Ch${ch.controllerChannel}`)}
            alignmentGroups={alignmentGroups.map((g) => g.name)}
            onSave={(evt: ShowEvent) => {
              const exists = events.some((r) => r.id === evt.id);
              const next = exists
                ? events.map((r) => (r.id === evt.id ? evt : r))
                : [...events, evt];
              onEventsChange?.(next);
              setEditingEvent(null);
            }}
            // cancel/discard
            onCancel={() => setEditingEvent(null)}
          />
        )}
        {/* [COMMENT] Hook this table to your Builder later:
    - Iterate events[] in order to compose the .blade/.fuse timeline.
    - Use songList[songId].tempo to compute beat-aligned durations if desired.
*/}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={programTarget} disabled={!blob}>
            Program Device
          </button>
          <span style={{ fontSize: 12, opacity: 0.8 }}>
            {blob ? `${blob.length} bytes ready` : "Nothing built yet"}
          </span>
        </div>
      </div>
    </div>
      
  );
}