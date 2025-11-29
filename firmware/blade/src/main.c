#include "pico/stdlib.h"
#include "common/proto.h"
#include "common/flash_if.h"
#include <stdio.h>

int main() {
    proto_init();
    flash_init();
    
    uint32_t jedec_id;
    flash_read_jedec_id(&jedec_id);
    printf("SYNC Blade Controller\nJEDEC ID: 0x%06lX\n", jedec_id);

    while (true) {
        proto_task();
        tight_loop_contents();
    }
}
