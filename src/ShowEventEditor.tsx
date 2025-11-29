// src/ShowEventEditor.tsx
import React, { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { ShowEvent } from "./types";
import type { Song } from "./SongListEditor";
import FunctionParamPanel from "./components/FunctionParamPanel";
import { listFunctions } from "./functions/registry";

const FUNCTION_LIST = listFunctions().map((f) => ({
  value: f.id,
  label: f.label,
}));
const FIRST_FUNC_ID = FUNCTION_LIST[0]?.value || "";

export default function ShowEventsEditor({
  event,
  songs = [],
  fixtures: availableFixtures = [],
  channels: availableChannels = [],
  alignmentGroups: availableGroups = [],
  onSave,
  onCancel,
}: {
  event?: ShowEvent;
  songs?: Song[];
  fixtures?: string[];
  channels?: string[];
  alignmentGroups?: string[];
  onSave: (evt: ShowEvent) => void;
  onCancel: () => void;
}) {
  // Migrate legacy payload to new structure on mount
  const migratedEvent = useMemo(() => {
    if (!event) return null;
    if (event.blade && event.fuselage) return event; // already new format

    // Legacy: event.func + event.payload
    const legacyFunc = event.func ?? FIRST_FUNC_ID;
    const legacyParams = event.payload?.params ?? {};
    const isBlade = legacyFunc.startsWith("blade:");

    return {
      ...event,
      blade: {
        top: {
          func: isBlade ? legacyFunc : "blade:line",
          params: isBlade ? legacyParams : {},
          media: event.payload?.topFiles ?? [],
        },
        bottom: {
          func: isBlade ? legacyFunc : "blade:line",
          params: isBlade ? legacyParams : {},
          media: event.payload?.bottomFiles ?? [],
        },
      },
      fuselage: {
        func: !isBlade ? legacyFunc : "fuse:verticalSweep",
        params: !isBlade ? legacyParams : {},
        assignments: {
          fixtureIds: event.payload?.fixtures ?? [],
          channelIds: event.payload?.channels ?? [],
          groupIds: event.payload?.alignmentGroups ?? [],
          pixels: event.payload?.pixels ?? [],
          channelPixelMap: event.payload?.channelPixelMap ?? {},
        },
      },
    };
  }, [event]);

  const [songId, setSongId] = useState<number>(
    migratedEvent?.songId ?? songs[0]?.id ?? 0
  );

  const tempoForSong = useMemo(() => {
    const s = songs.find((x) => x.id === songId);
    return s?.tempo ?? 160;
  }, [songs, songId]);

  const initialBeats = useMemo(() => {
    if (migratedEvent?.durationMs && tempoForSong) {
      const beatsFloat = (migratedEvent.durationMs * tempoForSong) / 60000;
      return Math.max(1, Math.round(beatsFloat)); // clamp to whole beats
    }
    return 4; // default whole beats
  }, [migratedEvent?.durationMs, tempoForSong]);

  const [beats, setBeats] = useState<number>(initialBeats);

  // Check if top and bottom are identical
  const initialSame = useMemo(() => {
    if (!migratedEvent?.blade) return true;
    const { top, bottom } = migratedEvent.blade;
    return (
      top.func === bottom.func &&
      JSON.stringify(top.params) === JSON.stringify(bottom.params) &&
      JSON.stringify(top.media) === JSON.stringify(bottom.media)
    );
  }, [migratedEvent]);

  const [sameBladeTopBottom, setSameBladeTopBottom] = useState(initialSame);

  // Blade Top (used for both when same is true)
  const [bladeTopFunc, setBladeTopFunc] = useState<string>(
    migratedEvent?.blade?.top.func ?? "blade:line"
  );
  const [bladeTopParams, setBladeTopParams] = useState<Record<string, any>>(
    migratedEvent?.blade?.top.params ?? {}
  );
  const [bladeTopMedia, setBladeTopMedia] = useState<string[]>(
    migratedEvent?.blade?.top.media ?? []
  );

  // Blade Bottom (only used when same is false)
  const [bladeBottomFunc, setBladeBottomFunc] = useState<string>(
    migratedEvent?.blade?.bottom.func ?? "blade:line"
  );
  const [bladeBottomParams, setBladeBottomParams] = useState<
    Record<string, any>
  >(migratedEvent?.blade?.bottom.params ?? {});
  const [bladeBottomMedia, setBladeBottomMedia] = useState<string[]>(
    migratedEvent?.blade?.bottom.media ?? []
  );

  // Fuselage
  const [fuselageFunc, setFuselageFunc] = useState<string>(
    migratedEvent?.fuselage?.func ?? "fuse:verticalSweep"
  );
  const [fuselageParams, setFuselageParams] = useState<Record<string, any>>(
    migratedEvent?.fuselage?.params ?? {}
  );
  const [fuselageFixtures, setFuselageFixtures] = useState<string[]>(
    migratedEvent?.fuselage?.assignments?.fixtureIds ?? []
  );
  const [fuselageChannels, setFuselageChannels] = useState<string[]>(
    migratedEvent?.fuselage?.assignments?.channelIds ?? []
  );
  const [fuselageGroups, setFuselageGroups] = useState<string[]>(
    migratedEvent?.fuselage?.assignments?.groupIds ?? []
  );

  const existingChannelPixelMap =
    migratedEvent?.fuselage?.assignments?.channelPixelMap ?? {};

  const [assignMode, setAssignMode] = useState<
    "none" | "fixtures" | "channels" | "groups" | "pixels"
  >(
    fuselageFixtures.length
      ? "fixtures"
      : fuselageChannels.length
      ? "channels"
      : fuselageGroups.length
      ? "groups"
      : Object.keys(existingChannelPixelMap).length > 0
      ? "pixels"
      : "none"
  );

  function serializeChannelPixelMap(map: Record<string, number[]>): string {
    const lines: string[] = [];
    for (const [ch, arr] of Object.entries(map)) {
      const sorted = [...new Set(arr)].sort((a, b) => a - b);
      lines.push(`${ch}: ${sorted.join(", ")}`);
    }
    return lines.join("\n");
  }

  const [pixelInput, setPixelInput] = useState<string>(() => {
    const keys = Object.keys(existingChannelPixelMap);
    if (keys.length > 0) {
      return serializeChannelPixelMap(existingChannelPixelMap);
    }
    return "";
  });

  // Collapsible sections
  const [bladeOpen, setBladeOpen] = useState(true);
  const [bladeTopOpen, setBladeTopOpen] = useState(true);
  const [bladeBottomOpen, setBladeBottomOpen] = useState(true);
  const [fuselageOpen, setFuselageOpen] = useState(true);

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onCancel]);

  function handleSave() {
    const durationMs = Math.round((beats * 60000) / tempoForSong);

    const { map: channelPixelMap, unknown } =
      assignMode === "pixels"
        ? parseChannelPixelInput(pixelInput, availableChannels)
        : { map: {}, unknown: [] };

    onSave({
      id: migratedEvent?.id ?? crypto.randomUUID?.() ?? String(Date.now()),
      songId,
      durationMs,
      blade: sameBladeTopBottom
        ? {
            top: {
              func: bladeTopFunc,
              params: bladeTopParams,
              media: bladeTopMedia,
            },
            bottom: {
              func: bladeTopFunc,
              params: bladeTopParams,
              media: bladeTopMedia,
            },
          }
        : {
            top: {
              func: bladeTopFunc,
              params: bladeTopParams,
              media: bladeTopMedia,
            },
            bottom: {
              func: bladeBottomFunc,
              params: bladeBottomParams,
              media: bladeBottomMedia,
            },
          },
      fuselage: {
        func: fuselageFunc,
        params: fuselageParams,
        assignments: {
          fixtureIds: assignMode === "fixtures" ? fuselageFixtures : [],
          channelIds: assignMode === "channels" ? fuselageChannels : [],
          groupIds: assignMode === "groups" ? fuselageGroups : [],
          channelPixelMap:
            assignMode === "pixels" ? channelPixelMap : undefined,
        },
      },
    });
  }

  async function pickBladeMedia(blade: "top" | "bottom") {
    const sel = await open({
      multiple: true,
      filters: [
        {
          name: "Blade media",
          extensions: [
            "png",
            "jpg",
            "jpeg",
            "gif",
            "webp",
            "bmp",
            "mp4",
            "webm",
          ],
        },
      ],
    });
    const files = Array.isArray(sel)
      ? (sel as string[])
      : typeof sel === "string"
      ? [sel]
      : [];
    if (blade === "top" || sameBladeTopBottom) setBladeTopMedia(files);
    else setBladeBottomMedia(files);
  }

  function toggleAssignment(
    list: string[],
    setter: (fn: (prev: string[]) => string[]) => void,
    value: string
  ) {
    setter((prev) =>
      prev.includes(value) ? prev.filter((p) => p !== value) : [...prev, value]
    );
  }

  const bladeFunctions = FUNCTION_LIST.filter((f) =>
    f.value.startsWith("blade:")
  );
  const fuselageFunctions = FUNCTION_LIST.filter((f) =>
    f.value.startsWith("fuse:")
  );

  function parseChannelPixelInput(input: string, knownChannels: string[]) {
    // Split into channel sections. Allow newline separation.
    // Pattern: <channel name> : <list>
    const lines = input
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean);

    // Also allow multiple channel declarations on one line separated by a channel name + colon.
    // We’ll first break lines further if more than one `:` appears.
    const sections: string[] = [];
    lines.forEach((line) => {
      // If multiple channel markers, split by regex capturing channel names
      const parts = line
        .split(/(?=(?:^|[\s;])[^:]+:\s*)/)
        .map((p) => p.trim())
        .filter(Boolean);
      sections.push(...parts);
    });

    const map: Record<string, number[]> = {};
    const unknown: string[] = [];

    for (const sec of sections) {
      const m = sec.match(/^([^:]+):\s*(.+)$/);
      if (!m) continue;
      const rawChannel = m[1].trim();
      const listPart = m[2].trim();
      // Normalize channel name to match entries in knownChannels
      const channelName = knownChannels.find(
        (c) => c.toLowerCase() === rawChannel.toLowerCase()
      );
      if (!channelName) {
        unknown.push(rawChannel);
        continue;
      }
      const nums: number[] = [];
      listPart
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .forEach((token) => {
          if (/^\d+$/.test(token)) {
            const v = Number(token);
            if (v >= 0) nums.push(v);
            return;
          }
          const range = token.match(/^(\d+)\s*-\s*(\d+)$/);
          if (range) {
            let a = Number(range[1]);
            let b = Number(range[2]);
            if (a > b) [a, b] = [b, a];
            for (let i = a; i <= b; i++) nums.push(i);
          }
        });
      map[channelName] = Array.from(new Set(nums)).sort((a, b) => a - b);
    }

    return { map, unknown };
  }

  return (
    <div style={overlay}>
      <div style={panel}>
        <h3>Event Editor</h3>

        {/* Song / Duration */}
        <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12 }}>Song</label>
            <select
              value={songId}
              onChange={(e) => setSongId(Number(e.target.value))}
              style={{ width: "100%" }}
            >
              {songs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.description} ({s.tempo} BPM)
                </option>
              ))}
            </select>
          </div>
          <div style={{ width: 120 }}>
            <label style={{ fontSize: 12 }}>Duration (beats)</label>
            <input
              type="number"
              min={1}
              step={1}
              value={beats}
              onChange={(e) =>
                setBeats(Math.max(1, Math.round(Number(e.target.value))))
              }
              style={{ width: "100%" }}
            />
          </div>
        </div>

        {/* Blade Section */}
        <CollapsibleSection
          title="Blade"
          open={bladeOpen}
          setOpen={setBladeOpen}
        >
          <label style={{ display: "block", marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={sameBladeTopBottom}
              onChange={(e) => setSameBladeTopBottom(e.target.checked)}
            />{" "}
            Same for Top & Bottom
          </label>

          {sameBladeTopBottom ? (
            // Single section for both
            <div>
              <div style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 12 }}>Function</label>
                <select
                  value={bladeTopFunc}
                  onChange={(e) => setBladeTopFunc(e.target.value)}
                  style={{ width: "100%" }}
                >
                  {bladeFunctions.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
              <FunctionParamPanel
                funcId={bladeTopFunc}
                params={bladeTopParams}
                onChangeParam={(k, v) =>
                  setBladeTopParams((p) => ({ ...p, [k]: v }))
                }
              />
              <button
                onClick={() => pickBladeMedia("top")}
                style={{ marginTop: 8 }}
              >
                Pick Media ({bladeTopMedia.length} file
                {bladeTopMedia.length !== 1 ? "s" : ""})
              </button>
            </div>
          ) : (
            // Separate Top and Bottom
            <>
              <CollapsibleSection
                title="Top"
                open={bladeTopOpen}
                setOpen={setBladeTopOpen}
              >
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 12 }}>Function</label>
                  <select
                    value={bladeTopFunc}
                    onChange={(e) => setBladeTopFunc(e.target.value)}
                    style={{ width: "100%" }}
                  >
                    {bladeFunctions.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
                <FunctionParamPanel
                  funcId={bladeTopFunc}
                  params={bladeTopParams}
                  onChangeParam={(k, v) =>
                    setBladeTopParams((p) => ({ ...p, [k]: v }))
                  }
                />
                <button
                  onClick={() => pickBladeMedia("top")}
                  style={{ marginTop: 8 }}
                >
                  Pick Media ({bladeTopMedia.length} file
                  {bladeTopMedia.length !== 1 ? "s" : ""})
                </button>
              </CollapsibleSection>

              <CollapsibleSection
                title="Bottom"
                open={bladeBottomOpen}
                setOpen={setBladeBottomOpen}
              >
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 12 }}>Function</label>
                  <select
                    value={bladeBottomFunc}
                    onChange={(e) => setBladeBottomFunc(e.target.value)}
                    style={{ width: "100%" }}
                  >
                    {bladeFunctions.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
                <FunctionParamPanel
                  funcId={bladeBottomFunc}
                  params={bladeBottomParams}
                  onChangeParam={(k, v) =>
                    setBladeBottomParams((p) => ({ ...p, [k]: v }))
                  }
                />
                <button
                  onClick={() => pickBladeMedia("bottom")}
                  style={{ marginTop: 8 }}
                >
                  Pick Media ({bladeBottomMedia.length} file
                  {bladeBottomMedia.length !== 1 ? "s" : ""})
                </button>
              </CollapsibleSection>
            </>
          )}
        </CollapsibleSection>

        {/* Fuselage */}
        <CollapsibleSection
          title="Fuselage"
          open={fuselageOpen}
          setOpen={setFuselageOpen}
        >
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 12 }}>Function</label>
            <select
              value={fuselageFunc}
              onChange={(e) => setFuselageFunc(e.target.value)}
              style={{ width: "100%" }}
            >
              {fuselageFunctions.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <FunctionParamPanel
            funcId={fuselageFunc}
            params={fuselageParams}
            onChangeParam={(k, v) =>
              setFuselageParams((p) => ({ ...p, [k]: v }))
            }
          />

          {/* Assignment mode */}
          <div style={{ marginTop: 12 }}>
            <label style={{ fontSize: 12 }}>Assign to:</label>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <label>
                <input
                  type="radio"
                  checked={assignMode === "none"}
                  onChange={() => setAssignMode("none")}
                />{" "}
                None
              </label>
              <label>
                <input
                  type="radio"
                  checked={assignMode === "fixtures"}
                  onChange={() => setAssignMode("fixtures")}
                />{" "}
                Fixtures
              </label>
              <label>
                <input
                  type="radio"
                  checked={assignMode === "channels"}
                  onChange={() => setAssignMode("channels")}
                />{" "}
                Channels
              </label>
              <label>
                <input
                  type="radio"
                  checked={assignMode === "groups"}
                  onChange={() => setAssignMode("groups")}
                />{" "}
                Groups
              </label>
              <label>
                <input
                  type="radio"
                  checked={assignMode === "pixels"}
                  onChange={() => setAssignMode("pixels")}
                />{" "}
                Channel Pixels
              </label>
            </div>
          </div>

          {assignMode === "fixtures" && (
            <div style={{ marginTop: 8, maxHeight: 120, overflowY: "auto" }}>
              {availableFixtures.map((f) => (
                <label key={f} style={{ display: "block" }}>
                  <input
                    type="checkbox"
                    checked={fuselageFixtures.includes(f)}
                    onChange={() =>
                      toggleAssignment(fuselageFixtures, setFuselageFixtures, f)
                    }
                  />{" "}
                  {f}
                </label>
              ))}
            </div>
          )}
          {assignMode === "channels" && (
            <div style={{ marginTop: 8, maxHeight: 120, overflowY: "auto" }}>
              {availableChannels.map((c) => (
                <label key={c} style={{ display: "block" }}>
                  <input
                    type="checkbox"
                    checked={fuselageChannels.includes(c)}
                    onChange={() =>
                      toggleAssignment(fuselageChannels, setFuselageChannels, c)
                    }
                  />{" "}
                  {c}
                </label>
              ))}
            </div>
          )}
          {assignMode === "groups" && (
            <div style={{ marginTop: 8, maxHeight: 120, overflowY: "auto" }}>
              {availableGroups.map((g) => (
                <label key={g} style={{ display: "block" }}>
                  <input
                    type="checkbox"
                    checked={fuselageGroups.includes(g)}
                    onChange={() =>
                      toggleAssignment(fuselageGroups, setFuselageGroups, g)
                    }
                  />{" "}
                  {g}
                </label>
              ))}
            </div>
          )}
          {assignMode === "pixels" && (
            <div style={{ marginTop: 8 }}>
              <label style={{ fontSize: 12 }}>Channel Pixel Assignments</label>
              <textarea
                value={pixelInput}
                onChange={(e) => setPixelInput(e.target.value)}
                placeholder="Channel 1: 1-10, 15, 20&#10;Channel 2: 5-8, 12"
                rows={4}
                style={{ width: "100%", fontFamily: "monospace", fontSize: 11 }}
              />
              <div style={{ marginTop: 6, fontSize: 12 }}>
                {(() => {
                  const { map, unknown } = parseChannelPixelInput(
                    pixelInput,
                    availableChannels
                  );
                  const channelSummaries = Object.entries(map).map(
                    ([ch, arr]) =>
                      `${ch}: ${arr.length} pixel${arr.length === 1 ? "" : "s"}`
                  );
                  return (
                    <>
                      <div style={{ color: "#bbb" }}>
                        {channelSummaries.length
                          ? channelSummaries.join(" • ")
                          : "No valid channel pixel entries parsed"}
                      </div>
                      {unknown.length > 0 && (
                        <div style={{ color: "#ff6666", marginTop: 4 }}>
                          Unknown channel name(s): {unknown.join(", ")}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </CollapsibleSection>

        {/* Actions */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 16,
          }}
        >
          <button onClick={onCancel}>Cancel</button>
          <button onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}

function CollapsibleSection({
  title,
  open,
  setOpen,
  children,
}: {
  title: string;
  open: boolean;
  setOpen: (o: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid #3a3d42",
        borderRadius: 6,
        marginBottom: 12,
        padding: 8,
      }}
    >
      <div
        onClick={() => setOpen(!open)}
        style={{
          cursor: "pointer",
          fontWeight: "bold",
          marginBottom: open ? 8 : 0,
          userSelect: "none",
        }}
      >
        {open ? "▼" : "▶"} {title}
      </div>
      {open && <div>{children}</div>}
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.5)",
  display: "grid",
  placeItems: "center",
  zIndex: 2000,
};

const panel: React.CSSProperties = {
  width: 700,
  maxHeight: "90vh",
  overflowY: "auto",
  background: "#202225",
  color: "white",
  border: "1px solid #2f3136",
  padding: 16,
  borderRadius: 8,
  boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
};
