// src/ShowEventEditor.tsx
import React, { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { ShowEvent, BladeMedia } from "./types";

export default function ShowEventsEditor({
  event,
  onSave,
  onCancel,
}: {
  event?: ShowEvent;
  onSave: (evt: ShowEvent) => void;
  onCancel: () => void;
}) {
  // local editable copies
  const [same, setSame] = useState<boolean>(event?.payload?.sameOnBoth ?? false);
  const [top, setTop] = useState<string[]>(event?.payload?.topFiles ?? []);
  const [bottom, setBottom] = useState<string[]>(event?.payload?.bottomFiles ?? []);

  // initialize local state whenever the supplied `event` changes
  useEffect(() => {
    setSame(event?.payload?.sameOnBoth ?? false);
    setTop(event?.payload?.topFiles ?? []);
    setBottom(event?.payload?.bottomFiles ?? []);
  }, [event?.id, event?.payload]);

  async function pickTop() {
    const sel = await open({
      multiple: true,
      filters: [{ name: "Blade media", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "mp4", "webm"] }],
    });
    if (Array.isArray(sel)) setTop(sel as string[]);
    else if (typeof sel === "string") setTop([sel]);
  }

  async function pickBottom() {
    if (same) return; // disabled when “same on both” is checked
    const sel = await open({
      multiple: true,
      filters: [{ name: "Blade media", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "mp4", "webm"] }],
    });
    if (Array.isArray(sel)) setBottom(sel as string[]);
    else if (typeof sel === "string") setBottom([sel]);
  }

  function handleSave() {
    const payload = { sameOnBoth: same, topFiles: top, bottomFiles: same ? top : bottom };
    onSave({
      id: event?.id ?? "",
      songId: event?.songId ?? 0,
      durationMs: event?.durationMs ?? 0,
      func: event?.func ?? "",
      payload,
    });
  }

  return (
    <div style={overlay}>
      <div style={panel}>
        <h3>Blade Media</h3>

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

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12, gap: 8 }}>
          <button onClick={() => onCancel()}>Cancel</button>
          <button onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100 };
const panel: React.CSSProperties = { width: 720, background: "#202225", color: "white", border: "1px solid #2f3136", padding: 16, borderRadius: 8 };
const box: React.CSSProperties = { border: "1px dashed #3a3d42", padding: 8, borderRadius: 6, minHeight: 160 };
const scroll: React.CSSProperties = { maxHeight: 140, overflowY: "auto", fontSize: 12 };