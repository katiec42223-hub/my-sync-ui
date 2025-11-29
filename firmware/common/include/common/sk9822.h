#ifndef SYNCHRON_SK9822_H
#define SYNCHRON_SK9822_H

#include <stdint.h>

void sk9822_build_start_frame(uint8_t *buf);
void sk9822_build_pixel(uint8_t *buf, uint8_t brightness, uint8_t r, uint8_t g, uint8_t b);
void sk9822_build_end_frame(uint8_t *buf, uint16_t pixel_count);

#endif
