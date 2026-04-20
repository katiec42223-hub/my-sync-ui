// firmware/tests/xbus_test/src/main.c
// SYNCHRON XBUS decoder — confirmed working configuration.
//
// JR XBUS Mode A, 250000 baud, non-inverted TTL (idle HIGH).
// GP28 via PIO UART on pio1 (hardware UART cannot use GP28).
//
// Wire format: continuous 4-byte channel records, no global header.
//   byte 0: channel_id (0x01-0x16, 1-based)
//   byte 1: sub_id (always 0x00)
//   byte 2: position high byte
//   byte 3: position low byte
// Position: us = 800 + (pos * 1400 / 65535)
// Range: 0x0000=800us, 0x7FFF=1500us, 0xFFFF=2200us

#include "pico/stdlib.h"
#include "hardware/pio.h"
#include "hardware/clocks.h"
#include "uart_rx.pio.h"
#include <stdio.h>
#include <string.h>

#define PIN_XBUS_RX      28
#define XBUS_BAUD        250000
#define MAX_CHANNELS     22

// Show trigger thresholds (CH6)
#define START_THRESHOLD  1900   // us — above = show START
#define STOP_THRESHOLD   1200   // us — below = show STOP
#define DEBOUNCE_COUNT   5      // consecutive records required

static PIO     xbus_pio;
static uint    xbus_sm;

// Channel values in microseconds [1..MAX_CHANNELS]
static uint16_t ch[MAX_CHANNELS + 1];

// 4-byte sliding window for record sync
static uint8_t  win[4];
static uint32_t win_pos = 0;

// Stats
static uint32_t total_bytes   = 0;
static uint32_t total_records = 0;
static uint32_t total_resyncs = 0;

// Show trigger debounce
static int  ch6_high_count = 0;
static int  ch6_low_count  = 0;
static bool show_running   = false;

static void pio_uart_init(void) {
    xbus_pio = pio1;  // pio0 reserved for SK9822 in blade firmware
    xbus_sm  = (uint)pio_claim_unused_sm(xbus_pio, true);
    uint offset = pio_add_program(xbus_pio, &uart_rx_program);
    uart_rx_program_init(xbus_pio, xbus_sm, offset, PIN_XBUS_RX, XBUS_BAUD);

    float clkdiv = (float)clock_get_hz(clk_sys) / (8.0f * (float)XBUS_BAUD);
    printf("PIO UART: GP%d, %d baud, non-inverted, clkdiv=%.2f\n",
           PIN_XBUS_RX, XBUS_BAUD, clkdiv);
}

static inline uint16_t pos_to_us(uint16_t pos) {
    return (uint16_t)(800u + ((uint32_t)pos * 1400u) / 65535u);
}

// Process one byte through the 4-byte sliding window decoder.
static void process_byte(uint8_t b) {
    total_bytes++;

    // Shift window left and append new byte
    win[0] = win[1];
    win[1] = win[2];
    win[2] = win[3];
    win[3] = b;
    win_pos++;

    if (win_pos < 4) return;

    // Validate: win[0]=ch_id (1..MAX_CHANNELS), win[1]=0x00, win[2..3]=position
    uint8_t ch_id  = win[0];
    uint8_t sub_id = win[1];

    if (ch_id >= 1 && ch_id <= MAX_CHANNELS && sub_id == 0x00) {
        uint16_t pos = ((uint16_t)win[2] << 8) | win[3];
        uint16_t us  = pos_to_us(pos);

        // Sanity check: 800-2200us
        if (us >= 800 && us <= 2200) {
            ch[ch_id] = us;
            total_records++;
            win_pos = 0;
            memset(win, 0, sizeof(win));
            return;
        }
    }

    // Not a valid record — slide by 1 byte and try again next iteration
    total_resyncs++;
}

static void check_show_trigger(void) {
    uint16_t ch6 = ch[6];
    if (ch6 == 0) return;  // not received yet

    if (ch6 > START_THRESHOLD) {
        ch6_low_count = 0;
        if (++ch6_high_count == DEBOUNCE_COUNT && !show_running) {
            show_running = true;
            printf("*** CH6 HIGH — SHOW START *** (%uus)\n", ch6);
        }
    } else if (ch6 < STOP_THRESHOLD) {
        ch6_high_count = 0;
        if (++ch6_low_count == DEBOUNCE_COUNT && show_running) {
            show_running = false;
            printf("*** CH6 LOW — SHOW STOP *** (%uus)\n", ch6);
        }
    } else {
        ch6_high_count = 0;
        ch6_low_count  = 0;
    }
}

int main(void) {
    stdio_init_all();
    sleep_ms(3000);

    printf("\n=== XBUS Test — JR Mode A, 250kbaud, GP28 ===\n");
    printf("CH6 > %dus = SHOW START\n", START_THRESHOLD);
    printf("CH6 < %dus = SHOW STOP\n\n", STOP_THRESHOLD);

    pio_uart_init();

    absolute_time_t last_hb    = get_absolute_time();
    absolute_time_t last_print = get_absolute_time();

    while (true) {
        // Drain PIO RX FIFO
        while (!pio_sm_is_rx_fifo_empty(xbus_pio, xbus_sm)) {
            uint32_t raw = pio_sm_get(xbus_pio, xbus_sm);
            process_byte((uint8_t)(raw >> 24));
        }

        check_show_trigger();

        // Status print every 500ms
        if (absolute_time_diff_us(last_print, get_absolute_time()) > 500000) {
            printf("ch1=%u ch2=%u ch3=%u ch4=%u ch5=%u ch6=%u ch7=%u ch8=%u\n",
                   ch[1], ch[2], ch[3], ch[4], ch[5], ch[6], ch[7], ch[8]);
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
