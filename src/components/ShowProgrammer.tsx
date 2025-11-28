// src/pages/ShowProgrammer.tsx
import React, { useState, useMemo } from "react";
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

export default function ShowProgrammer({
  fixtures = [],
  channels = [],
  alignmentGroups = [],
  songList = [],
  onSongListChange,
  events = [],
  onEventsChange,
}: {
  fixtures?: Fixture[];
  channels?: ChannelChain[];
  alignmentGroups?: AlignmentGroup[];
  songList?: Song[];
  onSongListChange?: (songs: Song[]) => void;
  events?: ShowEvent[];
  onEventsChange?: (events: ShowEvent[]) => void;
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
            <h3 style={{ margin: 0 }}>Events</h3>{" "}
            {/* changed label text */}
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
        <h3>Preview & Program</h3>
        <div
          style={{
            height: 260,
            border: "1px dashed #3a3d42",
            borderRadius: 8,
            marginBottom: 12,
            display: "grid",
            placeItems: "center",
          }}
        >
          <span style={{ opacity: 0.6 }}>POV/Fuselage preview placeholder</span>
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
