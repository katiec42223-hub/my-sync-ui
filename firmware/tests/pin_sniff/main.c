// firmware/tests/pin_sniff/main.c
// SYNCHRON — Raw Pin Signal Sniffer
//
// Standalone diagnostic: reads raw signal on GP28 and characterizes
// what it's seeing. No UART, no protocol assumptions — just GPIO
// edge timing.
//
// Use this when xbus_test_fw shows zero bytes received: it tells you
// whether ANYTHING is happening on the pin, and gives a best-guess
// classification of the signal type.

#include "pico/stdlib.h"
#include "hardware/gpio.h"
#include "hardware/sync.h"
#include <stdio.h>
#include <string.h>

#define PIN_SNIFF       28
#define EDGE_BUF_SIZE   256
#define REPORT_PERIOD_MS 2000

typedef struct {
    uint32_t time_us;
    bool     rising;
} Edge;

static volatile Edge     edge_buf[EDGE_BUF_SIZE];
static volatile uint32_t edge_head = 0;   // next write index
static volatile uint32_t edge_count = 0;  // number of valid entries (capped at EDGE_BUF_SIZE)

// ─── ISR ─────────────────────────────────────────────────────────────────────

static void pin_isr(uint gpio, uint32_t events) {
    if (gpio != PIN_SNIFF) return;

    uint32_t now = time_us_32();
    bool rising = (events & GPIO_IRQ_EDGE_RISE) != 0;
    // If both flags fire in a single event, prefer the actual current pin state
    if ((events & GPIO_IRQ_EDGE_RISE) && (events & GPIO_IRQ_EDGE_FALL)) {
        rising = gpio_get(PIN_SNIFF);
    }

    uint32_t idx = edge_head;
    edge_buf[idx].time_us = now;
    edge_buf[idx].rising  = rising;
    edge_head = (idx + 1) % EDGE_BUF_SIZE;
    if (edge_count < EDGE_BUF_SIZE) edge_count++;
}

// ─── Analysis ────────────────────────────────────────────────────────────────

typedef struct {
    uint32_t count;
    uint32_t min_us;
    uint32_t max_us;
    uint64_t sum_us;
} DurStats;

static void stats_init(DurStats *s) {
    s->count = 0;
    s->min_us = UINT32_MAX;
    s->max_us = 0;
    s->sum_us = 0;
}

static void stats_add(DurStats *s, uint32_t v) {
    s->count++;
    s->sum_us += v;
    if (v < s->min_us) s->min_us = v;
    if (v > s->max_us) s->max_us = v;
}

static uint32_t stats_mean(const DurStats *s) {
    return s->count > 0 ? (uint32_t)(s->sum_us / s->count) : 0;
}

// Classify the signal based on duration statistics.
static const char *classify(const DurStats *high, const DurStats *low,
                            uint32_t edges, uint32_t window_ms) {
    if (edges == 0) return "NO SIGNAL — pin is idle (pulled high)";

    uint32_t h_mean = stats_mean(high);
    uint32_t l_mean = stats_mean(low);

    // UART ~115200: bit time = 1/115200s ≈ 8.7us; runs of bits give
    // similar HIGH/LOW means in the 10-25us range.
    if (h_mean >= 5 && h_mean <= 30 && l_mean >= 5 && l_mean <= 30) {
        return "Looks like UART ~115200 baud";
    }

    // UART ~9600: bit time ≈ 104us
    if (h_mean >= 70 && h_mean <= 150 && l_mean >= 70 && l_mean <= 150) {
        return "Looks like UART ~9600 baud";
    }

    // PWM servo: HIGH pulse 1000-2000us, LOW gap 1-20ms (50-333Hz frame rate)
    if (high->min_us > 500 && high->max_us < 2500 &&
        l_mean >= 1000 && l_mean <= 20000) {
        return "Looks like PWM servo signal (1-2ms pulse)";
    }

    // PWM 50Hz: ~50-100 edges/sec total in this window
    uint32_t edges_per_sec = (window_ms > 0) ? (edges * 1000u / window_ms) : 0;
    if (edges_per_sec >= 50 && edges_per_sec <= 150 && l_mean > 1000) {
        return "Looks like PWM ~50Hz with long low gaps";
    }

    return "Unknown — see raw edge durations below";
}

// ─── Report ──────────────────────────────────────────────────────────────────

