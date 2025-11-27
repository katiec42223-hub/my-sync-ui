import React, { useState } from "react";
import type { AlignmentGroup, AlignmentMember, AlignmentMode } from "../modelTypes";

const panelStyle: React.CSSProperties = {
  border: "1px solid #3a3d42",
  borderRadius: 8,
  padding: 12,
  background: "#1f2125",
};
const rowStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 };
const labelStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12 };
const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", marginTop: 6, marginBottom: 8 };
const adderRowStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8 };


type Props = {
  group: AlignmentGroup;
  onChange: (g: AlignmentGroup) => void;
  availableFixtureIds: string[];
};

export default function AlignmentGroupEditor({ group, onChange, availableFixtureIds }: Props) {
  
  console.log("[Editor] availableFixtureIds =", availableFixtureIds);
  const [newMemberId, setNewMemberId] = useState<string>("");

  function update<K extends keyof AlignmentGroup>(k: K, v: AlignmentGroup[K]) {
    onChange({ ...group, [k]: v });
  }

  function addMember() {
    if (!newMemberId) return;
    if (group.members.some((m) => m.fixtureId === newMemberId)) return;
    const m: AlignmentMember = {
      fixtureId: newMemberId,
      flipRelativeToGroup: false,
      pixelOffsetInGroup: 0,
    };
    update("members", [...group.members, m]);
    setNewMemberId("");
  }

  function removeMember(idx: number) {
    const next = group.members.filter((_, i) => i !== idx);
    update("members", next);
  }

  function updateMember(idx: number, patch: Partial<AlignmentMember>) {
    const next = group.members.map((m, i) => (i === idx ? { ...m, ...patch } : m));
    update("members", next);
  }

  const modes: AlignmentMode[] = ["CENTER", "HEAD", "TAIL"];

  return (
    <div style={panelStyle}>
      <div style={rowStyle}>
        <label style={labelStyle}>
          Group Name
          <input
            type="text"
            value={group.name}
            onChange={(e) => update("name", e.target.value)}
          />
        </label>
        <label style={labelStyle}>
          Group ID
          <input
            type="text"
            value={group.id}
            onChange={(e) => update("id", e.target.value)}
          />
        </label>
        <label style={labelStyle}>
          Mode
          <select
            value={group.mode}
            onChange={(e) => update("mode", e.target.value as AlignmentMode)}
          >
            {modes.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      </div>

      <h4>Members</h4>
<ul style={{ listStyle: "none", paddingLeft: 0, marginTop: 8 }}>
  {group.members.map((m, i) => (
    <li
      key={`${m.fixtureId}-${i}`}
      style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}
    >
      <code style={{ minWidth: 140, fontSize: 12 }}>{m.fixtureId}</code>

      <label style={{ fontSize: 12 }}>
        Flip
        <input
          type="checkbox"
          checked={m.flipRelativeToGroup}
          onChange={(e) => updateMember(i, { flipRelativeToGroup: e.target.checked })}
          style={{ marginLeft: 6 }}
        />
      </label>

      <label style={{ fontSize: 12 }}>
        Pixel Offset
        <input
          type="number"
          value={m.pixelOffsetInGroup}
          onChange={(e) =>
            updateMember(i, { pixelOffsetInGroup: Number(e.target.value) || 0 })
          }
          style={{ width: 90, marginLeft: 6 }}
        />
      </label>

      <button onClick={() => removeMember(i)}>Remove</button>
    </li>
  ))}
  {group.members.length === 0 && (
    <li style={{ color: "#bfbfbf" }}>No members yet. Add one below.</li>
  )}
</ul>


      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
  <label style={{ fontSize: 12 }}>Add member:</label>
  <select
    value={newMemberId}
    onChange={(e) => setNewMemberId(e.target.value)}
    style={{ minWidth: 220 }}
  >
    <option value="">(choose fixture)</option>
    {availableFixtureIds
      .filter((id) => !group.members.some((m) => m.fixtureId === id)) // avoid duplicates
      .map((id) => (
        <option key={id} value={id}>
          {id}
        </option>
      ))}
  </select>
  <button onClick={addMember} disabled={!newMemberId}>
    Add member
  </button>
</div>

    
    </div>
  );
}