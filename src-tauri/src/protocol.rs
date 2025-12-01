use serde::{Deserialize, Serialize};
use std::io::Read;

// Protocol constants
pub const PROTO_MAGIC0: u8 = 0xAA;
pub const PROTO_MAGIC1: u8 = 0x55;
pub const PROTO_VERSION: u8 = 0x01;

// Command IDs (host → device)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[repr(u8)]
pub enum CommandId {
    Hello = 0x01,
    Erase = 0x10,
    Write = 0x11,
    Verify = 0x12,
    SetMeta = 0x13,
    Start = 0x14,
    LiveFrame = 0x21,
}

// Response IDs (device → host)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[repr(u8)]
pub enum ResponseId {
    Ok = 0x80,
    Err = 0x81,
    Hello = 0x82,
    Verify = 0x83,
}

impl TryFrom<u8> for ResponseId {
    type Error = String;
    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0x80 => Ok(ResponseId::Ok),
            0x81 => Ok(ResponseId::Err),
            0x82 => Ok(ResponseId::Hello),
            0x83 => Ok(ResponseId::Verify),
            _ => Err(format!("unknown response: 0x{:02X}", value)),
        }
    }
}

// Frame structure
#[derive(Debug, Clone)]
pub struct Frame {
    pub cmd: u8,
    pub payload: Vec<u8>,
}

impl Frame {
    pub fn new(cmd: CommandId, payload: Vec<u8>) -> Self {
        Self {
            cmd: cmd as u8,
            payload,
        }
    }

    /// Serialize to wire format: [MAGIC0 MAGIC1 VERSION CMD LEN_HI LEN_LO PAYLOAD CRC_HI CRC_LO]
    pub fn to_bytes(&self) -> Vec<u8> {
        let len = self.payload.len() as u16;
        let mut buf = Vec::with_capacity(6 + self.payload.len() + 2);

        buf.push(PROTO_MAGIC0);
        buf.push(PROTO_MAGIC1);
        buf.push(PROTO_VERSION);
        buf.push(self.cmd);
        buf.push((len >> 8) as u8);
        buf.push((len & 0xFF) as u8);
        buf.extend_from_slice(&self.payload);

        // CRC over [VERSION CMD LEN_HI LEN_LO PAYLOAD]
        let crc = crc16_ccitt(&buf[2..]);
        buf.push((crc >> 8) as u8);
        buf.push((crc & 0xFF) as u8);

        buf
    }

    /// Parse from wire format (blocking read)
    pub fn from_reader(reader: &mut dyn Read) -> Result<Self, String> {
        // Read header: MAGIC0 MAGIC1 VERSION CMD LEN_HI LEN_LO
        let mut hdr = [0u8; 6];
        reader
            .read_exact(&mut hdr)
            .map_err(|e| format!("header read: {e}"))?;

        if hdr[0] != PROTO_MAGIC0 || hdr[1] != PROTO_MAGIC1 {
            return Err(format!("bad magic: {:02X} {:02X}", hdr[0], hdr[1]));
        }

        if hdr[2] != PROTO_VERSION {
            return Err(format!("bad version: 0x{:02X}", hdr[2]));
        }

        let cmd = hdr[3];
        let len = ((hdr[4] as u16) << 8) | (hdr[5] as u16);

        // Read payload
        let mut payload = vec![0u8; len as usize];
        reader
            .read_exact(&mut payload)
            .map_err(|e| format!("payload read: {e}"))?;

        // Read CRC
        let mut crc_buf = [0u8; 2];
        reader
            .read_exact(&mut crc_buf)
            .map_err(|e| format!("crc read: {e}"))?;
        let rx_crc = ((crc_buf[0] as u16) << 8) | (crc_buf[1] as u16);

        // Verify CRC over [VERSION CMD LEN_HI LEN_LO PAYLOAD]
        let mut check_buf = Vec::with_capacity(4 + len as usize);
        check_buf.extend_from_slice(&hdr[2..6]);
        check_buf.extend_from_slice(&payload);
        let calc_crc = crc16_ccitt(&check_buf);

        if rx_crc != calc_crc {
            return Err(format!(
                "crc mismatch: got 0x{:04X}, expected 0x{:04X}",
                rx_crc, calc_crc
            ));
        }

        Ok(Self { cmd, payload })
    }
}

// CRC-16/CCITT (poly 0x1021, init 0xFFFF)
fn crc16_ccitt(data: &[u8]) -> u16 {
    let mut crc = 0xFFFFu16;
    for &byte in data {
        crc ^= (byte as u16) << 8;
        for _ in 0..8 {
            if (crc & 0x8000) != 0 {
                crc = (crc << 1) ^ 0x1021;
            } else {
                crc <<= 1;
            }
        }
    }
    crc
}

// Typed responses
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HelloResponse {
    pub target: String, // "blade" | "fuselage"
    pub fw: String,
    pub proto: u8,
}

impl HelloResponse {
    pub fn from_payload(payload: &[u8]) -> Result<Self, String> {
        serde_json::from_slice(payload).map_err(|e| format!("parse hello: {e}"))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerifyResponse {
    pub crc: u16,
}

impl VerifyResponse {
    pub fn from_payload(payload: &[u8]) -> Result<Self, String> {
        if payload.len() != 2 {
            return Err("verify response must be 2 bytes".into());
        }
        let crc = ((payload[0] as u16) << 8) | (payload[1] as u16);
        Ok(Self { crc })
    }
}