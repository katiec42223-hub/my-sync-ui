// firmware/tests/rainbow_strip/main.c
// SYNCHRON — standalone 144px SK9822 rainbow wave.
//
// Headless: no USB, no printf. Runs from BEC the moment power is applied.
// Useful for confirming wiring + LEDs + power before bringing up the full
// blade firmware.
//
// Hardware:
//   GP2  → J2 pin 2 (Seg1 Top, DATA via U2 buffer)
//   GP3  → J2 pin 3 (Seg1 Top, CLOCK via U2 buffer)
//   J2 pin 1 = GND, J2 pin 6 = +5V
//   144 pixels SK9822 / APA102C, brightness clamped to a safe level.

#include "pico/stdlib.h"
#include "hardware/gpio.h"
#include <stdint.h>

#define GP_DATA     2
#define GP_CLK      3
#define NUM_PIXELS  144
#define BRIGHTNESS  5    // 0-31, 5 ≈ 15% global brightness

// ─── Bit-bang SPI (mode 0: CPOL=0, CPHA=0, MSB first) ────────────────────────

static inline void spi_byte(uint8_t b) {
    for (int i = 7; i >= 0; i--) {
        gpio_put(GP_DATA, (b >> i) & 1);
        gpio_put(GP_CLK, 1);
        __asm volatile("nop\nnop\nnop\nnop");
        gpio_put(GP_CLK, 0);
        __asm volatile("nop\nnop\nnop\nnop");
    }
}

// ─── SK9822 frame writer ─────────────────────────────────────────────────────

static void write_frame(const uint8_t r[], const uint8_t g[], const uint8_t b[]) {
    // Start frame: 4 bytes of 0x00
    spi_byte(0x00); spi_byte(0x00); spi_byte(0x00); spi_byte(0x00);

    // Pixels: [0xE0|brightness][B][G][R]
    for (int i = 0; i < NUM_PIXELS; i++) {
        spi_byte(0xE0 | (BRIGHTNESS & 0x1F));
        spi_byte(b[i]);
        spi_byte(g[i]);
        spi_byte(r[i]);
    }

    // End frame: ceil(NUM_PIXELS / 16) extra clock pulses, but the simple
    // recipe of NUM_PIXELS/2 + 1 bytes of 0xFF works for any chain length.
    for (int i = 0; i < (NUM_PIXELS / 2 + 1); i++) {
        spi_byte(0xFF);
    }
}

// ─── HSV (S=V=255) → RGB, integer math ───────────────────────────────────────

static void hue_to_rgb(uint8_t hue, uint8_t *r, uint8_t *g, uint8_t *b) {
    uint8_t reg = hue / 43;
    uint8_t rem = (uint8_t)((hue - reg * 43) * 6);
    switch (reg) {
        case 0:  *r = 255;       *g = rem;       *b = 0;         break;
        case 1:  *r = 255 - rem; *g = 255;       *b = 0;         break;
        case 2:  *r = 0;         *g = 255;       *b = rem;       break;
        case 3:  *r = 0;         *g = 255 - rem; *b = 255;       break;
        case 4:  *r = rem;       *g = 0;         *b = 255;       break;
        default: *r = 255;       *g = 0;         *b = 255 - rem; break;
    }
}

// ─── Main ────────────────────────────────────────────────────────────────────

int main(void) {
    // GPIO setup — clock idles low, data idle low.
    gpio_init(GP_DATA);
    gpio_set_dir(GP_DATA, GPIO_OUT);
    gpio_put(GP_DATA, 0);

    gpio_init(GP_CLK);
    gpio_set_dir(GP_CLK, GPIO_OUT);
    gpio_put(GP_CLK, 0);

    static uint8_t r[NUM_PIXELS];
    static uint8_t g[NUM_PIXELS];
    static uint8_t b[NUM_PIXELS];

    uint8_t base_hue = 0;

    while (true) {
        // Build a rainbow that wraps once across the full strip.
        // Each pixel's hue = base_hue + (pixel_index * 256 / NUM_PIXELS).
        for (int i = 0; i < NUM_PIXELS; i++) {
            uint8_t h = (uint8_t)(base_hue + (i * 256) / NUM_PIXELS);
            hue_to_rgb(h, &r[i], &g[i], &b[i]);
        }

        write_frame(r, g, b);

        base_hue++;          // animate ~50fps × 256 = 5.1s per full cycle
        sleep_ms(20);
    }
}
