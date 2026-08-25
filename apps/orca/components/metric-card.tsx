import type { ReactNode } from "react";

export type MetricCardVariant = "default" | "warning" | "danger" | "info";

type MetricCardProps = {
  label: string;
  value: number | string;
  icon: ReactNode;
  variant?: MetricCardVariant;
};

const variantStyles: Record<MetricCardVariant, string> = {
  default: "border-gray-200 bg-white",
  warning: "border-warning bg-warning-light",
  danger: "border-danger bg-danger-light",
  info: "border-primary bg-primary-light",
};

const iconStyles: Record<MetricCardVariant, string> = {
  default: "bg-primary-light text-primary",
  warning: "bg-warning-light text-warning",
  danger: "bg-danger-light text-danger",
  info: "bg-white text-primary",
};

export function MetricCard({ label, value, icon, variant = "default" }: MetricCardProps) {
  return (
    <article
      className={`flex min-h-24 items-center rounded-lg border p-4 shadow-sm ${variantStyles[variant]}`}
      aria-label={`${label}: ${value}`}
    >
      <div className={`mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconStyles[variant]}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-sm text-gray-500">{label}</div>
        <div className="mt-1 text-xl font-bold text-[var(--orca-blue)]">{value}</div>
      </div>
    </article>
  );
}
