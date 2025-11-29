#ifndef SYNCHRON_FLASH_IF_H
#define SYNCHRON_FLASH_IF_H

#include <stdint.h>
#include <stdbool.h>

bool flash_init(void);
bool flash_read_jedec_id(uint32_t *id);
bool flash_erase_sector(uint32_t addr);
bool flash_write_page(uint32_t addr, const uint8_t *data, uint16_t len);
bool flash_read(uint32_t addr, uint8_t *data, uint32_t len);

#endif
