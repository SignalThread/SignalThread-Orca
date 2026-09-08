import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import {
  PageHeader,
  PageShell
} from "@/components/layout/page-header";
import { exhibitorEventSettingsHref } from "@/lib/exhibitor/exhibitor-app-nav";
import {
  isContinuousCaptureContainerKind,
  normalizeEventContainerKind
} from "@/lib/events/event-container-kind";
import {
  formatCurrency,
  formatEventDateRange,
  formatEventLocation
} from "@/lib/data/admin-events";
import {
  EVENT_PORTFOLIO_GROUP_LABEL,
  EVENT_PORTFOLIO_GROUP_ORDER,
  eventPortfolioLifecycleForEvent,
  exhibitorOpenEventHref,
  groupEventsForPortfolio,
  type EventPortfolioLifecycle
} from "@/lib/events/event-portfolio";
import { filterLifecycleEventCards } from "@/lib/events/account-command-center-core";
import type {
  AccountActivityEntry,
  AccountFollowUpStatus,
  AccountEventsFilter,
  PortfolioEventCard,
  AccountKpis,
  AccountSetupItem,
  PortfolioTheme,
  PortfolioThemesResult,
  RecommendedStep,
  TeamReadiness,
  WhatMattersNow
} from "@/lib/events/account-command-center-core";

/**
 * Presentation for the account Command Center at /app/events.
 * Pure view (no server-only imports): the page owns auth, scoping, and data.
 * Every value rendered is real production state or an honest "unavailable".
 */

export type PortfolioEventRow = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  container_kind: string | null;
  city: string | null;
  state: string | null;
  location: string | null;
  timezone: string | null;
  created_at: string | null;
  briefing_strategy: unknown;
};

const GROUP_ACCENT: Record<EventPortfolioLifecycle, { dot: string; badge: string }> = {
  live: {
    dot: "bg-emerald-500",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700"
  },
  upcoming: {
    dot: "bg-indigo-500",
    badge: "border-indigo-200 bg-indigo-50 text-indigo-700"
  },
  completed: {
    dot: "bg-slate-400",
    badge: "border-slate-200 bg-slate-100 text-slate-600"
  },
  unknown: {
    dot: "bg-amber-500",
    badge: "border-amber-200 bg-amber-50 text-amber-700"
  }
};

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500";

/* ================================ Icons ================================ */
/* Repo convention: local inline stroke SVGs, aria-hidden, no icon dependency. */

type IconProps = { size?: number; className?: string };

function iconProps({ size = 16, className }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
    className
  };
}

