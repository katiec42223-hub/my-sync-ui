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
| Fuselage Controller | Body, landing gear, canopy LEDs | Raspberry Pi Pico | WS2812B |
| Rotor Controller | Rotor disk top + bottom blades | Raspberry Pi Pico | SK9822 |

### LED Zones
- Fuselage body
- Landing gear
- Canopy / cockpit
- Rotor disk top
- Rotor disk bottom

### Communication
- **Upload method:** USB Serial (both controllers, potentially simultaneously)
- **During show:** Controllers run fully standalone (no tethering)
- **Sync method:** Pre-synced timing baked into the show file at upload time
- **Audio:** Plays from a separate device — app does not output audio during show

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

Tauri commands (Rust backend):
```
send_hello()     // handshake
send_erase()     // erase controller flash
send_write()     // write show data chunks
send_verify()    // verify written data
send_start()     // begin show playback
```

Future expanded protocol:
```
write_show_to_controllers()
erase()
write_chunk()
verify()
start()
live_frame()     // future: live streaming mode
```

**Supports:** Two controllers simultaneously over USB Serial  
**Current state:** Stubbed, used for protocol testing only

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

## 14. Known Issues in Previous Codebase (Do Not Repeat)

- Playback state split across `ShowProgrammer.tsx`, `TopCommandBar.tsx`, `App.tsx`
- `previewEvent` hardcoded to first event instead of playhead-driven
- No `buildFullTimeline()` — only per-event timeline building
- Transport controls in TopCommandBar not connected to playback loop
- Pattern functions not fully connected to model layout geometry
- No `Builder.ts` for firmware export

---

## 15. Files to Preserve / Reference from Old Codebase

When transplanting, reference these for logic — do not blindly copy:

| Old File | What to Preserve |
|---|---|
| `functions/registry.ts` | Pattern architecture, `buildTimeline()` contract |
| `components/Visualizer3D/*` | 3D rendering approach |
| `components/ModelLayoutEditor/*` | Layout data structure |
| `src-tauri/` | Rust USB serial commands |
| `firmware/` | Firmware logic and protocol |
| `.syncproj` format | JSON structure (already well defined) |

---

## 16. Future Work (Post-POC)

- Live streaming mode (`LIVE_FRAME` command)
- Wireless connection (Bluetooth / WiFi) — USB serial only for now
- Hardware size/weight optimization
- Multi-helicopter show coordination
- Android app (Tauri v2 supports this — architecture decisions should not block it)

---

*Last updated: March 2026 — Initial structured transplant brief*
*Generated in collaboration with Claude (claude.ai) during project initialization session*
