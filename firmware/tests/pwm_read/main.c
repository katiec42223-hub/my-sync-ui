// firmware/tests/pwm_read/main.c
// Simple PWM pulse width reader on GP28.
// Prints measured pulse width every 500ms so you can see
// live values as you move a transmitter switch or stick.

#include "pico/stdlib.h"
#include "hardware/gpio.h"
#include <stdio.h>

#define PIN_PWM_IN  28

static volatile uint32_t pulse_us     = 0;
static volatile uint32_t last_rise_us = 0;
static volatile uint32_t pulse_count  = 0;

static void pwm_isr(uint gpio, uint32_t events) {
    uint32_t now = time_us_32();
    if (events & GPIO_IRQ_EDGE_RISE) {
        last_rise_us = now;
    } else if (events & GPIO_IRQ_EDGE_FALL) {
        uint32_t width = now - last_rise_us;
        if (width >= 500 && width <= 3000) {
            pulse_us = width;
            pulse_count++;
        }
    }
}

int main(void) {
    stdio_init_all();
    sleep_ms(2000);

    printf("=== PWM Reader GP%d ===\n\n", PIN_PWM_IN);
    printf("Watching for PWM pulses — move a switch or stick\n\n");

    gpio_init(PIN_PWM_IN);
    gpio_set_dir(PIN_PWM_IN, GPIO_IN);
    gpio_pull_up(PIN_PWM_IN);
    gpio_set_irq_enabled_with_callback(PIN_PWM_IN,
        GPIO_IRQ_EDGE_RISE | GPIO_IRQ_EDGE_FALL, true, pwm_isr);

    uint32_t last_count = 0;

    while (true) {
        sleep_ms(500);
        uint32_t pw  = pulse_us;
        uint32_t cnt = pulse_count;

        if (cnt == 0) {
            printf("NO SIGNAL on GP28 — check wiring\n");
        } else if (cnt == last_count) {
            printf("SIGNAL LOST  (last good pulse: %luus)\n",
                   (unsigned long)pw);
        } else {
            const char *label;
            if      (pw < 1100) label = "LOW  -> show STOP";
            else if (pw > 1700) label = "HIGH -> show START";
            else                label = "MID  (between thresholds)";
            printf("%4luus  %s  [%lu total pulses]\n",
                   (unsigned long)pw, label, (unsigned long)cnt);
        }
        last_count = cnt;
    }
}
