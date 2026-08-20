import { ComponentType, CSSProperties, ReactNode } from "react";

/** Compact metric card with eyebrow label, value, sublabel, icon chip. */
export interface StatCardProps {
  label: string;
  value: ReactNode;
  sublabel?: string;
  icon?: ComponentType<{ size?: number; strokeWidth?: number }>;
  /** Icon chip tint. @default "primary" */
  tone?: "primary" | "success" | "warning" | "info" | "neutral";
  style?: CSSProperties;
}

export function StatCard(props: StatCardProps): JSX.Element;
