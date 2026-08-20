import { CSSProperties, ReactNode } from "react";

/**
 * Status badge — tinted pill with leading dot.
 *
 * @startingPoint section="Feedback" subtitle="Status & role badges, stat cards" viewport="700x150"
 */
export interface BadgeProps {
  children?: ReactNode;
  /** Explicit tone. */
  tone?: "success" | "warning" | "danger" | "info" | "neutral";
  /** Status label — resolves tone automatically (e.g. "Active" → success). */
  status?: string;
  /** Show the leading dot. @default true */
  dot?: boolean;
  style?: CSSProperties;
}

export function Badge(props: BadgeProps): JSX.Element;
