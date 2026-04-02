// src/components/TapTempoModal.tsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Song } from "../SongListEditor";

type Phase = "WAITING" | "TAPPING" | "DONE";

function computeBpm(taps: number[]): number | null {
  // Need at least 3 taps — discard first (no interval) and last (trailing gap)
  if (taps.length < 3) return null;
  const usable = taps.slice(1, -1);
  if (usable.length < 2) return null;
  const intervals = usable.slice(1).map((t, i) => t - usable[i]);
  const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  return Math.round(60000 / avg);
}

export default function TapTempoModal({
  song,
  onApply,
  onClose,
}: {
  song: Song;
  onApply: (bpm: number) => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("WAITING");
  const [taps, setTaps] = useState<number[]>([]);
  const [flash, setFlash] = useState(false);
  const gapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bpm = computeBpm(taps);

  // Gap threshold: 3s minimum, or 2× the last interval for slow tempos
  function getGapThreshold(currentTaps: number[]): number {
    if (currentTaps.length < 2) return 3000;
    const lastInterval =
      currentTaps[currentTaps.length - 1] - currentTaps[currentTaps.length - 2];
    return Math.max(3000, lastInterval * 2);
  }

  function clearGapTimer() {
    if (gapTimerRef.current) {
      clearTimeout(gapTimerRef.current);
      gapTimerRef.current = null;
    }
  }

  function scheduleGapTimer(currentTaps: number[]) {
    clearGapTimer();
    const threshold = getGapThreshold(currentTaps);
    gapTimerRef.current = setTimeout(() => {
      setPhase("DONE");
    }, threshold);
  }

  const handleTap = useCallback(() => {
    const now = Date.now();

    setTaps((prev) => {
      const next = [...prev, now];

      if (prev.length === 0) {
        // First tap — move to TAPPING, start gap timer
        setPhase("TAPPING");
      }

      scheduleGapTimer(next);
      return next;
    });

    // Flash effect
    setFlash(true);
    setTimeout(() => setFlash(false), 100);
  }, []);

  // Spacebar listener — scoped to modal lifetime only
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === "Space") {
        e.preventDefault();
        if (phase !== "DONE") handleTap();
      }
      if (e.code === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, handleTap, onClose]);

  // Cleanup gap timer on unmount
  useEffect(() => () => clearGapTimer(), []);

  function handleApply() {
    if (bpm != null) {
      onApply(bpm);
      onClose();
    }
  }

  function handleReset() {
    clearGapTimer();
    setTaps([]);
    setPhase("WAITING");
  }

  // Status line
  function statusText(): string {
    if (phase === "WAITING") return "Click or press spacebar on the beat";
    if (phase === "TAPPING") {
      if (taps.length < 3) return "Keep tapping...";
      return `Tapping... ${bpm ?? "—"} BPM`;
    }
    return `Stopped — ${bpm ?? "—"} BPM detected`;
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>
            Tap Tempo — {song.description || `Song ${song.id}`}
          </h3>
        </div>

        {/* Tap area */}
        <div
          onClick={phase !== "DONE" ? handleTap : undefined}
          style={{
            ...tapAreaStyle,
            background: flash ? "#4f46e5" : "#2b2d31",
            cursor: phase === "DONE" ? "default" : "pointer",
            transition: "background 0.08s ease",
          }}
        >
          <span style={{ fontSize: 14, color: "#888", userSelect: "none" }}>
            {phase === "DONE" ? "—" : "TAP HERE  or  SPACEBAR"}
          </span>
        </div>

        {/* BPM display */}
        <div style={{ textAlign: "center", margin: "16px 0 8px" }}>
          <span style={{ fontSize: 48, fontWeight: 700, letterSpacing: -1 }}>
            {bpm ?? "—"}
          </span>
          <span style={{ fontSize: 16, color: "#888", marginLeft: 8 }}>BPM</span>
        </div>

        {/* Tap count + status */}
        <div style={{ textAlign: "center", color: "#888", fontSize: 13, marginBottom: 16 }}>
          <div>{taps.length} taps</div>
          <div style={{ marginTop: 4 }}>{statusText()}</div>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={handleReset} style={btnStyle}>
            Reset
          </button>
          <button onClick={onClose} style={btnStyle}>
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={bpm == null}
            style={{
              ...btnStyle,
              background: bpm != null ? "#4f46e5" : "#3a3d42",
              color: bpm != null ? "white" : "#666",
              fontWeight: 600,
            }}
          >
            Apply {bpm != null ? `${bpm} BPM` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 2000,
};

const modalStyle: React.CSSProperties = {
  width: 400,
  background: "#202225",
  color: "white",
  border: "1px solid #3a3d42",
  borderRadius: 10,
  padding: 20,
  boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
};

const tapAreaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 120,
  borderRadius: 8,
  border: "2px dashed #3a3d42",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const btnStyle: React.CSSProperties = {
  padding: "7px 14px",
  borderRadius: 6,
  border: "none",
  background: "#2b2d31",
  color: "white",
  cursor: "pointer",
  fontSize: 13,
};
