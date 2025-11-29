# USB CDC Protocol

## Frame Format
CRC-16/CCITT-X25 over cmd|len|payload.

## Commands
- `0x01` HELLO → response: JSON {"role","v","pixels","build"}
- `0x10` ERASE [start:u32, len:u32]
- `0x11` WRITE [offset:u32, data...]
- `0x12` VERIFY [start:u32, len:u32] → [crc32:u32]
- `0x13` SET_META [json...]
- `0x20` START [t0_ms:u32]
- `0x21` LIVE_FRAME [t_ms:u32, theta_deg:u16, mask:u8, frames...]
