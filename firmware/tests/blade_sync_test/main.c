// ╔══════════════════════════════════════════════════════════════════╗
// ║           MILESTONE — XBUS CHANNEL READING CONFIRMED            ║
// ║                    April 2026                                    ║
// ╠══════════════════════════════════════════════════════════════════╣
// ║                                                                  ║
// ║  JR XBUS Mode A confirmed working on blade controller:          ║
// ║    • 250,000 baud (NOT 115200 — this took significant effort)   ║
// ║    • Non-inverted TTL signal (idle HIGH)                        ║
// ║    • GP28 via PIO UART on pio1 (hardware UART cannot use GP28) ║
// ║    • 4-byte records: [ch_id][0x00][pos_hi][pos_lo]             ║
// ║    • Position: us = 800 + (pos * 1400 / 65535)                 ║
// ║    • CH6 confirmed 900µs ↔ 2131µs full travel                  ║
// ║    • Transmitter: JR Matrix 22, receiver: JR RG012BX           ║
// ║    • Mode A (not Mode B) required for channel data output       ║
// ║                                                                  ║
// ║  CH6 drives mode selection in this firmware:                    ║
// ║    < 1200µs  = IR Signal Test Mode                              ║
// ║  1200-1800µs = Phase Tune Mode (bench-safe)                    ║
// ║    > 1800µs  = POV Sync Test Mode                               ║
// ║                                                                  ║
// ║  FUTURE USE — channels available for show control:              ║
// ║    CH6  = mode select / show start (confirmed working)          ║
// ║    CH7  = confirmed 2100µs (switch high)                        ║
// ║    CH8  = confirmed 1099µs — available for bailout              ║
// ║    CH9  = confirmed 1900µs — available for mode select          ║
// ║    CH5  = confirmed 899µs — available                           ║
// ║    CH1  = throttle/collective (safety-held, do not use)         ║
// ║                                                                  ║
// ║  Key learning: GP28 is ADC2 — hardware PWM and hardware UART   ║
// ║  silently fail on this pin. Always use PIO on GP28.             ║
// ║                                                                  ║
// ╚══════════════════════════════════════════════════════════════════╝

// firmware/tests/blade_sync_test/main.c
// Minimal CH6-mode visualiser with USB serial diagnostics.
//
// Reads XBUS on GP28 (PIO UART, 250kbaud, non-inverted, pio1).
// Drives all 4 SK9822 segments solid at ~16% brightness:
//
//   ch6 < 1200us            → GREEN   (low)
//   ch6 1200-1800us         → ORANGE  (mid)
//   ch6 > 1800us            → RED     (high)
//   ch6 not yet received    → OFF
//
// USB serial (115200): ch1..ch16 every 500ms + heartbeat every 2s
// with byte/record/resync counts (matches the xbus_test format).

#include "pico/stdlib.h"
#include "hardware/gpio.h"
#include "hardware/pio.h"
#include "hardware/clocks.h"
#include "uart_rx.pio.h"
#include <stdio.h>
#include <stdint.h>
#include <stdbool.h>
#include <string.h>

// ─── SK9822 ──────────────────────────────────────────────────────────────────

#define PIXELS_PER_SEG  36
#define BRIGHTNESS      5       // 5/31 ≈ 16% (project cap)

#define S1T_DAT  2
#define S1T_CLK  3
#define S2T_DAT  5
#define S2T_CLK  4
#define S1B_DAT  12
#define S1B_CLK  11
#define S2B_DAT  13
#define S2B_CLK  15

static const uint8_t all_seg_gpios[8] = {
    S1T_DAT, S1T_CLK, S2T_DAT, S2T_CLK,
    S1B_DAT, S1B_CLK, S2B_DAT, S2B_CLK,
};

static inline void spi_write(uint dp, uint cp, uint8_t b) {
    for (int i = 7; i >= 0; i--) {
        gpio_put(dp, (b >> i) & 1);
        gpio_put(cp, 1);
        __asm volatile("nop\nnop\nnop\nnop");
        gpio_put(cp, 0);
        __asm volatile("nop\nnop\nnop\nnop");
    }
}

// Forward decl — defined below alongside the rest of the XBUS code.
static void xbus_drain(void);

static void write_seg(uint dp, uint cp, uint8_t r, uint8_t g, uint8_t b) {
    for (int i = 0; i < 4; i++) spi_write(dp, cp, 0x00);
    for (int i = 0; i < PIXELS_PER_SEG; i++) {
        spi_write(dp, cp, 0xE0 | (BRIGHTNESS & 0x1F));
        spi_write(dp, cp, b);  // SK9822 byte order: B, G, R
        spi_write(dp, cp, g);
        spi_write(dp, cp, r);
        // Drain XBUS FIFO every pixel — one full segment write is long
        // enough (~300us) to overflow the 8-byte PIO FIFO at 250kbaud
        // (~30 bytes arrive per render). Draining here keeps headroom.
        xbus_drain();
    }
    for (int i = 0; i < 4; i++) spi_write(dp, cp, 0xFF);
}

static void write_all(uint8_t r, uint8_t g, uint8_t b) {
    write_seg(S1T_DAT, S1T_CLK, r, g, b);
    write_seg(S2T_DAT, S2T_CLK, r, g, b);
    write_seg(S1B_DAT, S1B_CLK, r, g, b);
    write_seg(S2B_DAT, S2B_CLK, r, g, b);
}

// ─── XBUS PIO UART (pio1, 250k, non-inverted) ────────────────────────────────

