import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import type {
  AdminEventStatus,
  AdminLicenseStatus,
  AdminUserStatus,
  DashboardMetric
} from "@/lib/data/platform-admin";

export function AdminPageHeader({
  title,
  subtitle,
  tag,
  action
}: {
  title: string;
  subtitle: string;
  tag?: string;
  action?: React.ReactNode;
}) {
  return (
    <PageHeader
      title={title}
      subtitle={subtitle}
      eyebrow={tag}
      actions={action}
    />
  );
}

export function PrimaryButton({ href, label }: { href?: string; label: string }) {
  const buttonClass =
    "admin-primary-button inline-flex h-12 items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 text-base font-semibold text-white shadow-sm transition hover:from-indigo-600 hover:to-violet-700";

  if (href) {
    return (
      <Link href={href} className={buttonClass}>
        {label}
      </Link>
    );
  }

  return (
    <button type="button" className={buttonClass}>
      {label}
    </button>
  );
}

export function MetricCard({
  metric,
  compact = false
}: {
  metric: DashboardMetric;
  compact?: boolean;
}) {
  return (
    <article className={`admin-metric-card rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(15,23,42,0.06)] ${compact ? "p-4" : "p-5"}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="admin-metric-icon inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-white">
          <MetricIcon icon={metric.icon} />
        </span>
        <ArrowIcon />
      </div>
      <p className={`admin-metric-value mt-3 font-bold tracking-tight text-slate-950 ${compact ? "text-3xl md:text-4xl" : "text-4xl md:text-5xl"}`}>
        {metric.shortValue ? <span className="md:hidden">{metric.shortValue}</span> : null}
        <span className={metric.shortValue ? "hidden md:inline" : "inline"}>{metric.value}</span>
      </p>
      <p className="admin-metric-label mt-1 text-sm font-semibold text-slate-600 md:text-base">{metric.label}</p>
      {metric.hint ? (
        <p className={`admin-metric-hint mt-1 text-xs font-semibold md:text-sm ${metric.tone === "positive" ? "text-emerald-600" : "text-slate-500"}`}>
          {metric.hint}
        </p>
      ) : null}
    </article>
  );
}

export function EventStatusBadge({ status }: { status: AdminEventStatus }) {
  if (status === "active") {
    return <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700">Active</span>;
  }
  if (status === "upcoming") {
    return <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-700">Upcoming</span>;
  }
  return <span className="rounded-full bg-slate-200 px-3 py-1 text-sm font-semibold text-slate-600">Completed</span>;
}

export function LicenseStatusBadge({ status }: { status: AdminLicenseStatus }) {
  if (status === "active") {
    return <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700">Active</span>;
  }
  if (status === "trial") {
    return <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-700">Trial</span>;
  }
  return <span className="rounded-full bg-rose-100 px-3 py-1 text-sm font-semibold text-rose-700">Expired</span>;
}

export function UserStatusBadge({ status }: { status: AdminUserStatus }) {
  if (status === "active") {
    return <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700">Active</span>;
  }
  if (status === "invited") {
    return <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-700">Invited</span>;
  }
  if (status === "invite_pending") {
    return (
      <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">Invite pending</span>
    );
  }
  return <span className="rounded-full bg-slate-200 px-3 py-1 text-sm font-semibold text-slate-600">Inactive</span>;
}

function MetricIcon({ icon }: { icon: DashboardMetric["icon"] }) {
  if (icon === "events") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3.5" y="5" width="17" height="15" rx="2.5" stroke="currentColor" strokeWidth="2" />
        <path d="M8 3.5v4M16 3.5v4M3.5 9.5h17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (icon === "exhibitors") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="5" y="3" width="10" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
        <path d="M8 8h4M8 12h4M8 16h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M15 10h4v9h-4" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }

  if (icon === "licenses") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M8 12h5.5a4.5 4.5 0 0 0 0-9H9.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M10 6.5L7.5 9 10 11.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="17.5" cy="16.5" r="3.5" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }

  if (icon === "active") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="2" />
        <path d="m8 12 2.5 2.5L16 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3v18M5 8h9a3 3 0 0 0 0-6H8a3 3 0 0 0 0 6h8a3 3 0 0 1 0 6H7a3 3 0 0 1-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-slate-300">
      <path d="M7 17 17 7M8 7h9v9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
