#include "pico/stdlib.h"
#include "hardware/uart.h"
#include "hardware/gpio.h"
#include "common/pins.h"

#include <stdio.h>
#include <string.h>

// XBUS test harness for a bare Pico.
// Reads inverted serial frames on UART1 RX and prints decoded channels over USB CDC.

#define XBUS_UART uart1
#define XBUS_BAUD 115200
#define FRAME_MAX 64
#define IDLE_GAP_US 3000

// Decoder assumptions (adjust if your receiver variant differs):
// - Bytes 0..1 are header/flags.
// - Channels are little-endian uint16 starting at byte 2.
// - Lower 11 bits carry channel value.
#define CH_START 2
#define CH_COUNT 16
#define CH_STRIDE 2
#define CH_MASK 0x07FFu

static uint8_t frame[FRAME_MAX];
static size_t frame_len = 0;
static absolute_time_t last_rx;

static void xbus_uart_init(void) {
    uart_init(XBUS_UART, XBUS_BAUD);
    gpio_set_function(PIN_XBUS_RX, GPIO_FUNC_UART);
    uart_set_format(XBUS_UART, 8, 1, UART_PARITY_NONE);
    uart_set_hw_flow(XBUS_UART, false, false);
    uart_set_fifo_enabled(XBUS_UART, true);
    // XBUS input is inverted electrically on this line.
#if defined(UART_INVERT_RX)
    uart_set_inverse_enabled(XBUS_UART, UART_INVERT_RX);
#else
    gpio_set_inover(PIN_XBUS_RX, GPIO_OVERRIDE_INVERT);
#endif
}

static bool decode_channels(const uint8_t *buf, size_t len, uint16_t ch[CH_COUNT]) {
    size_t need = CH_START + (CH_COUNT * CH_STRIDE);
    if (len < need) {
        return false;
    }

    for (size_t i = 0; i < CH_COUNT; i++) {
        size_t off = CH_START + (i * CH_STRIDE);
        uint16_t raw = (uint16_t)buf[off] | ((uint16_t)buf[off + 1] << 8);
        ch[i] = raw & CH_MASK;
    }

    return true;
}

static void print_frame_and_channels(const uint8_t *buf, size_t len) {
    printf("XBUS frame len=%u :", (unsigned)len);
    for (size_t i = 0; i < len; i++) {
        printf(" %02X", buf[i]);
    }
    printf("\n");

    uint16_t ch[CH_COUNT];
    if (!decode_channels(buf, len, ch)) {
        printf("decode: insufficient bytes for %u channels\n", CH_COUNT);
        return;
    }

    printf("channels:");
    for (size_t i = 0; i < CH_COUNT; i++) {
        printf(" ch%u=%u", (unsigned)(i + 1), (unsigned)ch[i]);
    }
    printf("\n");
}

int main(void) {
    stdio_init_all();
    sleep_ms(1200);

    printf("xbus_test_fw starting (UART1 RX=GP%u, baud=%u, inverted RX)\n",
           (unsigned)PIN_XBUS_RX,
           (unsigned)XBUS_BAUD);

    xbus_uart_init();
    last_rx = get_absolute_time();

    while (true) {
        while (uart_is_readable(XBUS_UART)) {
            uint8_t b = (uint8_t)uart_getc(XBUS_UART);
            if (frame_len < FRAME_MAX) {
                frame[frame_len++] = b;
            } else {
                // Overflow: keep receiving, but restart frame capture.
                frame_len = 0;
            }
            last_rx = get_absolute_time();
        }

        if (frame_len > 0) {
            int64_t dt = absolute_time_diff_us(last_rx, get_absolute_time());
            if (dt > IDLE_GAP_US) {
                print_frame_and_channels(frame, frame_len);
                frame_len = 0;
            }
        }

        tight_loop_contents();
    }
}
