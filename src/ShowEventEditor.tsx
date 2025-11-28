// src/ShowEventEditor.tsx
import React, { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { ShowEvent } from "./types";
import type { Song } from "./SongListEditor";

/**
 * ShowEventsEditor
 *
 * Props:
 * - event?: ShowEvent
 * - songs?: Song[]                 // used for song dropdown and tempo lookup
 * - fixtures?: string[]   // model items (empty lists for now)
 * - channels?: string[]
 * - alignmentGroups?: string[]
 * - onSave(evt: ShowEvent)
 * - onCancel()
 *
 * Notes:
 * - Duration is displayed/edited in beats; saved as ms using current song tempo.
 * - Only one assignment mode can be active: fixtures, channels, or groups.
 */

const FUNCTION_LIST = [
  { value: "fuse:noop", label: "No-op" },
  { value: "fuse:smoke", label: "Smoke" },
  { value: "fuse:strobe", label: "Strobe" },
  { value: "fuse:pattern", label: "Pattern" },
];

export default function ShowEventsEditor({
  event,
  songs = [],
  fixtures: availableFixtures = [],
  channels: availableChannels = [],
  alignmentGroups: availableGroups = [],
  onSave,
  onCancel,
}: {
  event?: ShowEvent;
  songs?: Song[];
  fixtures?: string[];
  channels?: string[];
  alignmentGroups?: string[];
  onSave: (evt: ShowEvent) => void;
  onCancel: () => void;
}) {
  // --- Metadata
  const [songId, setSongId] = useState<number>(event?.songId ?? songs[0]?.id ?? 0);
  const [func, setFunc] = useState<string>(event?.func ?? "");
  // beats shown to user; convert to/from ms on save/load
  const tempoForSong = useMemo(() => {
    const s = songs.find((x) => x.id === songId);
    return s?.tempo ?? 160;
  }, [songs, songId]);

  const initialBeats = useMemo(() => {
    if (event?.durationMs && tempoForSong) {
      return (event.durationMs * 60) / (1000 * tempoForSong);
    }
    return 1;
  }, [event?.durationMs, tempoForSong]);

  const [beats, setBeats] = useState<number>(initialBeats);
  const [durationMs, setDurationMs] = useState<number>(event?.durationMs ?? Math.round(1000 * initialBeats * tempoForSong / 60));

  // assignment mode: 'none' | 'fixtures' | 'channels' | 'groups'
  const [assignMode, setAssignMode] = useState<"none" | "fixtures" | "channels" | "groups">(
    (event?.payload?.fixtures?.length ? "fixtures" : event?.payload?.channels?.length ? "channels" : event?.payload?.alignmentGroups?.length ? "groups" : "none")
  );

//state declarations:
const [fixtures, setFixtures] = useState<string[]>(event?.payload?.fixtures ?? []);
const [channels, setChannels] = useState<string[]>(event?.payload?.channels ?? []);
const [alignmentGroups, setAlignmentGroups] = useState<string[]>(event?.payload?.alignmentGroups ?? []);

  // function parameters (key/value rows)
  const [params, setParams] = useState<Array<{ key: string; value: string }>>(
    event?.payload?.params ? Object.entries(event.payload.params).map(([k, v]) => ({ key: k, value: String(v) })) : []
  );

  // blade media (existing)
  const [same, setSame] = useState<boolean>(event?.payload?.sameOnBoth ?? false);
  const [top, setTop] = useState<string[]>(event?.payload?.topFiles ?? []);
  const [bottom, setBottom] = useState<string[]>(event?.payload?.bottomFiles ?? []);

  // re-initialize when event changes
  useEffect(() => {
    setSongId(event?.songId ?? songs[0]?.id ?? 0);
    setFunc(event?.func ?? "");
    const tempo = songs.find((s) => s.id === (event?.songId ?? songs[0]?.id ?? 0))?.tempo ?? 160;
    const initBeats = event?.durationMs ? (event.durationMs * 60) / (1000 * tempo) : 1;
    setBeats(Number.isFinite(initBeats) ? initBeats : 1);
    setDurationMs(event?.durationMs ?? Math.round(1000 * initBeats * tempo / 60));

    setFixtures(event?.payload?.fixtures ?? []);
    setChannels(event?.payload?.channels ?? []);
    setAlignmentGroups(event?.payload?.alignmentGroups ?? []);
    setParams(event?.payload?.params ? Object.entries(event.payload.params).map(([k, v]) => ({ key: k, value: String(v) })) : []);
    setSame(event?.payload?.sameOnBoth ?? false);
    setTop(event?.payload?.topFiles ?? []);
    setBottom(event?.payload?.bottomFiles ?? []);
    setAssignMode(event?.payload?.fixtures?.length ? "fixtures" : event?.payload?.channels?.length ? "channels" : event?.payload?.alignmentGroups?.length ? "groups" : "none");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id]);

  // update durationMs whenever beats or tempo changes (keeps ms in sync for display/save)
  useEffect(() => {
    const ms = Math.round(1000 * beats * tempoForSong / 60);
    setDurationMs(ms);
  }, [beats, tempoForSong]);

  // --- helpers
  function toggleSelect(listSetter: (fn: (prev: string[]) => string[]) => void, value: string) {
    listSetter((prev) => (prev.includes(value) ? prev.filter((p) => p !== value) : [...prev, value]));
  }

  async function pickTop() {
    const sel = await open({
      multiple: true,
      filters: [{ name: "Blade media", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "mp4", "webm"] }],
    });
    if (Array.isArray(sel)) setTop(sel as string[]);
    else if (typeof sel === "string") setTop([sel]);
  }

  async function pickBottom() {
    if (same) return;
    const sel = await open({
      multiple: true,
      filters: [{ name: "Blade media", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "mp4", "webm"] }],
    });
    if (Array.isArray(sel)) setBottom(sel as string[]);
    else if (typeof sel === "string") setBottom([sel]);
  }

  // params helpers
  function addParam() {
    setParams((p) => [...p, { key: "", value: "" }]);
  }
  function removeParam(idx: number) {
    setParams((p) => p.filter((_, i) => i !== idx));
  }
  function setParamKey(idx: number, key: string) {
    setParams((p) => p.map((r, i) => (i === idx ? { ...r, key } : r)));
  }
  function setParamValue(idx: number, value: string) {
    setParams((p) => p.map((r, i) => (i === idx ? { ...r, value } : r)));
  }

  // Save: build payload and convert beats->ms using current tempo
  function handleSave() {
    const payload: any = {
      sameOnBoth: same,
      topFiles: top,
      bottomFiles: same ? top : bottom,
      fixtures,
      channels,
      alignmentGroups,
      params: params.reduce((acc: Record<string, any>, { key, value }) => {
        if (!key) return acc;
        const num = Number(value);
        if (value === "true") acc[key] = true;
        else if (value === "false") acc[key] = false;
        else if (!Number.isNaN(num) && value.trim() !== "") acc[key] = num;
        else acc[key] = value;
        return acc;
      }, {}),
    };

    const ms = Math.round(1000 * beats * tempoForSong / 60);

    onSave({
      id: event?.id ?? "",
      songId,
      durationMs: ms,
      func,
      payload,
    });
  }

  // --- UI
  return (
    <div style={overlay}>
      <div style={panel}>
        <h3>Event — Edit</h3>

        {/* Song / Function / Duration (beats) */}
        <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12 }}>Song</label>
            <select value={songId} onChange={(e) => setSongId(Number(e.target.value))} style={{ width: "100%" }}>
              {songs.length === 0 && <option value={0}>No songs</option>}
              {songs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id} — {s.description}
                </option>
              ))}
            </select>
          </div>

          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12 }}>Function</label>
            <select value={func} onChange={(e) => setFunc(e.target.value)} style={{ width: "100%" }}>
              {FUNCTION_LIST.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          <div style={{ width: 160 }}>
            <label style={{ fontSize: 12 }}>Duration (beats)</label>
            <input 
                type="number" 
                step="1"
                min="1"
                value={Math.round(beats)}
                onChange={(e) => setBeats(Number(e.target.value) || 0)} 
                style={{ width: "100%" }} 
                />
            <div style={{ fontSize: 11, color: "#bbb", marginTop: 4 }}>
              {durationMs} ms @ {tempoForSong} BPM
            </div>
          </div>
        </div>

        {/* Assignment mode selectors (choose one) */}
        <div style={{ display: "flex", gap: 12, marginBottom: 8, alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="radio" name="assignMode" checked={assignMode === "fixtures"} onChange={() => setAssignMode("fixtures")} />
            Assign Fixtures
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="radio" name="assignMode" checked={assignMode === "channels"} onChange={() => setAssignMode("channels")} />
            Assign Channels
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="radio" name="assignMode" checked={assignMode === "groups"} onChange={() => setAssignMode("groups")} />
            Assign Groups
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="radio" name="assignMode" checked={assignMode === "none"} onChange={() => setAssignMode("none")} />
            None
          </label>
        </div>

        {/* Selection lists (multi-select) */}
        <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
          {/* Fixtures */}
          <div style={{ flex: 1 }}>
            <strong>Fixtures</strong>
            <div style={{ minHeight: 80, border: assignMode === "fixtures" ? "1px solid #6fa8ff" : "1px dashed #3a3d42", padding: 8, marginTop: 6 }}>
              {availableFixtures.length === 0 ? <em style={{ color: "#999" }}>No fixtures available</em> : null}
                {availableFixtures.map((f) => (
                <label key={f} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span>{f}</span>
                  <input
                    type="checkbox"
                    disabled={assignMode !== "fixtures"}
                    checked={fixtures.includes(f)}
                    onChange={() => toggleSelect(setFixtures, f)}
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Channels */}
          <div style={{ flex: 1 }}>
            <strong>Channels</strong>
            <div style={{ minHeight: 80, border: assignMode === "channels" ? "1px solid #6fa8ff" : "1px dashed #3a3d42", padding: 8, marginTop: 6 }}>
              {availableChannels.length === 0 ? <em style={{ color: "#999" }}>No channels available</em> : null}
                {availableChannels.map((c) => (
                <label key={c} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span>{c}</span>
                  <input
                    type="checkbox"
                    disabled={assignMode !== "channels"}
                    checked={channels.includes(c)}
                    onChange={() => toggleSelect(setChannels, c)}
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Groups */}
          <div style={{ flex: 1 }}>
            <strong>Groups</strong>
            <div style={{ minHeight: 80, border: assignMode === "groups" ? "1px solid #6fa8ff" : "1px dashed #3a3d42", padding: 8, marginTop: 6 }}>
              {availableGroups.length === 0 ? <em style={{ color: "#999" }}>No groups available</em> : null}
                {availableGroups.map((g) => (
                <label key={g} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span>{g}</span>
                  <input
                    type="checkbox"
                    disabled={assignMode !== "groups"}
                    checked={alignmentGroups.includes(g)}
                    onChange={() => toggleSelect(setAlignmentGroups, g)}
                  />
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Function-specific parameters area */}
        <div style={{ marginTop: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>Parameters for {func || "(select function)"}</strong>
            <div>
              <button onClick={addParam}>Add Param</button>
            </div>
          </div>
          <div style={{ marginTop: 8 }}>
            {params.length === 0 ? <em style={{ color: "#999" }}>No parameters added</em> : null}
            {params.map((p, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <input value={p.key} onChange={(e) => setParamKey(i, e.target.value)} placeholder="key" style={{ width: 160 }} />
                <input value={p.value} onChange={(e) => setParamValue(i, e.target.value)} placeholder="value" style={{ flex: 1 }} />
                <button onClick={() => removeParam(i)}>Remove</button>
              </div>
            ))}
          </div>
        </div>

        <hr style={{ margin: "12px 0" }} />

        {/* Blade media */}
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <input type="checkbox" checked={same} onChange={(e) => setSame(e.target.checked)} />
          Same media on both blades (1B)
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={box}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <strong>Top (B1)</strong>
              <button onClick={pickTop}>Upload… (1C)</button>
            </div>
            <div style={scroll}>
              {top.length === 0 ? <em>No files selected</em> : top.map((p) => <div key={p}>{p}</div>)}
            </div>
          </div>

          <div style={box}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <strong>Bottom (B2)</strong>
              <button onClick={pickBottom} disabled={same} title={same ? "Disabled by Same on both" : ""}>
                Upload… (1D)
              </button>
            </div>
            <div style={scroll}>
              {same ? <em>Mirroring Top</em> : bottom.length === 0 ? <em>No files selected</em> : bottom.map((p) => <div key={p}>{p}</div>)}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <button onClick={() => onCancel()}>Cancel</button>
          <button onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100 };
const panel: React.CSSProperties = { width: 900, maxHeight: "85vh", overflowY: "auto", background: "#202225", color: "white", border: "1px solid #2f3136", padding: 16, borderRadius: 8 };
const box: React.CSSProperties = { border: "1px dashed #3a3d42", padding: 8, borderRadius: 6, minHeight: 120 };
const scroll: React.CSSProperties = { maxHeight: 200, overflowY: "auto", fontSize: 12 };