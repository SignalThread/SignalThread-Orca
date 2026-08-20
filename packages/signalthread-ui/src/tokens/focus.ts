export const focus = {
  ring: "0 0 0 4px rgba(40, 67, 154, 0.16)",
  ringColor: "rgba(40, 67, 154, 0.16)",
  dangerRing: "0 0 0 4px rgba(220, 38, 38, 0.14)",
} as const;

export type SignalThreadFocus = typeof focus;
