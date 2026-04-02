// firmware/fuselage/include/app/player.h
#ifndef FUSELAGE_PLAYER_H
#define FUSELAGE_PLAYER_H

#include <stdint.h>
#include <stdbool.h>

void player_init(void);
bool player_load_show(void);
void player_start(uint32_t t0_ms);
void player_stop(void);
void player_run(void);

#endif
