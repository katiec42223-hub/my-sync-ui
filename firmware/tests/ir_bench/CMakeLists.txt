add_executable(ir_bench_fw
  main.c
)
target_link_libraries(ir_bench_fw pico_stdlib hardware_pwm)
pico_enable_stdio_usb(ir_bench_fw 1)
pico_enable_stdio_uart(ir_bench_fw 0)
pico_add_extra_outputs(ir_bench_fw)
