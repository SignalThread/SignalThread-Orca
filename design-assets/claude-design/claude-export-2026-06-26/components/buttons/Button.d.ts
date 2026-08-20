import { ComponentType, CSSProperties, ReactNode } from "react";

/**
 * Primary action button for SignalThread surfaces.
 *
 * @startingPoint section="Buttons" subtitle="Primary / secondary / ghost / danger actions" viewport="700x150"
 */
export interface ButtonProps {
  children?: ReactNode;
  /** Visual weight. @default "primary" */
  variant?: "primary" | "secondary" | "ghost" | "danger";
  /** @default "md" */
  size?: "sm" | "md";
  /** Lucide-style icon component, rendered before the label by default. */
  icon?: ComponentType<{ size?: number; strokeWidth?: number }>;
  /** Place the icon after the label instead of before. @default false */
  iconRight?: boolean;
  disabled?: boolean;
  /** Dim + disable while an async action runs. @default false */
  loading?: boolean;
  type?: "button" | "submit" | "reset";
  onClick?: () => void;
  style?: CSSProperties;
}

export function Button(props: ButtonProps): JSX.Element;
