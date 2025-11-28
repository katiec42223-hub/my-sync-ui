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
import type { Song } from "./SongListEditor";
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

  function getProjectData() {
    return {
      formatVersion: "1.0",
      meta: {
        created: new Date().toISOString(),
        appName: "SYNCHRON",
      },
      layout,
      songs: songList,
      events,
    };
  }

  useEffect(() => console.log("[APP] view =", view), [view]);
  return (
    <div>
      <TopCommandBar
        onPlay={() => console.log("play")}
        onPause={() => console.log("pause")}
        onRewind={(ms) => console.log("rewind", ms)}
        onForward={(ms) => console.log("forward", ms)}
        onProjectSaved={(path) => console.log("saved", path)}
        getProjectJson={getProjectData}
        onProjectLoaded={(json, path) => {
          console.log("loaded", path, json);

          // Validate format version
          if (json.formatVersion !== "1.0") {
            console.warn("Unsupported format version:", json.formatVersion);
          }

          // Restore layout
          if (json.layout) {
            setLayout({
              fixtures: json.layout.fixtures || [],
              channels: json.layout.channels || [],
              alignmentGroups: json.layout.alignmentGroups || [],
            });
          }

          // Restore songs
          if (Array.isArray(json.songs)) {
            setSongList(json.songs);
          }

          // Restore events
          if (Array.isArray(json.events)) {
            setEvents(json.events);
          }
        }}
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
