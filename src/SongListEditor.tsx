// src/SongListEditor.tsx
import React, { useEffect, useMemo, useState } from "react";

export type Song = {
  id: number;
  description: string;
  length_ms?: number;
  tempo: number;
};

export default function SongListEditor({
  open,
  onClose,
  songs,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  songs: Song[];
  onChange: (next: Song[]) => void;
}) {
  // compute the next available id (max existing + 1)
  const nextId = useMemo(() => {
    if (!songs || songs.length === 0) return 1;
    return Math.max(...songs.map((s) => s.id)) + 1;
  }, [songs]);

  const [id, setId] = useState<number>(nextId);
  const [desc, setDesc] = useState("");
  const [tempo, setTempo] = useState<number>(160);

  // when opening, prefill the id with the auto-increment suggestion
  useEffect(() => {
    if (open) {
      setId(nextId);
      setDesc("");
      setTempo(160);
    }
  }, [open, nextId]);

  function addSong() {
    // if user leaves id non-positive, use auto id
    const idToUse = Number.isFinite(id) && id > 0 ? id : nextId;
    if (!desc.trim()) return;
    if (!Number.isFinite(tempo) || tempo <= 0) return;

    const exists = songs.some((s) => s.id === idToUse);
    const next = exists
      ? songs.map((s) => (s.id === idToUse ? { id: idToUse, description: desc, tempo } : s))
      : [...songs, { id: idToUse, description: desc, tempo }];

    onChange(next.sort((a, b) => a.id - b.id));
    // prepare for next add: bump suggested id
    setId(nextId + 1);
    setDesc("");
  }

  function removeSong(removeId: number) {
    onChange(songs.filter((s) => s.id !== removeId));
  }

  if (!open) return null;
  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <h3>Song List</h3>
        <table style={{ width: "100%", marginBottom: 12 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>ID</th>
              <th style={{ textAlign: "left" }}>Description</th>
              <th style={{ textAlign: "left" }}>Tempo (BPM)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {songs.map((s) => (
              <tr key={s.id}>
                <td>{s.id}</td>
                <td>{s.description}</td>
                <td>{s.tempo}</td>
                <td>
                  <button onClick={() => removeSong(s.id)}>Delete</button>
                </td>
              </tr>
            ))}
            <tr>
              <td>
                <input
                  type="number"
                  value={id}
                  onChange={(e) => setId(Number(e.target.value))}
                  style={{ width: 80 }}
                />
              </td>
              <td>
                <input
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  style={{ width: "100%" }}
                  placeholder="Song description"
                />
              </td>
              <td>
                <input
                  type="number"
                  value={tempo}
                  onChange={(e) => setTempo(Number(e.target.value))}
                  style={{ width: 100 }}
                />
              </td>
              <td>
                <button onClick={addSong}>Add/Update</button>
              </td>
            </tr>
          </tbody>
        </table>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.35)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};
const panelStyle: React.CSSProperties = {
  width: 600,
  background: "#202225",
  color: "white",
  border: "1px solid #2f3136",
  padding: 16,
  borderRadius: 8,
  boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
};