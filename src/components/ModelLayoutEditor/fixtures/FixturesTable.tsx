// src/components/ModelLayoutEditor/fixtures/FixturesTable.tsx

import React from "react";
import { Fixture } from "../modelTypes";

type Props = {
  fixtures: Fixture[];
  selectedId: string | null;
  onSelectFixture: (id: string) => void;
};

export default function FixturesTable({
  fixtures,
  selectedId,
  onSelectFixture,
}: Props) {
  if (fixtures.length === 0) {
    return <p>No fixtures defined yet. Click “+ Add Fixture” to create one.</p>;
  }

  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          <th>Name</th>
          <th>Fixture ID</th>
          <th>Zone</th>
          <th>Channel</th>
          <th>Pixel Count</th>
          <th>Pixel Offset</th>
          <th>Side</th>
          <th>Orientation</th>
        </tr>
      </thead>
      <tbody>
        {fixtures.map((f) => {
          const isSelected = f.id === selectedId;
          return (
            <tr
              key={f.id}
              onClick={() => onSelectFixture(f.id)}
              style={isSelected ? selectedRowStyle : rowStyle}
            >
              <td>{f.name}</td>
              <td>{f.id}</td>
              <td>{f.zone}</td>
              <td>{f.controllerChannel ?? "—"}</td>
              <td>{f.pixelCount ?? "—"}</td>
              <td>{f.pixelOffset ?? "—"}</td>
              <td>{f.side ?? "—"}</td>
              <td>{f.orientation ?? "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 14,
  background: "lightblue",
  color: "Black",
  border: "1px solid #3a3d42",
  borderRadius: 6,
};

const rowStyle: React.CSSProperties = {
  cursor: "pointer",
};

const selectedRowStyle: React.CSSProperties = {
  ...rowStyle,
  background: "rgba(79, 70, 229, 0.2)",
};
