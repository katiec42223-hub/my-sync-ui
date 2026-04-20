add_executable(xbus_test_fw src/main.c)
pico_generate_pio_header(xbus_test_fw
    ${CMAKE_CURRENT_LIST_DIR}/uart_rx.pio)
target_include_directories(xbus_test_fw PRIVATE
    ${CMAKE_CURRENT_LIST_DIR}/../../common/include
    ${CMAKE_CURRENT_BINARY_DIR})
target_link_libraries(xbus_test_fw
    pico_stdlib hardware_pio hardware_gpio hardware_clocks)
pico_enable_stdio_usb(xbus_test_fw 1)
pico_enable_stdio_uart(xbus_test_fw 0)
pico_add_extra_outputs(xbus_test_fw)
