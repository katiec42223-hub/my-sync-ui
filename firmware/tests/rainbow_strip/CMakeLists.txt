add_executable(rainbow_strip_fw main.c)
target_link_libraries(rainbow_strip_fw pico_stdlib hardware_gpio)

# Headless: no USB, no UART. Boots straight into the rainbow loop
# the instant the BEC supplies power.
pico_enable_stdio_usb(rainbow_strip_fw 0)
pico_enable_stdio_uart(rainbow_strip_fw 0)
pico_add_extra_outputs(rainbow_strip_fw)
