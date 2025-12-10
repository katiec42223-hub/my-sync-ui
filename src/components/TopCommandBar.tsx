import React, { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";            // Tauri v2
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { exit } from "@tauri-apps/plugin-process";
import { VisualizerConfig } from "./ModelLayoutEditor/modelTypes";


type Target = "blade" | "fuselage" | "both";

type Props = {
  onOpenModelEditor?: () => void;
  onPlay?: () => void;
  onPause?: () => void;
  onRewind?: (ms?: number) => void;
  onForward?: (ms?: number) => void;
  onProjectLoaded?: (json: any, path?: string) => void;
  onProjectSaved?: (path: string) => void;
  getProjectJson?: () => any;         // return current project JSON to save
  defaultJumpMs?: number;             // rewind/forward step (default 5000ms)
  visualizerConfig?: VisualizerConfig;
  onVisualizerConfigChange?: (config: VisualizerConfig) => void;
};

const usbRegex = /(usb(modem|serial)|cu\.usb|tty\.usb)/i;

function TopbarMenu({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const closeTimer = React.useRef<number | null>(null);

  // start a delayed close
  const scheduleClose = React.useCallback(() => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 200);
  }, []);

  // cancel closing if we re-enter
  const cancelClose = React.useCallback(() => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setOpen(true);
  }, []);

  return (
    <div style={groupStyle}>
      <div
        style={menuStyle}                  // position: "relative" already
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
        onClick={() => setOpen(v => !v)}   // click-to-toggle too
      >
        {label} ▾
        <div
          style={{
            ...dropdownStyle,
            top: "calc(100% + 2px)",       // avoid touching the label edge
            display: open ? "flex" : "none",
          }}
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          {children}
        </div>
      </div>
    </div>
  );
}



