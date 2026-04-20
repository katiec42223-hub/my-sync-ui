add_executable(fuselage_hw_test_fw
    main.c
    ${CMAKE_CURRENT_LIST_DIR}/../../fuselage/src/ws2812_driver.c
)
target_include_directories(fuselage_hw_test_fw PRIVATE
    ${CMAKE_CURRENT_LIST_DIR}/../../fuselage/include/app
    ${CMAKE_CURRENT_LIST_DIR}/../../common/include
)
target_link_libraries(fuselage_hw_test_fw
    pico_stdlib hardware_gpio hardware_pwm hardware_clocks hardware_pio
)
pico_enable_stdio_usb(fuselage_hw_test_fw 0)
pico_enable_stdio_uart(fuselage_hw_test_fw 0)
pico_add_extra_outputs(fuselage_hw_test_fw)