function IconBuilding(p: IconProps) {
  return (
    <svg {...iconProps(p)}>
      <rect x="4" y="3" width="16" height="18" rx="1.5" />
      <path d="M9 8h.01M15 8h.01M9 12h.01M15 12h.01M9 16h.01M15 16h.01" />
    </svg>
  );
}
function IconFlag(p: IconProps) {
  return (
    <svg {...iconProps(p)}>
      <path d="M5 21V4.5A1.5 1.5 0 0 1 6.5 3H18l-2.5 4L18 11H6.5" />
    </svg>
  );
}
function IconUsers(p: IconProps) {
  return (
    <svg {...iconProps(p)}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function IconKey(p: IconProps) {
  return (
    <svg {...iconProps(p)}>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="M10.7 12.3 21 2M15 7l3 3" />
    </svg>
  );
}
function IconBolt(p: IconProps) {
  return (
    <svg {...iconProps(p)}>
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
    </svg>
  );
}
function IconChart(p: IconProps) {
  return (
    <svg {...iconProps(p)}>
      <path d="M3 3v18h18" />
      <path d="M7 15v-4M12 15V7M17 15v-6" />
    </svg>
  );
}
function IconListCheck(p: IconProps) {
  return (
    <svg {...iconProps(p)}>
      <path d="M10 6h11M10 12h11M10 18h11" />
      <path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17" />
    </svg>
  );
}
function IconClock(p: IconProps) {
  return (
    <svg {...iconProps(p)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
function IconCalendar(p: IconProps) {
  return (
    <svg {...iconProps(p)}>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 2.5v4M16 2.5v4" />
    </svg>
  );
}
function IconMapPin(p: IconProps) {
  return (
    <svg {...iconProps(p)}>
      <path d="M20 10c0 6-8 11-8 11s-8-5-8-11a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
function IconMail(p: IconProps) {
  return (
    <svg {...iconProps(p)}>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="m3.5 6.5 8.5 6 8.5-6" />
    </svg>
  );
}
function IconArrowRight(p: IconProps) {
  return (
    <svg {...iconProps(p)}>
      <path d="M4 12h16M13 5l7 7-7 7" />
    </svg>
  );
}
function IconUserPlus(p: IconProps) {
  return (
    <svg {...iconProps(p)}>
      <path d="M15 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8" cy="7" r="4" />
      <path d="M19 6v6M22 9h-6" />
    </svg>
  );
}
function IconInbox(p: IconProps) {
  return (
    <svg {...iconProps(p)}>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5 5 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3-7a2 2 0 0 0-1.8-1H6.8A2 2 0 0 0 5 5Z" />
    </svg>
  );
}
function IconInfo(p: IconProps) {
  return (
    <svg {...iconProps(p)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}

const STEP_ICON: Record<string, (p: IconProps) => ReactNode> = {
  "event-details": IconCalendar,
  "pending-invites": IconMail,
  "seats-exhausted": IconUsers,
  "no-active-license": IconKey
};

function stepIconFor(key: string): (p: IconProps) => ReactNode {
  const base = key.includes(":") ? key.slice(0, key.indexOf(":")) : key;
  return STEP_ICON[base] ?? IconFlag;
}

const ACTIVITY_ICON: Record<AccountActivityEntry["kind"], (p: IconProps) => ReactNode> = {
  event_created: IconCalendar,
  invite_sent: IconMail,
  user_joined: IconUserPlus,
  lead_captured: IconInbox
};

/* ============================ What matters now ============================ */

export function WhatMattersNowHero({ focus }: { focus: WhatMattersNow | null }) {
  if (!focus) return null;
  return (
    <section data-testid="what-matters-now" className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-5 shadow-sm sm:p-6">
      <h2 className="sr-only">What matters now</h2>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 max-w-[60ch] space-y-1.5">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-indigo-700">
            <IconBolt size={13} />
            What matters now
          </p>
          <p className="break-words text-lg font-bold leading-snug tracking-tight text-slate-950 sm:text-xl">
            {focus.title}
          </p>
          <p className="text-sm leading-relaxed text-slate-600">{focus.sub}</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[190px]">
          <Link
            href={focus.openHref}
            className={`inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:bg-indigo-800 ${FOCUS_RING}`}
          >
            Open event
          </Link>
          {focus.secondary ? (
            <Link
              href={focus.secondary.href}
              className={`inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50 active:bg-slate-100 ${FOCUS_RING}`}
            >
              <span className="truncate">{focus.secondary.label}</span>
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/* ================================ KPI row ================================ */

function KpiTile({
  icon,
  value,
  label,
  sublabel
}: {
  icon: ReactNode;
  value: string;
  label: string;
  sublabel: string | null;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-lg font-bold leading-none tracking-tight tabular-nums text-slate-900 sm:text-xl">
          {value}
        </p>
        <p className="mt-1 text-[10px] font-semibold uppercase leading-tight tracking-wide text-slate-500 sm:mt-1.5 sm:text-xs">
          {label}
        </p>
        {sublabel ? (
          <p className="mt-0.5 hidden truncate text-[11px] font-medium text-slate-400 sm:block" title={sublabel}>
            {sublabel}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function AccountKpiRow({ kpis }: { kpis: AccountKpis }) {
  return (
    <section data-testid="account-kpis">
      <h2 className="sr-only">Account overview</h2>
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <KpiTile icon={<IconBuilding />} value={String(kpis.events)} label="Events" sublabel="In your portfolio" />
        <KpiTile
          icon={<IconFlag />}
          value={String(kpis.setupItemsOpen)}
          label="Setup items open"
          sublabel={kpis.setupItemsOpen === 0 ? "Nothing outstanding" : "Across your events"}
        />
        <KpiTile
          icon={<IconUsers />}
          value={kpis.seats ? `${kpis.seats.used} / ${kpis.seats.total}` : "—"}
          label="Team seats used"
          sublabel={
            kpis.seats
              ? `${Math.max(0, kpis.seats.total - kpis.seats.used)} available on active licenses`
              : "Unavailable right now"
          }
        />
        <KpiTile
          icon={<IconKey />}
          value={kpis.activeLicenses === null ? "—" : String(kpis.activeLicenses)}
          label="Active licenses"
          sublabel={kpis.activeLicenses === null ? "Unavailable right now" : "On this account"}
        />
      </div>
    </section>
  );
}

/* =============================== Event cards =============================== */

function EventCard({
  event,
  todayYmd,
  setupItem
}: {
  event: PortfolioEventRow;
  todayYmd: string;
  setupItem: AccountSetupItem | null;
}) {
  const isContinuousCapture = isContinuousCaptureContainerKind(
    normalizeEventContainerKind(event.container_kind)
  );
  const dateText = isContinuousCapture
    ? "Continuous capture · ongoing"
    : formatEventDateRange(event.start_date, event.end_date);
  const locationText = formatEventLocation(event.city, event.state, event.location);
  const metaText = locationText ? `${dateText} · ${locationText}` : dateText;

  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900" title={event.name}>
            {event.name}
          </p>
          <p
            className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-slate-500"
            title={metaText}
          >
            <IconCalendar size={13} className="shrink-0 text-slate-400" />
            <span className="shrink-0 whitespace-nowrap">{dateText}</span>
            {locationText ? (
              <>
                <IconMapPin size={13} className="ml-1 shrink-0 text-slate-400" />
                <span className="truncate text-slate-400">{locationText}</span>
              </>
            ) : null}
          </p>
        </div>
        <StatusBadge event={event} todayYmd={todayYmd} />
      </div>
      {setupItem ? (
        <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium leading-snug text-amber-800">
          <IconFlag size={12} className="mt-[2px] shrink-0" />
          {setupItem.detail}
        </p>
      ) : null}
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <Link
          href={exhibitorOpenEventHref(event.id)}
          aria-label={`Open ${event.name}`}
          className={`inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 active:bg-slate-100 ${FOCUS_RING}`}
        >
          Open event
        </Link>
        <Link
          href={exhibitorEventSettingsHref(event.id)}
          aria-label={`Settings for ${event.name}`}
          className={`-mr-2 inline-flex items-center justify-center rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 active:bg-slate-100 ${FOCUS_RING}`}
        >
          Settings
        </Link>
      </div>
    </li>
  );
}

function StatusBadge({ event, todayYmd }: { event: PortfolioEventRow; todayYmd: string }) {
  const lifecycle = eventPortfolioLifecycleForEvent(event, todayYmd);
  const accent = GROUP_ACCENT[lifecycle];
  const label = EVENT_PORTFOLIO_GROUP_LABEL[lifecycle];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${accent.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${accent.dot}`} aria-hidden />
      {label}
    </span>
  );
}

export function EventsPortfolio({
  events,
  todayYmd,
  setupItems,
  className = ""
}: {
  events: PortfolioEventRow[];
  todayYmd: string;
  setupItems: readonly AccountSetupItem[];
  className?: string;
}) {
  const groups = groupEventsForPortfolio(events, todayYmd);
  const setupByEvent = new Map(
    setupItems.filter((i) => i.eventId !== null).map((i) => [i.eventId as string, i] as const)
  );
  return (
    <section className={`h-full space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      <div>
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
          <IconBuilding size={17} className="text-slate-600" />
          Your events
        </h2>
      </div>
      {EVENT_PORTFOLIO_GROUP_ORDER.map((groupKey) => {
        const groupEvents = groups[groupKey];
        if (groupEvents.length === 0) return null;
        return (
          <section key={groupKey} data-testid={`portfolio-group-${groupKey}`} className="space-y-3">
            <div className="flex items-baseline gap-2">
              <span
                className={`inline-block h-2 w-2 translate-y-[-1px] rounded-full ${GROUP_ACCENT[groupKey].dot}`}
                aria-hidden
              />
              <h3 className="text-sm font-bold text-slate-800">
                {EVENT_PORTFOLIO_GROUP_LABEL[groupKey]}
              </h3>
              <span className="text-xs font-semibold text-slate-400">
                {groupEvents.length} {groupEvents.length === 1 ? "event" : "events"}
              </span>
            </div>
            <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,360px),1fr))] gap-3">
              {groupEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  todayYmd={todayYmd}
                  setupItem={setupByEvent.get(event.id) ?? null}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </section>
  );
}

const LIFECYCLE_LANES = [
  { key: "completed", label: "Wrapped", shortLabel: "Wrapped", marker: "bg-slate-400", line: "bg-slate-200" },
  { key: "live", label: "Happening now", shortLabel: "Live", marker: "bg-emerald-500", line: "bg-emerald-200" },
  { key: "upcoming", label: "Upcoming", shortLabel: "Upcoming", marker: "bg-indigo-500", line: "bg-indigo-200" },
  { key: "unknown", label: "Needs timezone", shortLabel: "Needs timezone", marker: "bg-amber-500", line: "bg-amber-200" }
] as const;

type LifecycleLaneKey = (typeof LIFECYCLE_LANES)[number]["key"];

function displayNumber(value: number | null) {
  return value === null ? "—" : value.toLocaleString("en-US");
}

function EventLifecycleCard({ card }: { card: PortfolioEventCard }) {
  const phase = card.lifecycle;
  const action = card.nextAction?.label ?? (phase === "live" ? (card.hotAwaitingFollowUp === 0 ? "No hot follow-ups waiting" : `${displayNumber(card.hotAwaitingFollowUp)} hot waiting`) : phase === "upcoming" ? "Ready to review" : phase === "unknown" ? "Set event timezone" : card.openFollowUps ? `${card.openFollowUps} open follow-ups` : "No open follow-ups");
  const actionTone =
    phase === "live" && card.hotAwaitingFollowUp === 0
      ? "text-emerald-700"
      : card.nextAction || (phase === "live" && (card.hotAwaitingFollowUp ?? 0) > 0) || (phase === "completed" && (card.openFollowUps ?? 0) > 0)
        ? "text-amber-700"
        : "text-slate-600";
  return (
    <Link
      href={exhibitorOpenEventHref(card.event.id)}
      aria-label={`Open ${card.event.name}`}
      className={`group block rounded-xl border border-slate-200 bg-white p-3.5 transition hover:border-slate-300 hover:bg-slate-50/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${FOCUS_RING}`}
    >
      <p className={`text-[11px] font-bold ${phase === "live" ? "text-emerald-700" : phase === "upcoming" ? "text-indigo-600" : "text-slate-500"}`}>
        {card.timing ?? (phase === "live" ? "Live now" : phase === "upcoming" ? "Dates to be confirmed" : phase === "unknown" ? "Timezone not configured" : "Wrapped")}
      </p>
      <h3 className="mt-1 truncate text-sm font-bold text-slate-900" title={card.event.name}>{card.event.name}</h3>
      <p className="mt-0.5 truncate text-xs text-slate-500">{card.location ?? "Location not set"}</p>
      {phase === "unknown" ? (
        <div className="mt-3 border-t border-slate-100 pt-2.5 text-sm font-semibold text-amber-700">Metrics unavailable</div>
      ) : phase === "upcoming" ? (
        <div className="mt-3 border-t border-slate-100 pt-2.5">
          <p className="text-lg font-bold tabular-nums text-slate-900">{card.readinessPercent === null ? "—" : `${card.readinessPercent}%`} <span className="text-[11px] font-semibold text-slate-500">ready</span></p>
        </div>
      ) : phase === "live" ? (
        <div className="mt-3 border-t border-slate-100 pt-2.5">
          <p className="text-lg font-bold tabular-nums text-slate-900">{displayNumber(card.leadsToday)} <span className="text-[11px] font-semibold text-slate-500">leads today</span></p>
        </div>
      ) : (
        <div className="mt-3 border-t border-slate-100 pt-2.5">
          <p className="text-lg font-bold tabular-nums text-slate-900">{card.pipelineValue === null ? "—" : formatCurrency(card.pipelineValue)} <span className="text-[11px] font-semibold text-slate-500">pipeline</span></p>
        </div>
      )}
      <p className={`mt-2 flex items-center gap-1.5 text-[11px] font-semibold ${actionTone}`}>
        <IconFlag size={12} /> {action}
      </p>
    </Link>
  );
}

function EmptyLiveLane({ next }: { next: PortfolioEventCard | null }) {
  return (
    <div data-testid="no-live-events" className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-3.5 py-5 text-center">
      <span className="mx-auto block h-3 w-3 rounded-full border-2 border-slate-300 bg-white" aria-hidden />
      <p className="mt-2 text-sm font-bold text-slate-700">No event on the floor</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        {next?.timing ? `Next opening: ${next.event.name} · ${next.timing.replace(/^Opens /, "")}` : "No upcoming event is scheduled."}
      </p>
    </div>
  );
}

export function LifecycleEventsPortfolio({ lifecycleEvents }: { lifecycleEvents: Record<LifecycleLaneKey, readonly PortfolioEventCard[]> }) {
  const nextUpcoming = lifecycleEvents.upcoming[0] ?? null;
  return (
    <section data-testid="lifecycle-events" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><IconBuilding size={17} className="text-slate-600" />Your events</h2>
        <Link href="/app/events?view=all" className={`text-xs font-semibold text-indigo-600 transition hover:text-indigo-500 ${FOCUS_RING}`}>All events →</Link>
      </div>
      <div className="relative mt-5 grid grid-cols-1 gap-5 lg:grid-cols-4 lg:gap-4">
        <div className="absolute left-[16.666%] right-[16.666%] top-[27px] hidden h-px bg-slate-200 lg:block" aria-hidden />
        {LIFECYCLE_LANES.map((lane) => {
          const cards = lifecycleEvents[lane.key];
          const visible = cards.slice(0, 3);
          const more = cards.length - visible.length;
          return (
            <section key={lane.key} data-testid={`lifecycle-lane-${lane.key}`} className="relative min-w-0">
              <div className="flex items-center gap-2">
                <span className={`relative z-10 h-3 w-3 shrink-0 rounded-full border-2 border-white ${lane.marker} ring-1 ring-slate-200`} aria-hidden />
                <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-slate-600">{lane.label}</h3>
                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-slate-500">{cards.length}</span>
              </div>
              <div className="mt-3 space-y-2">
                {lane.key === "live" && cards.length === 0 ? <EmptyLiveLane next={nextUpcoming} /> : null}
                {visible.map((card) => <EventLifecycleCard key={card.event.id} card={card} />)}
                {more > 0 ? <Link href={`/app/events?view=all&lifecycle=${lane.key === "completed" ? "wrapped" : lane.key}`} className={`block rounded-lg border border-dashed border-slate-200 px-3 py-2 text-center text-xs font-semibold text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 ${FOCUS_RING}`}>+ {more} more</Link> : null}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function AllEventsRow({ card }: { card: PortfolioEventCard }) {
  const lifecycleLabel = card.lifecycle === "completed" ? "Wrapped" : card.lifecycle === "live" ? "Live" : card.lifecycle === "unknown" ? "Needs timezone" : "Upcoming";
  const phaseStatus = card.timing ?? (card.lifecycle === "live" ? "Live now" : lifecycleLabel);
  const next = card.nextAction?.label ?? (card.lifecycle === "unknown" ? "Set event timezone" : card.lifecycle === "completed" ? (card.openFollowUps ? `${card.openFollowUps} open` : "Closed out") : card.lifecycle === "live" ? (card.hotAwaitingFollowUp ? `${card.hotAwaitingFollowUp} waiting` : "No hot follow-ups waiting") : card.readinessPercent === null ? "Readiness unavailable" : `${card.readinessPercent}% ready`);
  return (
    <tr className="group border-t border-slate-100 text-sm transition hover:bg-slate-50">
      <td className="p-0"><Link href={exhibitorOpenEventHref(card.event.id)} aria-label={`Open ${card.event.name}`} className={`block min-w-[190px] px-4 py-3 ${FOCUS_RING}`}><span className="block font-semibold text-slate-900 group-hover:text-indigo-700">{card.event.name}</span><span className="mt-0.5 block truncate text-xs text-slate-500">{card.location ?? "Location not set"}</span></Link></td>
      <td className="whitespace-nowrap px-3 py-3"><span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${card.lifecycle === "live" ? "text-emerald-700" : card.lifecycle === "upcoming" ? "text-indigo-700" : "text-slate-600"}`}><span className={`h-1.5 w-1.5 rounded-full ${card.lifecycle === "live" ? "bg-emerald-500" : card.lifecycle === "upcoming" ? "bg-indigo-500" : "bg-slate-400"}`} />{phaseStatus}</span></td>
      <td className="hidden whitespace-nowrap px-3 py-3 text-xs text-slate-600 md:table-cell">{formatEventDateRange(card.event.start_date, card.event.end_date)}</td>
      <td className="hidden px-3 py-3 text-right font-semibold tabular-nums text-slate-800 sm:table-cell">{displayNumber(card.totalLeads)}</td>
      <td className="hidden px-3 py-3 text-right font-semibold tabular-nums text-amber-700 lg:table-cell">{displayNumber(card.hotAwaitingFollowUp)}</td>
      <td className="hidden px-3 py-3 text-right font-semibold tabular-nums text-slate-700 lg:table-cell">{displayNumber(card.openFollowUps)}</td>
      <td className="hidden px-3 py-3 text-right font-semibold tabular-nums text-slate-700 xl:table-cell">{card.pipelineValue === null ? "—" : formatCurrency(card.pipelineValue)}</td>
      <td className="px-3 py-3 text-xs font-semibold text-slate-700">{next}</td>
    </tr>
  );
}

export function AllEventsTable({
  lifecycleEvents,
  initialLifecycle,
  initialSearch
}: {
  lifecycleEvents: Record<LifecycleLaneKey, readonly PortfolioEventCard[]>;
  initialLifecycle: AccountEventsFilter;
  initialSearch: string;
}) {
  const allCounts = {
    all: lifecycleEvents.live.length + lifecycleEvents.upcoming.length + lifecycleEvents.completed.length + lifecycleEvents.unknown.length,
    live: lifecycleEvents.live.length,
    upcoming: lifecycleEvents.upcoming.length,
    wrapped: lifecycleEvents.completed.length
  };
  const rows = filterLifecycleEventCards(lifecycleEvents, { lifecycle: initialLifecycle, search: initialSearch });
  const visibleCount = rows.live.length + rows.upcoming.length + rows.completed.length + rows.unknown.length;
  const filters: Array<{ key: AccountEventsFilter; label: string }> = [
    { key: "all", label: "All" }, { key: "live", label: "Live" }, { key: "upcoming", label: "Upcoming" }, { key: "wrapped", label: "Wrapped" }
  ];
  const hrefFor = (key: AccountEventsFilter) => `/app/events?view=all&lifecycle=${key}${initialSearch ? `&q=${encodeURIComponent(initialSearch)}` : ""}`;
  const groups: Array<{ key: LifecycleLaneKey; label: string; cards: readonly PortfolioEventCard[] }> = [
    { key: "live", label: "Happening now", cards: rows.live },
    { key: "upcoming", label: "Upcoming", cards: rows.upcoming },
    { key: "completed", label: "Wrapped", cards: rows.completed },
    { key: "unknown", label: "Needs timezone", cards: rows.unknown }
  ];
  return (
    <section data-testid="all-events-table" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Account events</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">All events</h1><p className="mt-1 text-sm text-slate-500">Browse the events you can access across every lifecycle.</p></div>
        <Link href="/app/events" className={`text-sm font-semibold text-indigo-600 hover:text-indigo-500 ${FOCUS_RING}`}>← Back to Command Center</Link>
      </div>
      <form className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center" action="/app/events" method="get">
        <input type="hidden" name="view" value="all" />
        <input type="hidden" name="lifecycle" value={initialLifecycle} />
        <label className="sr-only" htmlFor="event-search">Search events</label>
        <input id="event-search" name="q" defaultValue={initialSearch} placeholder="Search events, cities, or playbooks" className={`h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 ${FOCUS_RING}`} />
        <button type="submit" className={`h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 ${FOCUS_RING}`}>Search</button>
      </form>
      <nav aria-label="Event lifecycle filters" className="flex flex-wrap gap-2">
        {filters.map((filter) => <Link key={filter.key} href={hrefFor(filter.key)} aria-current={initialLifecycle === filter.key ? "page" : undefined} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${initialLifecycle === filter.key ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-700"} ${FOCUS_RING}`}>{filter.label} <span className="ml-1 tabular-nums opacity-80">{allCounts[filter.key]}</span></Link>)}
      </nav>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[780px] border-collapse text-left"><thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500"><tr><th className="px-4 py-3">Event</th><th className="px-3 py-3">Status</th><th className="hidden px-3 py-3 md:table-cell">Dates</th><th className="hidden px-3 py-3 text-right sm:table-cell">Leads</th><th className="hidden px-3 py-3 text-right lg:table-cell">Hot</th><th className="hidden px-3 py-3 text-right lg:table-cell">Follow-ups</th><th className="hidden px-3 py-3 text-right xl:table-cell">Pipeline</th><th className="px-3 py-3">Next action</th></tr></thead><tbody>{groups.map((group) => group.cards.length > 0 ? <Fragment key={group.key}><tr className="bg-slate-50/70"><th colSpan={8} className="px-4 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">{group.label} · {group.cards.length}</th></tr>{group.cards.map((card) => <AllEventsRow key={card.event.id} card={card} />)}</Fragment> : null)}{visibleCount === 0 ? <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">No events match this view.</td></tr> : null}</tbody></table>
      </div>
      <p className="text-xs text-slate-500">Showing {visibleCount} of {allCounts.all} events. Pipeline is shown when a canonical value is available.</p>
    </section>
  );
}

/* ============================ Portfolio themes ============================ */

/** One consistent chip treatment — the strongest source (stored signals) gets the accent. */
const THEME_CATEGORY_BADGE: Record<PortfolioTheme["category"], string> = {
  Signal: "bg-indigo-50 text-indigo-700",
  Industry: "bg-slate-100 text-slate-500",
  Seniority: "bg-slate-100 text-slate-500",
  Role: "bg-slate-100 text-slate-500",
  Company: "bg-slate-100 text-slate-500"
};

export function PortfolioThemesPanel({ result, className = "" }: { result: PortfolioThemesResult | null; className?: string }) {
  const themes = result?.themes ?? null;
  const sampleSize = result?.sampleSize ?? 0;
  return (
    <section
      data-testid="portfolio-themes"
      className={`h-full space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}
    >
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
          <IconChart size={17} className="text-slate-600" />
          Themes across your events
        </h2>
        {result !== null && result.themes.length > 0 ? (
          <p className="text-xs text-slate-500">
            Patterns found across {result.sampleSize.toLocaleString("en-US")} recent{" "}
            {result.sampleSize === 1 ? "lead" : "leads"} from your accessible events.
          </p>
        ) : null}
      </div>
      {result === null || themes === null ? (
        <p className="text-sm text-slate-500">Portfolio themes are unavailable right now.</p>
      ) : themes.length === 0 ? (
        <p className="text-sm text-slate-500">
          Portfolio themes will appear as leads are captured across your events.
        </p>
      ) : (
        <ul className="space-y-3">
          {themes.map((theme) => (
            <li key={theme.key} className="min-w-0">
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-semibold text-slate-800" title={theme.label}>
                    {theme.label}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${THEME_CATEGORY_BADGE[theme.category]}`}
                  >
                    {theme.category}
                  </span>
                </span>
                <span className="shrink-0 text-sm tabular-nums text-slate-900">
                  <span className="font-bold">{theme.count.toLocaleString("en-US")}</span>
                  <span className="ml-1 text-[11px] font-semibold text-slate-400">
                    of {sampleSize.toLocaleString("en-US")} {sampleSize === 1 ? "lead" : "leads"}
                  </span>
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-indigo-400"
                  style={{ width: `${theme.barPct}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ============================ Rail: recommended ============================ */

export function RecommendedNextSteps({ steps, className = "" }: { steps: readonly RecommendedStep[] | null; className?: string }) {
  return (
    <section data-testid="recommended-next-steps" className={`h-full space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
        <IconListCheck size={15} className="text-slate-600" />
        Recommended next steps
      </h2>
      {steps === null ? (
        <p className="text-xs text-slate-500">Recommendations are unavailable right now.</p>
      ) : steps.length === 0 ? (
        <p className="text-xs text-slate-500">Nothing needs your attention right now.</p>
      ) : (
        <ul className="space-y-2">
          {steps.map((step) => {
            const StepIcon = stepIconFor(step.key);
            return (
              <li key={step.key}>
                <Link
                  href={step.href}
                  aria-label={`${step.label} — ${step.actionLabel}`}
                  className={`group flex items-start gap-2.5 rounded-xl border border-slate-200/70 bg-slate-50/50 px-2.5 py-2.5 transition hover:border-indigo-200 hover:bg-white hover:shadow-md active:bg-slate-100 active:shadow-sm ${FOCUS_RING}`}
                >
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
                      step.severity === "blocker"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-indigo-50 text-indigo-600"
                    }`}
                  >
                    <StepIcon size={13} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold leading-snug text-slate-800">
                      {step.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">
                      {step.detail}
                    </span>
                  </span>
                  <span
                    className="mt-1 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-indigo-600"
                    aria-hidden
                  >
                    <IconArrowRight size={14} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ============================ Rail: team readiness ============================ */

export function TeamReadinessPanel({ team, className = "" }: { team: TeamReadiness | null; className?: string }) {
  return (
    <section data-testid="team-readiness" className={`h-full space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <IconUsers size={15} className="text-slate-600" />
          Team readiness
        </h2>
        <Link
          href="/app/settings"
          className={`rounded text-[11px] font-semibold text-indigo-600 transition hover:text-indigo-500 ${FOCUS_RING}`}
        >
          Manage
        </Link>
      </div>
      {team === null ? (
        <p className="text-xs text-slate-500">Team information is unavailable right now.</p>
      ) : (
        <div className="space-y-3">
          <dl className="grid grid-cols-3 gap-2 text-center">
            {[
              [String(team.activeCount), "Company users"],
              [String(team.pendingCount), "Invited"],
              [team.seatsAvailable === null ? "—" : String(team.seatsAvailable), "Seats free"]
            ].map(([v, k]) => (
              <div key={k} className="rounded-xl bg-slate-50 px-2 py-2">
                <dt className="sr-only">{k}</dt>
                <dd className="text-sm font-bold tabular-nums text-slate-900">{v}</dd>
                <dd className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{k}</dd>
              </div>
            ))}
          </dl>
          {team.pendingCount > 0 ? (
            <ul className="space-y-1">
              {team.pending.map((p) => (
                <li key={p.email} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-slate-600" title={p.email}>
                    {p.email}
                  </span>
                  <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                    Invited
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </section>
  );
}

/* ============================ Rail: recent activity ============================ */

const ACTIVITY_DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC"
});

function activityDateLabel(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  return ACTIVITY_DATE.format(parsed);
}

export function RecentActivityPanel({ activity, className = "" }: { activity: readonly AccountActivityEntry[] | null; className?: string }) {
  return (
    <section data-testid="recent-activity" className={`h-full space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
        <IconClock size={15} className="text-slate-600" />
        Recent activity
      </h2>
      {activity === null ? (
        <p className="text-xs text-slate-500">Activity is unavailable right now.</p>
      ) : activity.length === 0 ? (
        <p className="text-xs text-slate-500">No recent account activity.</p>
      ) : (
        <ul className="space-y-2.5">
          {activity.map((entry) => {
            const ActivityIcon = ACTIVITY_ICON[entry.kind];
            return (
              <li key={entry.key} className="flex items-start justify-between gap-3 text-xs">
                <span className="flex min-w-0 items-start gap-2">
                  <span className="mt-[1px] shrink-0 text-slate-300">
                    <ActivityIcon size={13} />
                  </span>
                  <span className="line-clamp-2 min-w-0 leading-snug text-slate-600" title={entry.label}>
                    {entry.label}
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-slate-400">
                  {activityDateLabel(entry.at)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ======================== Cross-event follow-up status ======================== */

function FollowUpStatusTile({
  value,
  label,
  href,
  tone
}: {
  value: number | null;
  label: string;
  href: string;
  tone: "indigo" | "amber" | "rose";
}) {
  const tones = {
    indigo: "border-indigo-100 bg-indigo-50/70 text-indigo-700 hover:border-indigo-200",
    amber: "border-amber-200 bg-amber-50/70 text-amber-800 hover:border-amber-300",
    rose: "border-rose-200 bg-rose-50/70 text-rose-700 hover:border-rose-300"
  };
  return (
    <Link
      href={href}
      className={`rounded-xl border px-3 py-2.5 transition hover:shadow-sm ${tones[tone]} ${FOCUS_RING}`}
    >
      <span className="block text-xl font-bold leading-none tabular-nums">{value === null ? "—" : value}</span>
      <span className="mt-1 block text-[11px] font-semibold leading-snug text-slate-700">{label}</span>
    </Link>
  );
}

export function CrossEventFollowUpStatus({ status, className = "" }: { status: AccountFollowUpStatus; className?: string }) {
  const noWork =
    status.outstanding === 0 &&
    status.hotAwaitingFollowUp === 0 &&
    status.dueToday === 0 &&
    status.overdue === 0;
  return (
    <section data-testid="cross-event-follow-up-status" className={`flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <IconClock size={17} className="text-slate-600" />
            Cross-event follow-up status
          </h2>
          <span
            role="img"
            aria-label="Counts may overlap because each status is independently derived from accessible open lead records."
            title="Counts may overlap because each status is independently derived from accessible open lead records."
            className="mt-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-slate-500"
          >
            <IconInfo size={11} />
          </span>
        </div>
        <Link href={status.hrefs.allFollowUps} className={`shrink-0 text-xs font-semibold text-indigo-600 transition hover:text-indigo-500 ${FOCUS_RING}`}>
          Open due follow-ups →
        </Link>
      </div>
      <div className="mt-5 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-white px-4 py-3.5">
        <p className={`text-4xl font-bold leading-none tracking-tight tabular-nums ${status.outstanding === null ? "text-slate-400" : "text-indigo-700"}`}>
          {status.outstanding === null ? "—" : status.outstanding}
        </p>
        <p className="mt-2 text-sm font-semibold text-slate-800">Open follow-ups due</p>
      </div>
      {noWork ? (
        <p className="mt-3 text-sm text-slate-500">No follow-up work is currently due.</p>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <FollowUpStatusTile value={status.hotAwaitingFollowUp} label="Hot awaiting follow-up" href={status.hrefs.hotAwaitingFollowUp} tone="indigo" />
          <FollowUpStatusTile value={status.dueToday} label="Due today" href={status.hrefs.dueToday} tone="amber" />
          <FollowUpStatusTile value={status.overdue} label="Overdue" href={status.hrefs.overdue} tone="rose" />
        </div>
      )}
    </section>
  );
}

/* ================================ Page view ================================ */

export function AccountCommandCenterView({
  companyName,
  createEventHref,
  events,
  lifecycleEvents,
  todayYmd,
  setupItems,
  kpis,
  whatMattersNow,
  themes,
  recommendedSteps,
  teamReadiness,
  activity,
  followUpStatus,
  allEventsView = null
}: {
  companyName: string;
  createEventHref: string | null;
  events: PortfolioEventRow[];
  lifecycleEvents: Record<LifecycleLaneKey, readonly PortfolioEventCard[]>;
  todayYmd: string;
  setupItems: readonly AccountSetupItem[];
  kpis: AccountKpis;
  whatMattersNow: WhatMattersNow | null;
  themes: PortfolioThemesResult | null;
  recommendedSteps: readonly RecommendedStep[] | null;
  teamReadiness: TeamReadiness | null;
  activity: readonly AccountActivityEntry[] | null;
  followUpStatus: AccountFollowUpStatus;
  allEventsView?: { lifecycle: AccountEventsFilter; search: string } | null;
}) {
  const trimmedCompanyName = companyName.trim();

  if (allEventsView) {
    return (
      <PageShell>
        <AllEventsTable
          lifecycleEvents={lifecycleEvents}
          initialLifecycle={allEventsView.lifecycle}
          initialSearch={allEventsView.search}
        />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        variant="panel"
        eyebrow={trimmedCompanyName.length > 0 ? `${trimmedCompanyName} · Account` : "Account"}
        eyebrowStyle="plain"
        title="Command Center"
        actions={createEventHref ? (
          <Link
            href={createEventHref}
            className={`inline-flex h-10 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 active:bg-slate-950 ${FOCUS_RING}`}
          >
            Create event
          </Link>
        ) : null}
      />

      <WhatMattersNowHero focus={whatMattersNow} />

      <AccountKpiRow kpis={kpis} />

      <LifecycleEventsPortfolio lifecycleEvents={lifecycleEvents} />
      <div data-testid="account-primary-grid" className="grid grid-cols-1 gap-4 xl:grid-cols-3 xl:items-stretch"><RecommendedNextSteps steps={recommendedSteps} /><TeamReadinessPanel team={teamReadiness} /><RecentActivityPanel activity={activity} /></div>

      <div data-testid="account-lower-grid" className="grid grid-cols-1 gap-4 xl:grid-cols-12 xl:items-stretch">
        <PortfolioThemesPanel result={themes} className="xl:col-span-8 xl:h-full" />
        <CrossEventFollowUpStatus status={followUpStatus} className="xl:col-span-4 xl:h-full" />
      </div>
    </PageShell>
  );
}
