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

  // GLOBAL transport state (shared by top bar + preview)
  const [playheadMs, setPlayheadMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const handlePlay = () => setIsPlaying(true);
  const handlePause = () => setIsPlaying(false);

  // Positive delta = forward, negative = rewind
  const handleSeek = (deltaMs: number) => {
    setPlayheadMs((p) => Math.max(0, p + deltaMs));
  };

  const playbackHandlers = {
    onPlay: handlePlay,
    onPause: handlePause,
    onRewind: (ms?: number) => handleSeek(-(ms ?? 5000)),
    onForward: (ms?: number) => handleSeek(ms ?? 5000),
  };

  async function handleSelectSoundtrack() {
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
        visualizerConfig,
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
        onProjectSaved={(path) => console.log("saved", path)}
        getProjectJson={getProjectData}
        onProjectLoaded={(json, path) => {
          console.log("loaded", path, json);

          if (json.formatVersion !== "1.0") {
            console.warn("Unsupported format version:", json.formatVersion);
          }

          if (json.layout) {
            setLayout({
              fixtures: json.layout.fixtures || [],
              channels: json.layout.channels || [],
              alignmentGroups: json.layout.alignmentGroups || [],
            });
            if (json.layout.visualizerConfig) {
              setVisualizerConfig(json.layout.visualizerConfig);
            }
          }

          if (Array.isArray(json.songs)) {
            setSongList(json.songs);
          }

          if (Array.isArray(json.events)) {
            setEvents(json.events);
          }

          if (typeof json.soundtrack === "string") {
            setSoundtrack(json.soundtrack);
          }

          localStorage.setItem("lastProjectPath", path || "");
        }}
        onOpenModelEditor={() => setView("model-editor")}
        // transport wiring
        playing={isPlaying}
        timeMs={playheadMs}
        onPlay={playbackHandlers.onPlay}
        onPause={playbackHandlers.onPause}
        onRewind={() => handleSeek(-5000)}
        onForward={() => handleSeek(5000)}
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
            onSelectSoundtrack={handleSelectSoundtrack}
            soundtrack={soundtrack}
            visualizerConfig={visualizerConfig}
            // share transport state + controls with preview
            playing={isPlaying}
            timeMs={playheadMs}
            onPlay={handlePlay}
            onPause={handlePause}
            onRewind={(ms = 5000) => handleSeek(-ms)}
            onForward={(ms = 5000) => handleSeek(ms)}
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
    </div>
  );
}
1;
