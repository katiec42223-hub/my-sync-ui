#include "common/slice.h"

void slice_scheduler_init(void) {}

uint16_t slice_from_angle(uint16_t theta_deg) {
    return theta_deg / SLICE_DEGREES;
}

bool slice_ready(uint32_t t_ms, uint16_t theta_deg, uint16_t *slice_out) {
    // TODO: implement slice boundary detection
    *slice_out = slice_from_angle(theta_deg);
    return true;
}
