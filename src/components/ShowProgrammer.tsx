// src/pages/ShowProgrammer.tsx
import { useState, useMemo, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import ShowEventsEditor from "../ShowEventEditor";
import SongListEditor, { Song } from "../SongListEditor";
import type {
  Fixture,
  ChannelChain,
  AlignmentGroup,
} from "./ModelLayoutEditor/modelTypes";
import { ShowEvent, resolveSongForEvent } from "../types";
import Visualizer3D from "./Visualizer3D/Visualizer3D";
import type { VisualizerConfig } from "./ModelLayoutEditor/modelTypes";
import { getFunctionDescriptor } from "../functions/registry";
import {
  computePixelColorsForAll,
  buildPixelPositions,
  buildBladeSlices,
} from "../engine/timeline";
import BladePreview from "./BladePreview";

function fmtMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const frac = ms % 1000;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(Math.round(frac)).padStart(3, "0")}`;
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
  editingEvent,
  setEditingEvent,
  mixPath,
  onMixPathChange,
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
  editingEvent?: ShowEvent | null;
  setEditingEvent?: (ev: ShowEvent | null) => void;
  mixPath?: string;
  onMixPathChange?: (path: string) => void;
}) {
  const [status, setStatus] = useState<string>("idle");

  const [songPanelOpen, setSongPanelOpen] = useState<boolean>(false);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editingLabelValue, setEditingLabelValue] = useState<string>("");
  const labelInputRef = useRef<HTMLInputElement>(null);

  // [ADD] row helpers
  function addRow() {
    const next: ShowEvent = {
      id: crypto.randomUUID?.() ?? String(Date.now()),
      songId: songList[0]?.id ?? 0,
      startMs: timeMs ?? 0,
      durationMs: 1000,
      label: "",
    };
    onEventsChange?.([...events, next]);
  }
  function removeRow(idx: number) {
    onEventsChange?.(events.filter((_, i) => i !== idx));
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
      startMs: timeMs ?? 0,
      durationMs: 1000,
      label: "",
    };

    // add to the list and open the editor with a shallow copy
    onEventsChange?.([...events, newEvent]);
    setEditingEvent?.({ ...newEvent });
  }

  // Preview selection: prefer currently editing event, else first event with blade data, else first event
  const previewEvent: ShowEvent | null = useMemo(() => {
    if (editingEvent) return editingEvent;
    const bladeEv = events.find((e) => e.blade !== undefined);
    return bladeEv ?? (events.length ? events[0] : null);
  }, [editingEvent, events]);

  // Pixel world positions for geometry-dependent functions
  const pixelPositions = useMemo(
    () => buildPixelPositions(fixtures),
    [fixtures]
  );

  // Tempo from song list
  const tempoBpm = useMemo(() => {
    if (!previewEvent) return 120;
    const song = songList.find((s) => s.id === previewEvent.songId);
    return song?.tempo ?? 120;
  }, [previewEvent, songList]);

  // ShowProgrammer is a read-only consumer of timeMs from App.tsx.
  // All playback state lives in App.tsx via usePlayback.

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
                Label
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
                Start
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
                <td
                  style={{ paddingTop: 4, paddingBottom: 4, cursor: "text", minWidth: 60 }}
                  onClick={() => {
                    setEditingLabelId(ev.id);
                    setEditingLabelValue(ev.label ?? "");
                    setTimeout(() => labelInputRef.current?.focus(), 0);
                  }}
                >
                  {editingLabelId === ev.id ? (
                    <input
                      ref={labelInputRef}
                      value={editingLabelValue}
                      onChange={(e) => setEditingLabelValue(e.target.value)}
                      onBlur={() => {
                        onEventsChange?.(events.map((e) => e.id === ev.id ? { ...e, label: editingLabelValue } : e));
                        setEditingLabelId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        if (e.key === "Escape") setEditingLabelId(null);
                      }}
                      style={{ width: "100%", fontSize: 11 }}
                    />
                  ) : (
                    <span style={{ fontSize: 11, color: ev.label ? "#ccc" : "#555" }}>
                      {ev.label || "\u2014"}
                    </span>
                  )}
                </td>
                <td style={{ paddingTop: 4, paddingBottom: 4 }}>
                  {resolveSongForEvent(ev.startMs, songList)?.description ?? "\u2014"}
                </td>
                <td style={{ paddingTop: 4, paddingBottom: 4, fontSize: 11, color: "#aaa" }}>
                  {fmtMs(ev.startMs)}
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
                    onClick={() => setEditingEvent?.({ ...ev })}
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
          playheadMs={timeMs}
          mixPath={mixPath}
          onMixPathChange={onMixPathChange}
        />
      </div>

      {/* Right: Preview panel */}
      <div style={{ padding: 12 }}>
        <h3>Preview</h3>

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
                  const fw = resp.fw ?? resp.fw_version ?? "?";
                  const proto = resp.proto ?? resp.proto_version ?? "?";
                  setStatus(
                    `HELLO: ${resp.target} v${fw} (proto ${proto})`
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
                timeMs ?? 0,
                tempoBpm,
                fixtures ?? [],
                getFunctionDescriptor,
                pixelPositions
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
            t={Math.round(timeMs ?? 0)}ms • {tempoBpm} BPM
          </div>
        </div>

        {/* 2D Blade Preview — POV unrolled disk */}
        <h4 style={{ marginTop: 0, marginBottom: 8, fontSize: 14 }}>
          2D Blade Preview
        </h4>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
            marginBottom: 12,
            background: "#1f2023",
            border: "1px dashed #3a3d42",
            borderRadius: 8,
            padding: 8,
          }}
        >
          <BladePreview
            slices={buildBladeSlices(previewEvent, tempoBpm, timeMs ?? 0, "top")}
            label={`Top • ${tempoBpm} BPM • t=${Math.round(timeMs ?? 0)}ms`}
            width={360}
            height={144}
          />
          <BladePreview
            slices={buildBladeSlices(previewEvent, tempoBpm, timeMs ?? 0, "bottom")}
            label={`Bottom • ${tempoBpm} BPM • t=${Math.round(timeMs ?? 0)}ms`}
            width={360}
            height={144}
          />
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
              setEditingEvent?.(null);
            }}
            // cancel/discard
            onCancel={() => setEditingEvent?.(null)}
          />
        )}
      </div>
    </div>
      
  );
}