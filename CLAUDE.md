# CLAUDE.md — SYNCHRON_UI Project Brief

> This file is the single source of truth for AI-assisted development on this project.
> Read this entire file before writing any code or making any suggestions.
> All Claude sessions (claude.ai and Claude Code) should reference this document first.

---

## 1. Project Identity

**Product Name:** Synchron  
**App Name:** SYNCHRON_UI  
**Repo:** https://github.com/katiec42223-hub/my-sync-ui  
**Active Branch:** feat/songlist-editor  
**Stack:** Tauri v2 + React + TypeScript + Vite  
**Backend:** Rust (Tauri commands)  
**Package Manager:** pnpm  
**File Format:** `.syncproj` (JSON)  

---

## 2. What This App Does

SYNCHRON_UI is a professional desktop/mobile show programming tool for RC helicopter LED performances. It allows a pilot or choreographer to compose synchronized LED light shows that complement a flight routine and its soundtrack.

Think: **DaVinci Resolve meets Ableton Live**, but for programming addressable LED strips on a helicopter. The app manages the full workflow from composition to hardware upload.

**Target platforms:** Windows, macOS, Linux, Android (Tauri v2)  
**Target users:** Eventually a commercial product for the RC helicopter performance community  
**UI aesthetic:** Professional dark tool — Ableton/DaVinci Resolve style. No light theme.

---

## 3. Hardware Architecture

### Controllers (2 per helicopter)
| Controller | Purpose | MCU | LED Type |
|---|---|---|---|
| Fuselage Controller | Body, landing gear, canopy LEDs | RP2040 (Pico), 133MHz, 264KB SRAM | WS2812B |
| Rotor Controller | Rotor disk top + bottom blades | RP2040 (Pico), 133MHz, 264KB SRAM | SK9822 (4 parallel PIO lanes) |

### External Flash
Both controllers use **S25FL256S 32MB SPI flash** for show file storage (not internal flash). Show files are stored in this external flash and played back standalone.

### LED Zones
- Fuselage body
- Landing gear
- Canopy / cockpit
- Rotor disk top
- Rotor disk bottom

### Communication
- **Upload method:** USB Serial (both controllers, potentially simultaneously)
- **During show:** Controllers run fully standalone (no tethering)
- **Sync method:** XBUS — a dedicated sync bus (GP28, 115200 baud inverted) triggers show start across both controllers. The `START` command sends a shared `t0_ms` timestamp; both controllers count from that moment. This is the pre-synced timing mechanism.
- **Audio:** Plays from a separate device — app does not output audio during show

### Firmware Targets (3 total)
| Target | Purpose |
|---|---|
| `blade` | Rotor controller firmware (SK9822, 4 parallel PIO lanes) |
| `fuselage` | Body controller firmware (WS2812 + smoke PWM) |
| `xbus_test` | XBUS inter-controller sync bus test harness |

### Proof-of-Concept Status
Current hardware uses core components suitable for POC. Size/weight optimization for production hardware comes after software is proven.

---

## 4. Data Models

### Song
```typescript
Song {
  id: string
  description: string
  tempo: number // BPM
}
```

### ShowEvent
```typescript
ShowEvent {
  id: string
  songId: string
  durationMs: number
  func: string           // references functions/registry.ts
  payload: FuncParams    // function-specific parameters
  blade: boolean         // applies to rotor
  fuselage: boolean      // applies to fuselage
}
```

### Project File (.syncproj)
```json
{
  "formatVersion": "...",
  "meta": {},
  "layout": {},         // fixtures, channels, alignmentGroups, visualizerConfig
  "songs": [],
  "events": [],
  "soundtrack": {}
}
```

---

## 5. Function / Pattern System

### Overview
Functions are reusable LED animation patterns registered in `functions/registry.ts`. They are the core creative building block of a show.

Each function:
- Has a unique name/id (e.g. `vertical_line_sweep`, `serial_sweep`)
- Provides `buildTimeline()` — returns `{ timeMs, pixelsOn[] }` frames
- Provides `defaultParams` — default parameter values
- Provides `descriptor` — metadata, parameter definitions, geometry dependencies

### Universal Parameters (all functions)
| Parameter | Type | Description |
|---|---|---|
| color | Color picker / palette | Primary color(s) |
| gradient | Gradient editor | Multi-stop color gradient |
| speed | BPM input | Tied to song tempo |
| direction | Enum | e.g. left, right, up, down, clockwise |
| transition | Enum | `smooth` or `beat-jump` |
| duration | Number (beats) | How long this event runs |

