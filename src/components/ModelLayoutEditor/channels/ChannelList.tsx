// src/components/ModelLayoutEditor/channels/ChannelList.tsx
import React from "react";
import { ChannelChain } from "../modelTypes";

type Props = {
  channels: ChannelChain[];
  selectedIndex: number;
  onSelect: (idx: number) => void;
  onAdd: () => void;
  onRemove: () => void;
};

export default function ChannelList({
  channels,
  selectedIndex,
  onSelect,
  onAdd,
  onRemove,
}: Props) {
  return (
    <div style={boxStyle}>
      <div style={headerStyle}>
        <strong>Controller Channels</strong>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={onAdd}>+ Add</button>
          <button onClick={onRemove} disabled={channels.length <= 1}>Remove</button>
        </div>
      </div>

      <ul style={listStyle}>
        {channels.map((c, i) => (
          <li
            key={`${c.controllerChannel}-${i}`}
            onClick={() => onSelect(i)}
            style={i === selectedIndex ? selectedItemStyle : itemStyle}
            title={`Channel ${c.controllerChannel}`}
          >
            Channel {c.controllerChannel}
          </li>
        ))}
      </ul>
    </div>
  );
}

const boxStyle: React.CSSProperties = {
  border: "1px solid #3a3d42",
  borderRadius: 8,
  padding: 8,
  background: "#1f2125",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 8,
};

const listStyle: React.CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const itemStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 6,
  cursor: "pointer",
  background: "transparent",
  border: "1px solid transparent",
};

const selectedItemStyle: React.CSSProperties = {
  ...itemStyle,
  background: "rgba(79, 70, 229, 0.18)",
  border: "1px solid #4f46e5",
};
