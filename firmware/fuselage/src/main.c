#include "pico/stdlib.h"
#include "common/proto.h"
#include <stdio.h>

int main() {
    proto_init();
    printf("SYNC Fuselage Controller\n");

    while (true) {
        proto_task();
        tight_loop_contents();
    }
}
