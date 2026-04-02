// firmware/fuselage/include/app/ws2812_driver.h
#ifndef WS2812_DRIVER_H
#define WS2812_DRIVER_H

#include <stdint.h>

// Initialise PIO state machines for all WS2812B zone GPIOs (GP2-GP5)
void ws2812_init_all(void);

// Send GRB pixel data to a WS2812B strip on the specified GPIO
// grb_buf: packed GRB bytes (3 bytes per pixel)
// count: number of pixels
void ws2812_send(uint8_t gpio, uint8_t *grb_buf, uint32_t count);

#endif
