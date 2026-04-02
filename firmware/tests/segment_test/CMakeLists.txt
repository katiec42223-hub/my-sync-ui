add_executable(segment_test_fw
  main.c
)
target_link_libraries(segment_test_fw pico_stdlib)
pico_enable_stdio_usb(segment_test_fw 1)
pico_enable_stdio_uart(segment_test_fw 0)
pico_add_extra_outputs(segment_test_fw)
