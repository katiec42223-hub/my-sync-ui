# SYNCHRON — Fuselage Controller Hardware Reference

---

## 1. Microcontroller
| Component | Part | Notes |
|---|---|---|
| U_PICO | Raspberry Pi Pico (RP2040) | 133MHz, 264KB SRAM, main controller |

> **PCB note:** J1 is a 21-pin connector (Conn_01x21) — castellated pad breakout for SMD Pico mounting, not a user-facing connector. All signals route through J1 pins.

---

## 2. External Flash
| Component | Part | Package | Notes |
|---|---|---|---|
| U1 | S25FL256SAGMFIG03 | SOP-16 | 32MB SPI NOR flash, show file storage — identical to blade controller |

### Flash Pin Routing
| Flash Pin | Signal | Pico GPIO | Notes |
|---|---|---|---|
| SI / IO0 (pin 15) | SPI MOSI | GP7 | |
| SCK (pin 16) | SPI Clock | GP6 | |
| ~CE (pin 7) | Chip Enable | GP9 | |
| ~WP / IO2 (pin 9) | Write Protect | — | R5 10kΩ pull-up → 3.3V |
| ~HOLD / IO3 (pin 1) | Hold | — | R10 10kΩ pull-up → 3.3V |
| SO / IO1 (pin 8) | SPI MISO | GP8 | |
| ~RESET / NC (pin 3) | Reset | — | R11 10kΩ pull-up → 3.3V |
| VCC (pin 2) | +3.3V | — | C3 0.1uF + C4 1uF decoupling |
| GND (pin 10) | GND | — | 5V_GND bus |

---

## 3. WS2812B LED Zone Outputs

Single buffer IC U2 (SN74AHCT125D), 4 gates used for LED zones, each with 33Ω series resistor.

### IC U2 — SN74AHCT125D → LED Zones via J1
| Pin | Datasheet Name | Connection | J1 Pin | Signal |
|---|---|---|---|---|
| 1 | OE | GND | — | Enable (tied low) |
| 2 | 1A | GP2 | — | Input |
| 3 | 1Y | 33Ω → J1 | J1 pin 13 | CH2 out |
| 4 | OE | GND | — | Enable |
| 5 | 2A | GP3 | — | Input |
| 6 | 2Y | 33Ω → J1 | J1 pin 10 | CH1 out |
| 7 | GND | GND | — | — |
| 8 | 3Y | 33Ω → J1 | J1 pin 19 | CH4 out |
| 9 | 3A | GP5 | — | Input |
| 10 | OE | GND | — | Enable |
| 11 | 4Y | 33Ω → J1 | J1 pin 16 | CH3 out |
| 12 | 4A | GP4 | — | Input |
| 13 | OE | GND | — | Enable |
| 14 | VCC | +5V | — | 0.1uF decoupling (C2) |
| 7 | GND | GND | — | — |

### GPIO to Channel Mapping
| Pico GPIO | Buffer Gate | Channel | J1 Pin |
|---|---|---|---|
| GP2 | U2A (1→3) | CH2 | J1 pin 13 |
| GP3 | U2B (5→6) | CH1 | J1 pin 10 |
| GP4 | U2D (12→11) | CH3 | J1 pin 16 |
| GP5 | U2C (9→8) | CH4 | J1 pin 19 |

> **Zone assignment** (body / landing gear / canopy / tail etc.) is defined in `.syncmodel` — not hardcoded in firmware. Same firmware binary works for any zone configuration.

---

## 4. J1 Connector — Full Pin Map (Conn_01x21)
| J1 Pin | Function | GPIO | Notes |
|---|---|---|---|
| 1 | RC Input | GP15 | PWM input from flight controller |
| 2 | N/C | — | — |
| 3 | GND | — | 5V_GND |
| 4 | Smoke Output | GP14 | PWM servo output |
| 5 | GND | — | 5V_GND |
| 6 | +5V | — | Power |
| 7 | IR LED Out | GP28 | 38kHz IR output → MOSFET driver |
| 8 | GND | — | 5V_GND |
| 9 | +5V | — | Power |
| 10 | CH1 out | GP3 via U2B | WS2812B Zone 1 data |
| 11 | GND | — | 5V_GND |
| 12 | +5V | — | Power |
| 13 | CH2 out | GP2 via U2A | WS2812B Zone 2 data |
| 14 | GND | — | 5V_GND |
| 15 | +5V | — | Power |
| 16 | CH3 out | GP4 via U2D | WS2812B Zone 3 data |
| 17 | GND | — | 5V_GND |
| 18 | +5V | — | Power |
| 19 | CH4 out | GP5 via U2C | WS2812B Zone 4 data |
| 20 | GND | — | 5V_GND |
| 21 | +5V | — | Power |

