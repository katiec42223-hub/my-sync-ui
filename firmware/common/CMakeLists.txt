add_library(synchron_common
  src/proto/proto.c
  src/flash/flash_if.c
  src/sk9822/frame.c
  src/slice/scheduler.c
  third_party/crc16_ccitt.c
)
target_include_directories(synchron_common PUBLIC ${CMAKE_CURRENT_LIST_DIR}/include)
target_link_libraries(synchron_common pico_stdlib hardware_spi hardware_pio hardware_dma)
