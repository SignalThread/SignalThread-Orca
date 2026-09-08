import Link from "next/link";
import type {
  EventReadiness,
  ReadinessChecklistItem,
  ReadinessItemState
} from "@/lib/events/event-workspace-readiness-core";

/**
 * Upcoming / Event Readiness body for the Event Workspace. Pure presentation:
 * every value, state, and destination is derived in
 * `lib/events/event-workspace-readiness-core.ts`. Optional modules collapse;
 * unavailable sources say so; nothing here fabricates data or links.
 */

const ITEM_STATE_STYLE: Record<ReadinessItemState, { dot: string; label: string; badge: string }> = {
  complete: { dot: "bg-emerald-500", label: "Ready", badge: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  action: { dot: "bg-rose-500", label: "Needs you", badge: "border-rose-200 bg-rose-50 text-rose-700" },
  progress: { dot: "bg-amber-500", label: "In progress", badge: "border-amber-200 bg-amber-50 text-amber-700" },
  optional: { dot: "bg-slate-300", label: "Optional", badge: "border-slate-200 bg-slate-50 text-slate-500" },
  unavailable: { dot: "bg-slate-300", label: "Unavailable", badge: "border-slate-200 bg-slate-50 text-slate-400" }
};

function WhatMattersNowHero({ readiness }: { readiness: EventReadiness }) {
  const wmn = readiness.whatMattersNow;
  const isBlocker = wmn.tone === "blocker";
  return (
    <section
      data-testid="workspace-what-matters-now"
      className={`rounded-2xl border p-5 shadow-sm sm:p-6 ${
        isBlocker
          ? "border-amber-200 bg-gradient-to-br from-amber-50 via-white to-white"
          : "border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-white"
      }`}
    >
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">What matters now</p>
      <h2 className="mt-1.5 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{wmn.title}</h2>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-600">{wmn.body}</p>
      {wmn.actionLabel && wmn.actionHref ? (
        <div className="mt-4">
          <Link
            href={wmn.actionHref}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
          >
            {wmn.actionLabel}
          </Link>
        </div>
      ) : null}
    </section>
  );
}

function ReadinessKpiRow({ readiness }: { readiness: EventReadiness }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {readiness.kpis.map((kpi) => (
        <div
          key={kpi.key}
          data-testid={`workspace-kpi-${kpi.key}`}
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <p
            className={`text-2xl font-bold leading-none tracking-tight ${
              kpi.state === "attention" ? "text-amber-600" : kpi.state === "unavailable" ? "text-slate-400" : "text-slate-900"
            }`}
          >
            {kpi.value}
          </p>
          <p className="mt-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{kpi.label}</p>
          <p className="mt-0.5 text-[11px] font-medium text-slate-400">{kpi.caption}</p>
        </div>
      ))}
    </div>
  );
}