> **Pattern:** Each data channel is sandwiched between GND and +5V pins — clean 3-wire WS2812B connection at every zone output.

---

## 5. RC Input (Show Start Trigger)
| Signal | Net Label | Pico GPIO | J1 Pin |
|---|---|---|---|
| RC PWM input | `INPUT` / `PWM IN` | GP15 | J1 pin 1 |

> **Current protocol:** Standard RC PWM (50Hz, 1000–2000µs)
> **Future protocols:** XBUS, SBUS, others — same GPIO, firmware variant selected in UI during model setup
> **Show start:** Configured RC channel crosses configured threshold → triggers t0 on both controllers simultaneously

---

## 6. PWM Servo Output (Smoke Pump / Accessories)
| Signal | Net Label | Pico GPIO | J1 Pin |
|---|---|---|---|
| PWM servo output | `smoke` / `SMOKE OUT` | GP14 | J1 pin 4 |

> **Signal:** Configurable RC servo PWM — frequency and pulse width range set in model config
> **Default:** 50Hz, 1000–2000µs
> **Primary use:** Smoke pump control
> **Other uses:** Confetti drop, any RC-controlled accessory

### Smoke Pump Delay Compensation
- `delayCompensationMs` stored in `.syncmodel`
- User places smoke events at visually desired time in timeline
- At export: Builder shifts servo commands earlier by `delayCompensationMs`
- Timeline always shows intended visible time — compensation invisible to user
- Dedicated setup page in UI to measure and configure delay per model

---

## 7. IR LED Output (38kHz Angular Index)
| Signal | Net Label | Pico GPIO | J1 Pin |
|---|---|---|---|
| 38kHz IR output | `ir` / `IR OUT` | GP28 | J1 pin 7 |

> **CRITICAL — Always-on during show.** Must never be gated off during show playback. Blade controller depends on this signal for continuous angular orientation correction every revolution.
> **Mounting:** Tail boom, aimed upward toward main rotor shaft where IR receiver is mounted.

### IR LED Driver Circuit (MOSFET — separate small PCB, fiber laser)
Direct GPIO drive is insufficient — TSAL6400 requires ~90mA, Pico GPIO max is ~12mA.

| Component | Value | Notes |
|---|---|---|
| IR LED | TSAL6400 | 940nm, 5mm, Vf ~1.35V, If max 100mA |
| MOSFET | AO3400A | N-channel, SOT-23, 30V/5.7A, logic-level 3.3V gate drive |
| Gate resistor | 100Ω | Rgate — limits gate current, dampens oscillation |
| Current limiting resistor | 39Ω | R = (5V − 1.35V) / 0.093A ≈ 39Ω → ~93mA peak |
| PCB | Single layer copper clad | Fabricated on fiber laser |

**Circuit:**
```
GP28 (3.3V) ──[100Ω]──→ AO3400A Gate
                         AO3400A Drain ──[39Ω]──→ TSAL6400 Anode
                                                   TSAL6400 Cathode → GND
                         AO3400A Source → GND
+5V ────────────────────────────────────────────── TSAL6400 Anode (via 39Ω)
```

> At 38kHz 50% duty cycle: peak ~93mA, average ~46mA. Well within TSAL6400 and AO3400A ratings. Strong IR output for reliable detection across tail boom to rotor shaft distance.

---

## 8. Power
| Component | Notes |
|---|---|
| BT1 | 5V battery input |
| D1 | Schottky diode — reverse polarity protection on battery input |
| J4 | 5V+ input connector |
| J5 | 5V- / GND input connector |

