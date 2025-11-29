import React from "react";
import { listFunctions } from "../functions/registry";

type ParamRow = { key: string; value: string };

export default function FunctionParamPanel({
  funcId,
  params,
  onChangeParam,
}: {
  funcId: string;
  params: Record<string, any>;  // Changed from ParamRow[]
  onChangeParam: (key: string, value: string) => void;
}) {
  const funcs = listFunctions();
  const fdesc = funcs.find((f) => f.id === funcId);

  // Generic fallback if unknown function
  if (!fdesc) {
    return (
      <div
        style={{
          marginTop: 12,
          padding: 8,
          border: "1px solid #3a3d42",
          borderRadius: 6,
        }}
      >
        <strong>Parameters for {funcId || "(select function)"}</strong>
        <div style={{ color: "#bbb", fontSize: 12, marginTop: 6 }}>
          No specific UI for this function. Use the generic parameter list
          below.
        </div>
      </div>
    );
  }

  // Example: vertical sweep UI (extend with more functions later)
  if (funcId === "fuse:verticalSweep") {
    const get = (k: string) => String(params[k] ?? "");
    const mode = get("mode") || "smooth";
    return (
      <div
        style={{
          marginTop: 12,
          padding: 8,
          border: "1px solid #3a3d42",
          borderRadius: 6,
        }}
      >
        <h4 style={{ marginTop: 0 }}>{fdesc.label} Parameters</h4>

        <label style={{ display: "block", marginBottom: 8 }}>
          Mode:
          <select
            value={mode}
            onChange={(e) => onChangeParam("mode", e.target.value)}
            style={{ marginLeft: 8 }}
          >
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
            onChange={(e) =>
              onChangeParam(
                "reverseAtEnds",
                e.target.checked ? "true" : "false"
              )
            }
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

  if (funcId === "blade:line") {
    const get = (k: string) => String(params[k] ?? "");
    const colorMode = get("colorMode") || "solid";
    const stationary = (get("stationary") ?? "true") === "true";

    return (
      <div
        style={{
          marginTop: 12,
          padding: 8,
          border: "1px solid #3a3d42",
          borderRadius: 6,
        }}
      >
        <h4 style={{ marginTop: 0 }}>{fdesc.label} Parameters</h4>

        <label style={{ display: "block", marginBottom: 8 }}>
          Thickness (cm):
          <input
            type="number"
            min={1}
            step={1}
            value={Math.round(Number(get("thicknessCm")) || 1)}
            onChange={(e) =>
              onChangeParam(
                "thicknessCm",
                String(Math.max(1, Math.round(Number(e.target.value))))
              )
            }
            style={{ marginLeft: 8, width: 80 }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 8 }}>
          Color Mode:
          <select
            value={colorMode}
            onChange={(e) => onChangeParam("colorMode", e.target.value)}
            style={{ marginLeft: 8 }}
          >
            <option value="solid">Solid</option>
            <option value="gradient">Constant Gradient</option>
            <option value="rainbow-line">Rainbow Line</option>
            <option value="rainbow-rotating">Rainbow Rotating</option>
            <option value="rainbow-line-rotating">Rainbow Line Rotating</option>
          </select>
        </label>

        {colorMode === "solid" && (
          <label style={{ display: "block", marginBottom: 8 }}>
            Color:
            <input
              type="color"
              value={get("solidColor") ?? "#ffffff"}
              onChange={(e) => onChangeParam("solidColor", e.target.value)}
              style={{ marginLeft: 8 }}
            />
          </label>
        )}

        {colorMode === "gradient" && (
          <>
            <label style={{ display: "block", marginBottom: 8 }}>
              Gradient Start:
              <input
                type="color"
                value={get("gradientStart") ?? "#ff0000"}
                onChange={(e) => onChangeParam("gradientStart", e.target.value)}
                style={{ marginLeft: 8 }}
              />
            </label>
            <label style={{ display: "block", marginBottom: 8 }}>
              Gradient End:
              <input
                type="color"
                value={get("gradientEnd") ?? "#0000ff"}
                onChange={(e) => onChangeParam("gradientEnd", e.target.value)}
                style={{ marginLeft: 8 }}
              />
            </label>
          </>
        )}

        {(colorMode === "rainbow-line" ||
          colorMode === "rainbow-rotating" ||
          colorMode === "rainbow-line-rotating") && (
          <>
            <label style={{ display: "block", marginBottom: 8 }}>
              Rainbow Start Color:
              <input
                type="color"
                value={get("rainbowStart") ?? "#ff0000"}
                onChange={(e) => onChangeParam("rainbowStart", e.target.value)}
                style={{ marginLeft: 8 }}
              />
            </label>
            <label style={{ display: "block", marginBottom: 8 }}>
              Rainbow End Color:
              <input
                type="color"
                value={get("rainbowEnd") ?? "#ff00ff"}
                onChange={(e) => onChangeParam("rainbowEnd", e.target.value)}
                style={{ marginLeft: 8 }}
              />
            </label>
          </>
        )}

        <label style={{ display: "block", marginBottom: 8 }}>
          <input
            type="checkbox"
            checked={stationary}
            onChange={(e) =>
              onChangeParam("stationary", e.target.checked ? "true" : "false")
            }
          />{" "}
          Stationary (uncheck for rotation)
        </label>

{/* 
        {!stationary && (
          <>
            <label style={{ display: "block", marginBottom: 8 }}>
              Rotation Speed (degrees/beat):
              <input
                type="number"
                min={0}
                step={1}
                value={get("rotationSpeed") ?? "45"}
                onChange={(e) => onChangeParam("rotationSpeed", e.target.value)}
                style={{ marginLeft: 8, width: 100 }}
              />
            </label>
            <label style={{ display: "block", marginBottom: 8 }}>
              Direction:
              <select
                value={get("rotationDirection") ?? "cw"}
                onChange={(e) =>
                  onChangeParam("rotationDirection", e.target.value)
                }
                style={{ marginLeft: 8 }}
              >
                <option value="cw">Clockwise</option>
                <option value="ccw">Counter-Clockwise</option>
              </select>
            </label>
          </>
        )}
         */}

         {!stationary && (
  <>
    <label style={{ display: "block", marginBottom: 8 }}>
      Timing Mode:
      <select
        value={get("timingMode") ?? "smooth"}
        onChange={(e) => onChangeParam("timingMode", e.target.value)}
        style={{ marginLeft: 8 }}
      >
        <option value="smooth">Smooth</option>
        <option value="beat-jump">Beat Jump</option>
      </select>
    </label>

    <label style={{ display: "block", marginBottom: 8 }}>
      Degrees per Beat:
      <input
        type="number"
        min={1}
        step={1}
        value={get("degreesPerBeat") ?? "45"}
        onChange={(e) => onChangeParam("degreesPerBeat", e.target.value)}
        style={{ marginLeft: 8, width: 100 }}
      />
    </label>

    <label style={{ display: "block", marginBottom: 8 }}>
      Beats per Revolution (360°):
      <input
        type="number"
        min={1}
        step={1}
        value={get("beatsPerRev") ?? "4"}
        onChange={(e) => onChangeParam("beatsPerRev", e.target.value)}
        style={{ marginLeft: 8, width: 100 }}
      />
    </label>

    <label style={{ display: "block", marginBottom: 8 }}>
      Rotation Speed (degrees/beat):
      <input
        type="number"
        min={0}
        step={1}
        value={get("rotationSpeed") ?? "45"}
        onChange={(e) => onChangeParam("rotationSpeed", e.target.value)}
        style={{ marginLeft: 8, width: 100 }}
      />
    </label>

    <label style={{ display: "block", marginBottom: 8 }}>
      Direction:
      <select
        value={get("rotationDirection") ?? "cw"}
        onChange={(e) => onChangeParam("rotationDirection", e.target.value)}
        style={{ marginLeft: 8 }}
      >
        <option value="cw">Clockwise</option>
        <option value="ccw">Counter-Clockwise</option>
      </select>
    </label>
  </>
)}

        <label style={{ display: "block", marginBottom: 8 }}>
          Number of Lines:
          <input
            type="number"
            min={1}
            step={1}
            value={get("lineCount") ?? "1"}
            onChange={(e) => onChangeParam("lineCount", e.target.value)}
            style={{ marginLeft: 8, width: 80 }}
          />
        </label>
      </div>
    );
  }

  // Fallback for known function without a hardcoded panel yet
  return (
    <div
      style={{
        marginTop: 12,
        padding: 8,
        border: "1px solid #3a3d42",
        borderRadius: 6,
      }}
    >
      <strong>{fdesc.label} Parameters</strong>
      <div style={{ color: "#bbb", fontSize: 12, marginTop: 6 }}>
        Custom panel not implemented; use generic parameter list below.
      </div>
    </div>
  );
}
