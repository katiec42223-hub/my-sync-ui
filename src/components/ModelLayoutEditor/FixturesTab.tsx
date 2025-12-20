// src/components/ModelLayoutEditor/FixturesTab.tsx
import React from "react";
import FixturesTable from "./fixtures/FixturesTable";
import FixtureDetailPanel from "./fixtures/FixtureDetailPanel";
import type { Fixture } from "./modelTypes";

type Props = {
  fixtures: Fixture[];
  onFixturesChange: (next: Fixture[]) => void;
  onRenameFixtureId?: (oldId: string, newId: string) => void;
};

export default function FixturesTab({
  fixtures,
  onFixturesChange,
  onRenameFixtureId,
}: Props) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  function handleAddFixture() {
    const newFixture: Fixture = {
      id: `fixture_${fixtures.length + 1}`,
      name: `New Fixture ${fixtures.length + 1}`,
      zone: "UNDEFINED_ZONE",
      controllerChannel: null,
      pixelOffset: null,
      pixelCount: null,
      physicalLengthMm: null,
      side: null,
      orientation: null,
      alignmentGroupIds: [],
      ledType: "SK9822",
      serialIn: "START",
    };
    onFixturesChange([...fixtures, newFixture]);
    setSelectedId(newFixture.id);
  }

  function handleDeleteFixture(fixtureId: string) {
    onFixturesChange(fixtures.filter((f) => f.id !== fixtureId));
    setSelectedId((prev) => (prev === fixtureId ? null : prev));
  }

  function handleChangeFixture(updated: Fixture) {
    onFixturesChange(fixtures.map((f) => (f.id === updated.id ? updated : f)));
  }

  const selectedFixture = fixtures.find((f) => f.id === selectedId) ?? null;

  return (
    <div style={containerStyle}>
      <div style={headerRowStyle}>
        <h2 style={{ margin: 0 }}>Fixtures</h2>
        <button onClick={handleAddFixture}>+ Add Fixture</button>
      </div>

      <p style={{ fontSize: 12, opacity: 0.8, margin: "4px 0" }}>
        fixtures: {fixtures.length} — selectedId: {selectedId ?? "(none)"}
      </p>

      <FixturesTable
        fixtures={fixtures}
        selectedId={selectedId}
        onSelectFixture={setSelectedId}
      />

      {selectedFixture && (
        <FixtureDetailPanel
          fixture={selectedFixture}
          onChange={handleChangeFixture}
          onClose={() => {
            console.log("[FixturesTab] onClose -> clear selection");
            setSelectedId(null);
          }}
          onRenameId={(newId) => {
            if (!newId) return;
            onRenameFixtureId?.(selectedFixture.id, newId);
            setSelectedId(newId);
          }}
          onDelete={handleDeleteFixture}
        />
      )}
    </div>
  );
}

// … styles unchanged …

const containerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const headerRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};