export default function TopCommandBar({
    onOpenModelEditor,
  onPlay,
  onPause,
  onRewind,
  onForward,
  onProjectLoaded,
  onProjectSaved,
  getProjectJson,
  defaultJumpMs = 5000,
}: Props) {
  const [ports, setPorts] = useState<string[]>([]);
  const [showNonUsb, setShowNonUsb] = useState(false);
  const [selectedPort, setSelectedPort] = useState<string>("");
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"idle" | "ok" | "busy" | "err">("idle");
  const [target, setTarget] = useState<Target>("blade");
  const [playing, setPlaying] = useState(false);
  const [timeMs, setTimeMs] = useState(0);
  const [projectPath, setProjectPath] = useState<string | undefined>(undefined);
  const [selectedFuselagePort, setSelectedFuselagePort] = useState<string>("");
  const [selectedBladePort, setSelectedBladePort] = useState<string>("");


  // Time readout mm:ss.mmm
  const timecode = useMemo(() => {
    const ms = Math.max(0, timeMs);
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const f = Math.floor(ms % 1000);
    const pad = (n: number, w = 2) => n.toString().padStart(w, "0");
    const pad3 = (n: number) => n.toString().padStart(3, "0");
    return `${pad(m)}:${pad(s)}.${pad3(f)}`;
  }, [timeMs]);

  // Load serial ports (USB first, Bluetooth hidden by default)
  async function refreshPorts() {
    try {
      const p = await invoke<string[]>("list_ports");
      setPorts(p);
      if (!selectedPort) {
        const firstUsb = p.find((name) => usbRegex.test(name));
        setSelectedPort(firstUsb ?? p[0] ?? "");
      }
    } catch (e) {
      console.error("list_ports failed:", e);
    }
  }

  useEffect(() => {
    refreshPorts();
  }, []);

  const filteredPorts = useMemo(() => {
    if (showNonUsb) return ports;
    return ports.filter((p) => usbRegex.test(p));
  }, [ports, showNonUsb]);

  async function handleConnect() {
    if (!selectedPort) return;
    setBusy(true);
    setStatus("busy");
    try {
      // Implement this command on the Rust side later.
      // Example signature: connect(port: String, baud: u32)
      await invoke("connect", { port: selectedPort, baud: 115200 });
      // Optional sanity ping:
      const hello = await invoke<any>("hello").catch(() => undefined);
      console.log("HELLO:", hello);
      setConnected(true);
      setStatus("ok");
    } catch (e) {
      console.error("connect failed:", e);
      setConnected(false);
      setStatus("err");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setBusy(true);
    setStatus("busy");
    try {
      await invoke("disconnect");
      setConnected(false);
      setStatus("idle");
    } catch (e) {
      console.error("disconnect failed:", e);
      setStatus("err");
    } finally {
      setBusy(false);
    }
  }

  async function handleOpen() {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "SYNCHRON Project", extensions: ["syncproj", "json"] }],
      });
      if (typeof selected === "string") {
        const txt = await readTextFile(selected);
        const json = JSON.parse(txt);
        setProjectPath(selected);
        onProjectLoaded?.(json, selected);
      }
    } catch (e) {
      console.error("open failed:", e);
    }
  }

  async function handleSave(saveAs = false) {
    try {
      let dest = projectPath;
      if (!dest || saveAs) {
        const result = await save({
          filters: [{ name: "SYNCHRON Project", extensions: ["syncproj", "json"] }],
          defaultPath: dest,
        });
        dest = typeof result === "string" ? result : undefined;
      }
      if (!dest) return;

      const data = getProjectJson?.() ?? { version: "0.1", events: [] };
      await writeTextFile(dest, JSON.stringify(data, null, 2));
      setProjectPath(dest);
      onProjectSaved?.(dest);
      localStorage.setItem('lastProjectPath', dest);  
      console.log("Saved path to local", dest);
    } catch (e) {
      console.error("save failed:", e);
    }
  }

  async function handleExit() {
    try {
      await exit(0);
    } catch (e) {
      console.error("exit failed:", e);
    }
  }

  async function handleWriteShow() {
    setBusy(true);
    setStatus("busy");
    try {
      // Implement this on the Rust side; sample signature:
      // write_show_to_controllers(target: "blade"|"fuselage"|"both")
      await invoke("write_show_to_controllers", { target });
      setStatus("ok");
    } catch (e) {
      console.error("write_show_to_controllers failed:", e);
      setStatus("err");
    } finally {
      setBusy(false);
    }
  }

  function handlePlayPause() {
    if (playing) {
      setPlaying(false);
      onPause?.();
    } else {
      setPlaying(true);
      onPlay?.();
    }
  }

  function jump(dir: -1 | 1) {
    const delta = defaultJumpMs * dir;
    const next = Math.max(0, timeMs + delta);
    setTimeMs(next);
    if (dir < 0) onRewind?.(defaultJumpMs);
    else onForward?.(defaultJumpMs);
  }

  // Simple pill color
  const pillColor =
    status === "ok" ? "#2ecc71" : status === "busy" ? "#f39c12" : status === "err" ? "#e74c3c" : "#95a5a6";

  return (
  <div style={barStyle}>
    {/* File menu */}
    <TopbarMenu label="File">
      <button onClick={handleOpen}>Open… ⌘O</button>
      <button onClick={() => handleSave(false)}>Save ⌘S</button>
      <button onClick={() => handleSave(true)}>Save As… ⇧⌘S</button>
      <button onClick={handleExit}>Exit ⌘Q</button>
    </TopbarMenu>

    {/* Tools menu */}
    <TopbarMenu label="Tools">
      <button onClick={() => onOpenModelEditor?.()}>Model Layout Editor</button>
    </TopbarMenu>

{/* 
    * Transport *
    <div style={groupStyle}>
      <button onClick={() => jump(-1)} title="Rewind (J)">⟲</button>
      <button onClick={handlePlayPause} title="Play/Pause (Space)">{playing ? "⏸" : "▶"}</button>
      <button onClick={() => jump(1)} title="Forward (L)">⟶</button>
      <span style={{ marginLeft: 8, fontVariantNumeric: "tabular-nums" }}>{timecode}</span>
    </div> 
    */}

    {/* Target & Port */}
    <div style={groupStyle}>
      <span style={{ marginRight: 6 }}>Target:</span>
      <label style={radioStyle}><input type="radio" name="tgt" checked={target==="blade"} onChange={()=>setTarget("blade")} /> Blade</label>
      <label style={radioStyle}><input type="radio" name="tgt" checked={target==="fuselage"} onChange={()=>setTarget("fuselage")} /> Fuselage</label>
      <label style={radioStyle}><input type="radio" name="tgt" checked={target==="both"} onChange={()=>setTarget("both")} /> Both</label>

      {target === "both" ? (
  <>
    <span style={{ marginRight: 6 }}>Fuselage Port:</span>
    <select
      value={selectedFuselagePort}
      onChange={(e) => setSelectedFuselagePort(e.target.value)}
      style={{ marginLeft: 0, minWidth: 180 }}
      title="Fuselage Serial Port"
    >
      {filteredPorts.map((p) => (
        <option key={p} value={p}>{p}</option>
      ))}
    </select>
    <span style={{ margin: "0 6px" }}>Blade Port:</span>
    <select
      value={selectedBladePort}
      onChange={(e) => setSelectedBladePort(e.target.value)}
      style={{ marginLeft: 0, minWidth: 180 }}
      title="Blade Serial Port"
    >
      {filteredPorts.map((p) => (
        <option key={p} value={p}>{p}</option>
      ))}
    </select>
  </>
) : (
  <select
    value={selectedPort}
    onChange={(e) => setSelectedPort(e.target.value)}
    style={{ marginLeft: 12, minWidth: 260 }}
    title="Serial Port"
  >
    {filteredPorts.map((p) => (
      <option key={p} value={p}>{p}</option>
    ))}
  </select>
)}

      <label style={{ marginLeft: 8, fontSize: 12 }}>
        <input
          type="checkbox"
          checked={showNonUsb}
          onChange={(e) => setShowNonUsb(e.target.checked)}
        /> Show non-USB ports
      </label>

      <button
        onClick={connected ? handleDisconnect : handleConnect}
        disabled={!selectedPort || busy}
        style={{ marginLeft: 12 }}
        title={connected ? "Disconnect" : "Connect"}
      >
        {connected ? "Disconnect" : "Connect"}
      </button>

      <span style={{ ...pillStyle, background: pillColor }} title={`Status: ${status}`} />
    </div>

    {/* Primary action */}
    <div style={groupStyle}>
      <button onClick={handleWriteShow} disabled={busy || (playing && true)} style={primaryBtnStyle}>
        Write Show to Controllers
      </button>
    </div>
  </div>
);

}

