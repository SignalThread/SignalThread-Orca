import { CSSProperties, ReactNode } from "react";

/** Inline notice for product states. */
export interface AlertProps {
  /** @default "info" */
  tone?: "success" | "warning" | "danger" | "info" | "neutral";
  title?: ReactNode;
  children?: ReactNode;
  /** Right-aligned action slot (e.g. a Retry button). */
  action?: ReactNode;
  /** @default true */
  showIcon?: boolean;
  style?: CSSProperties;
}

export function Alert(props: AlertProps): JSX.Element;
