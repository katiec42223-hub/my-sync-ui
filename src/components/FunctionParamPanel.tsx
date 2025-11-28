import React from "react";
import { listFunctions } from "../functions/registry";

type ParamRow = { key: string; value: string };

export default function FunctionParamPanel({
  funcId,
  params,
  onChangeParam,
}: {
  funcId: string;
  params: ParamRow[];
  onChangeParam: (key: string, value: string) => void;
}) {
  const funcs = listFunctions();
  const fdesc = funcs.find(f => f.id === funcId);

  // Generic fallback if unknown function
  if (!fdesc) {
    return (
      <div style={{ marginTop: 12, padding: 8, border: "1px solid #3a3d42", borderRadius: 6 }}>
        <strong>Parameters for {funcId || "(select function)"}</strong>
        <div style={{ color: "#bbb", fontSize: 12, marginTop: 6 }}>
          No specific UI for this function. Use the generic parameter list below.
        </div>
      </div>
    );
  }

  // Example: vertical sweep UI (extend with more functions later)
  if (funcId === "fuse:verticalSweep") {
    const get = (k: string) => params.find(p => p.key === k)?.value;
    const mode = get("mode") || "smooth";
    return (
      <div style={{ marginTop: 12, padding: 8, border: "1px solid #3a3d42", borderRadius: 6 }}>
        <h4 style={{ marginTop: 0 }}>{fdesc.label} Parameters</h4>

        <label style={{ display: "block", marginBottom: 8 }}>
          Mode:
          <select value={mode} onChange={(e) => onChangeParam("mode", e.target.value)} style={{ marginLeft: 8 }}>
            <option value="smooth">Smooth</option>
            <option value="beat-jump">Beat Jump</option>
          </select>
        </label>

        <label style={{ display: "block", marginBottom: 8 }}>
          Beats per traversal:
          <input
            type="number"
            min={1}
            step={1}
            value={get("beatsPerTraversal") ?? "4"}
            onChange={(e) => onChangeParam("beatsPerTraversal", e.target.value)}
            style={{ marginLeft: 8, width: 120 }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 8 }}>
          Jump subdivision:
          <select
            value={get("jumpSubdivision") ?? "1"}
            onChange={(e) => onChangeParam("jumpSubdivision", e.target.value)}
            disabled={mode !== "beat-jump"}
            style={{ marginLeft: 8 }}
          >
            <option value="4">Whole</option>
            <option value="2">Half</option>
            <option value="1">Quarter</option>
            <option value="0.6667">Half-triplet</option>
            <option value="0.5">Eighth</option>
            <option value="0.3332">Quarter-triplet</option>
            <option value="0.25">Sixteenth</option>
          </select>
        </label>

        <label style={{ display: "block", marginBottom: 8 }}>
          Direction:
          <select
            value={get("direction") ?? "left-to-right"}
            onChange={(e) => onChangeParam("direction", e.target.value)}
            style={{ marginLeft: 8 }}
          >
            <option value="left-to-right">Left → Right</option>
            <option value="right-to-left">Right → Left</option>
          </select>
        </label>

        <label style={{ display: "block", marginBottom: 8 }}>
          Reverse at ends:
          <input
            type="checkbox"
            checked={(get("reverseAtEnds") ?? "false") === "true"}
            onChange={(e) => onChangeParam("reverseAtEnds", e.target.checked ? "true" : "false")}
            style={{ marginLeft: 8 }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 8 }}>
          End hold (beats):
          <input
            type="number"
            min={0}
            step={1}
            value={get("endHoldBeats") ?? "0"}
            onChange={(e) => onChangeParam("endHoldBeats", e.target.value)}
            style={{ marginLeft: 8, width: 120 }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 8 }}>
          Left extent (0–1 or pixel idx):
          <input
            value={get("extentLeft") ?? "0"}
            onChange={(e) => onChangeParam("extentLeft", e.target.value)}
            style={{ marginLeft: 8, width: 140 }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 8 }}>
          Right extent (0–1 or pixel idx):
          <input
            value={get("extentRight") ?? "1"}
            onChange={(e) => onChangeParam("extentRight", e.target.value)}
            style={{ marginLeft: 8, width: 140 }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 8 }}>
          Smoothing:
          <select
            value={get("smoothing") ?? "linear"}
            onChange={(e) => onChangeParam("smoothing", e.target.value)}
            style={{ marginLeft: 8 }}
          >
            <option value="linear">Linear</option>
            <option value="ease-in-out">Ease In-Out</option>
          </select>
        </label>
      </div>
    );
  }

  // Fallback for known function without a hardcoded panel yet
  return (
    <div style={{ marginTop: 12, padding: 8, border: "1px solid #3a3d42", borderRadius: 6 }}>
      <strong>{fdesc.label} Parameters</strong>
      <div style={{ color: "#bbb", fontSize: 12, marginTop: 6 }}>
        Custom panel not implemented; use generic parameter list below.
      </div>
    </div>
  );
}