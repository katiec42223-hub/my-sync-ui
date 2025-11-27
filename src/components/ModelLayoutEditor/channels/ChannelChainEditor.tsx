// src/components/ModelLayoutEditor/channels/ChannelChainEditor.tsx
import React, { useState } from "react";
import { ChannelChain } from "../modelTypes";

type Props = {
  channel: ChannelChain;
  onChange: (updated: ChannelChain) => void;
  availableFixtures: { id: string; name: string }[];
  nameById?: Record<string, string>;};

export default function ChannelChainEditor({
  channel,
  onChange,
  availableFixtures,
  nameById
}: Props) {
  const [newFixtureId, setNewFixtureId] = useState<string>("");

  function setControllerChannel(n: number) {
    onChange({ ...channel, controllerChannel: n });
  }

  function addFixture() {
    if (!newFixtureId) return;
    if (channel.fixtureOrder.includes(newFixtureId)) return;
    onChange({ ...channel, fixtureOrder: [...channel.fixtureOrder, newFixtureId] });
    setNewFixtureId("");
  }

  function removeFixture(idx: number) {
    const next = channel.fixtureOrder.filter((_, i) => i !== idx);
    onChange({ ...channel, fixtureOrder: next });
  }

  function move(idx: number, dir: -1 | 1) {
    const arr = [...channel.fixtureOrder];
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    onChange({ ...channel, fixtureOrder: arr });
  }

  return (
    <div style={panelStyle}>
      <div style={rowStyle}>
        <label>
          <span style={{ marginRight: 6 }}>Controller Channel #</span>
          <input
            type="number"
            value={channel.controllerChannel}
            onChange={(e) => setControllerChannel(Number(e.target.value))}
            style={{ width: 80 }}
          />
        </label>
      </div>

      <h3>Fixture Serial Order</h3>
      <p style={{ marginTop: -6, color: "#bfbfbf" }}>
        Top = first in chain (pixel 0), bottom = last.
      </p>

      <ul style={orderListStyle}>
        {channel.fixtureOrder.map((id, idx) => (
          <li key={`${id}-${idx}`} style={orderItemStyle}>
            <code style={{ fontSize: 12 }}>{(nameById as Record<string, string>)[id] ?? id}</code>
            <span>
              <button onClick={() => move(idx, -1)} disabled={idx === 0}>↑</button>
              <button onClick={() => move(idx, +1)} disabled={idx === channel.fixtureOrder.length - 1}>↓</button>
              <button onClick={() => removeFixture(idx)}>Remove</button>
            </span>
          </li>
        ))}
        {channel.fixtureOrder.length === 0 && (
          <li style={{ color: "#bfbfbf" }}>No fixtures yet. Add some below.</li>
        )}
      </ul>

      <div style={adderRowStyle}>
        <select
          value={newFixtureId}
          onChange={(e) => setNewFixtureId(e.target.value)}
          style={{ minWidth: 220 }}
        >
          <option value="">(select fixture)</option>
          {availableFixtures.map(opt => (
            <option key={opt.id} value={opt.id}>{opt.name}</option>
          ))}
        </select>
        <button onClick={addFixture}>Add to Chain</button>
      </div>

      <hr style={{ borderColor: "#333" }} />
      <p style={{ fontSize: 12, color: "#bfbfbf" }}>
        TODO (after store): Auto-calc pixel offsets from chain order + pixel counts.
      </p>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  border: "1px solid #3a3d42",
  borderRadius: 8,
  padding: 12,
  background: "#1f2125",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  marginBottom: 12,
};

const orderListStyle: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: "8px 0 12px 0",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const orderItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "6px 8px",
  background: "#111418",
  border: "1px solid #2d2f34",
  borderRadius: 6,
};

const adderRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};
