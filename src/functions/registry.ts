import { verticalSweep } from "./verticalSweep";
import type { FunctionDescriptor } from "../types";

const registry: Record<string, FunctionDescriptor<any>> = {
  [verticalSweep.id]: verticalSweep,
};

export function getFunctionDescriptor(id: string) {
  return registry[id];
}

export function listFunctions() {
  return Object.values(registry);
}