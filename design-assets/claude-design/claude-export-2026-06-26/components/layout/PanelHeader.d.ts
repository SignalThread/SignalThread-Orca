import { CSSProperties, ReactNode } from "react";

/** Consistent header for cards, panels, filter groups, admin sections. */
export interface PanelHeaderProps {
  /** Uppercase eyebrow above the title. */
  eyebrow?: string;
  title: ReactNode;
  /** Small muted text inline after the title (e.g. "Updated today"). */
  meta?: string;
  description?: string;
  /** Right-aligned action slot. */
  action?: ReactNode;
  style?: CSSProperties;
}

export function PanelHeader(props: PanelHeaderProps): JSX.Element;
