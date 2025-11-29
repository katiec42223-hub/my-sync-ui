#ifndef SYNCHRON_PINS_H
#define SYNCHRON_PINS_H

// Blade LED segments (SK9822)
#define PIN_A1_DATA  2
#define PIN_A1_CLK   3
#define PIN_A2_DATA  4
#define PIN_A2_CLK   5
#define PIN_B1_DATA  12
#define PIN_B1_CLK   13
#define PIN_B2_DATA  11
#define PIN_B2_CLK   15

// External flash (SPI0)
#define PIN_FLASH_SCK  6
#define PIN_FLASH_MOSI 7
#define PIN_FLASH_MISO 8
#define PIN_FLASH_CS   9

// Index and start
#define PIN_IR_INDEX   14
#define PIN_XBUS_RX    28  // UART1 RX (inverted)

// Fuselage
#define PIN_WS2812_BODY 10
#define PIN_WS2812_TAIL 11
#define PIN_SMOKE_PWM   16

#endif
