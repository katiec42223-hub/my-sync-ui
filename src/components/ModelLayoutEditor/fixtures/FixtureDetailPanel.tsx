// src/components/ModelLayoutEditor/fixtures/FixtureDetailPanel.tsx

import React from "react";
import { Fixture, LED_TYPES } from "../modelTypes";

type Props = {
  fixture: Fixture;
  onChange: (fixture: Fixture) => void;
  onDelete: (fixtureId: string) => void;
  onClose?: () => void;
  onRenameId?: (newId: string) => void;
};

export default function FixtureDetailPanel({
  fixture,
  onChange,
  onDelete,
  onClose,
  onRenameId,
}: Props) {
  function update<K extends keyof Fixture>(key: K, value: Fixture[K]) {
    onChange({ ...fixture, [key]: value });
  }

  // const sides: Side[] = ["LEFT", "RIGHT", "TOP", "BOTTOM", null];
  // const orientations: Orientation[] = [
  //   "LEFT",
  //   "RIGHT",
  //   "UP",
  //   "DOWN",
  //   "FORWARD",
  //   "BACKWARD",
  //   null,
  // ];
  // const zones: Zone[] = [
  //   "MAIN_BODY",
  //   "TAIL_BOOM",
  //   "TAIL_FIN",
  //   "UNDEFINED_ZONE",
  // ];

  return (
    <div style={panelStyle}>
      <div style={panelHeaderStyle}>
        <h3 style={{ margin: 0 }}>Fixture Details</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              const ok = window.confirm(
                `Delete fixture "${fixture.name}" (${fixture.id})? This cannot be undone.`
              );
              if (!ok) return;
              console.log("[FixtureDetailPanel] delete clicked", fixture.id);
              onDelete(fixture.id);
            }}
            style={deleteBtnStyle}
            title="Delete fixture"
          >
            Delete
          </button>

          {onClose && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                console.log("[FixtureDetailPanel] close clicked");
                onClose?.();
              }}
              style={closeBtnStyle}
              title="Close"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div style={fieldColumnStyle}>
        <label style={labelStyle}>
          Name
          <input
            type="text"
            value={fixture.name}
            onChange={(e) => update("name", e.target.value)}
          />
        </label>

        <label style={labelStyle}>
          Fixture ID
          <input
            type="text"
            value={fixture.id}
            onChange={(e) => onRenameId?.(e.target.value)}
          />
        </label>

        <label style={labelStyle}>
          Controller Channel
          <input
            type="number"
            value={fixture.controllerChannel ?? ""}
            onChange={(e) =>
              update(
                "controllerChannel",
                e.target.value === "" ? null : Number(e.target.value)
              )
            }
          />
        </label>

        <label style={labelStyle}>
          Pixel Count
          <input
            type="number"
            value={fixture.pixelCount ?? ""}
            onChange={(e) =>
              update(
                "pixelCount",
                e.target.value === "" ? null : Number(e.target.value)
              )
            }
          />
        </label>

        {/* LED Type Selection */}

        <label style={labelStyle}>
          LED Type
          <select
            value={fixture.ledType || "SK9822"}
            onChange={(e) =>
              update("ledType", e.target.value as keyof typeof LED_TYPES)
            }
          >
            {Object.entries(LED_TYPES).map(([key, spec]) => (
              <option key={key} value={key}>
                {spec.name}
              </option>
            ))}
          </select>
        </label>

        {/* Custom spacing/diameter if CUSTOM type */}
        {fixture.ledType === "CUSTOM" && (
          <>
            <label style={labelStyle}>
              Pixel Spacing (mm)
              <input
                type="number"
                value={fixture.customSpacing || 30}
                onChange={(e) =>
                  update("customSpacing", parseInt(e.target.value))
                }
              />
            </label>
            <label style={labelStyle}>
              Pixel Diameter (mm)
              <input
                type="number"
                value={fixture.customDiameter || 5}
                onChange={(e) =>
                  update("customDiameter", parseInt(e.target.value))
                }
              />
            </label>
          </>
        )}

        <div style={{ fontSize: 12, opacity: 0.85 }}>
          Derived length: {formatDerivedLengthMm(fixture)} mm
        </div>
      </div>
    </div>
  );
}

function getSpacingMm(fixture: Fixture): number {
  const spec = LED_TYPES[fixture.ledType || "SK9822"];
  if (!spec) return 0;
  if ((fixture.ledType || "SK9822") === "CUSTOM") {
    return fixture.customSpacing ?? spec.pixelSpacing;
  }
  return spec.pixelSpacing;
}

function formatDerivedLengthMm(fixture: Fixture): string {
  const count = fixture.pixelCount ?? 0;
  const spacing = getSpacingMm(fixture);
  const length = count > 0 ? (count - 1) * spacing : 0;
  // Round to 2 decimals max, but avoid trailing zeros where possible
  const rounded = Math.round(length * 100) / 100;
  return String(rounded);
}

const panelStyle: React.CSSProperties = {
  position: "fixed",
  right: 0,
  top: 48,
  bottom: 0,
  width: 320,
  background: "#111827",
  borderLeft: "1px solid #374151",
  padding: 12,
  overflowY: "auto",
  boxShadow: "-4px 0 10px rgba(0,0,0,0.5)",
  zIndex: 2000,
};

const panelHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 8,
};

const closeBtnStyle: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "white",
  fontSize: 16,
  cursor: "pointer",
};

const deleteBtnStyle: React.CSSProperties = {
  border: "1px solid #7f1d1d",
  background: "#991b1b",
  color: "white",
  fontSize: 12,
  padding: "6px 10px",
  borderRadius: 6,
  cursor: "pointer",
};

const fieldColumnStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  fontSize: 12,
  gap: 4,
};
