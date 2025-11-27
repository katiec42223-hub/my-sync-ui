import React from "react";
import type { AlignmentGroup } from "../modelTypes";

type Props = {
  groups: AlignmentGroup[];
  selectedIndex: number | null;
  onSelect: (idx: number) => void;
  onAdd: () => void;
  onRemove: (idx: number) => void;
};

export default function AlignmentGroupList({
  groups,
  selectedIndex,
  onSelect,
  onAdd,
  onRemove,
}: Props) {
  return (
    <div style={boxStyle}>
      <div style={headerStyle}>
        <strong>Groups</strong>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={onAdd}>+ Add</button>
          <button 
            onClick={() => {
              if (selectedIndex != null) onRemove(selectedIndex);
            }}
            disabled={groups.length === 0 || selectedIndex == null}>
            Remove
          </button>
        </div>
      </div>

      <ul style={listStyle}>
        {groups.map((g, i) => (
          <li
            key={g.id}
            onClick={() => onSelect(i)}
            style={i === selectedIndex ? selectedItemStyle : itemStyle}
            title={g.id}
          >
            {g.name}
          </li>
        ))}
        {groups.length === 0 && <li style={{ color: "#bfbfbf" }}>(no groups)</li>}
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
