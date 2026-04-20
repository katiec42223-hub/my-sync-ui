add_executable(ir_only_fw main.c)
pico_generate_pio_header(ir_only_fw
    ${CMAKE_CURRENT_LIST_DIR}/ir38k.pio)
target_include_directories(ir_only_fw PRIVATE
    ${CMAKE_CURRENT_BINARY_DIR})
target_link_libraries(ir_only_fw
    pico_stdlib hardware_pio hardware_clocks hardware_gpio)
pico_enable_stdio_usb(ir_only_fw 1)
pico_enable_stdio_uart(ir_only_fw 0)
pico_add_extra_outputs(ir_only_fw)
