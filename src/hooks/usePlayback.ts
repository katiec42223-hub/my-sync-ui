import { useRef, useState, useEffect } from "react";

/**
 * Owns the requestAnimationFrame playback loop.
 * When isPlaying is true, increments playheadMs each frame.
 * When false, cancels the RAF and freezes.
 * Exposes setPlayheadMs so callers can seek.
 */
export function usePlayback(isPlaying: boolean): {
  playheadMs: number;
  setPlayheadMs: React.Dispatch<React.SetStateAction<number>>;
} {
  const [playheadMs, setPlayheadMs] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = null;
      return;
    }

    function tick(ts: number) {
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dt = ts - lastTsRef.current;
      lastTsRef.current = ts;
      setPlayheadMs((p) => p + dt);
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = null;
    };
  }, [isPlaying]);

  return { playheadMs, setPlayheadMs };
}
