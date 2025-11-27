import { invoke } from "@tauri-apps/api/core";

export type Target = "blade" | "fuselage" | "both";

export async function listPorts(): Promise<string[]> {
  return await invoke<string[]>("list_ports");
}

export async function connect(port: string, baud = 115200): Promise<void> {
  await invoke("connect", { port, baud });
}

export async function disconnect(): Promise<void> {
  await invoke("disconnect");
}

export async function hello(): Promise<any> {
  try {
    return await invoke("hello");
  } catch (e) {
    throw new Error("HELLO failed: " + (e as Error).message);
  }
}

export async function writeShowToControllers(target: Target): Promise<void> {
  await invoke("write_show_to_controllers", { target });
}
