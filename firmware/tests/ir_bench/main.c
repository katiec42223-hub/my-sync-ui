// firmware/tests/ir_bench/main.c
// SYNCHRON — IR Sensor Bench Test
//
// Standalone diagnostic: drives IR LED at 38kHz on GP28,
// reads TSSP77038 output on GP14, reports pulse statistics
// over USB serial every second.

#include "pico/stdlib.h"
#include "hardware/pwm.h"
#include "hardware/gpio.h"
#include "hardware/clocks.h"
#include "hardware/sync.h"
#include <stdio.h>

// ─── GPIO assignments ────────────────────────────────────────────────────────

#define GP_IR_OUT   28   // 38kHz IR LED via MOSFET (fuselage side, for bench)
#define GP_IR_IN    14   // TSSP77038 output (active low)

// ─── IR carrier frequency ────────────────────────────────────────────────────

#define IR_FREQ_HZ  38000

// ─── Pulse measurement state ─────────────────────────────────────────────────

static volatile uint32_t fall_count       = 0;  // falling edges in current window
static volatile uint32_t last_edge_us     = 0;  // timestamp of last edge

// Dwell (LOW) duration accumulators
static volatile uint64_t dwell_sum_us     = 0;
static volatile uint32_t dwell_count      = 0;
static volatile uint32_t dwell_min_us     = UINT32_MAX;
static volatile uint32_t dwell_max_us     = 0;

// Gap (HIGH) duration accumulators
static volatile uint64_t gap_sum_us       = 0;
static volatile uint32_t gap_count        = 0;

// Track current pin state to classify edge
static volatile bool     pin_is_low       = false;

// ─── GPIO ISR (both edges) ───────────────────────────────────────────────────

static void ir_gpio_isr(uint gpio, uint32_t events) {
    if (gpio != GP_IR_IN) return;

    uint32_t now = time_us_32();
    uint32_t dt  = now - last_edge_us;
    last_edge_us = now;

    if (events & GPIO_IRQ_EDGE_FALL) {
        // Falling edge: IR detected (active low) — start of dwell
        fall_count++;
        pin_is_low = true;

        // The time since last edge was a HIGH gap
        if (dt > 0 && dt < 1000000 && gap_count < UINT32_MAX) {
            gap_sum_us += dt;
            gap_count++;
        }
    }

    if (events & GPIO_IRQ_EDGE_RISE) {
        // Rising edge: IR no longer detected — end of dwell
        pin_is_low = false;

        // The time since last edge was a LOW dwell
        if (dt > 0 && dt < 1000000 && dwell_count < UINT32_MAX) {
            dwell_sum_us += dt;
            dwell_count++;
            if (dt < dwell_min_us) dwell_min_us = dt;
            if (dt > dwell_max_us) dwell_max_us = dt;
        }
    }
}

// ─── Init ────────────────────────────────────────────────────────────────────

static void ir_led_init(void) {
    // PWM 38kHz on GP28 — copied from fuselage player ir_led_init()
    gpio_set_function(GP_IR_OUT, GPIO_FUNC_PWM);
    uint slice = pwm_gpio_to_slice_num(GP_IR_OUT);
    uint chan  = pwm_gpio_to_channel(GP_IR_OUT);

    // sys_clk = 125MHz, wrap = 125MHz/38kHz = 3289
    uint32_t sys_clk = clock_get_hz(clk_sys);
    uint32_t wrap = sys_clk / IR_FREQ_HZ;
    pwm_set_wrap(slice, wrap - 1);
    pwm_set_chan_level(slice, chan, wrap / 2); // 50% duty
    pwm_set_enabled(slice, true);

    printf("[ir_bench] IR LED 38kHz started on GP%d\n", GP_IR_OUT);
}

static void ir_sensor_init(void) {
    gpio_init(GP_IR_IN);
    gpio_set_dir(GP_IR_IN, GPIO_IN);
    gpio_pull_up(GP_IR_IN);

    // IRQ on both edges
    gpio_set_irq_enabled_with_callback(GP_IR_IN,
        GPIO_IRQ_EDGE_FALL | GPIO_IRQ_EDGE_RISE, true, ir_gpio_isr);

    printf("[ir_bench] IR sensor on GP%d (pull-up, both edges)\n", GP_IR_IN);
}

// ─── Report ──────────────────────────────────────────────────────────────────

static void print_report(void) {
    // Snapshot and reset accumulators atomically
    uint32_t irq_state = save_and_disable_interrupts();

    uint32_t pulses   = fall_count;
    uint64_t d_sum    = dwell_sum_us;
    uint32_t d_count  = dwell_count;
    uint32_t d_min    = dwell_min_us;
    uint32_t d_max    = dwell_max_us;
    uint64_t g_sum    = gap_sum_us;
    uint32_t g_count  = gap_count;

    fall_count    = 0;
    dwell_sum_us  = 0;
    dwell_count   = 0;
    dwell_min_us  = UINT32_MAX;
    dwell_max_us  = 0;
    gap_sum_us    = 0;
    gap_count     = 0;

    restore_interrupts(irq_state);

    // Compute means
    uint32_t d_mean = d_count > 0 ? (uint32_t)(d_sum / d_count) : 0;
    uint32_t g_mean = g_count > 0 ? (uint32_t)(g_sum / g_count) : 0;

    // AGC status
    const char *agc;
    if (d_count == 0)                              agc = "FAIL";
    else if (d_mean >= 200 && d_mean <= 600)       agc = "OK";
    else if (d_mean >= 100 && d_mean <= 1000)      agc = "WARN";
    else                                           agc = "FAIL";

    // Signal strength
    const char *signal;
    if (pulses > 30)       signal = "STRONG";
    else if (pulses >= 5)  signal = "WEAK";
    else                   signal = "NONE";

    printf("=== IR BENCH REPORT ===\n");
    printf("Pulses/sec:    %lu\n", pulses);
    printf("Dwell mean:    %luus  (mean LOW duration)\n", d_mean);
    printf("Dwell min:     %luus\n", d_count > 0 ? d_min : 0);
    printf("Dwell max:     %luus\n", d_max);
    printf("Gap mean:      %luus  (mean HIGH duration between pulses)\n", g_mean);
    printf("AGC status:    %s\n", agc);
    printf("Signal:        %s\n", signal);
    printf("=======================\n\n");
}

// ─── Main ────────────────────────────────────────────────────────────────────

int main() {
    stdio_init_all();
    sleep_ms(1000); // let USB CDC settle

    printf("\n");
    printf("=================================\n");
    printf("  SYNCHRON IR Bench Test\n");
    printf("  IR LED: GP%d (38kHz PWM)\n", GP_IR_OUT);
    printf("  Sensor: GP%d (TSSP77038)\n", GP_IR_IN);
    printf("=================================\n\n");

    ir_led_init();
    ir_sensor_init();

    // Seed last_edge_us
    last_edge_us = time_us_32();

    while (true) {
        sleep_ms(1000);
        print_report();
    }
}
