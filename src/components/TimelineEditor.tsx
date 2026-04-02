import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { ShowEvent } from "../types";
import type { Song } from "../SongListEditor";

const SIDEBAR_W = 48;
const RULER_H = 24;
const TRACK_H = 40;
const TOTAL_H = 180;
const CANVAS_H = TOTAL_H; // sidebar + canvas share this height

const SONG_COLORS = ["#1e3a5f", "#1e5f3a", "#3a1e5f"];
const BLADE_COLOR = "#4f46e5";
const FUSE_COLOR = "#0d9488";

const TRACK_LABELS = ["Songs", "Blade", "Fuselage"];

export default function TimelineEditor({
  events,
  songList,
  playheadMs,
  totalDurationMs,
  onSeek,
  onPlaceEvent,
  onEventClick,
  mixPath,
}: {
  events: ShowEvent[];
  songList: Song[];
  playheadMs: number;
  totalDurationMs: number;
  onSeek: (ms: number) => void;
  onPlaceEvent?: (startMs: number, type: "blade" | "fuselage") => void;
  onEventClick?: (eventId: string) => void;
  mixPath?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [hoverTrack, setHoverTrack] = useState<"blade" | "fuselage" | null>(null);
  const [waveformData, setWaveformData] = useState<Float32Array | null>(null);
  const [waveformLoading, setWaveformLoading] = useState(false);

  // Decode waveform when mixPath changes
  useEffect(() => {
    if (!mixPath) {
      setWaveformData(null);
      return;
    }
    let cancelled = false;
    setWaveformLoading(true);
    (async () => {
      try {
        const audioCtx = new AudioContext();
        const resp = await fetch(convertFileSrc(mixPath));
        const buf = await resp.arrayBuffer();
        const decoded = await audioCtx.decodeAudioData(buf);
        if (cancelled) return;
        const channel = decoded.getChannelData(0);
        // Downsample to ~2000 bins max for performance
        const bins = Math.min(2000, channel.length);
        const samplesPerBin = Math.floor(channel.length / bins);
        const peaks = new Float32Array(bins);
        for (let i = 0; i < bins; i++) {
          let max = 0;
          const start = i * samplesPerBin;
          for (let j = start; j < start + samplesPerBin && j < channel.length; j++) {
            const abs = Math.abs(channel[j]);
            if (abs > max) max = abs;
          }
          peaks[i] = max;
        }
        setWaveformData(peaks);
        audioCtx.close();
      } catch (e) {
        console.error("Waveform decode failed:", e);
      } finally {
        if (!cancelled) setWaveformLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [mixPath]);

  // Derive scale: fit full show in ~900px default, or 1px=100ms, whichever is larger
  const pixelsPerMs = Math.max(1 / 100, 900 / Math.max(1, totalDurationMs));
  const canvasW = Math.max(900, totalDurationMs * pixelsPerMs);

  // First song tempo for ruler ticks
  const tempo = songList.length > 0 ? songList[0].tempo : 120;
  const msPerBeat = 60000 / tempo;


  // Auto-scroll to keep playhead visible while playing
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const playheadX = playheadMs * pixelsPerMs;
    const { scrollLeft, clientWidth } = el;
    // If playhead is outside the visible region, scroll to center it
    if (playheadX < scrollLeft || playheadX > scrollLeft + clientWidth - 40) {
      el.scrollLeft = Math.max(0, playheadX - clientWidth / 3);
    }
  }, [playheadMs, pixelsPerMs]);

  function handleCanvasClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + (scrollRef.current?.scrollLeft ?? 0);
    const ms = Math.max(0, x / pixelsPerMs);
    onSeek(ms);
  }

  // Build song bars with offset/duration
  const songBars = songList.map((s, i) => {
    const offset = s.offsetMs ?? 0;
    const duration =
      s.length_ms
      ?? (s.barCount && s.barCount > 0
        ? s.barCount * (s.timeSignature ?? 4) * (60000 / s.tempo)
        : (i < songList.length - 1
          ? (songList[i + 1].offsetMs ?? 0) - offset
          : totalDurationMs - offset));
    return { song: s, offset, duration: Math.max(0, duration), colorIdx: i };
  });

  // Draw waveform on canvas
  useEffect(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas || !waveformData) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = Math.round(canvasW);
    const h = TRACK_H - 8;
    canvas.width = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    const mid = h / 2;
    for (let px = 0; px < w; px++) {
      const binIdx = Math.floor((px / w) * waveformData.length);
      const amp = waveformData[Math.min(binIdx, waveformData.length - 1)];
      const barH = amp * h;
      ctx.fillRect(px, mid - barH / 2, 1, barH);
    }
  }, [waveformData, canvasW]);

  const playheadX = playheadMs * pixelsPerMs;

  return (
    <div style={{ display: "flex", height: TOTAL_H, background: "#18191c", borderTop: "1px solid #2f3136", userSelect: "none" }}>
      {/* Sidebar */}
      <div style={{ width: SIDEBAR_W, flexShrink: 0, borderRight: "1px solid #2f3136" }}>
        {/* Ruler label */}
        <div style={{ height: RULER_H, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#666" }}>
          Time
        </div>
        {TRACK_LABELS.map((label) => (
          <div
            key={label}
            style={{
              height: TRACK_H,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              color: "#aaa",
              borderTop: "1px solid #2f3136",
            }}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Scrollable canvas */}
      <div
        ref={scrollRef}
        style={{ flex: 1, overflowX: "auto", overflowY: "hidden", position: "relative" }}
      >
        <div
          style={{ width: canvasW, height: CANVAS_H, position: "relative", cursor: "crosshair" }}
          onClick={handleCanvasClick}
        >
          {/* Time ruler */}
          <div style={{ height: RULER_H, position: "relative", borderBottom: "1px solid #2f3136" }}>
            {Array.from({ length: Math.ceil(totalDurationMs / msPerBeat) + 1 }, (_, i) => {
              const ms = i * msPerBeat;
              const x = ms * pixelsPerMs;
              const isBar = i % 4 === 0;
              const barNum = Math.floor(i / 4) + 1;
              return (
                <div key={i} style={{ position: "absolute", left: x, top: 0, height: RULER_H }}>
                  <div style={{ width: 1, height: isBar ? 14 : 8, background: isBar ? "#555" : "#333" }} />
                  {isBar && barNum % 4 === 1 && (
                    <span style={{ position: "absolute", top: 2, left: 3, fontSize: 9, color: "#777", whiteSpace: "nowrap" }}>
                      {barNum}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Songs track */}
          <div style={{ height: TRACK_H, position: "relative", borderBottom: "1px solid #2f3136" }}>
            {/* Waveform overlay */}
            {waveformData && (
              <canvas
                ref={waveformCanvasRef}
                style={{ position: "absolute", left: 0, top: 4, width: canvasW, height: TRACK_H - 8, pointerEvents: "none", zIndex: 1 }}
              />
            )}
            {waveformLoading && (
              <span style={{ position: "absolute", left: 8, top: 10, fontSize: 9, color: "#888", zIndex: 2 }}>
                Loading waveform...
              </span>
            )}
            {songBars.map(({ song, offset, duration, colorIdx }) => {
              const x = offset * pixelsPerMs;
              const w = Math.max(4, duration * pixelsPerMs);
              return (
                <div
                  key={song.id}
                  style={{
                    position: "absolute",
                    left: x,
                    top: 4,
                    width: w,
                    height: TRACK_H - 8,
                    background: SONG_COLORS[colorIdx % SONG_COLORS.length],
                    borderRadius: 3,
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    paddingLeft: 4,
                    fontSize: 10,
                    color: "white",
                    whiteSpace: "nowrap",
                  }}
                  title={song.description}
                >
                  {w > 40 ? song.description : ""}
                  {!song.barCount && (
                    <span
                      style={{
                        position: "absolute",
                        top: 2,
                        right: 4,
                        fontSize: 9,
                        color: "rgba(255,255,255,0.5)",
                        fontWeight: "bold",
                      }}
                      title="No bar count set — duration is estimated"
                    >
                      ?
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Blade track */}
          <div
            style={{ height: TRACK_H, position: "relative", borderBottom: "1px solid #2f3136" }}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setHoverX(e.clientX - rect.left + (scrollRef.current?.scrollLeft ?? 0));
              setHoverTrack("blade");
            }}
            onMouseLeave={() => { setHoverX(null); setHoverTrack(null); }}
            onClick={(e) => {
              if (!onPlaceEvent) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left + (scrollRef.current?.scrollLeft ?? 0);
              const ms = Math.max(0, x / pixelsPerMs);
              // Only place if not clicking on an existing block
              const clickedOnBlock = events.some((ev) => {
                if (!ev.blade) return false;
                const bx = ev.startMs * pixelsPerMs;
                const bw = Math.max(4, ev.durationMs * pixelsPerMs);
                return x >= bx && x <= bx + bw;
              });
              if (!clickedOnBlock) {
                e.stopPropagation();
                onPlaceEvent(ms, "blade");
              }
            }}
          >
            {events.map((ev, idx) => {
              if (!ev.blade) return null;
              const x = ev.startMs * pixelsPerMs;
              const w = Math.max(4, ev.durationMs * pixelsPerMs);
              const hasBoth = !!ev.blade && !!ev.fuselage;
              return (
                <div
                  key={ev.id}
                  style={{
                    position: "absolute",
                    left: x,
                    top: 4,
                    width: w,
                    height: TRACK_H - 8,
                    background: hasBoth
                      ? `linear-gradient(to right, ${BLADE_COLOR} 50%, ${FUSE_COLOR} 50%)`
                      : BLADE_COLOR,
                    borderRadius: 3,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    color: "white",
                    overflow: "hidden",
                    cursor: "pointer",
                  }}
                  title={`Event ${idx}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEventClick?.(ev.id);
                  }}
                >
                  {w > 20 ? idx : ""}
                </div>
              );
            })}
            {hoverTrack === "blade" && hoverX != null && (
              <div style={{ position: "absolute", left: hoverX, top: 0, width: 1, height: TRACK_H, background: "rgba(255,255,255,0.2)", pointerEvents: "none" }} />
            )}
          </div>

          {/* Fuselage track */}
          <div
            style={{ height: TRACK_H, position: "relative" }}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setHoverX(e.clientX - rect.left + (scrollRef.current?.scrollLeft ?? 0));
              setHoverTrack("fuselage");
            }}
            onMouseLeave={() => { setHoverX(null); setHoverTrack(null); }}
            onClick={(e) => {
              if (!onPlaceEvent) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left + (scrollRef.current?.scrollLeft ?? 0);
              const ms = Math.max(0, x / pixelsPerMs);
              const clickedOnBlock = events.some((ev) => {
                if (!ev.fuselage) return false;
                const bx = ev.startMs * pixelsPerMs;
                const bw = Math.max(4, ev.durationMs * pixelsPerMs);
                return x >= bx && x <= bx + bw;
              });
              if (!clickedOnBlock) {
                e.stopPropagation();
                onPlaceEvent(ms, "fuselage");
              }
            }}
          >
            {events.map((ev, idx) => {
              if (!ev.fuselage) return null;
              const x = ev.startMs * pixelsPerMs;
              const w = Math.max(4, ev.durationMs * pixelsPerMs);
              const hasBoth = !!ev.blade && !!ev.fuselage;
              return (
                <div
                  key={ev.id}
                  style={{
                    position: "absolute",
                    left: x,
                    top: 4,
                    width: w,
                    height: TRACK_H - 8,
                    background: hasBoth
                      ? `linear-gradient(to right, ${BLADE_COLOR} 50%, ${FUSE_COLOR} 50%)`
                      : FUSE_COLOR,
                    borderRadius: 3,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    color: "white",
                    overflow: "hidden",
                    cursor: "pointer",
                  }}
                  title={`Event ${idx}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEventClick?.(ev.id);
                  }}
                >
                  {w > 20 ? idx : ""}
                </div>
              );
            })}
            {hoverTrack === "fuselage" && hoverX != null && (
              <div style={{ position: "absolute", left: hoverX, top: 0, width: 1, height: TRACK_H, background: "rgba(255,255,255,0.2)", pointerEvents: "none" }} />
            )}
          </div>

          {/* Playhead */}
          <div
            style={{
              position: "absolute",
              left: playheadX,
              top: 0,
              width: 1,
              height: CANVAS_H,
              background: "red",
              pointerEvents: "none",
              zIndex: 10,
            }}
          />
        </div>
      </div>
    </div>
  );
}