function ChecklistRow({ item }: { item: ReadinessChecklistItem }) {
  const style = ITEM_STATE_STYLE[item.state];
  return (
    <li className="flex items-start justify-between gap-3 py-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${style.dot}`} aria-hidden />
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
            {item.label}
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${style.badge}`}>
              {style.label}
            </span>
          </p>
          <p className="mt-0.5 text-xs leading-snug text-slate-500">{item.detail}</p>
        </div>
      </div>
      {item.actionLabel && item.actionHref ? (
        <Link
          href={item.actionHref}
          className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          {item.actionLabel}
        </Link>
      ) : null}
    </li>
  );
}

function StrategyPanel({ readiness }: { readiness: EventReadiness }) {
  const strategy = readiness.strategy;
  if (!strategy.configured && (strategy.knowledgeItemCount ?? 0) === 0) {
    // Unused playbook: the restrained optional row already lives in the
    // checklist — no permanent empty card.
    return null;
  }
  const rows: Array<{ label: string; value: string }> = [];
  if (strategy.eventGoal) rows.push({ label: "Event goal", value: strategy.eventGoal });
  if (strategy.productFocus) rows.push({ label: "Product focus", value: strategy.productFocus });
  if (strategy.targetBuyerPersona) rows.push({ label: "Target audience", value: strategy.targetBuyerPersona });
  if (strategy.toneOfVoice) rows.push({ label: "Tone", value: strategy.toneOfVoice });
  if ((strategy.knowledgeItemCount ?? 0) > 0) {
    rows.push({
      label: "Trusted sources",
      value: `${strategy.knowledgeItemCount} ${strategy.knowledgeItemCount === 1 ? "item" : "items"}`
    });
  }
  if (rows.length === 0) return null;
  return (
    <section
      data-testid="workspace-strategy-panel"
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h2 className="text-base font-bold text-slate-900">Strategy & playbook</h2>
      <dl className="mt-3 space-y-3">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{row.label}</dt>
            <dd className="mt-0.5 text-sm leading-snug text-slate-700">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function TeamPanel({ readiness }: { readiness: EventReadiness }) {
  if (readiness.team === null) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-slate-900">Team preparation</h2>
        <p className="mt-3 text-sm text-slate-500">Team assignments are unavailable right now.</p>
      </section>
    );
  }
  if (readiness.team.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-slate-900">Team preparation</h2>
        <p className="mt-3 text-sm text-slate-500">No team members are assigned to this event yet.</p>
      </section>
    );
  }
  const shown = readiness.team.slice(0, 8);
  const extra = readiness.team.length - shown.length;
  return (
    <section data-testid="workspace-team-panel" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-slate-900">Team preparation</h2>
      <ul className="mt-3 space-y-2.5">
        {shown.map((member) => (
          <li key={member.userId} className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                {member.displayName.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-800">{member.displayName}</p>
                {member.state === "active" && !member.captureAccess ? (
                  <p className="text-[11px] font-medium text-slate-400">No mobile capture access</p>
                ) : null}
              </div>
            </div>
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                member.state === "active"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              }`}
            >
              {member.state === "active" ? "Ready" : "Invited"}
            </span>
          </li>
        ))}
      </ul>
      {extra > 0 ? <p className="mt-2 text-[11px] font-semibold text-slate-400">+{extra} more</p> : null}
    </section>
  );
}

function FinalActionsPanel({
  readiness,
  canManage
}: {
  readiness: EventReadiness;
  canManage: boolean;
}) {
  if (!canManage) return null;
  const actions = readiness.checklist
    .filter((item) => item.actionHref && item.state !== "complete")
    .slice(0, 4)
    .map((item) => ({
      key: item.key,
      label: item.actionLabel ?? item.label,
      description: item.label,
      href: item.actionHref as string
    }));
  if (actions.length === 0) return null;
  return (
    <section data-testid="workspace-final-actions" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-slate-900">Final pre-event actions</h2>
      <ul className="mt-3 space-y-1">
        {actions.map((action) => (
          <li key={action.key}>
            <Link
              href={action.href}
              className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-slate-50"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-800">{action.description}</span>
                <span className="block text-[11px] font-medium text-slate-400">{action.label}</span>
              </span>
              <span aria-hidden className="shrink-0 text-slate-300">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function UpcomingEventReadinessBody({
  readiness,
  canManage
}: {
  readiness: EventReadiness;
  canManage: boolean;
}) {
  return (
    <div data-testid="workspace-upcoming-body" className="space-y-4">
      <WhatMattersNowHero readiness={readiness} />
      <ReadinessKpiRow readiness={readiness} />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_310px]">
        <div className="space-y-4">
          <section
            data-testid="workspace-readiness-checklist"
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <h2 className="text-base font-bold text-slate-900">Event readiness</h2>
            <ul className="mt-2 divide-y divide-slate-100">
              {readiness.checklist.map((item) => (
                <ChecklistRow key={item.key} item={item} />
              ))}
            </ul>
          </section>
          <StrategyPanel readiness={readiness} />
        </div>
        <div className="space-y-4">
          <TeamPanel readiness={readiness} />
          <FinalActionsPanel readiness={readiness} canManage={canManage} />
        </div>
      </div>
    </div>
  );
}
