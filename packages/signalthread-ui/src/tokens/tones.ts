export const tones = {
  neutral: {
    text: "text-slate-700",
    border: "border-slate-200",
    background: "bg-slate-50",
    dot: "bg-slate-400",
  },
  info: {
    text: "text-blue-700",
    border: "border-blue-200",
    background: "bg-blue-50",
    dot: "bg-blue-500",
  },
  success: {
    text: "text-emerald-700",
    border: "border-emerald-200",
    background: "bg-emerald-50",
    dot: "bg-emerald-500",
  },
  warning: {
    text: "text-amber-800",
    border: "border-amber-200",
    background: "bg-amber-50",
    dot: "bg-amber-500",
  },
  danger: {
    text: "text-rose-700",
    border: "border-rose-200",
    background: "bg-rose-50",
    dot: "bg-rose-500",
  },
} as const;

export type SignalThreadTone = keyof typeof tones;
export type SignalThreadTones = typeof tones;
