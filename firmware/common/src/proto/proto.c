// firmware/common/src/proto/proto.c
#include "common/proto.h"
#include "pico/stdlib.h"
#include <stdio.h>
#include <string.h>

extern uint16_t crc16_ccitt(const uint8_t *data, size_t len);  // from third_party/

static uint8_t rx_buf[512];
static uint16_t rx_pos = 0;

void proto_init(void) {
    stdio_init_all();
}

static void send_frame(uint8_t cmd, const uint8_t *payload, uint16_t len) {
    uint8_t frame[512];
    frame[0] = PROTO_SYNC0;  // 0xAA
    frame[1] = PROTO_SYNC1;  // 0x55
    frame[2] = 0x01;         // VERSION
    frame[3] = cmd;
    frame[4] = (len >> 8) & 0xFF;  // LEN_HI
    frame[5] = len & 0xFF;          // LEN_LO
    
    if (len > 0) {
        memcpy(&frame[6], payload, len);
    }
    
    // CRC over VERSION + CMD + LEN + PAYLOAD
    uint16_t crc = crc16_ccitt(&frame[2], 4 + len);
    frame[6 + len] = (crc >> 8) & 0xFF;  // CRC_HI
    frame[6 + len + 1] = crc & 0xFF;      // CRC_LO
    
    fwrite(frame, 1, 8 + len, stdout);
    fflush(stdout);
}

void proto_task(void) {
    int c = getchar_timeout_us(0);
    if (c == PICO_ERROR_TIMEOUT) return;
    
    rx_buf[rx_pos++] = (uint8_t)c;
    if (rx_pos < 6) return;  // need at least header
    
    // Check magic
    if (rx_buf[0] != PROTO_SYNC0 || rx_buf[1] != PROTO_SYNC1) {
        rx_pos = 0;
        return;
    }
    
    uint16_t payload_len = (rx_buf[4] << 8) | rx_buf[5];
    uint16_t frame_len = 8 + payload_len;
    
    if (rx_pos < frame_len) return;  // still receiving
    
    // Verify CRC
    uint16_t expected_crc = crc16_ccitt(&rx_buf[2], 4 + payload_len);
    uint16_t received_crc = (rx_buf[6 + payload_len] << 8) | rx_buf[7 + payload_len];
    
    if (expected_crc != received_crc) {
        rx_pos = 0;
        return;
    }
    
    uint8_t cmd = rx_buf[3];
    uint8_t *payload = &rx_buf[6];
    
    // Dispatch command
    switch (cmd) {
        case CMD_HELLO: {
            const char *resp = "{\"target\":\"blade\",\"fw\":\"0.1.0\",\"proto\":1}";
            send_frame(0x82, (const uint8_t *)resp, strlen(resp));
            break;
        }
        case CMD_ERASE:
            send_frame(0x80, NULL, 0);  // OK
            break;
        case CMD_WRITE:
            send_frame(0x80, NULL, 0);  // OK
            break;
        case CMD_VERIFY: {
            uint8_t verify_resp[2] = {0x12, 0x34};  // dummy CRC16
            send_frame(0x83, verify_resp, 2);
            break;
        }
        case CMD_START:
            send_frame(0x80, NULL, 0);  // OK
            break;
        default:
            send_frame(0x81, NULL, 0);  // ERR
            break;
    }
    
    rx_pos = 0;
}

void proto_send_response(uint8_t cmd, const uint8_t *data, uint16_t len) {
    send_frame(cmd, data, len);
}