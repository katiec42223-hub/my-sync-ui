#include "common/proto.h"
#include "pico/stdlib.h"
#include <stdio.h>

void proto_init(void) {
    stdio_init_all();
}

void proto_task(void) {
    // TODO: read USB CDC, parse frames, dispatch commands
}

void proto_send_response(uint8_t cmd, const uint8_t *data, uint16_t len) {
    // TODO: frame response with SYNC + CRC and write to stdout
    printf("Response to cmd 0x%02x\n", cmd);
}
