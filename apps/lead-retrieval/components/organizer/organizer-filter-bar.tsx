import type { ReactNode } from "react";

/** Shared container for organizer filter + search rows (one system across Users, Licenses, Performance, Exhibitors). */
export const organizerFilterSectionClassName =
  "rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)] md:p-5";

type OrganizerFilterBarProps = {
  filters: ReactNode;
  search: ReactNode;
};

export function OrganizerFilterBar({ filters, search }: OrganizerFilterBarProps) {
  return (
    <section className={organizerFilterSectionClassName}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-6">
        <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3 md:gap-4">{filters}</div>
        <div className="w-full shrink-0 lg:max-w-md lg:min-w-[280px]">{search}</div>
      </div>
    </section>
  );
}

type OrganizerFilterFieldProps = {
  label: string;
  children: ReactNode;
  className?: string;
};

export function OrganizerFilterField({ label, children, className = "" }: OrganizerFilterFieldProps) {
  return (
    <label className={`flex min-w-[10rem] flex-col gap-1.5 ${className}`}>
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

export function OrganizerFilterSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = "", ...rest } = props;
  return (
    <select
      {...rest}
      className={`h-10 min-w-[10rem] rounded-lg border border-border bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm ${className}`}
    />
  );
}

type OrganizerSearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  icon?: ReactNode | null;
  "aria-label"?: string;
};

export function OrganizerSearchGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function OrganizerSearchField({ value, onChange, placeholder, icon, "aria-label": ariaLabel }: OrganizerSearchFieldProps) {
  const glyph = icon === undefined ? <OrganizerSearchGlyph /> : icon;
  return (
    <div className="relative w-full">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className="h-10 w-full rounded-lg border border-border bg-white pl-10 pr-3 text-sm font-medium placeholder:text-slate-400"
      />
      {glyph ? <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{glyph}</span> : null}
    </div>
  );
}
