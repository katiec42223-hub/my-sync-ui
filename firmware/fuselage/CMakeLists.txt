add_executable(fuselage_fw
  src/main.c
)
target_include_directories(fuselage_fw PRIVATE ${CMAKE_CURRENT_LIST_DIR}/include)
target_link_libraries(fuselage_fw synchron_common pico_stdlib)
pico_enable_stdio_usb(fuselage_fw 1)
pico_enable_stdio_uart(fuselage_fw 0)
pico_add_extra_outputs(fuselage_fw)
