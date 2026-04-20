add_executable(blade_sync_test_fw main.c)

pico_generate_pio_header(blade_sync_test_fw
    ${CMAKE_CURRENT_LIST_DIR}/../xbus_test/uart_rx.pio)

target_include_directories(blade_sync_test_fw PRIVATE
    ${CMAKE_CURRENT_LIST_DIR}/../../common/include
    ${CMAKE_CURRENT_BINARY_DIR}
)

target_link_libraries(blade_sync_test_fw
    pico_stdlib hardware_gpio hardware_pio
    hardware_clocks hardware_sync
)

pico_enable_stdio_usb(blade_sync_test_fw 1)
pico_enable_stdio_uart(blade_sync_test_fw 0)
pico_add_extra_outputs(blade_sync_test_fw)
