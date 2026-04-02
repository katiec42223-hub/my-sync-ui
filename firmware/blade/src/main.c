// firmware/blade/src/main.c
#include "pico/stdlib.h"
#include "common/proto.h"
#include "common/flash_if.h"
#include "app/player.h"
#include <stdio.h>

int main() {
    stdio_init_all();
    flash_init();

    uint32_t jedec_id;
    flash_read_jedec_id(&jedec_id);
    printf("SYNC Blade Controller\nJEDEC ID: 0x%06lX\n", jedec_id);

    // Initialise player (GPIO, IR interrupt, buffers)
    player_init();

    // Try to load show from flash
    bool show_loaded = player_load_show();
    if (show_loaded) {
        printf("[main] show loaded OK\n");
    } else {
        printf("[main] no show in flash — waiting for USB upload\n");
    }

    // Handle USB protocol commands (HELLO/ERASE/WRITE/VERIFY/START)
    // START command calls player_start(t0_ms) and then player_run()
    // proto_task() returns false when START is received and player should run
    while (true) {
        bool keep_usb = proto_task();
        if (!keep_usb) {
            // START received — proto_task handled it and called player_start
            // Drop into the tight render loop (never returns)
            player_run();
        }
        tight_loop_contents();
    }
}
