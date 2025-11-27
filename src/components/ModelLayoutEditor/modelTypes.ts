// src/components/ModelLayoutEditor/modelTypes.ts

export type Zone = "MAIN_BODY" | "TAIL_BOOM" | "TAIL_FIN" | "UNDEFINED_ZONE";

export type Side = "LEFT" | "RIGHT" | "TOP" | "BOTTOM" | null;

export type AlignmentMode = "CENTER" | "HEAD" | "TAIL";

export interface AlignmentMember {
  fixtureId: string;
  flipRelativeToGroup: boolean;
  pixelOffsetInGroup: number;
}

export interface AlignmentGroup {
  id: string;
  name: string;
  mode: AlignmentMode;
  members: AlignmentMember[];
}

export type Orientation =
  | "LEFT"
  | "RIGHT"
  | "UP"
  | "DOWN"
  | "FORWARD"
  | "BACKWARD"
  | null;

export interface Fixture {
  id: string;
  name: string;
  zone: Zone | string;
  controllerChannel: number | null;
  pixelOffset: number | null;
  pixelCount: number | null;
  physicalLengthMm: number | null;
  side: Side;
  orientation: Orientation;
  alignmentGroupIds: string[];
}

export interface ChannelChain {
  controllerChannel: number;   // e.g., 0, 1, 2...
  fixtureOrder: string[];      // ordered fixture IDs (serial order)
}