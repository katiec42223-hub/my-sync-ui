import React, { useMemo, useState, useEffect, useRef } from "react";
import FixturesTab from "./FixturesTab";
import ChannelsTab from "./ChannelsTab";
import AlignmentGroupsTab from "./AlignmentGroupsTab";
import type { Fixture, ChannelChain, AlignmentGroup } from "./modelTypes";
import { open, save, confirm} from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

  type Props = { 
    onBack?: () => void;
    fixtures?: Fixture[];
    channels?: ChannelChain[];
    alignmentGroups?: AlignmentGroup[];
    onFixturesChange?: (f: Fixture[]) => void;
    onChannelsChange?: (c: ChannelChain[]) => void;
    onAlignmentGroupsChange?: (g: AlignmentGroup[]) => void;
  };

  const DIALOGS_ENABLED = false;

export default function ModelLayoutEditor({ 
  onBack, 
  fixtures = [], 
  channels = [], 
  alignmentGroups = [], 
  onFixturesChange = () => {}, 
  onChannelsChange = () => {}, 
  onAlignmentGroupsChange = () => {} }: Props) {
    useEffect(() => {
        console.log("[ModelLayoutEditor] mounted");
        return () => console.log("[ModelLayoutEditor] unmounted");
    }, []);
  const [tab, setTab] = useState<"fixtures" | "channels" | "alignment">(
    "fixtures"
  );


  // const [fixtures, setFixtures] = useState<Fixture[]>([]); // brings fixture info here, to calculate pixelOffset (indexing)
  // const [channels, setChannels] = useState<ChannelChain[]>([]);
  // const [alignmentGroups, setAlignmentGroups] = useState<AlignmentGroup[]>([]);
  const [layoutPath, setLayoutPath] = useState<string | undefined>(undefined);
  
  // mark dirty when fixtures change (we'll add channels/groups later)
  

  // Build the JSON we save (channels/groups to be wired later)
  const layoutJson = useMemo(
    () => ({
      layoutVersion: "0.0.1",
      modelName: "UNDEFINED_MODEL",
      fixtures: fixtures ?? [],
      channels: channels ?? [], 
      alignmentGroups: alignmentGroups ?? [],
    }),
    [fixtures, channels, alignmentGroups]
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  //FIX FOR SAVE...

function downloadJson(filename = "layout.json") {
  const blob = new Blob([JSON.stringify(layoutJson, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function triggerWebOpen() {
  fileInputRef.current?.click();
}

function handleWebFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const json = JSON.parse(String(reader.result));
      onFixturesChange(Array.isArray(json.fixtures) ? json.fixtures : []);
      onChannelsChange(Array.isArray(json.channels) ? json.channels : []);
      onAlignmentGroupsChange(Array.isArray(json.alignmentGroups) ? json.alignmentGroups : []);
      setLayoutPath(undefined); // unknown path in web mode
      console.log("[Load:web] success");
    } catch (err) {
      console.error("[Load:web] parse failed:", err);
      alert("Could not parse that JSON file.");
    }
  };
  reader.readAsText(file);
  // reset input so picking the same file again still fires change
  e.target.value = "";
}

  async function handleSave(saveAs = false) {
    try {
      let dest = layoutPath;
      if (!dest || saveAs) {
        const picked = await save({
          filters: [{ name: "Model Layout", extensions: ["json"] }],
          defaultPath: dest,
        });
        dest = typeof picked === "string" ? picked : undefined;
      }
      if (!dest) return;
      await writeTextFile(dest, JSON.stringify(layoutJson, null, 2));
      setLayoutPath(dest);
    } catch (e) {
      console.error("ModelLayoutEditor save failed:", e);
    }
  }



  async function handleLoad() {
    try {
      const picked = await open({
        multiple: false,
        filters: [{ name: "Model Layout", extensions: ["json"] }],
      });
      if (typeof picked !== "string") return;
      const txt = await readTextFile(picked);
      const json = JSON.parse(txt);
      // minimal hydration (fixtures only for now)
      onFixturesChange(Array.isArray(json.fixtures) ? json.fixtures : []);
      onChannelsChange(Array.isArray(json.channels) ? json.channels : []);
      onAlignmentGroupsChange(Array.isArray(json.alignmentGroups) ? json.alignmentGroups : []);
      setLayoutPath(picked);
    } catch (e) {
      console.error("ModelLayoutEditor load failed:", e);
    }
  }

  async function handleBack() {
     
     onBack?.();
   }

   function renameFixtureId(oldId: string, newId: string) {
  if (!newId || oldId === newId) return;

  // 1) fixtures
  const nextFixtures = fixtures.map(f => (f.id === oldId ? { ...f, id: newId } : f));
  onFixturesChange(nextFixtures);

  // 2) channels: update fixtureOrder references
  const nextChannels = channels.map(ch => ({
    ...ch,
    fixtureOrder: (ch.fixtureOrder ?? []).map(id => (id === oldId ? newId : id)),
  }));
  onChannelsChange(nextChannels);
}


  return (
    <div style={containerStyle}>
      <input
  ref={fileInputRef}
  type="file"
  accept=".json,application/json"
  style={{ display: "none" }}
  onChange={handleWebFilePicked}
/>

     
     <div style={headerRowStyle}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={handleBack} title="Back to main">← Back</button>
          <h1 style={headerStyle}>Model Layout Editor</h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => handleLoad()}>Load</button>
          <button onClick={() => handleSave(false)}>Save</button>
          <button onClick={() => handleSave(true)}>Save As…</button>
        </div>
      </div>

      {/* Tab Buttons */}
      <div style={tabBarStyle}>
        <button
          style={tab === "fixtures" ? activeTabStyle : tabBtnStyle}
          onClick={() => setTab("fixtures")}
        >
          Fixtures
        </button>
        <button
          style={tab === "channels" ? activeTabStyle : tabBtnStyle}
          onClick={() => setTab("channels")}
        >
          Channels
        </button>
        <button
          style={tab === "alignment" ? activeTabStyle : tabBtnStyle}
          onClick={() => setTab("alignment")}
        >
          Alignment Groups
        </button>
      </div>

      {/* Tab Content */}
      <div style={contentStyle}>
        {tab === "fixtures" && (
             <FixturesTab
             fixtures={fixtures}
             onFixturesChange={onFixturesChange} 
             onRenameFixtureId={renameFixtureId}
             />)}
        {tab === "channels" && (
            <ChannelsTab
            fixtures={fixtures}
            channels={channels}
            onFixturesChange={onFixturesChange} 
            onChannelsChange={onChannelsChange}
            />)}
        {tab === "alignment" && (
        <AlignmentGroupsTab
          fixtures={fixtures}
          groups={alignmentGroups}
          onGroupsChange={onAlignmentGroupsChange}
      />)}
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  padding: 20,
  color: "white",
};

const headerStyle: React.CSSProperties = {
  fontSize: 26,
  marginBottom: 0,
};

const headerRowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
}

const tabBarStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  marginBottom: 16,
};

const tabBtnStyle: React.CSSProperties = {
  padding: "8px 14px",
  background: "#2b2d31",
  borderRadius: 6,
  border: "#3a3d42",
  color: "white",
};

const activeTabStyle: React.CSSProperties = {
  ...tabBtnStyle,
  background: "#4f46e5",
  borderColor: "#4f46e5",
};

const contentStyle: React.CSSProperties = {
  marginTop: 12,
};
