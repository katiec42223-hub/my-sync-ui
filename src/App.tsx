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
  VisualizerConfig,
} from "./components/ModelLayoutEditor/modelTypes";
import type { Song } from "./SongListEditor";
import { ShowEvent } from "./types";
import { open } from "@tauri-apps/plugin-dialog";
import Visualizer3D from "./components/Visualizer3D/Visualizer3D";

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
  const [soundtrack, setSoundtrack] = useState<string>("");

  const [visualizerConfig, setVisualizerConfig] = useState<VisualizerConfig>({
    fixtures: [],
    camera: { position: [3, 2, 3], target: [0, 0, 0] },
  });

  async function handleSelectSoundtrack() {
    // Use Tauri's open dialog to pick a music file
    const file = await open({
      multiple: false,
      filters: [
        { name: "Audio", extensions: ["mp3", "wav", "ogg", "flac", "m4a"] },
      ],
    });
    if (typeof file === "string") {
      setSoundtrack(file);
    }
  }

  function getProjectData() {
    return {
      formatVersion: "1.0",
      meta: {
        created: new Date().toISOString(),
        appName: "SYNCHRON",
      },
      layout: {
        ...layout,
        visualizerConfig, // CORRECT - inside layout object
      },
      songs: songList,
      events,
      soundtrack,
    };
  }

  // Auto-load last project on mount
  useEffect(() => {
    const lastProject = localStorage.getItem("lastProjectPath");
    if (lastProject) {
      (async () => {
        console.log("Attempting to auto load:", lastProject);
        try {
          const { readTextFile } = await import("@tauri-apps/plugin-fs");
          const txt = await readTextFile(lastProject);
          const json = JSON.parse(txt);

          if (json.formatVersion !== "1.0") {
            console.warn("Unsupported format version:", json.formatVersion);
          }
          if (json.layout) {
            setLayout({
              fixtures: json.layout.fixtures || [],
              channels: json.layout.channels || [],
              alignmentGroups: json.layout.alignmentGroups || [],
            });
            // Restore visualizer config
            if (json.layout.visualizerConfig) {
              setVisualizerConfig(json.layout.visualizerConfig);
            }
          }
          if (Array.isArray(json.songs)) setSongList(json.songs);
          if (Array.isArray(json.events)) setEvents(json.events);
          if (typeof json.soundtrack === "string")
            setSoundtrack(json.soundtrack);

          console.log("Auto-loaded last project:", lastProject);
        } catch (e) {
          console.error("Failed to auto-load project:", e);
          localStorage.removeItem("lastProjectPath");
        }
      })();
    }
  }, []);

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
            // Restore visualizer config
            if (json.layout.visualizerConfig) {
              setVisualizerConfig(json.layout.visualizerConfig);
            }
          }

          // Restore visualizer config
          if (json.layout.visualizerConfig) {
            setVisualizerConfig(json.layout.visualizerConfig);
          }

          // Restore songs
          if (Array.isArray(json.songs)) {
            setSongList(json.songs);
          }

          // Restore events
          if (Array.isArray(json.events)) {
            setEvents(json.events);
          }

          // Restore soundtrack
          if (typeof json.soundtrack === "string") {
            setSoundtrack(json.soundtrack);
          }

          // Store this as the last opened project
          localStorage.setItem("lastProjectPath", path || "");
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
            onPlay={() => {
              /* implement playback logic */
            }}
            onPause={() => {
              /* implement pause logic */
            }}
            onRewind={() => {
              /* implement rewind logic */
            }}
            onForward={() => {
              /* implement forward logic */
            }}
            onSelectSoundtrack={handleSelectSoundtrack}
            soundtrack={soundtrack}
            visualizerConfig={visualizerConfig}
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
          visualizerConfig={visualizerConfig}
          onVisualizerConfigChange={setVisualizerConfig}
        />
      )}
      {/* the rest of your UI goes here (timeline, previews, etc.) */}
    </div>
  );
}
