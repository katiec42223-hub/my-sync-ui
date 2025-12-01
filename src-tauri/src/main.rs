use std::sync::{Arc, Mutex};
use tauri::{self, Manager, State};
use serialport::{SerialPort, SerialPortType};
mod protocol;
use protocol::{CommandId, Frame, HelloResponse, ResponseId, VerifyResponse};

struct SerialState {
  port: Option<Box<dyn SerialPort>>,
  name: Option<String>,
}

type Shared = Arc<Mutex<SerialState>>;

#[tauri::command]
fn list_ports() -> Vec<String> {
  serialport::available_ports()
    .map(|v| {
      v.into_iter()
        .map(|p| match p.port_type {
          SerialPortType::UsbPort(_) => p.port_name, // already descriptive on macOS
          _ => p.port_name,
        })
        .collect()
    })
    .unwrap_or_default()
}

#[tauri::command]
fn connect(state: State<Shared>, port: String, baud: u32) -> Result<(), String> {
  let sp = serialport::new(&port, baud)
    .timeout(std::time::Duration::from_millis(500))
    .open()
    .map_err(|e| format!("open failed: {e}"))?;
  let mut s = state.lock().map_err(|_| "lock failed")?;
  s.port = Some(sp);
  s.name = Some(port);
  Ok(())
}

#[tauri::command]
fn disconnect(state: State<Shared>) -> Result<(), String> {
  let mut s = state.lock().map_err(|_| "lock failed")?;
  s.port = None;
  s.name = None;
  Ok(())
}

#[tauri::command]
fn hello(state: State<Shared>) -> Result<String, String> {
  let s = state.lock().map_err(|_| "lock failed")?;
  if s.port.is_none() { return Err("not connected".into()); }
  // Later: send a framed HELLO to device; for now return a stub JSON
  Ok(r#"{"fw":"dev","role":"unknown"}"#.to_string())
}

#[tauri::command]
fn send_hello(state: State<Shared>) -> Result<HelloResponse, String> {
  let mut s = state.lock().map_err(|_| "lock failed")?;
  let port = s.port.as_mut().ok_or("not connected")?;

  let frame = Frame::new(CommandId::Hello, vec![]);
  let bytes = frame.to_bytes();
  port.write_all(&bytes).map_err(|e| format!("write: {e}"))?;
  port.flush().map_err(|e| format!("flush: {e}"))?;

  let resp = Frame::from_reader(port.as_mut())?;
  let resp_id = ResponseId::try_from(resp.cmd)?;
  
  if resp_id != ResponseId::Hello {
    return Err(format!("expected Hello response, got {:?}", resp_id));
  }

  HelloResponse::from_payload(&resp.payload)
}

#[tauri::command]
fn send_erase(state: State<Shared>) -> Result<(), String> {
  let mut s = state.lock().map_err(|_| "lock failed")?;
  let port = s.port.as_mut().ok_or("not connected")?;

  let frame = Frame::new(CommandId::Erase, vec![]);
  let bytes = frame.to_bytes();
  port.write_all(&bytes).map_err(|e| format!("write: {e}"))?;
  port.flush().map_err(|e| format!("flush: {e}"))?;

  let resp = Frame::from_reader(port.as_mut())?;
  let resp_id = ResponseId::try_from(resp.cmd)?;
  
  if resp_id != ResponseId::Ok {
    return Err("erase failed".into());
  }

  Ok(())
}

#[tauri::command]
fn send_write(state: State<Shared>, offset: u32, data: Vec<u8>) -> Result<(), String> {
  let mut s = state.lock().map_err(|_| "lock failed")?;
  let port = s.port.as_mut().ok_or("not connected")?;

  // Payload: offset (4 bytes big-endian) + data
  let mut payload = Vec::with_capacity(4 + data.len());
  payload.push((offset >> 24) as u8);
  payload.push((offset >> 16) as u8);
  payload.push((offset >> 8) as u8);
  payload.push((offset & 0xFF) as u8);
  payload.extend_from_slice(&data);

  let frame = Frame::new(CommandId::Write, payload);
  let bytes = frame.to_bytes();
  port.write_all(&bytes).map_err(|e| format!("write: {e}"))?;
  port.flush().map_err(|e| format!("flush: {e}"))?;

  let resp = Frame::from_reader(port.as_mut())?;
  let resp_id = ResponseId::try_from(resp.cmd)?;
  
  if resp_id != ResponseId::Ok {
    return Err("write failed".into());
  }

  Ok(())
}

#[tauri::command]
fn send_verify(state: State<Shared>) -> Result<u16, String> {
  let mut s = state.lock().map_err(|_| "lock failed")?;
  let port = s.port.as_mut().ok_or("not connected")?;

  let frame = Frame::new(CommandId::Verify, vec![]);
  let bytes = frame.to_bytes();
  port.write_all(&bytes).map_err(|e| format!("write: {e}"))?;
  port.flush().map_err(|e| format!("flush: {e}"))?;

  let resp = Frame::from_reader(port.as_mut())?;
  let resp_id = ResponseId::try_from(resp.cmd)?;
  
  if resp_id != ResponseId::Verify {
    return Err("verify failed".into());
  }

  let verify_resp = VerifyResponse::from_payload(&resp.payload)?;
  Ok(verify_resp.crc)
}

#[tauri::command]
fn send_start(state: State<Shared>) -> Result<(), String> {
  let mut s = state.lock().map_err(|_| "lock failed")?;
  let port = s.port.as_mut().ok_or("not connected")?;

  let frame = Frame::new(CommandId::Start, vec![]);
  let bytes = frame.to_bytes();
  port.write_all(&bytes).map_err(|e| format!("write: {e}"))?;
  port.flush().map_err(|e| format!("flush: {e}"))?;

  let resp = Frame::from_reader(port.as_mut())?;
  let resp_id = ResponseId::try_from(resp.cmd)?;
  
  if resp_id != ResponseId::Ok {
    return Err("start failed".into());
  }

  Ok(())
}

#[tauri::command]
fn get_connection_status(state: State<Shared>) -> Result<Option<String>, String> {
  let s = state.lock().map_err(|_| "lock failed")?;
  Ok(s.name.clone())
}

// placeholder that you’ll flesh out with ERASE/WRITE/VERIFY
#[derive(serde::Deserialize)]
#[serde(rename_all = "lowercase")]
enum Target { Blade, Fuselage, Both }

#[tauri::command]
fn write_show_to_controllers(_state: State<Shared>, _target: Target) -> Result<(), String> {
  // TODO: invoke your programmer steps:
  // 1) ERASE region
  // 2) WRITE chunks
  // 3) VERIFY CRC
  Ok(())
}

fn main() {
  let shared: Shared = Arc::new(Mutex::new(SerialState { port: None, name: None }));
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .manage(shared)
    .invoke_handler(tauri::generate_handler![
  list_ports,
  connect,
  disconnect,
  hello,                    // keep existing
  send_hello,               // new
  send_erase,               // new
  send_write,               // new
  send_verify,              // new
  send_start,               // new
  get_connection_status,    // new
  write_show_to_controllers // keep existing
])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
