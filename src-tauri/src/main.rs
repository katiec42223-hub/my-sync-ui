use std::sync::{Arc, Mutex};
use tauri::{self, Manager, State};
use serialport::{SerialPort, SerialPortType};

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
      list_ports, connect, disconnect, hello, write_show_to_controllers
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
