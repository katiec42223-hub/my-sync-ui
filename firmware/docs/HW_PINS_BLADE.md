# SYNCHRON — Blade Controller Hardware Reference

---

## 1. Microcontroller
| Component | Part | Notes |
|---|---|---|
| U_PICO | Raspberry Pi Pico (RP2040) | 133MHz, 264KB SRAM, main controller |

---

## 2. External Flash
| Component | Part | Package | Notes |
|---|---|---|---|
| U1 | S25FL256SAGMFIG03 | SOP-16 | 32MB SPI NOR flash, show file storage |

### Flash Pin Routing
| Flash Pin | Signal | Pico GPIO | Notes |
|---|---|---|---|
| SI / IO0 (pin 15) | SPI MOSI | GP7 | |
| SCK (pin 16) | SPI Clock | GP6 | |
| ~CE (pin 7) | Chip Enable | GP9 | |
| ~WP / IO2 (pin 9) | Write Protect | — | 10kΩ pull-up → 3.3V (Pico pin 36) |
| ~HOLD / IO3 (pin 1) | Hold | — | 10kΩ pull-up → 3.3V (Pico pin 36) |
| SO / IO1 (pin 8) | SPI MISO | GP8 | |
| VCC (pin 2) | +3.3V | — | 0.1uF + 1uF decoupling caps to GND |
| GND (pin 10) | GND | — | 5V_GND bus (common ground) |

### Flash Pull-up Resistors
| Resistor | Value | Connected To |
|---|---|---|
| R10 | 10kΩ | Flash pin 1 (~HOLD/IO3) → 3.3V |
| R11 | 10kΩ | Flash pin 3 (~RESET/NC) → 3.3V |
| R5 | 10kΩ | Flash pin 9 (~WP/IO2) → 3.3V |

---

## 3. IR Receiver
| Component | Part | Notes |
|---|---|---|
| U4 | TSSP77038TR | 38kHz IR demodulator, angular index sensor |

> **Physical note:** Mounted on a separate PCB — not populated on the blade PCB itself. The receiver spins with the rotor on the main shaft and sees the always-on fuselage IR LED once per revolution, generating the angular index pulse.

### IR Receiver Pin Routing
| Pin | Signal | Destination |
|---|---|---|
| OUT (pin 3) | IR index pulse | GP14 |
| VS (pin 2) | Power | +5V |
| GND (pin 4) | Ground | 5V_GND bus |

---

## 4. SK9822 LED Output Buffers

> **Why buffers:** SK9822 LEDs require 5V logic levels. The Pico outputs 3.3V. The SN74AHCT125D is a 5V-tolerant quad buffer that level-shifts the PIO output signals to 5V for reliable SK9822 communication.

> **Connector layout rule:** Both J1 and J2 share the same pin layout (pin 1 = GND, pin 6 = 5V) so both blade assemblies are identical and interchangeable.

### IC U2 — SN74AHCT125D → J2 (Blade Top LEDs)
| Pin | Datasheet Name | Connection | Connector Pin | Signal |
|---|---|---|---|---|
| 1 | OE | GND | — | Enable (active low, tied low) |
| 2 | 1A | GP2 | — | Input |
| 3 | 1Y | 33Ω → J2 | J2 pin 2 | Seg1, Top, Data |
| 4 | OE | GND | — | Enable |
| 5 | 2A | GP3 | — | Input |
| 6 | 2Y | 33Ω → J2 | J2 pin 3 | Seg1, Top, Clock |
| 7 | GND | GND | — | — |
| 8 | 3Y | 33Ω → J2 | J2 pin 4 | Seg2, Top, Clock |
| 9 | 3A | GP5 | — | Input |
| 10 | OE | GND | — | Enable |
| 11 | 4Y | 33Ω → J2 | J2 pin 5 | Seg2, Top, Data |
| 12 | 4A | GP4 | — | Input |
| 13 | OE | GND | — | Enable |
| 14 | VCC | +5V | — | 0.1uF decoupling (C2) |

### IC U3 — SN74AHCT125D → J1 (Blade Bottom LEDs)
| Pin | Datasheet Name | Connection | Connector Pin | Signal |
|---|---|---|---|---|
| 1 | OE | GND | — | Enable (active low, tied low) |
| 2 | 1A | GP13 | — | Input |
| 3 | 1Y | 33Ω → J1 | J1 pin 4 | Seg1, Bot, Clock |
| 4 | OE | GND | — | Enable |
| 5 | 2A | GP15 | — | Input |
| 6 | 2Y | 33Ω → J1 | J1 pin 5 | Seg2, Bot, Clock |
| 7 | GND | GND | — | — |
| 8 | 3Y | 33Ω → J1 | J1 pin 2 | Seg1, Bot, Data |
| 9 | 3A | GP12 | — | Input |
| 10 | OE | GND | — | Enable |
| 11 | 4Y | 33Ω → J1 | J1 pin 3 | Seg2, Bot, Data |
| 12 | 4A | GP11 | — | Input |
| 13 | OE | GND | — | Enable |
| 14 | VCC | +5V | — | 0.1uF decoupling (C1) |

---

