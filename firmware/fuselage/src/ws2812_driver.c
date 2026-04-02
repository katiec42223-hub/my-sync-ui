// firmware/fuselage/src/ws2812_driver.c
// WS2812B driver for fuselage controller
//
// Blocking bit-bang implementation. Each bit requires precise timing:
//   T0H = 400ns, T0L = 850ns  (send 0)
//   T1H = 800ns, T1L = 450ns  (send 1)
// At 125MHz sys_clk, 1 cycle = 8ns.
// This is a fallback — replace with PIO when available.

#include "ws2812_driver.h"
#include "pico/stdlib.h"
#include "hardware/gpio.h"
#include "hardware/sync.h"
#include <stdio.h>

// Zone GPIOs (from HW_PINS_FUSELAGE.md)
static const uint8_t zone_gpios[] = {2, 3, 4, 5};
#define NUM_ZONES (sizeof(zone_gpios) / sizeof(zone_gpios[0]))

void ws2812_init_all(void) {
    for (uint32_t i = 0; i < NUM_ZONES; i++) {
        gpio_init(zone_gpios[i]);
        gpio_set_dir(zone_gpios[i], GPIO_OUT);
        gpio_put(zone_gpios[i], 0);
    }
    printf("[ws2812] init GPIOs 2-5 (bit-bang mode)\n");
}

// Blocking bit-bang send. Interrupts are disabled during transmission
// to maintain WS2812B timing requirements.
void ws2812_send(uint8_t gpio, uint8_t *grb_buf, uint32_t count) {
    if (count == 0) return;

    uint32_t total_bytes = count * 3;
    uint32_t irq_state = save_and_disable_interrupts();

    for (uint32_t i = 0; i < total_bytes; i++) {
        uint8_t byte = grb_buf[i];
        for (int8_t bit = 7; bit >= 0; bit--) {
            if (byte & (1u << bit)) {
                // Send 1: high ~800ns, low ~450ns
                gpio_put(gpio, 1);
                // ~100 cycles = 800ns at 125MHz
                __asm volatile (
                    "nop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\n"
                    "nop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\n"
                    "nop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\n"
                    "nop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\n"
                    "nop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\n"
                    "nop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\n"
                    "nop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\n"
                    "nop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\n"
                    "nop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\n"
                    "nop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\n"
                );
                gpio_put(gpio, 0);
                // ~56 cycles = 450ns
                __asm volatile (
                    "nop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\n"
                    "nop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\n"
                    "nop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\n"
                    "nop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\n"
                    "nop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\n"
                    "nop\nnop\nnop\nnop\nnop\nnop\n"
                );
            } else {
                // Send 0: high ~400ns, low ~850ns
                gpio_put(gpio, 1);
                // ~50 cycles = 400ns
                __asm volatile (
                    "nop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\n"
                    "nop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\n"
                    "nop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\n"
                    "nop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\n"
                    "nop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\n"
                );
                gpio_put(gpio, 0);
                // ~106 cycles = 850ns
                __asm volatile (
                    "nop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\n"
                    "nop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\n"
                    "nop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\n"
                    "nop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\n"
                    "nop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\n"
                    "nop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\n"
                    "nop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\n"
                    "nop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\n"
                    "nop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\n"
                    "nop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\nnop\n"
                    "nop\nnop\nnop\nnop\nnop\nnop\n"
                );
            }
        }
    }

    restore_interrupts(irq_state);

    // Reset: hold low for >50µs (WS2812B latch)
    sleep_us(60);
}
