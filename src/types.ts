export type ShowEvent = {
  id: string;
  songId: number;
  durationMs: number;
  func: string;
  payload?: any;
};

export type BladeMedia = {
  sameOnBoth: boolean;
  topFiles: string[];
  bottomFiles: string[];
};