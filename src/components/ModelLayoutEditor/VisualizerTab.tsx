import React, { useState } from "react";
import Visualizer3D from "../Visualizer3D/Visualizer3D";
import type {
  Fixture,
  VisualizerConfig,
  FixtureVisualConfig,
  Attachment,
  SurfaceId,
} from "./modelTypes";
import { LED_TYPES } from "./modelTypes";

type VisualizerTabProps = {
  fixtures: Fixture[];
  config: VisualizerConfig;
  onChange: (config: VisualizerConfig) => void;
};

export default function VisualizerTab({
  fixtures,
  config,
  onChange,
}: VisualizerTabProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [cameraResetCounter, setCameraResetCounter] = useState(0);

  type SurfaceAttachment = Extract<Attachment, { kind: "surface" }>;

  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

  function setSelectedAttachment(next: Attachment | undefined) {
    if (!selected) return;
    updateFixture(selected, { attachment: next });
  }

  function updateSelectedSurfaceAttachment(patch: Partial<SurfaceAttachment>) {
    if (!selected) return;

    const existing = config.fixtures.find((f) => f.fixtureId === selected);
    const current = existing?.attachment;

    if (!current || current.kind !== "surface") return;

    updateFixture(selected, { attachment: { ...current, ...patch } });
  }

  function updateFixture(
    fixtureId: string,
    updates: Partial<FixtureVisualConfig>
  ) {
    const existing = config.fixtures.find((f) => f.fixtureId === fixtureId);
    const updated: FixtureVisualConfig = existing
      ? { ...existing, ...updates }
      : {
          fixtureId,
          layout: "linear",
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: 1.0,
          circleRadius: 0.5,
          attachment: { kind: "detached" },
          ...updates,
        };

    const nextFixtures = existing
      ? config.fixtures.map((f) => (f.fixtureId === fixtureId ? updated : f))
      : [...config.fixtures, updated];

    onChange({ ...config, fixtures: nextFixtures });
  }

  const selectedConfig = selected
    ? config.fixtures.find((f) => f.fixtureId === selected)
    : null;
  const selectedAttachment = selectedConfig?.attachment;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "300px 1fr",
        height: "calc(100vh - 200px)",
      }}
    >
      {/* Left: Fixture list + transform controls */}
      <div
        style={{
          borderRight: "1px solid #2f3136",
          padding: 12,
          overflowY: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <h4 style={{ margin: 0 }}>Fixtures</h4>
          <button
            onClick={() => {
              setCameraResetCounter((prev) => prev + 1); // Increment to trigger reset
            }}
            style={{ fontSize: 11, padding: "4px 8px" }}
            title="Reset camera to home position"
          >
            🏠 Home
          </button>
        </div>

        {fixtures.length === 0 && (
          <div style={{ color: "#666", fontSize: 12, marginBottom: 12 }}>
            No fixtures defined. Add fixtures in the Fixtures tab first.
          </div>
        )}

        {fixtures.map((fixture) => {
          const isConfigured = config.fixtures.some(
            (f) => f.fixtureId === fixture.id
          );
          return (
            <div key={fixture.id}>
              <div
                onClick={() => setSelected(fixture.id)}
                style={{
                  padding: 8,
                  marginBottom: 4,
                  background: selected === fixture.id ? "#3a3d42" : "#23272a",
                  cursor: "pointer",
                  borderRadius: 4,
                  borderLeft: isConfigured
                    ? "3px solid #4f46e5"
                    : "3px solid transparent",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>{fixture.name}</span>
                {!isConfigured && (
                  <span style={{ fontSize: 10, color: "#888" }}>
                    not placed
                  </span>
                )}
              </div>

              {/* Add to Scene button when selected but not placed */}
              {selected === fixture.id && !isConfigured && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    updateFixture(fixture.id, {
                      layout: "linear",
                      position: [0, 0, 0],
                      rotation: [0, 0, 0],
                    });
                  }}
                  style={{
                    width: "calc(100% - 8px)",
                    marginLeft: 4,
                    marginBottom: 8,
                    fontSize: 11,
                    padding: "6px 8px",
                    background: "#4f46e5",
                  }}
                >
                  ➕ Add to 3D Scene
                </button>
              )}
            </div>
          );
        })}

        {selectedConfig && (
          <div
            style={{
              marginTop: 16,
              padding: 12,
              background: "#1f2023",
              borderRadius: 8,
            }}
          >
            <h5 style={{ marginTop: 0 }}>
              Transform: {fixtures.find((f) => f.id === selected)?.name}
            </h5>

            {/* Layout Type */}
            <label style={{ display: "block", marginBottom: 12 }}>
              <span
                style={{
                  fontSize: 11,
                  color: "#bbb",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Layout Pattern:
              </span>
              <select
                value={selectedConfig.layout}
                onChange={(e) =>
                  updateFixture(selected!, {
                    layout: e.target.value as
                      | "linear"
                      | "circle"
                      | "wrapped"
                      | "spline",
                  })
                }
                style={{ width: "100%", fontSize: 12 }}
              >
                <option value="linear">Linear (straight strip)</option>
                <option value="circle">Circle (ring)</option>
                <option value="wrapped">Wrapped (helical)</option>
                <option value="spline">Spline (curved path)</option>
              </select>
            </label>

            {/* Show calculated strip length */}
            {selectedConfig.layout === "linear"
              ? (() => {
                  const fixture = fixtures.find((f) => f.id === selected);
                  if (!fixture || !fixture.pixelCount) return null;

                  const ledSpec =
                    LED_TYPES[fixture.ledType] || LED_TYPES.SK9822;
                  const spacing =
                    (fixture.customSpacing || ledSpec.pixelSpacing) / 1000;
                  const totalLength = (fixture.pixelCount - 1) * spacing;

                  return (
                    <div
                      style={{
                        fontSize: 11,
                        color: "#888",
                        marginBottom: 12,
                        padding: "6px 8px",
                        background: "#0d0f12",
                        borderRadius: 4,
                      }}
                    >
                      Strip length: {totalLength.toFixed(2)}m (
                      {(totalLength * 100).toFixed(0)}cm)
                      <br />
                      {fixture.pixelCount} × {(spacing * 1000).toFixed(0)}mm
                      spacing
                    </div>
                  );
                })()
              : null}

            {/* Attachment Model */}
            <div style={{ marginBottom: 12 }}>
              <span
                style={{
                  fontSize: 11,
                  color: "#bbb",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Attach to Surface:
              </span>
              <select
                value={
                  selectedAttachment && selectedAttachment.kind === "surface"
                    ? (selectedAttachment.surfaceId as string)
                    : "detached"
                }
                onChange={(e) => {
  if (!selected) return;

  const v = e.target.value;

  if (v === "detached") {
    updateFixture(selected, { attachment: { kind: "detached" } });
    return;
  }

  // CANOPY only is OK for now; other values may not wrap yet.
  // IMPORTANT: do NOT force centerU/centerV defaults here.
  // Visualizer3D has a better world-space default (nose pick point -> U/V) and
  // will use it when centerU/centerV are undefined.
  updateFixture(selected, {
    layout: "linear",
    attachment: {
      kind: "surface",
      surfaceId: v as SurfaceId,
      tangentialOffsetMm: 0,
      lateralOffsetMm: 0,
      normalOffsetMm: 0,
      angleDeg: 0,
    },
  });
}}
                style={{ width: "100%", fontSize: 12 }}
              >
                <option value="detached">
                  Detached (use position/rotation)
                </option>
                <option value="CANOPY">Canopy</option>
                <option value="TAIL_BOOM">Tail Boom</option>
                <option value="TAIL_FIN">Tail Fin</option>
                <option value="SKID_PIPE_LEFT">Left Skid Pipe</option>
                <option value="SKID_PIPE_RIGHT">Right Skid Pipe</option>
                <option value="STRUT_FL">Front Strut</option>
                <option value="STRUT_FR">Front Strut (right)</option>
                <option value="STRUT_RL">Rear Strut</option>
                <option value="STRUT_RR">Rear Strut (right)</option>
              </select>
            </div>

            {/* Surface Attachment Parameters */}
            {selectedAttachment && selectedAttachment.kind === "surface" && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: "#888", marginBottom: 4 }}>
                  Location on surface (U 0–1, V 0–1):
                  <br />
                  (canopy uses U for "distance along centerline", V for "offset
                  from center")
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={selectedAttachment.centerU ?? 0.5}
                    onChange={(e) =>
                      updateSelectedSurfaceAttachment({
                        centerU: clamp01(parseFloat(e.target.value) || 0),
                      })
                    }
                    style={{ width: 60, fontSize: 11 }}
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={selectedAttachment.centerV ?? 0.5}
                    onChange={(e) =>
                      updateSelectedSurfaceAttachment({
                        centerV: clamp01(parseFloat(e.target.value) || 0),
                      })
                    }
                    style={{ width: 60, fontSize: 11 }}
                    disabled={selectedAttachment.surfaceId !== "CANOPY"}
                    placeholder="V (canopy only)"
                  />
                </div>
                <div style={{ fontSize: 10, color: "#888", marginBottom: 4 }}>
                  Offsets (mm) and angle:
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="number"
                    value={selectedAttachment.tangentialOffsetMm ?? 0}
                    onChange={(e) =>
                      updateSelectedSurfaceAttachment({
                        tangentialOffsetMm: parseFloat(e.target.value) || 0,
                      })
                    }
                    style={{ width: 60, fontSize: 11 }}
                    placeholder="Tangential"
                  />
                  <input
                    type="number"
                    value={selectedAttachment.lateralOffsetMm ?? 0}
                    onChange={(e) =>
                      updateSelectedSurfaceAttachment({
                        lateralOffsetMm: parseFloat(e.target.value) || 0,
                      })
                    }
                    style={{ width: 60, fontSize: 11 }}
                    placeholder="Lateral"
                  />
                  <input
                    type="number"
                    value={selectedAttachment.normalOffsetMm ?? 0}
                    onChange={(e) =>
                      updateSelectedSurfaceAttachment({
                        normalOffsetMm: parseFloat(e.target.value) || 0,
                      })
                    }
                    style={{ width: 60, fontSize: 11 }}
                    placeholder="Normal"
                  />
                  <input
                    type="number"
                    value={selectedAttachment.angleDeg ?? 0}
                    onChange={(e) =>
                      updateSelectedSurfaceAttachment({
                        angleDeg: parseFloat(e.target.value) || 0,
                      })
                    }
                    style={{ width: 60, fontSize: 11 }}
                    placeholder="Angle"
                  />
                </div>
              </div>
            )}

            {/* Position */}
            <div style={{ marginBottom: 12 }}>
              <span
                style={{
                  fontSize: 11,
                  color: "#bbb",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Position (meters):
              </span>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 4,
                }}
              >
                <input
                  type="number"
                  step="0.1"
                  value={selectedConfig.position[0]}
                  onChange={(e) =>
                    updateFixture(selected!, {
                      position: [
                        parseFloat(e.target.value),
                        selectedConfig.position[1],
                        selectedConfig.position[2],
                      ],
                    })
                  }
                  placeholder="X"
                  style={{ fontSize: 11 }}
                />
                <input
                  type="number"
                  step="0.1"
                  value={selectedConfig.position[1]}
                  onChange={(e) =>
                    updateFixture(selected!, {
                      position: [
                        selectedConfig.position[0],
                        parseFloat(e.target.value),
                        selectedConfig.position[2],
                      ],
                    })
                  }
                  placeholder="Y"
                  style={{ fontSize: 11 }}
                />
                <input
                  type="number"
                  step="0.1"
                  value={selectedConfig.position[2]}
                  onChange={(e) =>
                    updateFixture(selected!, {
                      position: [
                        selectedConfig.position[0],
                        selectedConfig.position[1],
                        parseFloat(e.target.value),
                      ],
                    })
                  }
                  placeholder="Z"
                  style={{ fontSize: 11 }}
                />
              </div>
            </div>

            {/* Rotation */}
            <div style={{ marginBottom: 12 }}>
              <span
                style={{
                  fontSize: 11,
                  color: "#bbb",
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Rotation (degrees):
              </span>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 4,
                }}
              >
                <input
                  type="number"
                  step="15"
                  value={selectedConfig.rotation[0]}
                  onChange={(e) =>
                    updateFixture(selected!, {
                      rotation: [
                        parseFloat(e.target.value),
                        selectedConfig.rotation[1],
                        selectedConfig.rotation[2],
                      ],
                    })
                  }
                  placeholder="X"
                  style={{ fontSize: 11 }}
                />
                <input
                  type="number"
                  step="15"
                  value={selectedConfig.rotation[1]}
                  onChange={(e) =>
                    updateFixture(selected!, {
                      rotation: [
                        selectedConfig.rotation[0],
                        parseFloat(e.target.value),
                        selectedConfig.rotation[2],
                      ],
                    })
                  }
                  placeholder="Y"
                  style={{ fontSize: 11 }}
                />
                <input
                  type="number"
                  step="15"
                  value={selectedConfig.rotation[2]}
                  onChange={(e) =>
                    updateFixture(selected!, {
                      rotation: [
                        selectedConfig.rotation[0],
                        selectedConfig.rotation[1],
                        parseFloat(e.target.value),
                      ],
                    })
                  }
                  placeholder="Z"
                  style={{ fontSize: 11 }}
                />
              </div>
            </div>

            {/* Spline Control Points */}
            {selectedConfig.layout === "spline" &&
              (() => {
                const fixture = fixtures.find((f) => f.id === selected);
                if (!fixture) return null;

                return (
                  <div style={{ marginBottom: 12 }}>
                    <div
                      style={{
                        background: "#1a3a52",
                        padding: 8,
                        borderRadius: 4,
                        marginBottom: 8,
                        fontSize: 11,
                        lineHeight: "1.4",
                        color: "#a8c5e0",
                      }}
                    >
                      <strong>💡 How Splines Work:</strong>
                      <ul style={{ margin: "4px 0 0 0", paddingLeft: 16 }}>
                        <li>Add control points to define the path</li>
                        <li>LEDs follow a smooth curve through these points</li>
                        <li>
                          Spacing stays fixed at{" "}
                          {(() => {
                            const ledSpec =
                              LED_TYPES[fixture.ledType] || LED_TYPES.SK9822;
                            const spacing =
                              fixture.customSpacing || ledSpec.pixelSpacing;
                            return `${spacing}mm`;
                          })()}
                        </li>
                        <li>Use tension slider to adjust curve smoothness</li>
                      </ul>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 6,
                      }}
                    >
                      <span
                        style={{ fontSize: 11, color: "#bbb", fontWeight: 600 }}
                      >
                        Control Points (
                        {(selectedConfig.splinePoints || []).length}
                        ):
                      </span>
                      <button
                        onClick={() => {
                          const points = selectedConfig.splinePoints || [];
                          if (points.length === 0) {
                            // First point at origin
                            updateFixture(selected!, {
                              splinePoints: [[0, 0, 0]],
                            });
                          } else {
                            // Add point offset from last point
                            const lastPoint = points[points.length - 1];
                            updateFixture(selected!, {
                              splinePoints: [
                                ...points,
                                [
                                  lastPoint[0] + 0.3,
                                  lastPoint[1] + 0.1,
                                  lastPoint[2],
                                ],
                              ],
                            });
                          }
                        }}
                        style={{
                          fontSize: 10,
                          padding: "4px 8px",
                          background: "#4f46e5",
                        }}
                      >
                        ➕ Add Point
                      </button>
                    </div>

                    {(selectedConfig.splinePoints || []).length === 0 && (
                      <div
                        style={{
                          fontSize: 11,
                          color: "#888",
                          textAlign: "center",
                          padding: 16,
                          background: "#0d0f12",
                          borderRadius: 4,
                          fontStyle: "italic",
                        }}
                      >
                        Click "+ Add Point" to start creating your path
                      </div>
                    )}

                    <div
                      style={{
                        maxHeight: 200,
                        overflowY: "auto",
                        background: "#0d0f12",
                        borderRadius: 4,
                        padding: 4,
                      }}
                    >
                      {(selectedConfig.splinePoints || []).map((point, idx) => (
                        <div key={idx}>
                          <div
                            style={{
                              fontSize: 10,
                              color: "#888",
                              marginTop: idx > 0 ? 8 : 4,
                              marginBottom: 2,
                              marginLeft: 4,
                            }}
                          >
                            Point {idx + 1} {idx === 0 && "(start)"}{" "}
                            {idx ===
                              (selectedConfig.splinePoints || []).length - 1 &&
                              idx > 0 &&
                              "(end)"}
                          </div>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 1fr 1fr auto",
                              gap: 4,
                              marginBottom: 4,
                              fontSize: 11,
                              alignItems: "center",
                            }}
                          >
                            <div>
                              <label
                                style={{
                                  fontSize: 9,
                                  color: "#666",
                                  display: "block",
                                }}
                              >
                                X (m)
                              </label>
                              <input
                                type="number"
                                step="0.05"
                                value={point[0].toFixed(2)}
                                onChange={(e) => {
                                  const updated = [
                                    ...(selectedConfig.splinePoints || []),
                                  ];
                                  updated[idx] = [
                                    parseFloat(e.target.value),
                                    point[1],
                                    point[2],
                                  ];
                                  updateFixture(selected!, {
                                    splinePoints: updated,
                                  });
                                }}
                                style={{
                                  fontSize: 10,
                                  padding: "4px 2px",
                                  width: "100%",
                                }}
                              />
                            </div>
                            <div>
                              <label
                                style={{
                                  fontSize: 9,
                                  color: "#666",
                                  display: "block",
                                }}
                              >
                                Y (m)
                              </label>
                              <input
                                type="number"
                                step="0.05"
                                value={point[1].toFixed(2)}
                                onChange={(e) => {
                                  const updated = [
                                    ...(selectedConfig.splinePoints || []),
                                  ];
                                  updated[idx] = [
                                    point[0],
                                    parseFloat(e.target.value),
                                    point[2],
                                  ];
                                  updateFixture(selected!, {
                                    splinePoints: updated,
                                  });
                                }}
                                style={{
                                  fontSize: 10,
                                  padding: "4px 2px",
                                  width: "100%",
                                }}
                              />
                            </div>
                            <div>
                              <label
                                style={{
                                  fontSize: 9,
                                  color: "#666",
                                  display: "block",
                                }}
                              >
                                Z (m)
                              </label>
                              <input
                                type="number"
                                step="0.05"
                                value={point[2].toFixed(2)}
                                onChange={(e) => {
                                  const updated = [
                                    ...(selectedConfig.splinePoints || []),
                                  ];
                                  updated[idx] = [
                                    point[0],
                                    point[1],
                                    parseFloat(e.target.value),
                                  ];
                                  updateFixture(selected!, {
                                    splinePoints: updated,
                                  });
                                }}
                                style={{
                                  fontSize: 10,
                                  padding: "4px 2px",
                                  width: "100%",
                                }}
                              />
                            </div>
                            <button
                              onClick={() => {
                                const updated = (
                                  selectedConfig.splinePoints || []
                                ).filter((_, i) => i !== idx);
                                updateFixture(selected!, {
                                  splinePoints: updated,
                                });
                              }}
                              style={{
                                fontSize: 11,
                                padding: "4px 8px",
                                background: "#5c2626",
                                marginTop: 14,
                              }}
                              title="Delete this point"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Quick preset buttons */}
                    {(selectedConfig.splinePoints || []).length >= 2 && (
                      <div style={{ marginTop: 8 }}>
                        <div
                          style={{
                            fontSize: 10,
                            color: "#888",
                            marginBottom: 4,
                          }}
                        >
                          Quick Shapes:
                        </div>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: 4,
                          }}
                        >
                          <button
                            onClick={() => {
                              // Create S-curve
                              updateFixture(selected!, {
                                splinePoints: [
                                  [0, 0, 0],
                                  [0.3, 0.2, 0],
                                  [0.6, -0.2, 0],
                                  [0.9, 0, 0],
                                ],
                              });
                            }}
                            style={{ fontSize: 10, padding: "4px 6px" }}
                          >
                            S-Curve
                          </button>
                          <button
                            onClick={() => {
                              // Create arc
                              updateFixture(selected!, {
                                splinePoints: [
                                  [0, 0, 0],
                                  [0.2, 0.3, 0],
                                  [0.4, 0.4, 0],
                                  [0.6, 0.3, 0],
                                  [0.8, 0, 0],
                                ],
                              });
                            }}
                            style={{ fontSize: 10, padding: "4px 6px" }}
                          >
                            Arc
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Spline tension control */}
                    <div
                      style={{
                        marginTop: 12,
                        paddingTop: 12,
                        borderTop: "1px solid #2f3136",
                      }}
                    >
                      <label style={{ display: "block" }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: 6,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 11,
                              color: "#bbb",
                              fontWeight: 600,
                            }}
                          >
                            Curve Tension:
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              color: "#4f46e5",
                              fontWeight: 600,
                            }}
                          >
                            {(selectedConfig.splineTension || 0.5).toFixed(1)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.1"
                          value={selectedConfig.splineTension || 0.5}
                          onChange={(e) =>
                            updateFixture(selected!, {
                              splineTension: parseFloat(e.target.value),
                            })
                          }
                          style={{ width: "100%" }}
                        />
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: 9,
                            color: "#666",
                            marginTop: 2,
                          }}
                        >
                          <span>Tight curves</span>
                          <span>Loose/flowing</span>
                        </div>
                      </label>
                    </div>
                  </div>
                );
              })()}

            {/* Scale (for linear only) */}
            {selectedConfig.layout === "linear" && (
              <label style={{ display: "block", marginBottom: 12 }}>
                <span
                  style={{
                    fontSize: 11,
                    color: "#bbb",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Length Scale:
                </span>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={selectedConfig.scale || 1.0}
                  onChange={(e) =>
                    updateFixture(selected!, {
                      scale: parseFloat(e.target.value),
                    })
                  }
                  style={{ width: "100%", fontSize: 12 }}
                />
              </label>
            )}

            {/* Circle Radius */}
            {(selectedConfig.layout === "circle" ||
              selectedConfig.layout === "wrapped") && (
              <label style={{ display: "block", marginBottom: 12 }}>
                <span
                  style={{
                    fontSize: 11,
                    color: "#bbb",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Radius (meters):
                </span>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={selectedConfig.circleRadius || 0.5}
                  onChange={(e) =>
                    updateFixture(selected!, {
                      circleRadius: parseFloat(e.target.value),
                    })
                  }
                  style={{ width: "100%", fontSize: 12 }}
                />
              </label>
            )}

            {/* Quick Actions */}
            <div
              style={{
                borderTop: "1px solid #2f3136",
                paddingTop: 12,
                marginTop: 12,
              }}
            >
              <button
                onClick={() => {
                  const updated = config.fixtures.filter(
                    (f) => f.fixtureId !== selected
                  );
                  onChange({ ...config, fixtures: updated });
                  setSelected(null);
                }}
                style={{
                  width: "100%",
                  fontSize: 11,
                  padding: "6px 8px",
                  background: "#5c2626",
                }}
              >
                Remove from 3D Scene
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right: 3D preview */}
      <div style={{ position: "relative", background: "#000" }}>
        <Visualizer3D
          config={config.fixtures}
          fixtures={fixtures}
          onCameraResetRequest={cameraResetCounter}
        />
      </div>
    </div>
  );
}