### Function-Specific Parameters
Many functions have unique parameters that only apply to them. These must be defined per function in the registry descriptor.

### Geometry Dependency (CRITICAL)
Many functions depend on the **Model Layout** for geometry data:
- e.g. `vertical_line_sweep` needs to know which pixel IDs are vertically aligned
- e.g. `serial_sweep` needs the full pixel chain order
- Functions must declare their geometry dependencies in their descriptor
- The model layout must be built before geometry-dependent functions can be fully configured

**This means: Model Layout is foundational infrastructure, not just a UI feature.**

### INVARIANT — Preview = Export = Firmware
> The same `buildTimeline()` output used for visual preview MUST be the same data used for firmware export.
> There must be NO separate rendering path. One builder, one truth.

---

## 6. Playback Architecture

### Source of Truth
All playback state lives in `App.tsx` — nowhere else.

```typescript
// In App.tsx
playheadMs: number
isPlaying: boolean
handlePlay(): void
handlePause(): void
handleSeek(ms: number): void
```

### Animation Loop
`requestAnimationFrame` in `App.tsx`, passed down as props.

### Playback Pipeline
```
events[]
   ↓
buildFullTimeline(events)     // App.tsx or engine/timeline.ts
   ↓
frame selection (playheadMs)
   ↓
computePixelColorsForAll()    // returns Map<fixtureId, string[]>
   ↓
Visualizer3D (read-only consumer)
Blade Preview (read-only consumer)
```

### INVARIANT — One Playhead
> TopCommandBar, ShowProgrammer, TimelineEditor, and Visualizer3D all consume
> the same playheadMs from App.tsx. No component owns its own playback state.

---

## 7. UI Layout & Views

```
┌─────────────────────────────────────┐
│         TopCommandBar               │  ← Fixed, always visible
├─────────────────────────────────────┤
│                                     │
│         Main View                   │
│   view = "main" | "model-editor"   │
│                                     │
│   "main":                           │
│     ├── ShowProgrammer              │
│     ├── TimelineEditor              │
│     └── Visualizer3D               │
│                                     │
│   "model-editor":                   │
│     └── ModelLayoutEditor          │
│                                     │
└─────────────────────────────────────┘
```

### TopCommandBar Responsibilities
- File load / save
- Project metadata display
- Transport controls (play / pause / rewind / forward) → dispatches to App.tsx state
- USB / device commands
- Open Model Editor
- **RULE: TopCommandBar is UI-only. It dispatches. It does not own state.**

---

## 8. Component Responsibilities

| Component | Responsibility | Owns State? |
|---|---|---|
| `App.tsx` | Project load/save, playback state, view routing | YES — playback, project, view |
| `TopCommandBar` | Global controls UI | NO — dispatches only |
| `ShowProgrammer` | Event list, function assignment, device panel | NO — reads from App |
| `ShowEventsEditor` | Per-event parameter editing | NO |
| `TimelineEditor` | Visual timeline, beat-snapping, drag/drop | NO — reads playhead from App |
| `ModelLayoutEditor` | Fixture/geometry definition | YES — layout data only |
| `Visualizer3D` | Real-time 3D preview | NO — read-only consumer |
| `BladePreview` | 2D rotor blade preview | NO — read-only consumer |
| `functions/registry.ts` | Pattern function definitions | NO — pure functions |

---

## 9. Timeline Editor Behavior

- **Default snap:** Beat and sub-beat intervals (quarter, eighth, sixteenth notes based on song BPM)
- **Override:** Hold `Shift` to drag to custom (non-beat-aligned) time position
- **Input method:** Both timeline drag AND parameter-based input (e.g. "start at beat 4, duration 8 eighth notes")
- **Visual style:** DaVinci Resolve / Ableton style dark timeline

---

## 10. Model Layout Editor

Defines the geometric and electrical layout of the helicopter's LEDs.

Outputs:
```typescript
fixtures[]          // individual LED strips/zones
channels[]          // electrical channels
alignmentGroups[]   // geometry groups (e.g. "vertically aligned pixels")
visualizerConfig    // 3D preview positioning
```

**This data is prerequisite for:**
- Geometry-dependent pattern functions
- Visualizer3D rendering
- Firmware export (pixel addressing)

---

## 11. USB / Device Protocol

**Status: WORKING — do not rewrite this layer.**

The protocol is fully implemented and tested in `src-tauri/src/protocol.rs` and `src-tauri/src/main.rs`.

