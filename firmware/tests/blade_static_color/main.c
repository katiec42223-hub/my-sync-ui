// firmware/tests/blade_static_color/main.c
// SYNCHRON — standalone blade SK9822 static-color identifier.
//
// Headless: no USB, no printf. Boots from BEC and lights all 4
// segments in distinct colors so you can visually confirm wiring
// matches the connector pinout below.
//
// Both connectors wired identically: GND, DATA1, CLK1, DATA2, CLK2, +5V.
// Buffer routing means the GPIO-to-connector mapping is asymmetric —
// see the per-connector mapping below.
//
//   J2 (Top — via U2 buffer)
//     J2 pin 2 = GP2   Seg1 Top DATA  → RED
//     J2 pin 3 = GP3   Seg1 Top CLK
//     J2 pin 4 = GP5   Seg2 Top DATA  → GREEN
//     J2 pin 5 = GP4   Seg2 Top CLK
//
//   J1 (Bottom — via U3 buffer)
//     J1 pin 2 = GP12  Seg1 Bot DATA  → YELLOW
//     J1 pin 3 = GP11  Seg1 Bot CLK
//     J1 pin 4 = GP13  Seg2 Bot DATA  → BLUE
//     J1 pin 5 = GP15  Seg2 Bot CLK
//
// SK9822 is non-volatile — once a frame is clocked in the strip
// holds the value indefinitely. Single write at boot, then idle.

#include "pico/stdlib.h"
#include "hardware/gpio.h"
#include <stdint.h>

#define BRIGHTNESS      5     // 0-31 (5/31 ≈ 16%)
#define PIXELS_PER_SEG  36

// ─── Bit-bang SPI (mode 0: CPOL=0, CPHA=0, MSB first) ────────────────────────

static inline void spi_write(uint data_pin, uint clk_pin, uint8_t b) {
    for (int i = 7; i >= 0; i--) {
        gpio_put(data_pin, (b >> i) & 1);
        gpio_put(clk_pin, 1);
        __asm volatile("nop\nnop\nnop\nnop");
        gpio_put(clk_pin, 0);
        __asm volatile("nop\nnop\nnop\nnop");
    }
}

// ─── SK9822 segment writer ───────────────────────────────────────────────────

static void write_segment(uint data_pin, uint clk_pin,
                          uint8_t r, uint8_t g, uint8_t b,
                          int n_pixels) {
    // Start frame: 4 bytes of 0x00
    for (int i = 0; i < 4; i++) spi_write(data_pin, clk_pin, 0x00);

    // Pixel data — same color for all n_pixels
    for (int i = 0; i < n_pixels; i++) {
        spi_write(data_pin, clk_pin, 0xE0 | (BRIGHTNESS & 0x1F));
        spi_write(data_pin, clk_pin, b);   // SK9822 byte order: B, G, R
        spi_write(data_pin, clk_pin, g);
        spi_write(data_pin, clk_pin, r);
    }

    // End frame: 4 bytes of 0xFF (sufficient for ≤64 pixels per chain)
    for (int i = 0; i < 4; i++) spi_write(data_pin, clk_pin, 0xFF);
}

// ─── GPIO setup ──────────────────────────────────────────────────────────────

static void init_pin_out_low(uint pin) {
    gpio_init(pin);
    gpio_set_dir(pin, GPIO_OUT);
    gpio_put(pin, 0);
}

// ─── Main ────────────────────────────────────────────────────────────────────

int main(void) {
    // Init all 8 segment GPIOs as outputs, idle LOW
    init_pin_out_low(2);   // Seg1 Top DATA
    init_pin_out_low(3);   // Seg1 Top CLK
    init_pin_out_low(5);   // Seg2 Top DATA
    init_pin_out_low(4);   // Seg2 Top CLK
    init_pin_out_low(12);  // Seg1 Bot DATA
    init_pin_out_low(11);  // Seg1 Bot CLK   (J1 pin 3)
    init_pin_out_low(13);  // Seg2 Bot DATA  (J1 pin 4)
    init_pin_out_low(15);  // Seg2 Bot CLK   (J1 pin 5)

    // Brief settle so power rails stabilise before the first SPI edge
    sleep_ms(100);

    // Write each segment once — colors persist in the strip
    write_segment( 2,  3, 255,   0,   0, PIXELS_PER_SEG);  // Seg1 Top  RED
    write_segment( 5,  4,   0, 255,   0, PIXELS_PER_SEG);  // Seg2 Top  GREEN
    write_segment(12, 11, 255, 255,   0, PIXELS_PER_SEG);  // Seg1 Bot  YELLOW
    write_segment(13, 15,   0,   0, 255, PIXELS_PER_SEG);  // Seg2 Bot  BLUE

    while (true) tight_loop_contents();
}
