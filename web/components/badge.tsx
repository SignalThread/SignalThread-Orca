import type { ReactNode } from "react";

export type BadgeVariant = "danger" | "warning" | "success" | "info";

type BadgeProps = {
  children: ReactNode;
  variant: BadgeVariant;
};

const colors: Record<BadgeVariant, string> = {
  danger: "bg-danger-light text-danger",
  warning: "bg-warning-light text-warning",
  success: "bg-green-100 text-green-700",
  info: "bg-primary-light text-primary",
};

export function Badge({ children, variant }: BadgeProps) {
  return (
    <span className={`rounded-full px-2 py-1 text-xs font-medium ${colors[variant]}`}>
      {children}
    </span>
  );
}
