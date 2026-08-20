export const shadows = {
  none: "none",
  sm: "0 1px 2px rgba(15, 23, 42, 0.06)",
  card: "0 1px 3px rgba(15, 23, 42, 0.08)",
  popover: "0 24px 70px -30px rgba(15, 23, 42, 0.45)",
  modal: "0 24px 80px rgba(15, 23, 42, 0.18)",
} as const;

export type SignalThreadShadows = typeof shadows;
