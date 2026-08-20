import type { ReactNode } from "react";

export const EVENT_MODULE_PRIMARY_CLASS = "bg-[#28439A] text-white shadow-sm";

export const eventModuleClasses = {
  switcher: "eventModuleSwitcher flex flex-wrap items-center gap-3",
  shell: "eventModuleShell rounded-[28px] border border-slate-200 bg-white shadow-sm",
  header: "eventModuleHeader grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto_auto] xl:items-center",
  headerLeft: "eventModuleHeaderLeft min-w-0",
  headerStats: "eventModuleHeaderStats flex flex-wrap items-center gap-5 xl:justify-center",
  headerActions: "eventModuleHeaderActions flex min-h-11 flex-wrap items-center justify-start gap-2 xl:justify-end",
  controlRow: "eventModuleControlRow flex flex-col gap-3 border-t border-slate-200 pt-4 xl:flex-row xl:items-center xl:justify-between",
  viewToggle: "eventModuleViewToggle inline-flex max-w-full gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1",
};

type EventModuleStatTone = "default" | "good" | "warning" | "critical";

export type EventModuleStat = {
  label: string;
  value: string;
  tone?: EventModuleStatTone;
};

type EventModuleHeaderProps = {
  title: string;
  subtitle?: string;
  badge?: string;
  stats?: EventModuleStat[];
  actions?: ReactNode;
};

function statToneClasses(tone: EventModuleStatTone): string {
  if (tone === "good") return "text-emerald-700";
  if (tone === "warning") return "text-amber-700";
  if (tone === "critical") return "text-rose-700";
  return "text-slate-950";
}

export function EventModuleSurface({
  children,
  className = "",
  paddingClassName = "p-6",
}: {
  children: ReactNode;
  className?: string;
  paddingClassName?: string;
}) {
  return (
    <section className={`${eventModuleClasses.shell} ${paddingClassName} ${className}`.trim()}>
      {children}
    </section>
  );
}

export function EventModuleHeader({
  title,
  subtitle,
  badge,
  stats = [],
  actions,
}: EventModuleHeaderProps) {
  return (
    <div className={eventModuleClasses.header}>
      <div className={eventModuleClasses.headerLeft}>
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h1 className="truncate text-[24px] leading-[30px] font-semibold text-slate-950">{title}</h1>
          {badge ? (
            <span className="inline-flex items-center rounded-full bg-[#28439A]/8 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#28439A]">
              {badge}
            </span>
          ) : null}
        </div>
        {subtitle ? (
          <p className="mt-1.5 max-w-3xl text-[13px] leading-[19px] text-slate-500">{subtitle}</p>
        ) : null}
      </div>

      {stats.length > 0 ? (
        <div className={eventModuleClasses.headerStats}>
          {stats.map((stat) => (
            <div key={`${stat.label}-${stat.value}`} className="min-w-[72px]">
              <p className={`text-[24px] leading-[28px] font-semibold ${statToneClasses(stat.tone ?? "default")}`}>{stat.value}</p>
              <p className="mt-0.5 text-[12px] text-slate-500">{stat.label}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="hidden xl:block" aria-hidden />
      )}

      <div className={eventModuleClasses.headerActions}>
        {actions}
      </div>
    </div>
  );
}
