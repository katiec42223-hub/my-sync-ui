// firmware/blade/include/app/player.h
#ifndef PLAYER_H
#define PLAYER_H

#include <stdint.h>
#include <stdbool.h>

// Initialise GPIO, IR interrupt, DMA channels
void player_init(void);

// Load show from flash into SRAM event table + prefetch first pattern
// Returns false if flash read fails or no valid show file found
bool player_load_show(void);

// Start show playback from given t0_ms (shared timestamp from XBUS START)
void player_start(uint32_t t0_ms);

// Stop playback, hold last frame
void player_stop(void);

// Main playback loop — call from Core 0, never returns
void player_run(void);

#endif
