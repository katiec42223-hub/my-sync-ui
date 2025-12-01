import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

type HelloResponse = {
  target: "blade" | "fuselage";
  fw: string;
  proto: number;
};

export default function DeviceManager() {
  const [ports, setPorts] = useState<string[]>([]);
  const [selectedPort, setSelectedPort] = useState<string>("");
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<string>("Disconnected");
  const [deviceInfo, setDeviceInfo] = useState<HelloResponse | null>(null);
  const [testData, setTestData] = useState<string>("");

  async function refreshPorts() {
    try {
      const list = await invoke<string[]>("list_ports");
      setPorts(list);
      if (list.length > 0 && !selectedPort) {
        setSelectedPort(list[0]);
      }
    } catch (e) {
      console.error("refreshPorts:", e);
    }
  }

  async function handleConnect() {
    if (!selectedPort) return;
    try {
      setStatus("Connecting...");
      await invoke("connect", { port: selectedPort, baud: 115200 });
      setConnected(true);

      // Send HELLO to identify device
      const info = await invoke<HelloResponse>("send_hello");
      setDeviceInfo(info);
      setStatus(`Connected: ${info.target} (FW ${info.fw}, proto v${info.proto})`);
    } catch (e: any) {
      setStatus(`Error: ${e}`);
      setConnected(false);
    }
  }

  async function handleDisconnect() {
    try {
      await invoke("disconnect");
      setConnected(false);
      setStatus("Disconnected");
      setDeviceInfo(null);
    } catch (e: any) {
      setStatus(`Disconnect error: ${e}`);
    }
  }

  async function handleTestPing() {
    try {
      setStatus("Testing...");
      const info = await invoke<HelloResponse>("send_hello");
      setStatus(`Ping OK: ${info.target} v${info.fw}`);
    } catch (e: any) {
      setStatus(`Ping failed: ${e}`);
    }
  }

  async function handleTestErase() {
    try {
      setStatus("Erasing...");
      await invoke("send_erase");
      setStatus("Erase OK");
    } catch (e: any) {
      setStatus(`Erase failed: ${e}`);
    }
  }

  async function handleTestWrite() {
    if (!testData) {
      setStatus("Enter test data first");
      return;
    }
    try {
      setStatus("Writing...");
      const encoder = new TextEncoder();
      const bytes = Array.from(encoder.encode(testData));
      await invoke("send_write", { offset: 0, data: bytes });
      setStatus(`Write OK (${bytes.length} bytes)`);
    } catch (e: any) {
      setStatus(`Write failed: ${e}`);
    }
  }

  async function handleTestVerify() {
    try {
      setStatus("Verifying...");
      const crc = await invoke<number>("send_verify");
      setStatus(`Verify OK: CRC16 = 0x${crc.toString(16).toUpperCase().padStart(4, '0')}`);
    } catch (e: any) {
      setStatus(`Verify failed: ${e}`);
    }
  }

  async function handleTestStart() {
    try {
      setStatus("Starting...");
      await invoke("send_start");
      setStatus("Start OK");
    } catch (e: any) {
      setStatus(`Start failed: ${e}`);
    }
  }

  useEffect(() => {
    refreshPorts();
    const interval = setInterval(refreshPorts, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ padding: 16, background: "#2a2a2a", borderRadius: 8, marginBottom: 16 }}>
      <h3 style={{ marginTop: 0 }}>Device Connection & Testing</h3>

      {/* Connection */}
      <div style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "center" }}>
        <select
          value={selectedPort}
          onChange={(e) => setSelectedPort(e.target.value)}
          disabled={connected}
          style={{ flex: 1 }}
        >
          <option value="">Select USB port...</option>
          {ports.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <button onClick={refreshPorts} disabled={connected}>
          Refresh
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {!connected ? (
          <button onClick={handleConnect} disabled={!selectedPort}>
            Connect
          </button>
        ) : (
          <button onClick={handleDisconnect}>Disconnect</button>
        )}
      </div>

      <div
        style={{
          fontSize: 12,
          color: "#bbb",
          marginBottom: 12,
          padding: 8,
          background: "#1a1a1a",
          borderRadius: 4,
        }}
      >
        <strong>Status:</strong> {status}
      </div>

      {deviceInfo && (
        <div
          style={{
            fontSize: 11,
            color: "#888",
            fontFamily: "monospace",
            marginBottom: 12,
            padding: 8,
            background: "#1a1a1a",
            borderRadius: 4,
          }}
        >
          <div>Target: {deviceInfo.target}</div>
          <div>Firmware: {deviceInfo.fw}</div>
          <div>Protocol: v{deviceInfo.proto}</div>
        </div>
      )}

      {/* Test Commands */}
      {connected && (
        <div style={{ borderTop: "1px solid #444", paddingTop: 12 }}>
          <h4 style={{ marginTop: 0, fontSize: 14 }}>Test Commands</h4>

          <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <button onClick={handleTestPing} style={{ fontSize: 11, padding: "4px 8px" }}>
              HELLO
            </button>
            <button onClick={handleTestErase} style={{ fontSize: 11, padding: "4px 8px" }}>
              ERASE
            </button>
            <button onClick={handleTestVerify} style={{ fontSize: 11, padding: "4px 8px" }}>
              VERIFY
            </button>
            <button onClick={handleTestStart} style={{ fontSize: 11, padding: "4px 8px" }}>
              START
            </button>
          </div>

          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 11, display: "block", marginBottom: 4 }}>
              Test Data (WRITE at offset 0):
            </label>
            <input
              type="text"
              value={testData}
              onChange={(e) => setTestData(e.target.value)}
              placeholder="Enter test string..."
              style={{ width: "100%", marginBottom: 4, fontSize: 11 }}
            />
            <button onClick={handleTestWrite} disabled={!testData} style={{ fontSize: 11, padding: "4px 8px" }}>
              WRITE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}