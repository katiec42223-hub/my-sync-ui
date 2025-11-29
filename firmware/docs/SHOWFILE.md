# .blade / .fuse File Format

Stored in external S25FL256S flash.

## Header (4KB aligned)
```c
magic[4]         // "SYNC"
format_version   // u8
role             // u8: 1=blade, 2=fuse
pixel_cfg        // u16: e.g. 2×36
duration_ms      // u32
time_index_off   // u32
angle_table_off  // u32 (blade only)
payload_off      // u32
payload_len      // u32
crc32            // u32
reserved[...]    // pad to 4096

```bash
cat > docs/TIMING.md << 'EOF'
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
