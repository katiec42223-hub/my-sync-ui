// firmware/blade/include/app/sk9822_pio.h
#ifndef SK9822_PIO_H
#define SK9822_PIO_H

#include <stdint.h>
#include <stdbool.h>

// Initialise all 4 PIO state machines and DMA channels.
// Call once at boot before any write calls.
void sk9822_pio_init(void);

// Write one lane's pixel data and kick DMA (non-blocking).
// lane: 0=Seg1Top, 1=Seg2Top, 2=Seg1Bot, 3=Seg2Bot
// pixel_data: 36 pixels × 4 bytes [0xE0|bri, B, G, R]
void sk9822_pio_write_lane(int lane, const uint8_t *pixel_data);

// Write all 4 lanes from a full slice buffer (144 pixels × 4 bytes).
// Kicks all 4 DMA transfers simultaneously.
void sk9822_pio_write_slice(const uint8_t *slice_buf);

// Block until all 4 DMA transfers are complete.
void sk9822_pio_wait(void);

// Non-blocking check — true if all 4 lanes are idle.
bool sk9822_pio_done(void);

#endif
