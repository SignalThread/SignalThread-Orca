import type { ReactNode } from "react";

type DashboardEmptyStateProps = {
  title: string;
  description: string;
  icon?: ReactNode;
  primaryAction: ReactNode;
  secondaryAction?: ReactNode;
  bullets?: string[];
  className?: string;
};

export const DASHBOARD_EMPTY_PRIMARY_ACTION_CLASS =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#28439A] px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#243d8e] disabled:cursor-not-allowed disabled:bg-slate-300";

export const DASHBOARD_EMPTY_SECONDARY_ACTION_CLASS =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-[13px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60";

export function DashboardEmptyState({
  title,
  description,
  icon,
  primaryAction,
  secondaryAction,
  bullets = [],
  className = "",
}: DashboardEmptyStateProps) {
  return (
    <section
      className={[
        "rounded-3xl border border-slate-200 bg-white px-5 py-10 text-center shadow-sm sm:px-8 sm:py-12",
        className,
      ].filter(Boolean).join(" ")}
    >
      <div className="mx-auto max-w-2xl">
        {icon ? (
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#28439A]">
            {icon}
          </div>
        ) : null}
        <h2 className={icon ? "mt-5 text-xl font-semibold text-slate-950" : "text-xl font-semibold text-slate-950"}>
          {title}
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">{description}</p>
        {bullets.length > 0 ? (
          <ul className="mx-auto mt-5 grid max-w-xl gap-2 text-left text-[13px] leading-5 text-slate-600 sm:grid-cols-2">
            {bullets.map((bullet) => (
              <li key={bullet} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#28439A]/35" aria-hidden />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap">
          {primaryAction}
          {secondaryAction ?? null}
        </div>
      </div>
    </section>
  );
}
