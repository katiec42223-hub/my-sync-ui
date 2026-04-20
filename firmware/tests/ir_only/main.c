// firmware/tests/ir_only/main.c
//
// Diagnostic: figure out why GP28 won't drive on this board.
//
// The previous PIO build was producing only 0.055V on GP28 — meaning the
// pin is essentially LOW the whole time. This binary walks four phases
// so you can correlate a multimeter (or scope) reading to each one and
// identify exactly which layer is broken:
//
//   PHASE 1 (3s)  — SIO HIGH      → expect ~3.3V on GP28
//   PHASE 2 (3s)  — SIO LOW       → expect  0.0V
//   PHASE 3 (5s)  — SIO 1Hz blink → expect square wave 0V↔3.3V every 0.5s
//   PHASE 4 (∞)   — PIO 38kHz     → expect ~1.65V average / clean square wave
//
// If PHASE 1 fails (still 0V) the pad's output driver is disabled or there
// is a hardware fault — PIO won't help.
// If PHASE 1-3 pass but PHASE 4 fails the issue is in the PIO config.
//
// Also dumps PADS_BANK0[28] before each phase so you can see the OD/IE
// bits the SDK actually programmed.

#include "pico/stdlib.h"
#include "hardware/pio.h"
#include "hardware/clocks.h"
#include "hardware/gpio.h"
#include "hardware/structs/padsbank0.h"
#include "ir38k.pio.h"

#include <stdio.h>
#include <stdint.h>

#define GP_IR_OUT             28
#define IR_FREQ_HZ            38000
#define PIO_CYCLES_PER_PERIOD 50

static void dump_pad(const char *tag) {
    uint32_t pad = padsbank0_hw->io[GP_IR_OUT];
    printf("[%s] PADS_BANK0[%d]=0x%08lx  (OD=%lu IE=%lu DRIVE=%lu PUE=%lu PDE=%lu)\n",
           tag, GP_IR_OUT, (unsigned long)pad,
           (unsigned long)((pad >> 7) & 1),  // OD
           (unsigned long)((pad >> 6) & 1),  // IE
           (unsigned long)((pad >> 4) & 3),  // DRIVE
           (unsigned long)((pad >> 3) & 1),  // PUE
           (unsigned long)((pad >> 2) & 1)); // PDE
}

static void phase_sio_static(bool high) {
    gpio_init(GP_IR_OUT);
    gpio_set_dir(GP_IR_OUT, GPIO_OUT);
    gpio_set_drive_strength(GP_IR_OUT, GPIO_DRIVE_STRENGTH_12MA);
    gpio_put(GP_IR_OUT, high);
}

static void phase_sio_blink_1hz(uint32_t total_ms) {
    gpio_init(GP_IR_OUT);
    gpio_set_dir(GP_IR_OUT, GPIO_OUT);
    gpio_set_drive_strength(GP_IR_OUT, GPIO_DRIVE_STRENGTH_12MA);
    bool level = false;
    uint32_t elapsed = 0;
    while (elapsed < total_ms) {
        level = !level;
        gpio_put(GP_IR_OUT, level);
        sleep_ms(500);
        elapsed += 500;
    }
    gpio_put(GP_IR_OUT, 0);
}

static void phase_pio_38k(void) {
    PIO  pio    = pio0;
    uint offset = pio_add_program(pio, &ir38k_program);
    uint sm     = (uint)pio_claim_unused_sm(pio, true);

    pio_sm_config c = ir38k_program_get_default_config(offset);
    sm_config_set_set_pins(&c, GP_IR_OUT, 1);

    pio_gpio_init(pio, GP_IR_OUT);
    gpio_set_drive_strength(GP_IR_OUT, GPIO_DRIVE_STRENGTH_12MA);
    pio_sm_set_consecutive_pindirs(pio, sm, GP_IR_OUT, 1, true);

    float clkdiv = (float)clock_get_hz(clk_sys)
                 / ((float)IR_FREQ_HZ * (float)PIO_CYCLES_PER_PERIOD);
    sm_config_set_clkdiv(&c, clkdiv);

    pio_sm_init(pio, sm, offset, &c);
    pio_sm_set_enabled(pio, sm, true);

    printf("PIO armed: offset=%u sm=%u clkdiv=%.2f → %u Hz target\n",
           offset, sm, clkdiv, IR_FREQ_HZ);
}

int main(void) {
    stdio_init_all();
    sleep_ms(2000);

    printf("\n=== ir_only_fw diagnostic — GP%d ===\n", GP_IR_OUT);
    dump_pad("boot");

    // ── PHASE 1 ──
    printf("\nPHASE 1: SIO HIGH for 3s — expect GP%d ≈ 3.3V\n", GP_IR_OUT);
    phase_sio_static(true);
    dump_pad("sio-high");
    sleep_ms(3000);

    // ── PHASE 2 ──
    printf("\nPHASE 2: SIO LOW for 3s — expect GP%d ≈ 0.0V\n", GP_IR_OUT);
    phase_sio_static(false);
    dump_pad("sio-low");
    sleep_ms(3000);

    // ── PHASE 3 ──
    printf("\nPHASE 3: SIO 1Hz blink for 5s — expect GP%d toggling\n", GP_IR_OUT);
    phase_sio_blink_1hz(5000);
    dump_pad("sio-blink");

    // ── PHASE 4 ──
    printf("\nPHASE 4: PIO 38kHz forever — expect GP%d square wave\n", GP_IR_OUT);
    phase_pio_38k();
    dump_pad("pio-running");

    uint32_t t = 0;
    while (true) {
        sleep_ms(2000);
        printf("running %lus — PIO 38kHz on GP%d\n",
               (unsigned long)(t += 2), GP_IR_OUT);
    }
}