### Power Rails
| Rail | Voltage | Source | Supplies |
|---|---|---|---|
| +5V | 5V | Battery via D1 | U2 buffer, WS2812B zones via J1 |
| +3.3V | 3.3V | Pico onboard regulator (pin 36) | Pico, Flash U1, pull-ups |
| 5V_GND | GND | Common ground | All |

### Decoupling Capacitors
| Cap | Value | Location |
|---|---|---|
| C1 | 22uF | Main 5V bulk |
| C2 | 0.1uF | U2 VCC (pin 14) |
| C3 | 0.1uF | Flash VCC |
| C4 | 1uF | Flash VCC |
| C6 | 22uF | Secondary bulk |

---

## 9. Pico GPIO Summary
| GPIO | Direction | Function | Connected To |
|---|---|---|---|
| GP0 | — | Unassigned | — |
| GP1 | — | Unassigned | — |
| GP2 | OUT | WS2812B CH2 | U2A pin 2 (1A) → J1 pin 13 |
| GP3 | OUT | WS2812B CH1 | U2B pin 5 (2A) → J1 pin 10 |
| GP4 | OUT | WS2812B CH3 | U2D pin 12 (4A) → J1 pin 16 |
| GP5 | OUT | WS2812B CH4 | U2C pin 9 (3A) → J1 pin 19 |
| GP6 | OUT | SPI0 SCK | Flash SCK (pin 16) |
| GP7 | OUT | SPI0 TX (MOSI) | Flash SI/IO0 (pin 15) |
| GP8 | IN | SPI0 RX (MISO) | Flash SO/IO1 (pin 8) |
| GP9 | OUT | SPI0 CSn | Flash ~CE (pin 7) |
| GP10 | — | Unassigned | — |
| GP11 | — | Unassigned | — |
| GP12 | — | Unassigned | — |
| GP13 | — | Unassigned | — |
| GP14 | OUT | PWM servo output | Smoke pump / accessory → J1 pin 4 |
| GP15 | IN | RC PWM input | Flight controller PWM → J1 pin 1 |
| GP16 | — | Unassigned | — |
| GP17 | — | Unassigned | — |
| GP18 | — | Unassigned | — |
| GP19 | — | Unassigned | — |
| GP20 | — | Unassigned | — |
| GP21 | — | Unassigned | — |
| GP22 | — | Unassigned | — |
| GP26 | — | Unassigned | — |
| GP27 | — | Unassigned | — |
| GP28 | OUT | 38kHz IR LED | MOSFET driver → TSAL6400 → J1 pin 7 |

---

## 10. Architecture Notes
- Only one SN74AHCT125D buffer IC (U2) — 4 gates for LED zones, 2 gates unused (U2E, U2F available)
- RC input (GP15) goes directly to Pico — no buffer needed for an input signal
- Smoke output (GP14) and IR output (GP28) go directly to J1 — confirm if buffered or direct in KiCad
- IR LED requires external MOSFET driver PCB — 12mA GPIO vs 93mA required
- GP0, GP1, GP10–GP13, GP16–GP22, GP26–GP27 unassigned — significant headroom for future features
- Zone-to-GPIO mapping stored in `.syncmodel` — same firmware binary for any zone assignment
- Flash SPI pinout GP6–GP9 identical to blade controller — simplifies firmware sharing

---

## 11. IR Driver PCB — Build TODO
- [ ] Design single-layer layout for fiber laser
- [ ] Components: TSAL6400, AO3400A (SOT-23), 100Ω gate resistor, 39Ω current resistor
- [ ] Input pad: 3.3V signal from J1 pin 7 (GP28)
- [ ] Output: TSAL6400 at ~93mA peak, 38kHz
- [ ] Mounting provision: tail boom, aimed upward toward rotor shaft
- [ ] Add decoupling cap (100nF) on MOSFET drain side

---
*Last updated: March 2026*
*Verified against: Fuselage_JLC KiCad schematic + owner routing confirmation*
*GP14/GP28 direct vs buffered routing to be confirmed from KiCad netlist*
