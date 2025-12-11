import { verticalSweep } from "./verticalSweep";
import { serialSnake } from "./serialSnake";
import type { FunctionDescriptor } from "../types";
import { bladeLine } from "./bladeLine";

const registry: Record<string, FunctionDescriptor<any>> = {
  [verticalSweep.id]: verticalSweep,
   [bladeLine.id]: bladeLine,
   [serialSnake.id]: serialSnake,
};

export function getFunctionDescriptor(id: string) {
  return registry[id];
}

export function listFunctions() {
  return Object.values(registry);
}