// --- inline styles (simple / tweak as you like) ---
const barStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 16,
  padding: "8px 12px",
  background: "#202225",
  color: "white",
  borderBottom: "1px solid #2f3136",
  position: "sticky",
  top: 0,
  zIndex: 2000,
  userSelect: "none",
  whiteSpace: "nowrap",
  overflowX: "visible",
  overflowY: "visible",
};

const groupStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const radioStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 4,
  marginLeft: 6,
};

const pillStyle: React.CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: 10,
  display: "inline-block",
  marginLeft: 8,
  border: "1px solid rgba(255,255,255,0.4)",
};

const menuStyle: React.CSSProperties = {
  position: "relative",
  padding: "4px 8px",
  borderRadius: 4,
  background: "rgba(255,255,255,0.06)",
  cursor: "default",
};

const dropdownStyle: React.CSSProperties = {
  position: "absolute",
  left: 0,
  // top is set dynamically in the component so we can add a small gap
  flexDirection: "column",
  background: "#2b2d31",
  padding: 6,
  borderRadius: 6,
  border: "1px solid #3a3d42",
  zIndex: 3000, // higher than bar
  boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
  minWidth: 180,
};

const primaryBtnStyle: React.CSSProperties = {
  padding: "8px 14px",
  background: "#4f46e5",
  color: "white",
  borderRadius: 8,
  border: "none",
  fontWeight: 600,
};

// show dropdown on hover (tiny CSS helper)
const styleTag = document.createElement("style");
styleTag.innerHTML = `
  .topbar-dropdown { display: none; }
  [style*="File ▾"] .topbar-dropdown { display: none; }
`;
document.head.appendChild(styleTag);

