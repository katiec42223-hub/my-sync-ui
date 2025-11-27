// src/components/ModelLayoutEditor/ChannelsTab.tsx
import React, { useMemo, useState } from "react";
import { Fixture, ChannelChain } from "./modelTypes";
import ChannelList from "./channels/ChannelList";
import ChannelChainEditor from "./channels/ChannelChainEditor";
import { computeAutoPixelIndex } from "./autopixel";

type Props = {
  fixtures: Fixture[];
  channels: ChannelChain[];
  onChannelsChange: (c: ChannelChain[]) => void;
  onFixturesChange: (f: Fixture[]) => void;
};


export default function ChannelsTab({
  fixtures,
  channels,
  onChannelsChange,
  onFixturesChange,
}: Props) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  //const [selectedFixtureId, setSelectedFixtureId] = useState<string>("");


  // ChannelsTab.tsx (inside the component)
const fixtureOptions = React.useMemo(
  () => fixtures.map(f => ({ id: f.id, name: f.name ?? f.id })),
  [fixtures]
);

const nameById = React.useMemo(
  () => Object.fromEntries(fixtureOptions.map(o => [o.id, o.name])) as Record<string, string>,
  [fixtureOptions]
);



  // Ensure selectedIndex stays valid if channels length changes
  const clampedIndex = Math.min(selectedIndex, Math.max(0, channels.length - 1));
  const selected = channels[clampedIndex];

  function addChannel() {
    // Pick next available controllerChannel number
    const used = new Set(channels.map((c) => c.controllerChannel));
    let n = 0;
    while (used.has(n)) n++;
    const next: ChannelChain = { controllerChannel: n, fixtureOrder: [] };
    onChannelsChange([...channels, next]);
    setSelectedIndex(channels.length); // select the newly added
  }

  function removeChannel(idx: number) {
    if (channels.length <= 1) return; // keep at least one
    const next = channels.filter((_, i) => i !== idx);
    onChannelsChange(next);
    setSelectedIndex(Math.max(0, idx - 1));
  }

  function updateChannel(idx: number, updated: ChannelChain) {
    onChannelsChange(channels.map((c, i) => (i === idx ? updated : c)));
  }

  const availableFixtures = useMemo(
    () => fixtures.map((f) => ({ id: f.id, name: f.name ?? f.id })),
    [fixtures]
  );

  function handleAutoPixelIndex() {
    const { nextFixtures, warnings } = computeAutoPixelIndex(channels, fixtures);
    onFixturesChange(nextFixtures);
    if (warnings.length) {
      alert("AutoPixel_Index completed with warnings:\n\n" + warnings.join("\n"));
    }
  }

  
  // // ---- Add to chain ----
  // function addToChain() {
  //   if (!selected || !selectedFixtureId) return;
  //   updateChannel(clampedIndex, {
  //     ...selected,
  //     fixtureOrder: [...selected.fixtureOrder, selectedFixtureId],
  //   });
  //   // optionally clear pick after adding
  //   setSelectedFixtureId("");
  // }


  return (
    <div style={containerStyle}>
      <h2 style={{ marginTop: 0 }}>Channels</h2>

      <div style={columnsStyle}>
        {/* Left column: channel list + AutoPixel_Index */}
        <div style={leftColStyle}>
          <ChannelList
            channels={channels}
            selectedIndex={clampedIndex}
            onSelect={setSelectedIndex}
            onAdd={addChannel}
            onRemove={() => removeChannel(clampedIndex)}
          />

          {/* AutoPixel_Index applies to ALL channels */}
          <div style={{ marginTop: 12 }}>
            <button onClick={handleAutoPixelIndex}>AutoPixel_Index (compute offsets)</button>
            <p style={{ fontSize: 12, color: "#bfbfbf", marginTop: 6 }}>
              Sets each fixture’s <code>pixelOffset</code> from chain order + <code>pixelCount</code>.
              Missing counts are skipped (warning).
            </p>
          </div>
        </div>

        {/* Right column: selected channel editor + Add-to-chain controls */}
        <div style={rightColStyle}>
          {selected ? (
            <>
              <ChannelChainEditor
                channel={selected}
                onChange={(c) => updateChannel(selectedIndex, c)}
                availableFixtures={fixtureOptions} //these are NOW defines as ONLY name and ID... why? ug
                nameById={nameById}
              />

{/* 
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
                <label style={{ fontSize: 12 }}>Add fixture to this chain:</label>
                <select
                  value={selectedFixtureId}
                  onChange={(e) => setSelectedFixtureId(e.target.value)}
                  style={{ minWidth: 220 }}
                >
                  <option value="">(choose fixture)</option>
                  {availableFixtures.map(opt  => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name}
                    </option>
                  ))}
                </select>
                <button onClick={addToChain} disabled={!selectedFixtureId}>
                  Add to chain
                </button>
              </div>
               */}
            </>
          ) : (
            <p>No channel selected.</p>
          )}
        </div>
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};
const columnsStyle: React.CSSProperties = {
  display: "flex",
  gap: 16,
  alignItems: "flex-start",
};
const leftColStyle: React.CSSProperties = { minWidth: 240, maxWidth: 280, width: 280 };
const rightColStyle: React.CSSProperties = { flex: 1, minWidth: 420 };
