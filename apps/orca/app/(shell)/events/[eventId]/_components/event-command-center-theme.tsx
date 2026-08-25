"use client";

import type { CSSProperties, ReactNode } from "react";

export const eventCommandCenterTheme = {
  colors: {
    primary: "#0F2740",
    secondary: "#2952A3",
    accent: "#0043FF",
    success: "#2CA77C",
    warning: "#F4A261",
    error: "#E76F51",
    neutral: "#F4F7FA",
    neutralText: "#929CA8",
    neutralBorder: "#D8E0E8",
    surface: "#FFFFFF",
  },
  typography: {
    fontFamily: "var(--font-body)",
    display: "30px",
    headline: "22px",
    subheadline: "17px",
    body: "14px",
    caption: "12px",
  },
  spacing: {
    mobileGutter: "8px",
    tabletGutter: "16px",
    desktopGutter: "24px",
    maxWidth: "1440px",
  },
  shadows: {
    card: "0 2px 4px rgba(15, 39, 64, 0.05)",
  },
} as const;

const themeStyle = {
  "--event-color-primary": eventCommandCenterTheme.colors.primary,
  "--event-color-secondary": eventCommandCenterTheme.colors.secondary,
  "--event-color-accent": eventCommandCenterTheme.colors.accent,
  "--event-color-success": eventCommandCenterTheme.colors.success,
  "--event-color-warning": eventCommandCenterTheme.colors.warning,
  "--event-color-error": eventCommandCenterTheme.colors.error,
  "--event-color-neutral": eventCommandCenterTheme.colors.neutral,
  "--event-color-neutral-text": eventCommandCenterTheme.colors.neutralText,
  "--event-color-neutral-border": eventCommandCenterTheme.colors.neutralBorder,
  "--event-color-surface": eventCommandCenterTheme.colors.surface,
  "--event-font-family": eventCommandCenterTheme.typography.fontFamily,
  "--event-font-display": eventCommandCenterTheme.typography.display,
  "--event-font-headline": eventCommandCenterTheme.typography.headline,
  "--event-font-subheadline": eventCommandCenterTheme.typography.subheadline,
  "--event-font-body": eventCommandCenterTheme.typography.body,
  "--event-font-caption": eventCommandCenterTheme.typography.caption,
  "--event-gutter-mobile": eventCommandCenterTheme.spacing.mobileGutter,
  "--event-gutter-tablet": eventCommandCenterTheme.spacing.tabletGutter,
  "--event-gutter-desktop": eventCommandCenterTheme.spacing.desktopGutter,
  "--event-max-width": eventCommandCenterTheme.spacing.maxWidth,
  "--event-shadow-card": eventCommandCenterTheme.shadows.card,
} as CSSProperties;

export function EventCommandCenterThemeProvider({ children }: { children: ReactNode }) {
  return <div style={themeStyle}>{children}</div>;
}
