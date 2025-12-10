// src/components/ModelLayoutEditor/fixtures/FixtureDetailPanel.tsx

import React from "react";
import { Fixture, Side, Orientation, Zone, LED_TYPES } from "../modelTypes";

type Props = {
  fixture: Fixture;
  onChange: (fixture: Fixture) => void;
  onClose?: () => void;
  onRenameId?: (newId: string) => void;
};

export default function FixtureDetailPanel({
  fixture,
  onChange,
  onClose,
  onRenameId,
}: Props) {
  function update<K extends keyof Fixture>(key: K, value: Fixture[K]) {
    onChange({ ...fixture, [key]: value });
  }

  const sides: Side[] = ["LEFT", "RIGHT", "TOP", "BOTTOM", null];
  const orientations: Orientation[] = [
    "LEFT",
    "RIGHT",
    "UP",
    "DOWN",
    "FORWARD",
    "BACKWARD",
    null,
  ];
  const zones: Zone[] = [
    "MAIN_BODY",
    "TAIL_BOOM",
    "TAIL_FIN",
    "UNDEFINED_ZONE",
  ];

  return (
    <div style={panelStyle}>
      <div style={panelHeaderStyle}>
        <h3 style={{ margin: 0 }}>Fixture Details</h3>
        {onClose && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              console.log("[FixtureDetailPanel] close clicked");
              onClose?.();
            }}
            style={closeBtnStyle}
          >
            ✕
          </button>
        )}
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
          Zone
          <select
            value={fixture.zone}
            onChange={(e) => update("zone", e.target.value)}
          >
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
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

        {/* After the pixelCount input, add: */}

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

        <label style={labelStyle}>
          Pixel Offset
          <input
            type="number"
            value={fixture.pixelOffset ?? ""}
            onChange={(e) =>
              update(
                "pixelOffset",
                e.target.value === "" ? null : Number(e.target.value)
              )
            }
          />
        </label>

        <label style={labelStyle}>
          Physical Length (mm)
          <input
            type="number"
            value={fixture.physicalLengthMm ?? ""}
            onChange={(e) =>
              update(
                "physicalLengthMm",
                e.target.value === "" ? null : Number(e.target.value)
              )
            }
          />
        </label>

        <label style={labelStyle}>
          Side
          <select
            value={fixture.side ?? ""}
            onChange={(e) =>
              update(
                "side",
                (e.target.value === "" ? null : e.target.value) as Side
              )
            }
          >
            <option value="">(none)</option>
            {sides
              .filter((s) => s !== null)
              .map((s) => (
                <option key={s} value={s!}>
                  {s}
                </option>
              ))}
          </select>
        </label>

        <label style={labelStyle}>
          Orientation
          <select
            value={fixture.orientation ?? ""}
            onChange={(e) =>
              update(
                "orientation",
                (e.target.value === "" ? null : e.target.value) as Orientation
              )
            }
          >
            <option value="">(none)</option>
            {orientations
              .filter((o) => o !== null)
              .map((o) => (
                <option key={o} value={o!}>
                  {o}
                </option>
              ))}
          </select>
        </label>

        <label style={labelStyle}>
          Alignment Group IDs (comma separated)
          <input
            type="text"
            value={fixture.alignmentGroupIds.join(", ")}
            onChange={(e) =>
              update(
                "alignmentGroupIds",
                e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
              )
            }
          />
        </label>
      </div>
    </div>
  );
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
