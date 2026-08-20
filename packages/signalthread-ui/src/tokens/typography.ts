export const typography = {
  /**
   * SignalThread uses Montserrat for product UI and Geist Mono only for
   * monospace contexts. Do not switch the sans family to Claude's Geist export
   * without an explicit brand approval.
   */
  fontFamily: {
    sans: "var(--font-montserrat, Montserrat, Arial, Helvetica, sans-serif)",
    mono: 'var(--font-geist-mono, "SFMono-Regular", Consolas, monospace)',
  },
  semantic: {
    productSans: "var(--font-montserrat, Montserrat, Arial, Helvetica, sans-serif)",
    codeMono: 'var(--font-geist-mono, "SFMono-Regular", Consolas, monospace)',
  },
  fontSize: {
    xs: "0.75rem",
    sm: "0.875rem",
    md: "0.9375rem",
    lg: "1rem",
    xl: "1.125rem",
    displaySm: "1.625rem",
  },
  fontWeight: {
    regular: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
  },
  lineHeight: {
    tight: "1.2",
    normal: "1.5",
    relaxed: "1.65",
  },
  letterSpacing: {
    none: "0",
    label: "0.16em",
  },
} as const;

export type SignalThreadTypography = typeof typography;
