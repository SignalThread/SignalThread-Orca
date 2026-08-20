export const colors = {
  /**
   * Foundation palette.
   *
   * These values are the current SignalThread source of truth. Claude design
   * exports may reference similar aliases, but should map back to these values
   * unless an approved visual redesign says otherwise.
   */
  bg: {
    canvas: "#f8f8fb",
    surface: "#ffffff",
    panel: "#f1f5f9",
    overlay: "rgba(15, 23, 42, 0.42)",
  },
  border: {
    default: "#cbd5e1",
    subtle: "#e2e8f0",
    strong: "#94a3b8",
  },
  text: {
    primary: "#0f172a",
    secondary: "#334155",
    muted: "#64748b",
    inverse: "#ffffff",
  },
  action: {
    primary: "#28439A",
    primaryHover: "#243d8e",
    primarySoft: "#e8edff",
    danger: "#dc2626",
    dangerHover: "#b91c1c",
    dangerSoft: "#fef2f2",
  },
  shell: {
    nav: "#0B1638",
  },
  brand: {
    navy: "#183060",
    blue: "#3078C0",
    cyan: "#30A8D8",
    signalOrange: "#F07830",
  },
  semantic: {
    canvas: "#f8f8fb",
    cardSurface: "#ffffff",
    panelSurface: "#f1f5f9",
    primaryAction: "#28439A",
    primaryActionHover: "#243d8e",
    primaryActionSoft: "#e8edff",
    shellNav: "#0B1638",
    textPrimary: "#0f172a",
    textSecondary: "#334155",
    textMuted: "#64748b",
    borderSubtle: "#e2e8f0",
    borderDefault: "#cbd5e1",
  },
  status: {
    success: "#16a34a",
    warning: "#d97706",
    danger: "#dc2626",
    info: "#2563eb",
    neutral: "#64748b",
  },
} as const;

export type SignalThreadColors = typeof colors;