## 5. LED Output Connectors
| Connector | Part | Destination |
|---|---|---|
| J1 | BM06B-GHS-TBT(LF)(SN) | Blade Bottom LEDs (via U3) |
| J2 | BM06B-GHS-TBT(LF)(SN) | Blade Top LEDs (via U2) |

### J1 — Blade Bottom
| Pin | Signal |
|---|---|
| 1 | GND |
| 2 | Seg1, Bot, Data |
| 3 | Seg2, Bot, Data |
| 4 | Seg1, Bot, Clock |
| 5 | Seg2, Bot, Clock |
| 6 | +5V |

### J2 — Blade Top (identical layout to J1)
| Pin | Signal |
|---|---|
| 1 | GND |
| 2 | Seg1, Top, Data |
| 3 | Seg2, Top, Data |
| 4 | Seg1, Top, Clock |
| 5 | Seg2, Top, Clock |
| 6 | +5V |

---

## 6. XBUS Interface
| Signal | Net Name | Pico GPIO | Notes |
|---|---|---|---|
| XBUS input | XBSIG | GP28 | RC receiver digital protocol — show start trigger + channel monitoring |

### XBUS Connector Pinout
| Pin | Signal |
|---|---|
| 1 | VCC (5V) |
| 2 | GND |
| 3 | GND |
| 4 | XBSIG → GP28 |

---

## 7. Power
| Component | Notes |
|---|---|
| BT1 | 5V battery input |
| D1 | Schottky diode — reverse polarity protection on battery input |
| J4 | 5V+ input connector |
| J5 | 5V- / GND input connector |
| J3, J6, J7, J8 | Single-pin test points / power taps |

### Power Rails
| Rail | Voltage | Source | Supplies |
|---|---|---|---|
| +5V | 5V | Battery via D1 (J4/J5) | U2, U3 buffers, LED strips via J1/J2 |
| +3.3V | 3.3V | Pico onboard regulator (pin 36) | Pico, Flash U1, pull-ups |
| 5V_GND | GND | Common ground | All components |

> **Note:** 5V_GND is a unified ground for both the 5V and 3.3V rails.

---

## 8. Pico GPIO Summary
| GPIO | Direction | Function | Connected To |
|---|---|---|---|
| GP0 | — | Unassigned | — |
| GP1 | — | Unassigned | — |
| GP2 | OUT | PIO — Seg1 Top Data | U2 pin 2 (1A) |
| GP3 | OUT | PIO — Seg1 Top Clock | U2 pin 5 (2A) |
| GP4 | OUT | PIO — Seg2 Top Data | U2 pin 12 (4A) |
| GP5 | OUT | PIO — Seg2 Top Clock | U2 pin 9 (3A) |
| GP6 | OUT | SPI0 SCK | Flash SCK (pin 16) |
| GP7 | OUT | SPI0 TX (MOSI) | Flash SI/IO0 (pin 15) |
| GP8 | IN | SPI0 RX (MISO) | Flash SO/IO1 (pin 8) |
| GP9 | OUT | SPI0 CSn | Flash ~CE (pin 7) |
| GP10 | — | Unassigned | — |
| GP11 | OUT | PIO — Seg2 Bot Data | U3 pin 12 (4A) |
| GP12 | OUT | PIO — Seg1 Bot Data | U3 pin 9 (3A) |
| GP13 | OUT | PIO — Seg1 Bot Clock | U3 pin 2 (1A) |
| GP14 | IN | IR index pulse | TSSP77038 OUT (pin 3) |
| GP15 | OUT | PIO — Seg2 Bot Clock | U3 pin 5 (2A) |
| GP16 | — | Unassigned | — |
| GP17 | — | Unassigned | — |
| GP18 | — | Unassigned | — |
| GP19 | — | Unassigned | — |
| GP20 | — | Unassigned | — |
| GP21 | — | Unassigned | — |
| GP22 | — | Unassigned | — |
| GP26 | — | Unassigned | — |
| GP27 | — | Unassigned | — |
| GP28 | IN | XBUS signal | XBUS receiver XBSIG |

---

## 9. PIO Lane Summary
The SK9822 parallel output uses 4 PIO lanes — 2 per connector (top/bottom), each lane carrying data + clock for one blade segment.

| PIO Lane | Data GPIO | Clock GPIO | Connector | Segment |
|---|---|---|---|---|
| Lane 1 | GP2 | GP3 | J2 | Seg1, Top |
| Lane 2 | GP4 | GP5 | J2 | Seg2, Top |
| Lane 3 | GP12 | GP13 | J1 | Seg1, Bottom |
| Lane 4 | GP11 | GP15 | J1 | Seg2, Bottom |

---

## 10. Architecture Notes
- All buffer OE pins tied to GND (always enabled — outputs always active)
- 33Ω series resistors on all buffer outputs for signal integrity and overshoot damping
- Both LED connectors J1 and J2 share identical pinout (GND pin 1, +5V pin 6) — blade assemblies are interchangeable
- TSSP77038 IR receiver is on a separate small PCB mounted on the main rotor shaft — spins with blades, sees fixed fuselage IR LED once per revolution
- GP0, GP1, GP10, GP16–GP22, GP26, GP27 currently unassigned — available for future use

---
*Last updated: March 2026*
*Verified against: Blades_JLC KiCad schematic + owner routing confirmation*
