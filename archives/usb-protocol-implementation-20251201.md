
# USB Protocol Implementation - Completed

**Date:** November 30, 2025  
**Status:** ✅ Working  
**Branch:** feat/songlist-editor

## Summary
Implemented USB CDC protocol for Pico RP2040 firmware with framed commands matching Rust backend. Successfully tested all protocol commands (HELLO, ERASE, WRITE, VERIFY, START).

## Architecture

### Protocol Specification
- **Frame Format:** `[0xAA 0x55 VERSION CMD LEN_HI LEN_LO PAYLOAD CRC_HI CRC_LO]`
- **Magic Bytes:** 0xAA 0x55
- **Version:** 0x01
- **CRC:** CRC-16/CCITT (polynomial 0x1021, init 0xFFFF)

### Command IDs
- `0x01` HELLO → response: `{"target":"blade","fw":"0.1.0","proto":1}`
- `0x10` ERASE → response: OK (0x80)
- `0x11` WRITE [offset:u32, data...] → response: OK (0x80)
- `0x12` VERIFY → response: Verify (0x83) [crc16:u16]
- `0x13` SET_META
- `0x14` START → response: OK (0x80)
- `0x21` LIVE_FRAME

### Response IDs
- `0x80` OK
- `0x81` ERR
- `0x82` Hello
- `0x83` Verify

## Files Modified

### Rust Backend (`src-tauri/`)
- **src/protocol.rs** - Protocol constants, Frame struct, CRC-16 implementation, typed responses
- **src/main.rs** - Tauri commands: `send_hello`, `send_erase`, `send_write`, `send_verify`, `send_start`, `get_connection_status`

### TypeScript Frontend (`src/`)
- **components/ShowProgrammer.tsx** - USB Protocol Test Panel with command buttons

### Firmware (`firmware/`)
- **common/include/common/proto.h** - Protocol constants and command enum (fixed START = 0x14)
- **common/include/common/slice.h** - Added `#include <stdbool.h>`
- **common/src/proto/proto.c** - Complete protocol handler with frame parsing, CRC validation, command dispatch
- **common/third_party/crc16_ccitt.c** - CRC-16/CCITT implementation

## Build Process

### Environment Setup
```bash
# ARM toolchain
curl -L -O "https://developer.arm.com/-/media/Files/downloads/gnu/13.2.rel1/binrel/arm-gnu-toolchain-13.2.rel1-darwin-arm64-arm-none-eabi.tar.xz"
tar -xf arm-gnu-toolchain-13.2.rel1-darwin-arm64-arm-none-eabi.tar.xz
sudo mv arm-gnu-toolchain-13.2.rel1-darwin-arm64-arm-none-eabi /usr/local/
export PATH="/usr/local/arm-gnu-toolchain-13.2.rel1-darwin-arm64-arm-none-eabi/bin:$PATH"

# Pico SDK
git clone https://github.com/raspberrypi/pico-sdk.git ~/pico-sdk
cd ~/pico-sdk && git submodule update --init
export PICO_SDK_PATH=~/pico-sdk
