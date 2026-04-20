// firmware/tests/fuselage_hw_test/main.c
// SYNCHRON — standalone fuselage hardware test.
//
// Headless: no USB, no printf. Boots from BEC and immediately:
//   1. Drives 38kHz IR LED on GP28 via PIO (hardware PWM unreliable on
//      ADC pins — PIO bypasses that).
//   2. Drives a rainbow wave on all 4 WS2812B zones (GP2-GP5) using
//      the production ws2812_driver from fuselage/src/.
//
// Hardware (HW_PINS_FUSELAGE.md):
//   GP2 → CH2  (J1 pin 13)
//   GP3 → CH1  (J1 pin 10)
//   GP4 → CH3  (J1 pin 16)
//   GP5 → CH4  (J1 pin 19)
//   GP28 → 38kHz IR LED via MOSFET

#include "pico/stdlib.h"
#include "hardware/pwm.h"
#include "hardware/clocks.h"
#include "hardware/pio.h"
#include "hardware/gpio.h"
#include "app/ws2812_driver.h"
#include <stdint.h>
#include <string.h>

#define NUM_ZONES     4
#define ZONE_PIXELS   60
#define BRIGHTNESS    5    // out of 31 — project brightness cap

#define GP_IR_OUT             28
#define IR_FREQ_HZ            38000
#define PIO_CYCLES_PER_PERIOD 50    // 2 instructions × (1 + [24]) cycles

static const uint8_t zone_gpio[NUM_ZONES] = {2, 3, 4, 5};

// ─── IR LED via PIO ──────────────────────────────────────────────────────────
//
// 2-instruction wrap loop, hand-encoded:
//   SET PINS, 1 [24]  → opcode 111, delay 11000, dst 000, data 00001 = 0xF801
//   SET PINS, 0 [24]  → opcode 111, delay 11000, dst 000, data 00000 = 0xF800
// One full square-wave period = 50 SM cycles → clkdiv = sys_clk / (38k×50).

static const uint16_t ir38k_insn[] = {
    0xf801,
    0xf800,
};

static const struct pio_program ir38k_prog = {
    .instructions = ir38k_insn,
    .length       = 2,
    .origin       = -1,
};

static void ir_pio_init(void) {
    PIO  pio    = pio0;
    uint offset = pio_add_program(pio, &ir38k_prog);
    uint sm     = (uint)pio_claim_unused_sm(pio, true);

    pio_sm_config c = pio_get_default_sm_config();
    sm_config_set_set_pins(&c, GP_IR_OUT, 1);
    sm_config_set_wrap(&c, offset, offset + 1);

    float clkdiv = (float)clock_get_hz(clk_sys)
                 / ((float)IR_FREQ_HZ * (float)PIO_CYCLES_PER_PERIOD);
    sm_config_set_clkdiv(&c, clkdiv);

    // pio_gpio_init re-enables the pad output driver — required on the
    // ADC-capable pins (GP26-29). Crank drive strength so the MOSFET
    // gate sees clean edges.
    pio_gpio_init(pio, GP_IR_OUT);
    gpio_set_drive_strength(GP_IR_OUT, GPIO_DRIVE_STRENGTH_12MA);
    pio_sm_set_consecutive_pindirs(pio, sm, GP_IR_OUT, 1, true);

    pio_sm_init(pio, sm, offset, &c);
    pio_sm_set_enabled(pio, sm, true);
}

// ─── HSV (S=V=255) → RGB, integer math ───────────────────────────────────────

static void hue_to_rgb(uint8_t hue, uint8_t *r, uint8_t *g, uint8_t *b) {
    uint8_t reg = hue / 43;
    uint8_t rem = (uint8_t)((hue - (uint8_t)(reg * 43)) * 6);
    switch (reg) {
        case 0:  *r=255;     *g=rem;     *b=0;       break;
        case 1:  *r=255-rem; *g=255;     *b=0;       break;
        case 2:  *r=0;       *g=255;     *b=rem;     break;
        case 3:  *r=0;       *g=255-rem; *b=255;     break;
        case 4:  *r=rem;     *g=0;       *b=255;     break;
        default: *r=255;     *g=0;       *b=255-rem; break;
    }
}

// ─── Main ────────────────────────────────────────────────────────────────────

int main(void) {
    // IR LED via PIO on GP28 (replaces the broken hardware-PWM path)
    ir_pio_init();

    // WS2812B zones via the production driver (GP2-GP5)
    ws2812_init_all();

    sleep_ms(100);

    // GRB buffer — ws2812_send expects packed [G,R,B,G,R,B,...]
    static uint8_t grb[ZONE_PIXELS * 3];
    uint8_t phase = 0;

    while (true) {
        // Build one rainbow frame, shared across all zones
        for (int i = 0; i < ZONE_PIXELS; i++) {
            uint8_t hue = (uint8_t)(((uint32_t)i * 256 / ZONE_PIXELS) + phase);
            uint8_t r, g, b;
            hue_to_rgb(hue, &r, &g, &b);
            // Brightness scaling: BRIGHTNESS / 31
            uint8_t rs = (uint8_t)((uint32_t)r * BRIGHTNESS / 31);
            uint8_t gs = (uint8_t)((uint32_t)g * BRIGHTNESS / 31);
            uint8_t bs = (uint8_t)((uint32_t)b * BRIGHTNESS / 31);
            grb[i * 3 + 0] = gs;  // G
            grb[i * 3 + 1] = rs;  // R
            grb[i * 3 + 2] = bs;  // B
        }

        // Push to all 4 zones (driver handles its own latch internally,
        // but a small inter-zone gap doesn't hurt either)
        for (int z = 0; z < NUM_ZONES; z++) {
            ws2812_send(zone_gpio[z], grb, ZONE_PIXELS);
            sleep_us(60);
        }

        phase += 2;
        sleep_ms(20);
    }
}
