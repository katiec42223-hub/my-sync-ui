import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

const DRIFT_CHECK_INTERVAL = 2000;
const DRIFT_THRESHOLD_MS = 150;

export function useAudioPlayback(
  soundtrackPath: string | null,
  isPlaying: boolean,
  playheadMs: number
): { audioReady: boolean; audioDuration: number } {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playheadMsRef = useRef<number>(0);
  const [audioReady, setAudioReady] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);
  const driftTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Create audio element once
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;

    audio.addEventListener("loadedmetadata", () => {
      setAudioReady(true);
      setAudioDuration(audio.duration * 1000);
    });

    audio.addEventListener("error", () => {
      setAudioReady(false);
      setAudioDuration(0);
    });

    return () => {
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, []);

  // Load source when path changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!soundtrackPath) {
      audio.src = "";
      setAudioReady(false);
      setAudioDuration(0);
      return;
    }

    setAudioReady(false);
    setAudioDuration(0);
    audio.src = convertFileSrc(soundtrackPath);
    audio.load();
  }, [soundtrackPath]);

  // Keep playheadMs ref current to avoid stale closures
  useEffect(() => {
    playheadMsRef.current = playheadMs;
  }, [playheadMs]);

  // Play/pause sync
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioReady) return;

    if (isPlaying) {
      audio.currentTime = playheadMsRef.current / 1000;
      audio.play().catch(() => {});

      // Start drift correction — uses ref to avoid stale closure
      driftTimerRef.current = setInterval(() => {
        const audioMs = audio.currentTime * 1000;
        if (Math.abs(audioMs - playheadMsRef.current) > DRIFT_THRESHOLD_MS) {
          audio.currentTime = playheadMsRef.current / 1000;
        }
      }, DRIFT_CHECK_INTERVAL);
    } else {
      audio.pause();
      if (driftTimerRef.current) {
        clearInterval(driftTimerRef.current);
        driftTimerRef.current = null;
      }
    }

    return () => {
      if (driftTimerRef.current) {
        clearInterval(driftTimerRef.current);
        driftTimerRef.current = null;
      }
    };
  }, [isPlaying, audioReady]);

  // Seek while paused
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioReady || isPlaying) return;
    audio.currentTime = playheadMs / 1000;
  }, [playheadMs, audioReady, isPlaying]);

  return { audioReady, audioDuration };
}
