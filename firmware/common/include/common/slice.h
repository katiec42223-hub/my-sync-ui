#ifndef SYNCHRON_SLICE_H
#define SYNCHRON_SLICE_H

#include <stdint.h>
#include <stdbool.h>  // ADD THIS LINE

#define SLICE_DEGREES 3
#define SLICES_PER_REV (360 / SLICE_DEGREES)

uint16_t slice_from_angle(uint16_t theta_deg);
void slice_scheduler_init(void);
bool slice_ready(uint32_t t_ms, uint16_t theta_deg, uint16_t *slice_out);

#endif
