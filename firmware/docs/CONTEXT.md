# SYNCHRON Firmware Design Seeds

Quick context for GitHub Copilot and future devs.

## Role
Dual RP2040 controllers (blade rotor + fuselage body) for LED poi synchronization.

## Hardware
- MCU: RP2040 (Pico), 133 MHz, 264 KB SRAM
- Flash: S25FL256S 32MB external (SPI0: GP6-9)
- Blade LEDs: SK9822, 4 parallel lanes via PIO (2×36px per blade)
- Index: TSSP770 IR (GP14), XBUS start cue (GP28, 115200 baud inverted)
- Fuselage: WS2812 strips + smoke PWM

## Protocol
USB CDC framed commands: HELLO, ERASE, WRITE, VERIFY, SET_META, START, LIVE_FRAME

## Timing
- Target: 1,950 RPM → 30.77ms/rev
- Slice: 3° (120/rev) → 0.77ms window, ~0.7ms margin after LED TX
- Smear budget: <1–3°
