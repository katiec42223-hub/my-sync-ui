#include "common/flash_if.h"
#include "hardware/spi.h"
#include "common/pins.h"

bool flash_init(void) {
    // TODO: init SPI0, configure CS
    return true;
}

bool flash_read_jedec_id(uint32_t *id) {
    // TODO: send 0x9F command, read 3 bytes
    *id = 0x012018; // S25FL256S placeholder
    return true;
}

bool flash_erase_sector(uint32_t addr) {
    // TODO: WREN + 0x20 sector erase
    return true;
}

bool flash_write_page(uint32_t addr, const uint8_t *data, uint16_t len) {
    // TODO: WREN + 0x02 page program
    return true;
}

bool flash_read(uint32_t addr, uint8_t *data, uint32_t len) {
    // TODO: 0x03 read command
    return true;
}
