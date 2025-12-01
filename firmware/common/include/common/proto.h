#ifndef SYNCHRON_PROTO_H
#define SYNCHRON_PROTO_H

#include <stdint.h>

#define PROTO_SYNC0 0xAA
#define PROTO_SYNC1 0x55

typedef enum {
    CMD_HELLO = 0x01,
    CMD_ERASE = 0x10,
    CMD_WRITE = 0x11,
    CMD_VERIFY = 0x12,
    CMD_SET_META = 0x13,
    CMD_START = 0x14,
    CMD_LIVE_FRAME = 0x21
} proto_cmd_t;

void proto_init(void);
void proto_task(void);  // call in main loop
void proto_send_response(uint8_t cmd, const uint8_t *data, uint16_t len);

#endif
