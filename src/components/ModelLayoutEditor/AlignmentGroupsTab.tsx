import React, { useMemo } from "react";
import type { AlignmentGroup, AlignmentMember, AlignmentMode, Fixture } from "./modelTypes";
import AlignmentGroupList from "./alignment/AlignmentGroupList";
import AlignmentGroupEditor from "./alignment/AlignmentGroupEditor";

type Props = {
  fixtures: Fixture[];
  groups: AlignmentGroup[];
  onGroupsChange: (g: AlignmentGroup[]) => void;
};

export default function AlignmentGroupsTab({ fixtures, groups, onGroupsChange }: Props) {
  const [selectedIdx, setSelectedIdx] = React.useState<number | null>(null);

function addGroup() {
  const id = `group_${groups.length + 1}`;

  const newGroup: AlignmentGroup = {
    id,
    name: `Group ${groups.length + 1}`,
    mode: "CENTER",                 // one of: "CENTER" | "HEAD" | "TAIL"
    members: [] as AlignmentMember[]
  };

  onGroupsChange([...groups, newGroup]);
  setSelectedIdx(groups.length);    // new group is last index
}

function removeGroup(idx: number) {
  const next = groups.filter((_, i) => i !== idx);
  onGroupsChange(next);

  if (selectedIdx === idx) setSelectedIdx(null);
  else if (selectedIdx !== null && selectedIdx > idx) setSelectedIdx(selectedIdx - 1);
}

function updateGroup(idx: number, nextGroup: AlignmentGroup) {
  const next = groups.map((g, i) => (i === idx ? nextGroup : g));
  onGroupsChange(next);
}

const selectedGroup: AlignmentGroup | null =
  selectedIdx != null && selectedIdx >= 0 && selectedIdx < groups.length
    ? groups[selectedIdx]
    : null;

const fixtureIds = React.useMemo(() => fixtures.map((f) => f.id), [fixtures]);


  return (
    <div style={containerStyle}>
      <h2 style={{ marginTop: 0 }}>Alignment Groups</h2>

      <div style={columnsStyle}>
        <div style={leftColStyle}>
          <AlignmentGroupList
            groups={groups}
            selectedIndex={selectedIdx}
            onSelect={setSelectedIdx}
            onAdd={addGroup}
            onRemove={removeGroup}
          />
        </div>

        <div style={rightColStyle}>
          {selectedGroup && selectedIdx != null ? (
            <AlignmentGroupEditor
              group={selectedGroup}                                 //{/* fix: use selectedGroup */}
              onChange={(g) => updateGroup(selectedIdx, g)}          //{/* selectedIdx is non-null here */}
              availableFixtureIds={fixtureIds}
            />
          ) : (
            <p>No group selected.</p>
          )}
        </div>
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 12 };
const columnsStyle: React.CSSProperties = { display: "flex", gap: 16, alignItems: "flex-start" };
const leftColStyle: React.CSSProperties = { minWidth: 280, maxWidth: 320, width: 320 };
const rightColStyle: React.CSSProperties = { flex: 1, minWidth: 420 };
