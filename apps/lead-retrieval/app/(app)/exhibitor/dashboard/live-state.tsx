import Link from "next/link";
import type { LiveInsightModule, LiveWorkspace } from "@/lib/events/event-workspace-live-core";
import { COMMAND_SURFACE_CARD_CLASS, COMMAND_SURFACE_GRID_CLASS } from "@/components/layout/page-header";
import { LiveIntelligenceModules, OperationalNoticePanel } from "./evidence-drawer";

/**
 * Live state body for the canonical Event Workspace. Pure presentation over
 * `deriveLiveWorkspace` output. Conditional modules disappear when their
 * source is unsupported or below sample; unavailable KPIs render as
 * unavailable, never 0. The Live page itself is the Phase 1 live
 * intelligence product — nothing here links to a deeper dashboard.
 */

function WhatMattersNowHero({ live }: { live: LiveWorkspace }) {
  const wmn = live.whatMattersNow;
  const isAction = wmn.tone === "action";
  return (
    <section
      data-testid="workspace-what-matters-now"
      className={`relative overflow-hidden rounded-2xl border p-5 shadow-md sm:p-6 ${
        isAction
          ? "border-indigo-400/40 bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-600 text-white"
          : "border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-white"
      }`}
    >
      {isAction ? <div className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full bg-white/10" /> : null}
      <div className="relative grid items-center gap-5 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <p
            className={`text-[11px] font-bold uppercase tracking-[0.12em] ${isAction ? "text-indigo-100" : "text-slate-500"}`}
          >
            What matters now
          </p>
          <h2
            className={`mt-1.5 max-w-3xl text-xl font-bold tracking-tight sm:text-2xl ${isAction ? "text-white" : "text-slate-900"}`}
          >
            {wmn.title}
          </h2>
          <p className={`mt-1.5 max-w-2xl text-sm leading-relaxed ${isAction ? "text-indigo-100" : "text-slate-600"}`}>
            {wmn.body}
          </p>
        </div>
        {wmn.actionLabel && wmn.actionHref ? (
          <Link
            href={wmn.actionHref}
            className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-semibold shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
              isAction
                ? "bg-white text-indigo-700 hover:bg-indigo-50 focus-visible:outline-white"
                : "bg-indigo-600 text-white hover:bg-indigo-500 focus-visible:outline-indigo-500"
            }`}
          >
            {wmn.actionLabel}
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function KpiIcon({ kind }: { kind: string }) {
  const common = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  if (kind === "conversations_today") return <svg {...common}><path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 8.4 8.4 0 0 1-3.7-.9L3 21l1.8-4.2A8.5 8.5 0 1 1 21 11.5Z" /><path d="M8 12h.01M12 12h.01M16 12h.01" /></svg>;
  if (kind === "leads_today") return <svg {...common}><circle cx="12" cy="8" r="3.5" /><path d="M5.5 21a6.5 6.5 0 0 1 13 0" /></svg>;
  if (kind === "hot_needing_follow_up") return <svg {...common}><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" /></svg>;
  if (kind === "follow_ups_due") return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
  return null;
}

function LiveKpiRow({ live }: { live: LiveWorkspace }) {
  const kpis = live.kpis;
  return (
    <section data-testid="workspace-live-kpis" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi) => {
        const due = kpi.key === "follow_ups_due";
        const hot = kpi.key === "hot_needing_follow_up";
        const body = (
          <div className="flex min-w-0 items-start gap-3">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${due ? "bg-amber-100 text-amber-700" : hot ? "bg-orange-50 text-orange-700" : "bg-indigo-50 text-indigo-600"}`}>
              <KpiIcon kind={kpi.key} />
            </span>
            <span className="min-w-0">
              <span className={`block text-2xl font-bold leading-none tracking-tight ${kpi.value === null ? "text-slate-400" : "text-slate-900"}`}>{kpi.display}</span>
              <span className="mt-1.5 block text-xs font-semibold text-slate-600">{kpi.label}</span>
            </span>
          </div>
        );
        const className = `min-w-0 rounded-2xl border bg-white p-3 shadow-sm ${due ? "border-amber-200" : "border-slate-200"}`;
        return kpi.href ? (
          <Link
            key={kpi.key}
            href={kpi.href}
            data-testid={`workspace-live-kpi-${kpi.key}`}
            className={`${className} transition hover:border-slate-300 hover:shadow-md`}
          >
            {body}
          </Link>
        ) : (
          <div key={kpi.key} data-testid={`workspace-live-kpi-${kpi.key}`} className={className}>
            {body}
          </div>
        );
      })}
    </section>
  );
}

