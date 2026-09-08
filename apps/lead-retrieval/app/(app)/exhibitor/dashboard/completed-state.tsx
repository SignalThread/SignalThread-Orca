import Link from "next/link";
import type { CompletedWorkspace } from "@/lib/events/event-workspace-completed-core";
import { CoachingCallouts, LiveIntelligenceModules } from "./evidence-drawer";

/**
 * Completed / Post-Event body for the canonical Event Workspace — the Phase 1
 * post-event and executive outcome product. Pure presentation over
 * `deriveCompletedWorkspace` output: conditional modules disappear when
 * unsupported, unavailable values render as unavailable, every action targets
 * an existing workflow, and nothing links to a deeper dashboard.
 */

function WhatMattersNowHero({ completed }: { completed: CompletedWorkspace }) {
  const wmn = completed.whatMattersNow;
  const isAction = wmn.tone === "action";
  return (
    <section
      data-testid="workspace-what-matters-now"
      className={`rounded-2xl border p-5 shadow-sm sm:p-6 ${
        isAction
          ? "border-emerald-300 bg-gradient-to-br from-emerald-700 to-emerald-600 text-white"
          : "border-slate-200 bg-gradient-to-br from-slate-50 via-white to-white"
      }`}
    >
      <p
        className={`text-[11px] font-bold uppercase tracking-wider ${isAction ? "text-emerald-100" : "text-slate-500"}`}
      >
        What matters now
      </p>
      <h2
        className={`mt-1.5 text-xl font-bold tracking-tight sm:text-2xl ${isAction ? "text-white" : "text-slate-900"}`}
      >
        {wmn.title}
      </h2>
      <p className={`mt-1.5 max-w-2xl text-sm leading-relaxed ${isAction ? "text-emerald-50" : "text-slate-600"}`}>
        {wmn.body}
      </p>
      {wmn.actionLabel && wmn.actionHref ? (
        <div className="mt-4">
          <Link
            href={wmn.actionHref}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
              isAction
                ? "bg-white text-emerald-700 hover:bg-emerald-50 focus-visible:outline-white"
                : "bg-indigo-600 text-white hover:bg-indigo-500 focus-visible:outline-indigo-500"
            }`}
          >
            {wmn.actionLabel}
          </Link>
        </div>
      ) : null}
    </section>
  );
}

function OutcomeKpiRow({ completed }: { completed: CompletedWorkspace }) {
  const count = completed.kpis.length;
  const lgCols = count <= 3 ? "lg:grid-cols-3" : "lg:grid-cols-4";
  return (
    <div className={`grid grid-cols-2 gap-3 ${lgCols}`}>
      {completed.kpis.map((kpi) => {
        const body = (
          <>
            <p
              className={`text-2xl font-bold leading-none tracking-tight ${
                kpi.value === null ? "text-slate-400" : "text-slate-900"
              }`}
            >
              {kpi.display}
            </p>
            <p className="mt-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{kpi.label}</p>
            <p className="mt-0.5 text-[11px] font-medium text-slate-400">{kpi.caption}</p>
          </>
        );
        const className = "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm";
        return kpi.href ? (
          <Link
            key={kpi.key}
            href={kpi.href}
            data-testid={`workspace-completed-kpi-${kpi.key}`}
            className={`${className} transition hover:border-slate-300 hover:shadow-md`}
          >
            {body}
          </Link>
        ) : (
          <div key={kpi.key} data-testid={`workspace-completed-kpi-${kpi.key}`} className={className}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

export function CompletedEventBody({
  completed,
  eventId
}: {
  completed: CompletedWorkspace;
  eventId: string;
}) {
  return (
    <div data-testid="workspace-completed-body" className="space-y-4">
      <WhatMattersNowHero completed={completed} />
      <OutcomeKpiRow completed={completed} />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_310px]">
        <div className="space-y-4">
          <section
            data-testid="workspace-final-recap"
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <h2 className="text-base font-bold text-slate-900">Final intelligence recap</h2>
            {completed.intelligenceCoverage?.isSampled ? (
              <p className="mt-1 text-xs text-slate-500">
                Recap uses the newest {completed.intelligenceCoverage.analyzedCount} analyzed conversations from {completed.intelligenceCoverage.totalCount} total.
              </p>
            ) : null}
            {completed.recapModules.length > 0 ? (
              <div className="mt-4">
                <LiveIntelligenceModules modules={completed.recapModules} eventId={eventId} />
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                Not enough analyzed conversations from this event for a reliable recap.
              </p>
            )}
          </section>
          {completed.coaching.length > 0 ? (
            <section
              data-testid="workspace-coaching-callouts"
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <h2 className="text-base font-bold text-slate-900">Team patterns</h2>
              <p className="mt-1 text-xs text-slate-500">
                Recurring behaviors observed across this event's analyzed conversations.
              </p>
              <CoachingCallouts callouts={completed.coaching} eventId={eventId} />
            </section>
          ) : null}
        </div>
        <div className="space-y-4">
          <section
            data-testid="workspace-follow-up-readiness"
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <h2 className="text-base font-bold text-slate-900">Follow-up readiness</h2>
            {completed.followUpReadiness === null ? (
              <p className="mt-3 text-sm text-slate-500">Follow-up state is unavailable right now.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {completed.followUpReadiness.map((row) => {
                  const rowBody = (
                    <span className="flex items-center justify-between gap-3">
                      <span className="min-w-0 text-sm font-medium text-slate-700">{row.label}</span>
                      <span
                        className={`shrink-0 text-sm font-bold tabular-nums ${
                          row.value > 0 && (row.key === "hot_untouched" || row.key === "overdue")
                            ? "text-rose-600"
                            : "text-slate-700"
                        }`}
                      >
                        {row.value}
                      </span>
                    </span>
                  );
                  return (
                    <li key={row.key}>
                      {row.href ? (
                        <Link href={row.href} className="block rounded-lg px-1 py-0.5 transition hover:bg-slate-50">
                          {rowBody}
                        </Link>
                      ) : (
                        <span className="block px-1 py-0.5">{rowBody}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          {completed.executiveSnapshot.length > 0 ? (
            <section
              data-testid="workspace-executive-snapshot"
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <h2 className="text-base font-bold text-slate-900">Executive snapshot</h2>
              <dl className="mt-3 space-y-3">
                {completed.executiveSnapshot.map((row) => (
                  <div key={row.key}>
                    <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{row.label}</dt>
                    <dd className="mt-0.5 text-sm leading-snug text-slate-700">
                      {row.href ? (
                        <Link href={row.href} className="transition hover:text-indigo-600">
                          {row.value}
                        </Link>
                      ) : (
                        row.value
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
          {completed.takeItFurther.length > 0 ? (
            <section
              data-testid="workspace-take-it-further"
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <h2 className="text-base font-bold text-slate-900">Take it further</h2>
              <ul className="mt-3 space-y-1">
                {completed.takeItFurther.map((action) => (
                  <li key={action.key}>
                    <Link
                      href={action.href}
                      className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-slate-50"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-800">{action.label}</span>
                        <span className="block text-[11px] font-medium text-slate-400">{action.description}</span>
                      </span>
                      <span aria-hidden className="shrink-0 text-slate-300">
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