### Frame Format
```
[0xAA 0x55 VERSION CMD LEN_HI LEN_LO PAYLOAD CRC_HI CRC_LO]
CRC: CRC-16/CCITT (poly 0x1021, init 0xFFFF)
```

### Commands (all working)
| Command | Code | Description |
|---|---|---|
| HELLO | 0x01 | Handshake → `{target, fw, proto}` |
| ERASE | 0x10 | Erase flash region |
| WRITE | 0x11 | Write chunk `[offset:u32, data...]` |
| VERIFY | 0x12 | Verify → `[crc16:u16]` |
| SET_META | 0x13 | Set show metadata |
| START | 0x14 | Start show `[t0_ms:u32]` — syncs both controllers |
| LIVE_FRAME | 0x21 | Future: live streaming mode |

### Tauri Commands (all implemented)
```rust
send_hello()
send_erase()
send_write()
send_verify()
send_start()
list_ports()
connect(port, baud)
disconnect()
get_connection_status()
write_show_to_controllers(target)  // stubbed, needs Builder integration
```

**Supports:** Two controllers simultaneously, separate port selection per controller  
**Auto-retry:** Connect does 4 HELLO attempts with backoff for Pico USB CDC settle time

---

## 12. Build Order (Structured Transplant Strategy)

This project is being rebuilt clean in dependency order. Do NOT skip layers.

```
Layer 1 — Data Models
  Song, ShowEvent, .syncproj format, file I/O

Layer 2 — Model Layout & Geometry
  fixtures, alignmentGroups, pixel geometry, visualizerConfig

Layer 3 — Function / Pattern Registry
  Built on Layer 2 geometry from day one
  functions/registry.ts, buildTimeline(), descriptors

Layer 4 — Timeline Engine
  buildFullTimeline(events)
  eventStartMs[] calculation
  Single source of truth for time

Layer 5 — Playback State
  App.tsx owns: playheadMs, isPlaying, handlePlay/Pause/Seek
  requestAnimationFrame loop
  computePixelColorsForAll()

Layer 6 — Visualizer (Read-Only Consumers)
  Visualizer3D
  BladePreview
  Fed exclusively by Layer 4+5 output

Layer 7 — UI Shell
  TopCommandBar (dispatch only)
  ShowProgrammer
  ShowEventsEditor
  All wired to App.tsx state

Layer 8 — USB / Device Layer
  Clean Rust protocol
  Firmware export format (blade, fuselage, alignment, timing)
  Builder.ts

Layer 9 — Timeline Editor UI
  Beat-snapped drag/drop
  Shift-override for custom timing
  Parameter-based input mode
```

---

## 13. Design Invariants (Never Violate These)

1. **One source of truth for time** — `playheadMs` lives only in `App.tsx`
2. **One timeline builder** — `buildTimeline()` used for preview AND export AND firmware
3. **Preview = Export = Firmware** — no diverging render paths
4. **No duplicated logic** — if two components need the same calculation, it's a shared utility
5. **Deterministic playback** — same inputs always produce same outputs
6. **No hidden state** — no component secretly owns time or playback
7. **Visualizer is read-only** — it never modifies show data
8. **Geometry before patterns** — no pattern function should be wired to hardcoded pixel IDs

---

## 14. Known Issues in Current Codebase (Structured Transplant Targets)

- `App.tsx` has playback state partially in the right place but `ShowProgrammer` still has its own local playback loop — needs full unification
- `TimelineEditor.tsx` exists but is a stub — no real implementation yet
- `Builder.ts` has the binary format header correct but is not connected to the function timeline system
- Pattern functions (`verticalSweep`, etc.) are not yet connected to model layout geometry — they take `fixtureIds` but don't use `alignmentGroups`
- `ShowProgrammer` still has legacy `func/payload` fields alongside new `blade/fuselage` structured fields — dual-path needs resolving
- `write_show_to_controllers` Tauri command is stubbed — needs `Builder.ts` integration
- Two backup/safe copies of ShowProgrammer in the repo (`_backup`, `SAFE_`) — indicates instability in that component

---

## 15. Files to Preserve / Reference from Old Codebase

When transplanting, these are CONFIRMED WORKING and should be carried forward directly:

