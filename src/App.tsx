import TopCommandBar from "./components/TopCommandBar";
import ShowProgrammer from "./components/ShowProgrammer";
import ModelLayoutEditor from "./components/ModelLayoutEditor/ModelLayoutEditor";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import TimelineEditor from "./components/TimelineEditor";
import type {
  Fixture,
  ChannelChain,
  AlignmentGroup,
} from "./components/ModelLayoutEditor/modelTypes";
import type {Song} from "./SongListEditor";
import { ShowEvent } from "./types";

type Layout = {
  fixtures: Fixture[];
  channels: ChannelChain[];
  alignmentGroups: AlignmentGroup[];
};

export default function App() {
  const [view, setView] = useState<"main" | "model-editor">("main");
  const [layout, setLayout] = useState<Layout>({
    fixtures: [],
    channels: [],
    alignmentGroups: [],
  });
  const [songList, setSongList] = useState<Song[]>([]);
  const [events, setEvents] = useState<ShowEvent[]>([]); 
  useEffect(() => console.log("[APP] view =", view), [view]);
  return (
    <div>
      <TopCommandBar
        onPlay={() => console.log("play")}
        onPause={() => console.log("pause")}
        onRewind={(ms) => console.log("rewind", ms)}
        onForward={(ms) => console.log("forward", ms)}
        onProjectLoaded={(json, path) => console.log("loaded", path, json)}
        onProjectSaved={(path) => console.log("saved", path)}
        getProjectJson={() => ({ version: "0.1", events: [] })}
        onOpenModelEditor={() => setView("model-editor")}
      />

      {view === "main" && (
        <>
          <ShowProgrammer
            fixtures={layout.fixtures}
            channels={layout.channels}
            alignmentGroups={layout.alignmentGroups}
            songList={songList}
            onSongListChange={setSongList}
            events={events}
            onEventsChange={setEvents}
          />
          <TimelineEditor />
        </>
      )}
      {view === "model-editor" && (
        <ModelLayoutEditor
          fixtures={layout.fixtures}
          channels={layout.channels}
          alignmentGroups={layout.alignmentGroups}
          onFixturesChange={(f) => setLayout((p) => ({ ...p, fixtures: f }))}
          onChannelsChange={(c) => setLayout((p) => ({ ...p, channels: c }))}
          onAlignmentGroupsChange={(g) =>
            setLayout((p) => ({ ...p, alignmentGroups: g }))
          }
          onBack={() => setView("main")}
        />
      )}
      {/* the rest of your UI goes here (timeline, previews, etc.) */}
    </div>
  );
}
