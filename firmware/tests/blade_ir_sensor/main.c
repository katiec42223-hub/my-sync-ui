// firmware/tests/blade_ir_sensor/main.c
// SYNCHRON — Blade IR sensor diagnostic.
//
// Reads the TSSP77038 IR demodulator output on GP14 and reports
// pulse statistics over USB serial every second. Sensor-only:
// no IR LED output, no XBUS, no LED drive.
//
// TSSP77038 is active-low — output drops while a 38kHz IR carrier
// is detected, then returns high. Each detected carrier burst is
// one falling/rising edge pair.

#include "pico/stdlib.h"
#include "hardware/gpio.h"
#include "hardware/sync.h"
#include <stdio.h>
#include <stdint.h>

#define GP_IR_IN     14

// ─── Pulse measurement state ─────────────────────────────────────────────────

static volatile uint32_t fall_count    = 0;  // falling edges in current window
static volatile uint32_t last_edge_us  = 0;

// Dwell (LOW) — IR detected
static volatile uint32_t dwell_count   = 0;
static volatile uint64_t dwell_sum_us  = 0;
static volatile uint64_t dwell_sumsq   = 0;  // for stddev
static volatile uint32_t dwell_min_us  = UINT32_MAX;
static volatile uint32_t dwell_max_us  = 0;

// Gap (HIGH) — between pulses
static volatile uint32_t gap_count     = 0;
static volatile uint64_t gap_sum_us    = 0;

// ─── ISR ─────────────────────────────────────────────────────────────────────

static void ir_isr(uint gpio, uint32_t events) {
    if (gpio != GP_IR_IN) return;

    uint32_t now = time_us_32();
    uint32_t dt  = now - last_edge_us;
    last_edge_us = now;

    if (events & GPIO_IRQ_EDGE_FALL) {
        // Falling edge — start of LOW dwell. Time since last edge was a HIGH gap.
        fall_count++;
        if (dt > 0 && dt < 1000000) {
            gap_sum_us += dt;
            gap_count++;
        }
    }

    if (events & GPIO_IRQ_EDGE_RISE) {
        // Rising edge — end of LOW dwell. Time since last edge was a LOW dwell.
        if (dt > 0 && dt < 1000000) {
            dwell_sum_us += dt;
            dwell_sumsq  += (uint64_t)dt * (uint64_t)dt;
            dwell_count++;
            if (dt < dwell_min_us) dwell_min_us = dt;
            if (dt > dwell_max_us) dwell_max_us = dt;
        }
    }
}

// ─── Report ──────────────────────────────────────────────────────────────────

// Integer sqrt for stddev display.
static uint32_t isqrt_u64(uint64_t v) {
    uint64_t x = v, y = (x + 1) >> 1;
    while (y < x) { x = y; y = (x + v / x) >> 1; }
    return (uint32_t)x;
}

typedef enum { SIG_NONE, SIG_WEAK, SIG_STRONG } SigState;

static SigState last_sig_state = SIG_NONE;
static bool     ever_acquired  = false;

