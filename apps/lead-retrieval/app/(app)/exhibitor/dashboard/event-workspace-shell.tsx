import type { ReactNode } from "react";
import { PageHeader, PageShell } from "@/components/layout/page-header";
import { BackLink } from "@/components/navigation/back-link";
import type { EventPortfolioLifecycle } from "@/lib/events/event-portfolio";
import type { EventIdentity } from "@/lib/exhibitor/event-command-center";

const LIFECYCLE_BADGE: Record<EventPortfolioLifecycle, { dot: string; badge: string }> = {
  live: { dot: "bg-emerald-500", badge: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  upcoming: { dot: "bg-indigo-500", badge: "border-indigo-200 bg-indigo-50 text-indigo-700" },
  completed: { dot: "bg-slate-400", badge: "border-slate-200 bg-slate-100 text-slate-600" },
  unknown: { dot: "bg-amber-500", badge: "border-amber-200 bg-amber-50 text-amber-700" }
};

export function EventLifecycleBadge({
  lifecycle,
  label
}: {
  lifecycle: EventPortfolioLifecycle;
  label: string;
}) {
  const accent = LIFECYCLE_BADGE[lifecycle];
  return (
    <span
      className={`inline-flex shrink-0 translate-y-[-2px] items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-normal ${accent.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${accent.dot}`} aria-hidden />
      {label}
    </span>
  );
}

/**
 * Shared shell for every lifecycle state of the canonical Event Workspace.
 * Durable event context only — no lifecycle business content, no lifecycle
 * selector, no intelligence-suite navigation. Bodies render as children.
 */
export function EventWorkspaceShell({
  identity,
  timingText,
  backHref,
  topSlot,
  actions,
  children
}: {
  identity: EventIdentity;
  /** "Opens in 5 days" / "Day 2 of 3" / "Wrapped 4 days ago"; null when unsupported. */
  timingText: string | null;
  /** Back to Events — only for tenants with the events portfolio surface. */
  backHref: string | null;
  topSlot?: ReactNode;
  /** Permission-aware direct actions for the current state. */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const subtitleParts: string[] = [];
  if (identity.detailsAvailable) {
    if (identity.isContinuousCapture) {
      subtitleParts.push("Continuous capture · ongoing");
    } else if (identity.dateText) {
      subtitleParts.push(identity.dateText);
    }
    if (identity.locationText) subtitleParts.push(identity.locationText);
    if (timingText) subtitleParts.push(timingText);
  }

  return (
    <PageShell>
      <div data-testid="event-workspace-header" className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 shadow-sm sm:px-5 sm:py-3.5">
        <PageHeader
          variant="panel"
          topSlot={
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
              {backHref ? <BackLink href={backHref}>← Back to Events</BackLink> : null}
              {topSlot}
            </div>
          }
          title={
            <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="min-w-0 max-w-full truncate" title={identity.name}>
                {identity.name}
              </span>
              {identity.lifecycle && identity.lifecycleLabel ? (
                <EventLifecycleBadge lifecycle={identity.lifecycle} label={identity.lifecycleLabel} />
              ) : null}
            </span>
          }
          subtitle={
            identity.detailsAvailable ? (
              subtitleParts.length > 0 ? (
                <span title={subtitleParts.join(" · ")}>{subtitleParts.join(" · ")}</span>
              ) : null
            ) : (
              <span className="text-slate-500">
                Event details are unavailable right now — the workspace below is unaffected.
              </span>
            )
          }
          actions={actions}
        />
      </div>
      {children}
    </PageShell>
  );
}
