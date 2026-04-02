// firmware/tests/segment_test/main.c
// SYNCHRON — SK9822 Segment Wiring Test
//
// Standalone diagnostic: cycles through each segment and pixel
// individually so you can visually confirm wiring matches the
// expected GPIO assignments from HW_PINS_BLADE.md.
//
// Uses bit-bang SPI as fallback (no PIO program dependency).

#include "pico/stdlib.h"
#include "hardware/gpio.h"
#include <stdio.h>
#include <string.h>

// ─── GPIO pairs from HW_PINS_BLADE.md ────────────────────────────────────────

#define PIXELS_PER_SEGMENT 36

typedef struct {
    uint8_t data_gpio;
    uint8_t clk_gpio;
    const char *name;
} Segment;

static const Segment segments[4] = {
    { 2,  3, "SEG1-TOP" },   // Lane 0: GP2 data, GP3 clk
    { 4,  5, "SEG2-TOP" },   // Lane 1: GP4 data, GP5 clk
    { 12, 13, "SEG1-BOT" },  // Lane 2: GP12 data, GP13 clk
    { 11, 15, "SEG2-BOT" },  // Lane 3: GP11 data, GP15 clk
};

// ─── Bit-bang SPI for SK9822 ─────────────────────────────────────────────────
// SK9822 protocol: MSB first, data sampled on rising clock edge.
// Start frame: 4 bytes of 0x00
// Pixel frame: [0xE0 | brightness(5bit)] [B] [G] [R]
// End frame:   ceil(N/16) bytes of 0xFF

static void spi_init_all(void) {
    for (int i = 0; i < 4; i++) {
        gpio_init(segments[i].data_gpio);
        gpio_set_dir(segments[i].data_gpio, GPIO_OUT);
        gpio_put(segments[i].data_gpio, 0);

        gpio_init(segments[i].clk_gpio);
        gpio_set_dir(segments[i].clk_gpio, GPIO_OUT);
        gpio_put(segments[i].clk_gpio, 0);
    }
}

static inline void spi_write_byte(uint8_t data_pin, uint8_t clk_pin, uint8_t byte) {
    for (int bit = 7; bit >= 0; bit--) {
        gpio_put(data_pin, (byte >> bit) & 1);
        // ~200ns half-period at 125MHz — well within SK9822 spec (max 30MHz SPI)
        __asm volatile("nop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\n");
        gpio_put(clk_pin, 1);
        __asm volatile("nop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\n");
        gpio_put(clk_pin, 0);
    }
}

// Send a full frame to one segment
// pixels: array of PIXELS_PER_SEGMENT entries, each 4 bytes [0xE0|bri, B, G, R]
static void seg_send(const Segment *seg, const uint8_t *pixels) {
    uint8_t dp = seg->data_gpio;
    uint8_t cp = seg->clk_gpio;

    // Start frame: 4 bytes of 0x00
    for (int i = 0; i < 4; i++) spi_write_byte(dp, cp, 0x00);

    // Pixel data
    for (int px = 0; px < PIXELS_PER_SEGMENT; px++) {
        const uint8_t *p = pixels + px * 4;
        spi_write_byte(dp, cp, p[0]);  // 0xE0 | brightness
        spi_write_byte(dp, cp, p[1]);  // B
        spi_write_byte(dp, cp, p[2]);  // G
        spi_write_byte(dp, cp, p[3]);  // R
    }

    // End frame: ceil(36/16) = 3 bytes of 0xFF
    for (int i = 0; i < 3; i++) spi_write_byte(dp, cp, 0xFF);
}

// ─── Pixel buffer helpers ────────────────────────────────────────────────────

// 4 segments x 36 pixels x 4 bytes = 576 bytes
static uint8_t framebuf[4][PIXELS_PER_SEGMENT * 4];

static void clear_all(void) {
    memset(framebuf, 0, sizeof(framebuf));
    // Set brightness byte to 0xE0 (bri=0 = off but valid frame)
    for (int s = 0; s < 4; s++) {
        for (int px = 0; px < PIXELS_PER_SEGMENT; px++) {
            framebuf[s][px * 4] = 0xE0;
        }
    }
}

static void set_pixel(int seg, int px, uint8_t r, uint8_t g, uint8_t b, uint8_t bri) {
    uint8_t *p = framebuf[seg] + px * 4;
    p[0] = 0xE0 | (bri & 0x1F);
    p[1] = b;
    p[2] = g;
    p[3] = r;
}

static void set_segment_all(int seg, uint8_t r, uint8_t g, uint8_t b, uint8_t bri) {
    for (int px = 0; px < PIXELS_PER_SEGMENT; px++) {
        set_pixel(seg, px, r, g, b, bri);
    }
}

static void flush(void) {
    for (int s = 0; s < 4; s++) {
        seg_send(&segments[s], framebuf[s]);
    }
}

// ─── Main ────────────────────────────────────────────────────────────────────

int main() {
    stdio_init_all();
    sleep_ms(1000); // let USB CDC settle

    printf("\n");
    printf("==========================================\n");
    printf("  SYNCHRON Segment Wiring Test\n");
    printf("==========================================\n");
    printf("Expected layout:\n");
    printf("  Seg1-Top (GP2/3):   px 0-35,  TOP blade\n");
    printf("  Seg2-Top (GP4/5):   px 36-71, TOP blade\n");
    printf("  Seg1-Bot (GP12/13): px 0-35,  BOT blade\n");
    printf("  Seg2-Bot (GP11/15): px 36-71, BOT blade\n");
    printf("Watch physical blade and confirm colors match above.\n");
    printf("==========================================\n\n");

    spi_init_all();
    clear_all();
    flush();

    while (true) {
        // ── PHASE 1: Segment identification ──────────────────────────

        // Seg1-Top = RED
        clear_all();
        set_segment_all(0, 255, 0, 0, 8);
        flush();
        printf("SEG1-TOP RED\n");
        sleep_ms(2000);

        // Seg2-Top = GREEN
        clear_all();
        set_segment_all(1, 0, 255, 0, 8);
        flush();
        printf("SEG2-TOP GREEN\n");
        sleep_ms(2000);

        // Seg1-Bot = BLUE
        clear_all();
        set_segment_all(2, 0, 0, 255, 8);
        flush();
        printf("SEG1-BOT BLUE\n");
        sleep_ms(2000);

        // Seg2-Bot = WHITE
        clear_all();
        set_segment_all(3, 255, 255, 255, 8);
        flush();
        printf("SEG2-BOT WHITE\n");
        sleep_ms(2000);

        // All off pause
        clear_all();
        flush();
        sleep_ms(500);

        // ── PHASE 2: Pixel sweep ────────────────────────────────────

        for (int s = 0; s < 4; s++) {
            for (int px = 0; px < PIXELS_PER_SEGMENT; px++) {
                clear_all();
                set_pixel(s, px, 255, 255, 0, 8);  // YELLOW
                flush();
                printf("SEG[%d] PX[%d]\n", s + 1, px);
                sleep_ms(100);
            }
        }

        // ── PHASE 3: All on white ───────────────────────────────────

        clear_all();
        for (int s = 0; s < 4; s++) {
            set_segment_all(s, 255, 255, 255, 8);
        }
        flush();
        printf("ALL ON — 144px\n");
        sleep_ms(1000);

        printf("\n--- Restarting test cycle ---\n\n");
    }
}