static void print_report(void) {
    uint32_t irq_state = save_and_disable_interrupts();

    uint32_t pulses = fall_count;
    uint32_t d_count = dwell_count;
    uint64_t d_sum   = dwell_sum_us;
    uint64_t d_sq    = dwell_sumsq;
    uint32_t d_min   = dwell_min_us;
    uint32_t d_max   = dwell_max_us;
    uint32_t g_count = gap_count;
    uint64_t g_sum   = gap_sum_us;

    fall_count   = 0;
    dwell_count  = 0;
    dwell_sum_us = 0;
    dwell_sumsq  = 0;
    dwell_min_us = UINT32_MAX;
    dwell_max_us = 0;
    gap_count    = 0;
    gap_sum_us   = 0;

    restore_interrupts(irq_state);

    uint32_t d_mean = d_count > 0 ? (uint32_t)(d_sum / d_count) : 0;
    uint32_t g_mean = g_count > 0 ? (uint32_t)(g_sum / g_count) : 0;
    (void)g_mean;

    // Sample variance via E[x^2] - (E[x])^2
    uint32_t d_stddev = 0;
    if (d_count > 1) {
        uint64_t mean_sq = (uint64_t)d_mean * (uint64_t)d_mean;
        uint64_t avg_sq  = d_sq / d_count;
        if (avg_sq > mean_sq) d_stddev = isqrt_u64(avg_sq - mean_sq);
    }

    // AGC classification
    const char *agc;
    if (d_count == 0)                          agc = "FAIL";
    else if (d_mean >= 200 && d_mean <= 600)   agc = "OK";
    else if (d_mean >= 100 && d_mean <= 1000)  agc = "WARN";
    else                                        agc = "FAIL";

    // Signal strength
    SigState sig;
    if (pulses > 30)      sig = SIG_STRONG;
    else if (pulses >= 5) sig = SIG_WEAK;
    else                  sig = SIG_NONE;

    const char *sig_label = (sig == SIG_STRONG) ? "STRONG"
                          : (sig == SIG_WEAK)   ? "WEAK"
                                                : "NONE";

    // Acquisition / loss edges
    if (sig != SIG_NONE && !ever_acquired) {
        printf("SIGNAL ACQUIRED\n");
        ever_acquired = true;
    } else if (sig == SIG_NONE && last_sig_state != SIG_NONE) {
        printf("SIGNAL LOST\n");
    }
    last_sig_state = sig;

    printf("=== IR SENSOR REPORT ===\n");
    printf("Pulses/sec:   %lu\n", (unsigned long)pulses);
    printf("Dwell mean:   %luus  (target: 200-600us)\n", (unsigned long)d_mean);
    printf("Dwell min:    %luus\n", (unsigned long)(d_count > 0 ? d_min : 0));
    printf("Dwell max:    %luus\n", (unsigned long)d_max);
    printf("Dwell stddev: %luus\n", (unsigned long)d_stddev);
    printf("AGC status:   %s\n", agc);
    printf("Signal:       %s\n", sig_label);
    printf("=======================\n\n");

    // While there's no signal, re-check the raw pin state every 5 reports
    // (5 seconds, since print_report runs once per second). Helps confirm
    // the pull-up is working and the receiver isn't pulling the line low.
    static uint32_t no_signal_ticks = 0;
    if (sig == SIG_NONE) {
        if (++no_signal_ticks >= 5) {
            printf("GP%d raw state: %s\n\n",
                   GP_IR_IN,
                   gpio_get(GP_IR_IN) ? "HIGH (idle — correct)"
                                      : "LOW (stuck low — wiring issue)");
            no_signal_ticks = 0;
        }
    } else {
        no_signal_ticks = 0;
    }
}

// ─── Main ────────────────────────────────────────────────────────────────────

int main(void) {
    gpio_init(GP_IR_IN);
    gpio_set_dir(GP_IR_IN, GPIO_IN);
    gpio_pull_up(GP_IR_IN);
    gpio_set_irq_enabled_with_callback(GP_IR_IN,
        GPIO_IRQ_EDGE_RISE | GPIO_IRQ_EDGE_FALL, true, ir_isr);

    stdio_init_all();
    sleep_ms(2000);  // USB CDC settle

    printf("=== Blade IR Sensor Test ===\n");
    printf("Watching GP%d (TSSP77038)...\n", GP_IR_IN);
    printf("GP%d raw state: %s\n\n",
           GP_IR_IN,
           gpio_get(GP_IR_IN) ? "HIGH (idle — correct)"
                              : "LOW (stuck low — wiring issue)");

    // Seed last_edge_us so the first measured interval is sane
    last_edge_us = time_us_32();

    while (true) {
        sleep_ms(1000);
        print_report();
    }
}