function TodayFollowUpStatus({ live, href, className = "" }: { live: LiveWorkspace; href: string; className?: string }) {
  const hot = live.followUpStatus.hotAwaitingFollowUp;
  const dueToday = live.followUpStatus.dueToday;
  const overdue = live.followUpStatus.overdue;
  const unavailable = hot === null && dueToday === null && overdue === null;

  return (
    <section
      data-testid="workspace-follow-up-status"
      className={`${COMMAND_SURFACE_CARD_CLASS} flex min-h-0 flex-col p-5 ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Today’s follow-up status</h2>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span
              role="img"
              aria-label="Counts may overlap because each status is derived independently from the current open lead record."
              title="Counts may overlap because each status is derived independently from the current open lead record."
              className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] font-bold text-slate-500"
            >
              i
            </span>
          </div>
        </div>
        <Link href={href} className="shrink-0 text-xs font-semibold text-indigo-600 transition hover:text-indigo-500">
          Open follow-up queue →
        </Link>
      </div>
      {unavailable ? (
        <p className="mt-4 text-sm text-slate-500">Follow-up status is unavailable right now.</p>
      ) : (
        <>
          <div data-testid="workspace-follow-up-primary" className="mt-4 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-white px-4 py-3.5">
            <p className={`text-4xl font-bold leading-none tracking-tight tabular-nums ${hot === null ? "text-slate-400" : "text-indigo-700"}`}>
              {hot === null ? "—" : hot}
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-800">Hot leads awaiting follow-up</p>
          </div>
          <div data-testid="workspace-follow-up-indicators" className="mt-3 grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2.5">
              <p className={`text-xl font-bold leading-none tabular-nums ${dueToday === null ? "text-slate-400" : "text-amber-800"}`}>{dueToday === null ? "—" : dueToday}</p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-amber-800">Due today</p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50/70 px-3 py-2.5">
              <p className={`text-xl font-bold leading-none tabular-nums ${overdue === null ? "text-slate-400" : "text-rose-700"}`}>{overdue === null ? "—" : overdue}</p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-rose-700">Overdue</p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function SecondaryIntelligenceCard({
  module,
  title,
  emptyText,
  eventId,
  className
}: {
  module: LiveInsightModule | null;
  title: string;
  emptyText: string;
  eventId: string;
  className?: string;
}) {
  return (
    <section className={`${COMMAND_SURFACE_CARD_CLASS} flex flex-col p-5 ${className ?? ""}`}>
      {module ? (
        <LiveIntelligenceModules modules={[module]} eventId={eventId} />
      ) : (
        <>
          <div className="flex items-start gap-3 py-1">
            {title === "Competitor mentions" ? (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-400" aria-hidden>—</span>
            ) : null}
            <div>
              <h2 className="text-sm font-bold text-slate-900">{title}</h2>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{emptyText}</p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

export function LiveEventBody({
  live,
  eventId,
  followUpQueueHref
}: {
  live: LiveWorkspace;
  eventId: string;
  followUpQueueHref: string;
}) {
  const topics = live.modules.filter((module) => module.key === "topics");
  const objections = live.modules.find((module) => module.key === "objections") ?? null;
  const competitors = live.modules.find((module) => module.key === "competitors") ?? null;
  const messaging = live.modules.find((module) => module.key === "buying_signals") ?? null;
  const legacyCoverage = live.intelligenceCoverage?.legacyCount ?? 0;
  const coverageNote =
    legacyCoverage > 0
      ? ` ${legacyCoverage} ${legacyCoverage === 1 ? "analyzed conversation uses" : "analyzed conversations use"} the legacy summary format and do not contain these structured fields.`
      : "";
  const sampleCoverage = live.intelligenceCoverage?.isSampled
    ? `Showing the newest ${live.intelligenceCoverage.analyzedCount} analyzed conversations from ${live.intelligenceCoverage.totalCount} total.`
    : null;
  return (
    <div data-testid="workspace-live-body" className="space-y-4">
      <WhatMattersNowHero live={live} />
      <LiveKpiRow live={live} />
      <div className={`${COMMAND_SURFACE_GRID_CLASS} md:grid-cols-2 xl:grid-cols-12 xl:items-stretch`}>
        <section
          data-testid="workspace-live-intelligence"
          className={`${COMMAND_SURFACE_CARD_CLASS} h-full p-5 sm:p-6 xl:col-span-8 xl:row-start-1`}
        >
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Emerging attendee needs</h2>
              {sampleCoverage ? <p className="mt-1 text-xs text-slate-500">{sampleCoverage}</p> : null}
            </div>
            {topics[0] ? <span className="text-[11px] font-semibold text-slate-400">{topics[0].sampleSize} analyzed conversations</span> : null}
          </div>
          {topics.length > 0 ? (
            <div className="mt-4">
              <LiveIntelligenceModules modules={topics} eventId={eventId} featured />
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              Not enough structured conversations yet for reliable topics.{coverageNote} Evidence-backed attendee needs will appear as structured conversations are analyzed.
            </p>
          )}
        </section>

        <SecondaryIntelligenceCard
          module={messaging}
          title="Messaging that’s resonating"
          emptyText={`No recurring buying-signal messaging meets the evidence threshold yet.${coverageNote}`}
          eventId={eventId}
          className="order-2 md:col-span-1 xl:order-none xl:h-full xl:col-span-4 xl:col-start-9 xl:row-start-1"
        />

        <TodayFollowUpStatus
          live={live}
          href={followUpQueueHref}
          className="order-3 md:col-span-1 xl:order-none xl:h-full xl:col-span-4 xl:col-start-9 xl:row-start-2"
        />

        <SecondaryIntelligenceCard
          module={competitors}
          title="Competitor mentions"
          emptyText={`No competitor mentions meet the evidence threshold yet.${coverageNote}`}
          eventId={eventId}
          className="order-5 md:col-span-1 xl:order-none xl:h-full xl:col-span-4 xl:col-start-1 xl:row-start-2"
        />
        <SecondaryIntelligenceCard
          module={objections}
          title="Rising objections"
          emptyText={`No recurring objections meet the evidence threshold yet.${coverageNote}`}
          eventId={eventId}
          className="order-4 md:col-span-1 xl:order-none xl:h-full xl:col-span-4 xl:col-start-5 xl:row-start-2"
        />

        {live.operational ? (
          <div className="xl:col-span-12 xl:row-start-3">
            <OperationalNoticePanel notice={live.operational} eventId={eventId} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
