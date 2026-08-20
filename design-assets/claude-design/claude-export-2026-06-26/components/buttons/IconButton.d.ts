import { ComponentType, CSSProperties } from "react";

/**
 * Square, icon-only button for toolbars, dialog close, and overflow actions.
 */
export interface IconButtonProps {
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  /** Accessible label (also the tooltip). */
  label: string;
  /** @default "ghost" */
  variant?: "ghost" | "outline";
  /** @default "md" */
  size?: "sm" | "md";
  disabled?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
}

export function IconButton(props: IconButtonProps): JSX.Element;
