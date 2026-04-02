// firmware/fuselage/src/main.c
#include "pico/stdlib.h"
#include "common/proto.h"
#include "common/flash_if.h"
#include "app/player.h"
#include <stdio.h>

int main() {
    proto_init();
    flash_init();

    printf("SYNC Fuselage Controller\n");

    // Initialise player (GPIO, IR LED, servo, WS2812B zones)
    player_init();

    // Try to load show from flash
    bool show_loaded = player_load_show();
    if (show_loaded) {
        printf("[main] show loaded OK\n");
    } else {
        printf("[main] no show in flash — waiting for USB upload\n");
    }

    // Handle USB protocol commands (HELLO/ERASE/WRITE/VERIFY/START)
    // proto_task() returns false when START is received
    while (true) {
        bool keep_usb = proto_task();
        if (!keep_usb) {
            // START received — drop into the player loop (never returns)
            player_start(0);
            player_run();
        }
        tight_loop_contents();
    }
}