static void print_report(uint32_t window_ms) {
    // Snapshot the buffer atomically
    uint32_t irq_state = save_and_disable_interrupts();

    uint32_t count = edge_count;
    uint32_t head  = edge_head;

    // Copy out into a stable local array
    Edge snap[EDGE_BUF_SIZE];
    if (count > 0) {
        // Edges in chronological order: oldest is at (head - count) mod size
        uint32_t start = (head + EDGE_BUF_SIZE - count) % EDGE_BUF_SIZE;
        for (uint32_t i = 0; i < count; i++) {
            snap[i] = edge_buf[(start + i) % EDGE_BUF_SIZE];
        }
    }

    // Reset for next window
    edge_count = 0;

    restore_interrupts(irq_state);

    printf("=== PIN SNIFF GP%d ===\n", PIN_SNIFF);
    printf("Total edges: %lu (last %lu ms)\n",
           (unsigned long)count, (unsigned long)window_ms);

    if (count == 0) {
        printf("NO SIGNAL — pin is idle (pulled high)\n");
        printf("=======================\n\n");
        return;
    }

    DurStats high, low;
    stats_init(&high);
    stats_init(&low);

    // Duration between consecutive edges represents one state.
    // The state's level is the level BEFORE the second edge:
    //   second edge rising  → previous state was LOW
    //   second edge falling → previous state was HIGH
    uint32_t durations[EDGE_BUF_SIZE];
    bool     dur_was_high[EDGE_BUF_SIZE];
    uint32_t dur_count = 0;

    for (uint32_t i = 1; i < count; i++) {
        uint32_t dt = snap[i].time_us - snap[i - 1].time_us;
        bool was_high = !snap[i].rising;  // rising edge means prior was LOW → was_high=false
        durations[dur_count] = dt;
        dur_was_high[dur_count] = was_high;
        dur_count++;
        if (was_high) stats_add(&high, dt);
        else          stats_add(&low,  dt);
    }

    if (high.count > 0) {
        printf("HIGH durations: min=%luus mean=%luus max=%luus (n=%lu)\n",
               (unsigned long)high.min_us, (unsigned long)stats_mean(&high),
               (unsigned long)high.max_us, (unsigned long)high.count);
    } else {
        printf("HIGH durations: (no samples)\n");
    }

    if (low.count > 0) {
        printf("LOW durations:  min=%luus mean=%luus max=%luus (n=%lu)\n",
               (unsigned long)low.min_us, (unsigned long)stats_mean(&low),
               (unsigned long)low.max_us, (unsigned long)low.count);
    } else {
        printf("LOW durations:  (no samples)\n");
    }

    // Frequency estimate: full cycle = one HIGH + one LOW
    uint32_t cycle_us = stats_mean(&high) + stats_mean(&low);
    uint32_t freq_hz  = cycle_us > 0 ? 1000000u / cycle_us : 0;
    printf("Est. frequency: %lu Hz\n", (unsigned long)freq_hz);

    printf("GUESS: %s\n", classify(&high, &low, count, window_ms));

    // Always dump first 32 edge durations so the operator sees the raw pattern
    uint32_t dump_n = dur_count < 32 ? dur_count : 32;
    printf("edges:");
    for (uint32_t i = 0; i < dump_n; i++) {
        printf(" %lu%c", (unsigned long)durations[i], dur_was_high[i] ? 'H' : 'L');
    }
    printf("\n");
    printf("=======================\n\n");
}

// ─── Main ────────────────────────────────────────────────────────────────────

int main(void) {
    stdio_init_all();
    sleep_ms(3000); // let USB CDC settle

    printf("\n");
    printf("==========================================\n");
    printf("  SYNCHRON Pin Sniffer\n");
    printf("  Watching GP%d (input, pull-up, both edges)\n", PIN_SNIFF);
    printf("==========================================\n\n");

    gpio_init(PIN_SNIFF);
    gpio_set_dir(PIN_SNIFF, GPIO_IN);
    gpio_pull_up(PIN_SNIFF);
    gpio_set_irq_enabled_with_callback(PIN_SNIFF,
        GPIO_IRQ_EDGE_RISE | GPIO_IRQ_EDGE_FALL, true, pin_isr);

    while (true) {
        sleep_ms(REPORT_PERIOD_MS);
        print_report(REPORT_PERIOD_MS);
    }
}