| File | Status | Notes |
|---|---|---|
| `src-tauri/src/protocol.rs` | ✅ Working | Full protocol impl, CRC-16, typed responses |
| `src-tauri/src/main.rs` | ✅ Working | All Tauri commands implemented |
| `src/functions/registry.ts` | ✅ Good architecture | 3 functions: verticalSweep, bladeLine, serialSnake |
| `src/functions/verticalSweep.ts` | ✅ Keep | Reference for buildTimeline() contract |
| `src/functions/bladeLine.ts` | ✅ Keep | Good example of blade-specific function |
| `src/functions/serialSnake.ts` | ✅ Keep | Good example of fixture-traversal function |
| `src/lib/Builder.ts` | 🔶 Started | Binary SYNC format correct, needs completion |
| `src/components/Visualizer3D/*` | 🔶 Partial | 3D heli OBJ model loaded, needs cleanup |
| `src/components/ModelLayoutEditor/*` | 🔶 Partial | Good data structure, UI needs work |
| `firmware/common/` | ✅ Working | proto.c, crc16, sk9822, flash_if, scheduler |
| `firmware/blade/` | ✅ Working | Blade firmware, PIO SK9822 driver |
| `firmware/fuselage/` | ✅ Working | Fuselage firmware, WS2812 driver |
| `public/*.obj / *.mtl` | ✅ Keep | Helicopter 3D model for visualizer |
| `firmware/docs/` | ✅ Reference | PROTOCOL.md, SHOWFILE.md, TIMING.md, HW_PINS.md |

Files to archive/ignore:
- `src/components/ShowProgrammer_backup.tsx` — stale backup
- `src/components/SAFE_ShowProgrammer.tsx` — stale backup
- `firmware/build_win/` and `firmware/build_xbus/` — build artifacts, not source

---

## 16. Blade Firmware — Critical Architecture Constraint

### Two Independent Time Domains (NEVER mix these)

The blade firmware must maintain two completely decoupled timing domains running simultaneously:

**Domain 1 — Angular / POV Rendering (continuously corrected by IR index)**
- Controls *when* pixels fire within each revolution to produce a stable image
- RPM fluctuates constantly during flight (range: ~1,800–2,400 RPM)
- The IR index pulse (TSSP77038 seeing the fuselage IR LED once per revolution) is the correction reference
- If index arrives early → rotor is spinning faster → compress pixel firing schedule for this revolution
- If index arrives late → rotor is spinning slower → stretch pixel firing schedule for this revolution
- This correction fires every revolution (~40x/second at 2,400 RPM)
- **Scope:** angular pixel rendering pipeline ONLY

**Domain 2 — Show Sequence Clock (never touched by RPM correction)**
- Wall-clock milliseconds counted from t0 (show start trigger)
- Controls which effect is active, when transitions happen, what beat the music is on
- A transition at 00:32.000 happens at 00:32.000 regardless of rotor RPM
- **INVARIANT: RPM correction in Domain 1 must never affect Domain 2 timing**

### Why This Matters
RPM fluctuates significantly during flight maneuvers. Without this decoupling, an RPM correction could cause show effect transitions to shift in time — making the LED show drift out of sync with the music. The angular image orientation self-corrects every revolution. The show clock does not need correction (drift over 5 minutes is within perceptible threshold without any correction mechanism).

### Firmware Phase Plan (safe, incremental)
```
Phase A  USB CDC serial protocol test
         → Isolate as standalone target in firmware/tests/serial_test/
         → NEVER overwrite once proven working

Phase B  XBUS RC channel reading
         → Detect show start trigger (RC channel value change)
         → Isolate as standalone target in firmware/tests/xbus_test/
         → Already exists as build target

Phase C  IR index pulse reception
         → Confirm TSSP77038 pulse timing and reliability
         → Measure actual dwell time through mechanical aperture
         → Standalone test before integrating into show firmware

Phase D  Full show firmware integration
         → Domain 1: angular renderer with IR index correction
         → Domain 2: show sequence clock, decoupled from Domain 1
         → RC start trigger → t0 → both domains begin
```

### No Fuselage-to-Blade Sync Mechanism (by design)
Crystal drift between the two Pico boards over a 5-minute show is ≤18ms worst case (±60ppm combined). This is within the ~25ms audiovisual perception threshold. No active sync correction is implemented. The IR LED remains always-on for reliable angular indexing — it is not used for data encoding.

---

## 17. Future Work (Post-POC)

- Live streaming mode (`LIVE_FRAME` command)
- Wireless connection (Bluetooth / WiFi) — USB serial only for now
- Hardware size/weight optimization
- Multi-helicopter show coordination
- Android app (Tauri v2 supports this — architecture decisions should not block it)

---

*Last updated: March 2026 — Initial structured transplant brief*
*Generated in collaboration with Claude (claude.ai) during project initialization session*
