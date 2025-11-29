add_executable(blade_fw
  src/main.c
)
target_include_directories(blade_fw PRIVATE ${CMAKE_CURRENT_LIST_DIR}/include)
target_link_libraries(blade_fw synchron_common pico_stdlib hardware_pio hardware_dma hardware_spi)
pico_enable_stdio_usb(blade_fw 1)
pico_enable_stdio_uart(blade_fw 0)
pico_add_extra_outputs(blade_fw)
