#include "common/sk9822.h"

void sk9822_build_start_frame(uint8_t *buf) {
    buf[0] = buf[1] = buf[2] = buf[3] = 0x00;
}

void sk9822_build_pixel(uint8_t *buf, uint8_t brightness, uint8_t r, uint8_t g, uint8_t b) {
    buf[0] = 0xE0 | (brightness & 0x1F);
    buf[1] = b;
    buf[2] = g;
    buf[3] = r;
}

void sk9822_build_end_frame(uint8_t *buf, uint16_t pixel_count) {
    uint16_t end_bytes = (pixel_count + 15) / 16;
    for (uint16_t i = 0; i < end_bytes; i++) {
        buf[i] = 0xFF;
    }
}
