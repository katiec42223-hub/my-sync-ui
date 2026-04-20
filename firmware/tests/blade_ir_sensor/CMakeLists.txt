add_executable(blade_ir_sensor_fw main.c)
target_link_libraries(blade_ir_sensor_fw
    pico_stdlib hardware_gpio)
pico_enable_stdio_usb(blade_ir_sensor_fw 1)
pico_enable_stdio_uart(blade_ir_sensor_fw 0)
pico_add_extra_outputs(blade_ir_sensor_fw)
