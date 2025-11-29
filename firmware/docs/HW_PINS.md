# Pin Map (RP2040)

## Blade Controller
- **LED Segments** (SK9822, DATA/CLK):
  - A1: GP2 / GP3
  - A2: GP4 / GP5
  - B1: GP12 / GP13
  - B2: GP11 / GP15
- **External Flash** (SPI0):
  - SCK: GP6, MOSI: GP7, MISO: GP8, CS: GP9
- **Index/Start**:
  - IR Index (TSSP770): GP14 (input, pull-up)
  - XBUS Start (UART1 RX inverted): GP28

## Fuselage Controller
- WS2812 strips: GP10, GP11 (body/tail)
- Smoke PWM: GP16 (RC servo signal)
- External Flash: same SPI0 pins