#define XBUS_PIN     28
#define XBUS_BAUD    250000
#define MAX_CHANNELS 22

static PIO  xbus_pio;
static uint xbus_sm;
static uint16_t ch[MAX_CHANNELS + 1];
static uint8_t  win[4];
static uint8_t  win_fill = 0;

static uint32_t total_bytes   = 0;
static uint32_t total_records = 0;
static uint32_t total_resyncs = 0;

static void xbus_init(void) {
    xbus_pio = pio1;
    xbus_sm  = (uint)pio_claim_unused_sm(xbus_pio, true);
    uint offset = pio_add_program(xbus_pio, &uart_rx_program);
    uart_rx_program_init(xbus_pio, xbus_sm, offset, XBUS_PIN, XBUS_BAUD);
}

static inline uint16_t pos_to_us(uint16_t pos) {
    return (uint16_t)(800u + ((uint32_t)pos * 1400u) / 65535u);
}

static void xbus_drain(void) {
    while (!pio_sm_is_rx_fifo_empty(xbus_pio, xbus_sm)) {
        uint32_t raw = pio_sm_get(xbus_pio, xbus_sm);
        uint8_t b = (uint8_t)(raw >> 24);
        total_bytes++;

        win[0] = win[1]; win[1] = win[2]; win[2] = win[3]; win[3] = b;
        if (win_fill < 4) win_fill++;
        if (win_fill < 4) continue;

        bool decoded = false;
        if (win[0] >= 1 && win[0] <= MAX_CHANNELS && win[1] == 0x00) {
            uint16_t pos = ((uint16_t)win[2] << 8) | win[3];
            uint16_t us  = pos_to_us(pos);
            if (us >= 800 && us <= 2200) {
                ch[win[0]] = us;
                total_records++;
                win_fill = 0;
                memset(win, 0, sizeof(win));
                decoded = true;
            }
        }
        if (!decoded) {
            total_resyncs++;
        }
    }
}

// ─── Mode debounce ───────────────────────────────────────────────────────────

typedef enum { MODE_NONE, MODE_LOW, MODE_MID, MODE_HIGH } Mode;

#define DEBOUNCE_COUNT  5

static Mode classify(uint16_t ch6) {
    if (ch6 == 0)        return MODE_NONE;
    if (ch6 < 1200)      return MODE_LOW;
    if (ch6 <= 1800)     return MODE_MID;
    return MODE_HIGH;
}

// ─── Main ────────────────────────────────────────────────────────────────────

int main(void) {
    stdio_init_all();
    sleep_ms(2000);   // USB CDC settle

    printf("\n=== blade_sync_test_fw — CH6 mode visualiser ===\n");
    printf("LED: ch6<1200 GREEN, 1200-1800 ORANGE, >1800 RED\n");
    printf("XBUS: GP%d, %d baud, non-inverted, PIO1\n\n",
           XBUS_PIN, XBUS_BAUD);

    for (int i = 0; i < 8; i++) {
        gpio_init(all_seg_gpios[i]);
        gpio_set_dir(all_seg_gpios[i], GPIO_OUT);
        gpio_put(all_seg_gpios[i], 0);
    }

    xbus_init();
    write_all(0, 0, 0);

    Mode published_mode = MODE_NONE;
    Mode tentative_mode = MODE_NONE;
    int  tentative_count = 0;

    absolute_time_t last_print = get_absolute_time();
    absolute_time_t last_hb    = get_absolute_time();

    while (true) {
        xbus_drain();

        // Mode debounce: only switch after DEBOUNCE_COUNT consecutive
        // ch[6] reads agree on a different band.
        Mode m = classify(ch[6]);
        if (m == published_mode) {
            tentative_count = 0;
        } else if (m == tentative_mode) {
            if (++tentative_count >= DEBOUNCE_COUNT) {
                published_mode  = m;
                tentative_count = 0;
            }
        } else {
            tentative_mode  = m;
            tentative_count = 1;
        }

        uint8_t r = 0, g = 0, b = 0;
        switch (published_mode) {
            case MODE_LOW:  g = 255;            break;
            case MODE_MID:  r = 255; g = 80;    break;
            case MODE_HIGH: r = 255;            break;
            case MODE_NONE: default:            break;
        }
        write_all(r, g, b);

        // ch1..ch16 dump every 500ms
        if (absolute_time_diff_us(last_print, get_absolute_time()) > 500000) {
            const char *mode_name =
                (published_mode == MODE_LOW)  ? "LOW " :
                (published_mode == MODE_MID)  ? "MID " :
                (published_mode == MODE_HIGH) ? "HIGH" : "NONE";
            printf("ch1=%u ch2=%u ch3=%u ch4=%u ch5=%u ch6=%u ch7=%u ch8=%u "
                   "ch9=%u ch10=%u ch11=%u ch12=%u ch13=%u ch14=%u ch15=%u ch16=%u "
                   "[mode=%s]\n",
                   ch[1], ch[2], ch[3], ch[4], ch[5], ch[6], ch[7], ch[8],
                   ch[9], ch[10], ch[11], ch[12], ch[13], ch[14], ch[15], ch[16],
                   mode_name);
            last_print = get_absolute_time();
        }

        // Heartbeat every 2s
        if (absolute_time_diff_us(last_hb, get_absolute_time()) > 2000000) {
            printf("heartbeat — %lu bytes, %lu records, %lu resyncs\n",
                   (unsigned long)total_bytes,
                   (unsigned long)total_records,
                   (unsigned long)total_resyncs);
            last_hb = get_absolute_time();
        }
    }
}
