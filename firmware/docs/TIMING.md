# Timing & Smear Analysis

## Target Performance
- RPM: 1,950
- Period: 30.77 ms/rev
- Slice: 3° → 0.77 ms window
- SK9822 TX (4 lanes parallel): ~0.06–0.08 ms
- Margin: ~0.7 ms for fetch + render

## Smear Budget
- Target: <1–3° visual smear
- Achievable with 3° slices and <0.08ms LED output

## Live Playback
- LIVE_FRAME buffers 2–3 frames ahead
- Tauri app streams at ~130 Hz (120 slices/rev + margin)
