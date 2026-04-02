// src/SongListEditor.tsx
import React, { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import TapTempoModal from "./components/TapTempoModal";

export type Song = {
  id: number;
  description: string;
  length_ms?: number;
  tempo: number;
  offsetMs?: number;
  barCount?: number;
  timeSignature?: number;
};

function fmtMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const frac = ms % 1000;
  return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(frac).padStart(3, "0")}`;
}

export default function SongListEditor({
  open: isOpen,
  onClose,
  songs,
  onChange,
  playheadMs,
  mixPath,
  onMixPathChange,
}: {
  open: boolean;
  onClose: () => void;
  songs: Song[];
  onChange: (next: Song[]) => void;
  playheadMs?: number;
  mixPath?: string;
  onMixPathChange?: (path: string) => void;
}) {
  const nextId = useMemo(() => {
    if (!songs || songs.length === 0) return 1;
    return Math.max(...songs.map((s) => s.id)) + 1;
  }, [songs]);

  const [id, setId] = useState<number>(nextId);
  const [desc, setDesc] = useState("");
  const [tempo, setTempo] = useState<number>(160);
  const [offset, setOffset] = useState<number>(0);
  const [barCount, setBarCount] = useState<number>(0);
  const [timeSig, setTimeSig] = useState<number>(4);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDesc, setEditDesc] = useState("");
  const [editTempo, setEditTempo] = useState<number>(160);
  const [editOffset, setEditOffset] = useState<number>(0);
  const [editBarCount, setEditBarCount] = useState<number>(0);
  const [editTimeSig, setEditTimeSig] = useState<number>(4);

  // tapTargetSong: the song being tapped for, or "new" for the new-song row
  const [tapTargetSong, setTapTargetSong] = useState<Song | "new" | null>(null);

  useEffect(() => {
    if (isOpen) {
      setId(nextId);
      setDesc("");
      setTempo(160);
      setOffset(0);
      setBarCount(0);
      setTimeSig(4);
      setEditingId(null);
      setTapTargetSong(null);
    }
  }, [isOpen, nextId]);

  function addSong() {
    const idToUse = Number.isFinite(id) && id > 0 ? id : nextId;
    if (!desc.trim()) return;
    if (!Number.isFinite(tempo) || tempo <= 0) return;

    const offsetMs = Number.isFinite(offset) && offset >= 0 ? offset : 0;
    const bc = barCount > 0 ? barCount : undefined;
    const ts = timeSig > 0 ? timeSig : 4;
    const songData: Song = { id: idToUse, description: desc, tempo, offsetMs, barCount: bc, timeSignature: ts };
    const exists = songs.some((s) => s.id === idToUse);
    const next = exists
      ? songs.map((s) => (s.id === idToUse ? songData : s))
      : [...songs, songData];

    onChange(next.sort((a, b) => a.id - b.id));
    setId(nextId + 1);
    setDesc("");
    setOffset(0);
    setBarCount(0);
    setTimeSig(4);
  }

  function removeSong(removeId: number) {
    onChange(songs.filter((s) => s.id !== removeId));
  }

  function startEdit(song: Song) {
    setEditingId(song.id);
    setEditDesc(song.description);
    setEditTempo(song.tempo);
    setEditOffset(song.offsetMs ?? 0);
    setEditBarCount(song.barCount ?? 0);
    setEditTimeSig(song.timeSignature ?? 4);
  }

  function saveEdit() {
    if (editingId == null) return;
    if (!editDesc.trim() || !Number.isFinite(editTempo) || editTempo <= 0) return;
    const offsetMs = Number.isFinite(editOffset) && editOffset >= 0 ? editOffset : 0;
    const bc = editBarCount > 0 ? editBarCount : undefined;
    const ts = editTimeSig > 0 ? editTimeSig : 4;
    onChange(
      songs.map((s) =>
        s.id === editingId ? { ...s, description: editDesc, tempo: editTempo, offsetMs, barCount: bc, timeSignature: ts } : s
      )
    );
    setEditingId(null);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  function handleTapApply(bpm: number) {
    if (tapTargetSong === "new") {
      setTempo(bpm);
    } else if (tapTargetSong != null) {
      if (editingId === tapTargetSong.id) setEditTempo(bpm);
      onChange(songs.map((s) => (s.id === (tapTargetSong as Song).id ? { ...s, tempo: bpm } : s)));
    }
    setTapTargetSong(null);
  }

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (tapTargetSong != null) {
          setTapTargetSong(null);
        } else if (editingId != null) {
          cancelEdit();
        } else {
          onClose();
        }
      }
    }
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose, editingId, tapTargetSong]);

  if (!isOpen) return null;

  const newSongPlaceholder: Song = { id: nextId, description: desc || "New Song", tempo };

  return (
    <>
      <div style={overlayStyle}>
        <div style={panelStyle}>
          <h3>Song List</h3>

          {/* Mix Track */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, padding: 8, background: "#1a1b1e", borderRadius: 4 }}>
            <span style={{ fontSize: 12, color: "#aaa" }}>Mix Track:</span>
            <span style={{ fontSize: 11, color: "#ccc", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {mixPath ? mixPath.split(/[\\/]/).pop() : "None"}
            </span>
            <button
              onClick={async () => {
                const file = await open({
                  multiple: false,
                  filters: [{ name: "Audio", extensions: ["mp3", "wav", "ogg", "flac", "m4a"] }],
                });
                if (typeof file === "string") onMixPathChange?.(file);
              }}
              style={{ padding: "4px 10px", fontSize: 11 }}
            >
              Load Mix...
            </button>
          </div>

          <table style={{ width: "100%", marginBottom: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>ID</th>
                <th style={{ textAlign: "left" }}>Description</th>
                <th style={{ textAlign: "left" }}>Tempo (BPM)</th>
                <th style={{ textAlign: "left" }}>Starts At</th>
                <th style={{ textAlign: "left" }}>Bars</th>
                <th style={{ textAlign: "left" }}>Time Sig</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {songs.map((s) => {
                const isEditing = editingId === s.id;
                return (
                  <tr key={s.id}>
                    <td>{s.id}</td>
                    <td>
                      {isEditing ? (
                        <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} style={{ width: "100%" }} />
                      ) : s.description}
                    </td>
                    <td>
                      {isEditing ? (
                        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                          <input type="number" value={editTempo} onChange={(e) => setEditTempo(Number(e.target.value))} style={{ width: 70 }} />
                          <button onClick={() => setTapTargetSong(s)} style={tapBtnStyle} title="Tap tempo">🎵</button>
                        </div>
                      ) : s.tempo}
                    </td>
                    <td>
                      {(() => {
                        const t = isEditing ? editTempo : s.tempo;
                        const msPerBeat = t > 0 ? 60000 / t : 1;
                        const off = isEditing ? editOffset : (s.offsetMs ?? 0);
                        const beatPos = (off / msPerBeat).toFixed(2);
                        if (isEditing) {
                          return (
                            <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                              <input type="number" value={editOffset} onChange={(e) => setEditOffset(Number(e.target.value))} style={{ width: 70 }} min={0} />
                              <span style={{ fontSize: 10, color: "#888" }}>{fmtMs(editOffset)}</span>
                              <span style={{ fontSize: 10, color: "#6a9fb5" }}>Beat {beatPos}</span>
                              {playheadMs != null && (
                                <button
                                  onClick={() => setEditOffset(Math.round(playheadMs))}
                                  style={tapBtnStyle}
                                  title={`Set offset to current playhead (${fmtMs(playheadMs)})`}
                                >
                                  ▶ Here
                                </button>
                              )}
                              <span style={{ fontSize: 10, color: "#888" }}>or beat:</span>
                              <input
                                type="number"
                                step="0.01"
                                style={{ width: 50, fontSize: 11 }}
                                onChange={(e) => {
                                  const b = Number(e.target.value);
                                  if (Number.isFinite(b) && b >= 0) setEditOffset(Math.round(b * msPerBeat));
                                }}
                              />
                            </div>
                          );
                        }
                        return (
                          <div style={{ display: "flex", gap: 4, flexDirection: "column", alignItems: "flex-start" }}>
                            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                              <span>{off}</span>
                              <span style={{ fontSize: 10, color: "#888" }}>{fmtMs(off)}</span>
                            </div>
                            <span style={{ fontSize: 10, color: "#6a9fb5" }}>Beat {beatPos}</span>
                          </div>
                        );
                      })()}
                    </td>
                    <td>
                      {isEditing ? (
                        <input type="number" value={editBarCount} onChange={(e) => setEditBarCount(Number(e.target.value))} style={{ width: 50 }} min={0} />
                      ) : (
                        <span>{s.barCount ?? ""}</span>
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input type="number" value={editTimeSig} onChange={(e) => setEditTimeSig(Number(e.target.value))} style={{ width: 40 }} min={1} />
                      ) : (
                        <span>{s.timeSignature ?? 4}</span>
                      )}
                      {(() => {
                        const bc = isEditing ? editBarCount : (s.barCount ?? 0);
                        const ts = isEditing ? editTimeSig : (s.timeSignature ?? 4);
                        const t = isEditing ? editTempo : s.tempo;
                        if (bc > 0 && t > 0) {
                          return <span style={{ fontSize: 10, color: "#888", marginLeft: 4 }}>{fmtMs(bc * ts * (60000 / t))}</span>;
                        }
                        return null;
                      })()}
                    </td>
                    <td style={{ display: "flex", gap: 4 }}>
                      {isEditing ? (
                        <>
                          <button onClick={saveEdit}>Save</button>
                          <button onClick={cancelEdit}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEdit(s)}>Edit</button>
                          <button onClick={() => setTapTargetSong(s)} style={tapBtnStyle} title="Tap tempo">🎵</button>
                          <button onClick={() => removeSong(s.id)}>Delete</button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td><input type="number" value={id} onChange={(e) => setId(Number(e.target.value))} style={{ width: 60 }} /></td>
                <td><input value={desc} onChange={(e) => setDesc(e.target.value)} style={{ width: "100%" }} placeholder="Song description" /></td>
                <td>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <input type="number" value={tempo} onChange={(e) => setTempo(Number(e.target.value))} style={{ width: 70 }} />
                    <button onClick={() => setTapTargetSong("new")} style={tapBtnStyle} title="Tap tempo">🎵</button>
                  </div>
                </td>
                <td>
                  {(() => {
                    const msPerBeat = tempo > 0 ? 60000 / tempo : 1;
                    const beatPos = (offset / msPerBeat).toFixed(2);
                    return (
                      <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                        <input type="number" value={offset} onChange={(e) => setOffset(Number(e.target.value))} style={{ width: 70 }} min={0} />
                        <span style={{ fontSize: 10, color: "#888" }}>{fmtMs(offset)}</span>
                        <span style={{ fontSize: 10, color: "#6a9fb5" }}>Beat {beatPos}</span>
                        {playheadMs != null && (
                          <button
                            onClick={() => setOffset(Math.round(playheadMs))}
                            style={tapBtnStyle}
                            title={`Set offset to current playhead (${fmtMs(playheadMs)})`}
                          >
                            ▶ Here
                          </button>
                        )}
                        <span style={{ fontSize: 10, color: "#888" }}>or beat:</span>
                        <input
                          type="number"
                          step="0.01"
                          style={{ width: 50, fontSize: 11 }}
                          onChange={(e) => {
                            const b = Number(e.target.value);
                            if (Number.isFinite(b) && b >= 0) setOffset(Math.round(b * msPerBeat));
                          }}
                        />
                      </div>
                    );
                  })()}
                </td>
                <td>
                  <input type="number" value={barCount} onChange={(e) => setBarCount(Number(e.target.value))} style={{ width: 50 }} min={0} placeholder="0" />
                </td>
                <td>
                  <input type="number" value={timeSig} onChange={(e) => setTimeSig(Number(e.target.value))} style={{ width: 40 }} min={1} />
                  {barCount > 0 && tempo > 0 && (
                    <span style={{ fontSize: 10, color: "#888", marginLeft: 4 }}>{fmtMs(barCount * timeSig * (60000 / tempo))}</span>
                  )}
                </td>
                <td><button onClick={addSong}>Add</button></td>
              </tr>
            </tbody>
          </table>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button onClick={onClose}>Close</button>
          </div>
        </div>
      </div>

      {tapTargetSong != null && (
        <TapTempoModal
          song={tapTargetSong === "new" ? newSongPlaceholder : tapTargetSong}
          onApply={handleTapApply}
          onClose={() => setTapTargetSong(null)}
        />
      )}
    </>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
};
const panelStyle: React.CSSProperties = {
  width: 920, background: "#202225", color: "white",
  border: "1px solid #2f3136", padding: 16, borderRadius: 8,
  boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
};
const tapBtnStyle: React.CSSProperties = {
  padding: "2px 6px", fontSize: 14, background: "transparent",
  border: "1px solid #3a3d42", borderRadius: 4, cursor: "pointer", color: "white",
};
