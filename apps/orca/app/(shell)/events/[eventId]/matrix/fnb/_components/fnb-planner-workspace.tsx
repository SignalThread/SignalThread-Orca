"use client";

import Link from "next/link";
import { AlertCircle, ArrowUpRight, CalendarDays, CheckCircle2, Loader2, Plus, Utensils } from "lucide-react";
import { FormEvent, useCallback, useMemo, useState } from "react";

import type { FnbCatalogItemRecord, FnbSourceMenuRecord } from "@/lib/fnb-catalog";
import type {
  FnbEventPlannerPayload,
  FnbFunctionReadinessState,
  FnbFunctionRecord,
} from "@/lib/fnb-event-planner";
import type {
  FnbEventRequirementsPayload,
  FnbRequirementStatus,
} from "@/lib/fnb-event-requirements";

import { FnbCatalogWorkspace } from "../../../fnb-catalog/_components/fnb-catalog-workspace";

type LinkableSession = {
  id: string;
  name: string;
  date: string;
  startTime: string | null;
};

type Props = {
  eventId: string;
  eventName: string;
  initialPlanner: FnbEventPlannerPayload;
  initialRequirements: FnbEventRequirementsPayload;
  linkableSessions: LinkableSession[];
  catalogItems: FnbCatalogItemRecord[];
  sourceMenus: FnbSourceMenuRecord[];
  canWrite: boolean;
};

type Tab = "functions" | "requirements" | "catalog";
type ReadinessFilter = "all" | FnbFunctionReadinessState;
type RequirementFilter = "all" | FnbRequirementStatus;

const REQUIREMENT_LABEL: Record<FnbRequirementStatus, string> = {
  verified: "Verified",
  needsWork: "Needs work",
  blocked: "Blocked",
};

const REQUIREMENT_TONE: Record<FnbRequirementStatus, string> = {
  verified: "border-emerald-200 bg-emerald-50 text-emerald-800",
  needsWork: "border-amber-200 bg-amber-50 text-amber-900",
  blocked: "border-rose-200 bg-rose-50 text-rose-900",
};

const READINESS_LABEL: Record<FnbFunctionReadinessState, string> = {
  ready: "Ready",
  needsWork: "Needs work",
  blocked: "Blocked",
};

const READINESS_TONE: Record<FnbFunctionReadinessState, string> = {
  ready: "border-emerald-200 bg-emerald-50 text-emerald-800",
  needsWork: "border-amber-200 bg-amber-50 text-amber-900",
  blocked: "border-rose-200 bg-rose-50 text-rose-900",
};

const FUNCTION_TYPES = ["BREAKFAST", "BREAK", "LUNCH", "RECEPTION", "DINNER", "OTHER"] as const;

function money(cents: number | null): string {
  if (cents === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function preciseMoney(cents: number | null): string {
  if (cents === null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function dayLabel(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

function timeLabel(value: string | null): string {
  if (!value) return "—";
  const [hours, minutes] = value.split(":").map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;
  const suffix = hours >= 12 ? "PM" : "AM";
  const display = hours % 12 === 0 ? 12 : hours % 12;
  return `${display}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function serviceWindow(entry: FnbFunctionRecord): string {
  if (!entry.startTime && !entry.endTime) return "Time not set";
  return `${timeLabel(entry.startTime)} – ${timeLabel(entry.endTime)}`;
}

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</dt>
      <dd className="mt-1 text-xl font-semibold text-slate-950">{value}</dd>
      {hint ? <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function FnbPlannerWorkspace({
  eventId,
  eventName,
  initialPlanner,
  initialRequirements,
  linkableSessions,
  catalogItems,
  sourceMenus,
  canWrite,
}: Props) {
  const [planner, setPlanner] = useState(initialPlanner);
  const [requirements, setRequirements] = useState(initialRequirements);
  const [tab, setTab] = useState<Tab>("functions");
  const [readinessFilter, setReadinessFilter] = useState<ReadinessFilter>("all");
  const [requirementFilter, setRequirementFilter] = useState<RequirementFilter>("all");
  const [expandedRequirementId, setExpandedRequirementId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const { functions, totals, costByDay, costByType } = planner;

  const visibleFunctions = useMemo(
    () =>
      readinessFilter === "all"
        ? functions
        : functions.filter((entry) => entry.readiness === readinessFilter),
    [functions, readinessFilter],
  );

  const visibleRequirements = useMemo(
    () =>
      requirementFilter === "all"
        ? requirements.requirements
        : requirements.requirements.filter((entry) => entry.status === requirementFilter),
    [requirements, requirementFilter],
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const [plannerResponse, requirementsResponse] = await Promise.all([
        fetch(`/api/events/${eventId}/fnb/planner`, { cache: "no-store" }),
        fetch(`/api/events/${eventId}/fnb/requirements`, { cache: "no-store" }),
      ]);
      if (!plannerResponse.ok || !requirementsResponse.ok) {
        throw new Error("Unable to refresh F&B totals");
      }
      setPlanner((await plannerResponse.json()) as FnbEventPlannerPayload);
      setRequirements((await requirementsResponse.json()) as FnbEventRequirementsPayload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to refresh F&B totals");
    } finally {
      setRefreshing(false);
    }
  }, [eventId]);

  async function createFunction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setCreating(true);
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(
      Array.from(form.entries()).filter(([, value]) => String(value).trim().length > 0),
    );

    try {
      const response = await fetch(`/api/events/${eventId}/fnb/functions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as {
        planner?: FnbEventPlannerPayload;
        created?: boolean;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Unable to create the function");
      // Rollups come back from the server after the write commits, never patched client-side.
      if (payload.planner) setPlanner(payload.planner);
      setShowCreate(false);
      setNotice(payload.created ? "Function created." : "Session is now an F&B function.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create the function");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-5 pb-8">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{eventName}</p>
        <div className="mt-1 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-slate-950">F&amp;B Planner</h1>
            <p className="mt-1 text-sm text-slate-600">
              Everything served across {eventName}: what it costs, what is incomplete, and what needs action.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 disabled:opacity-60"
            >
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Refresh totals
            </button>
            {canWrite ? (
              <button
                type="button"
                onClick={() => setShowCreate((current) => !current)}
                aria-expanded={showCreate}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Create function
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <nav className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1" aria-label="F&B Planner sections">
        {(
          [
            ["functions", `Functions (${totals.functionCount})`],
            ["requirements", `Requirements (${requirements.summary.total})`],
            ["catalog", "Menu catalog"],
          ] as Array<[Tab, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-current={tab === key ? "page" : undefined}
            className={`h-9 flex-1 rounded-lg px-3 text-sm font-semibold transition ${
              tab === key ? "bg-slate-950 text-white" : "text-slate-700 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {error ? (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <AlertCircle className="h-4 w-4" aria-hidden />
          <span className="min-w-0 flex-1">{error}</span>
          <button type="button" onClick={() => void refresh()} className="font-semibold underline">
            Retry
          </button>
        </div>
      ) : null}

      {notice ? (
        <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          {notice}
        </div>
      ) : null}

      {tab === "catalog" ? (
        <FnbCatalogWorkspace
          eventId={eventId}
          eventName={eventName}
          initialItems={catalogItems}
          initialSourceMenus={sourceMenus}
        />
      ) : tab === "requirements" ? (
        <>
          <section aria-label="Requirement status" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(
              [
                ["verified", requirements.summary.verified],
                ["needsWork", requirements.summary.needsWork],
                ["blocked", requirements.summary.blocked],
              ] as Array<[FnbRequirementStatus, number]>
            ).map(([state, count]) => (
              <button
                key={state}
                type="button"
                onClick={() => setRequirementFilter((current) => (current === state ? "all" : state))}
                aria-pressed={requirementFilter === state}
                className={`rounded-xl border p-3 text-left transition ${REQUIREMENT_TONE[state]} ${
                  requirementFilter === state ? "ring-2 ring-slate-900/20" : ""
                }`}
              >
                <span className="block text-2xl font-semibold">{count}</span>
                <span className="text-xs font-semibold">{REQUIREMENT_LABEL[state]}</span>
              </button>
            ))}
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                Outstanding
              </p>
              <p className="mt-1 text-sm text-slate-800">
                <strong>{requirements.summary.outstandingAccommodations.toLocaleString()}</strong>{" "}
                accommodations across <strong>{requirements.summary.affectedFunctionCount}</strong>{" "}
                function{requirements.summary.affectedFunctionCount === 1 ? "" : "s"}
              </p>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">
                Accommodations are servings owed. One attendee may need the same accommodation at
                more than one function, so this is not a count of people.
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-950">
                Dietary, allergen, and accessibility requirements
              </h2>
              {requirementFilter !== "all" ? (
                <button
                  type="button"
                  onClick={() => setRequirementFilter("all")}
                  className="text-xs font-semibold text-slate-700 underline"
                >
                  Clear filter
                </button>
              ) : null}
            </div>

            {requirements.requirements.length === 0 ? (
              <div className="py-12 text-center">
                <AlertCircle className="mx-auto h-7 w-7 text-slate-400" aria-hidden />
                <h3 className="mt-3 font-semibold text-slate-900">No requirements recorded</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Dietary, allergen, and accessibility requirements added to a function appear here
                  with the function they belong to.
                </p>
              </div>
            ) : visibleRequirements.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">
                No requirements are {REQUIREMENT_LABEL[requirementFilter as FnbRequirementStatus].toLowerCase()}.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {visibleRequirements.map((entry) => {
                  const expanded = expandedRequirementId === entry.id;
                  return (
                    <li key={entry.id}>
                      <article className="rounded-xl border border-slate-200 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="text-base font-semibold text-slate-950">
                              {entry.label}
                              {entry.quantity !== null ? (
                                <span className="font-normal text-slate-700">
                                  {" "}
                                  — {entry.quantity.toLocaleString()} accommodation
                                  {entry.quantity === 1 ? "" : "s"}
                                </span>
                              ) : null}
                            </h3>
                            {/* Scope is stated before anything else: a requirement on Breakfast
                                must never read as event-wide. */}
                            <p className="mt-0.5 text-xs text-slate-600">
                              {entry.scope.functionName} · {dayLabel(entry.scope.date)} ·{" "}
                              {entry.scope.startTime
                                ? `${timeLabel(entry.scope.startTime)}–${timeLabel(entry.scope.endTime)}`
                                : "Time not set"}{" "}
                              · {entry.scope.location ?? "Location not set"}
                            </p>
                            <p className="mt-1 text-sm text-slate-800">
                              <span className="font-semibold">{entry.result}.</span> {entry.cause}
                            </p>
                            <p className="mt-1 text-sm text-slate-700">
                              Action required: {entry.nextAction}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full border px-2 py-1 text-xs font-semibold ${REQUIREMENT_TONE[entry.status]}`}
                          >
                            {REQUIREMENT_LABEL[entry.status]}
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                          <span>Owner: {entry.ownerLabel ?? "Unassigned"}</span>
                          <span>
                            Last updated{" "}
                            {new Intl.DateTimeFormat("en-US", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            }).format(new Date(entry.lastUpdatedAt))}
                            {entry.lastUpdatedByLabel ? ` by ${entry.lastUpdatedByLabel}` : ""}
                          </span>
                          <Link href={entry.href} className="font-semibold text-slate-800 underline">
                            Open {entry.scope.functionName} in F&amp;B Planner
                          </Link>
                          <button
                            type="button"
                            onClick={() => setExpandedRequirementId(expanded ? null : entry.id)}
                            aria-expanded={expanded}
                            className="font-semibold text-slate-800 underline"
                          >
                            {expanded ? "Hide menu evidence" : `Menu evidence (${entry.menuEvidence.length})`}
                          </button>
                        </div>

                        {expanded ? (
                          entry.menuEvidence.length === 0 ? (
                            <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                              No assigned menu item has been evaluated against this requirement.
                            </p>
                          ) : (
                            <ul className="mt-3 space-y-2">
                              {entry.menuEvidence.map((evidence) => (
                                <li
                                  key={`${entry.id}-${evidence.itemId}`}
                                  className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <Link href={evidence.href} className="font-semibold text-slate-900 underline">
                                      {evidence.itemName}
                                    </Link>
                                    <span className="font-semibold text-slate-700">
                                      {evidence.outcome.replaceAll("_", " ")}
                                    </span>
                                  </div>
                                  {evidence.explanations.length > 0 ? (
                                    <ul className="mt-1 space-y-0.5 text-slate-600">
                                      {evidence.explanations.map((explanation) => (
                                        <li key={explanation}>• {explanation}</li>
                                      ))}
                                    </ul>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          )
                        ) : null}
                      </article>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      ) : (
        <>
          <section aria-label="Event F&B totals">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              <StatTile label="Estimated" value={money(totals.totalEstimatedCents)} hint={`${totals.assignedItemCount} assigned items`} />
              <StatTile label="Budgeted" value={money(totals.budgetedCents)} hint={totals.budgetedCents === null ? "No linked budget lines" : undefined} />
              <StatTile
                label="Variance"
                value={money(totals.budgetVarianceCents)}
                hint={
                  totals.budgetVarianceCents === null
                    ? "Needs budget links"
                    : totals.budgetVarianceCents > 0
                      ? "Over budget"
                      : totals.budgetVarianceCents < 0
                        ? "Under budget"
                        : "On budget"
                }
              />
              <StatTile
                label="Avg / person"
                value={preciseMoney(totals.averageCostPerPersonCents)}
                hint={
                  totals.averageCostPerPersonCents === null
                    ? "No function records a headcount"
                    : totals.costPerPersonExcludedFunctionCount > 0
                      ? `From ${totals.costPerPersonFunctionCount} of ${totals.functionCount} functions; ${totals.costPerPersonExcludedFunctionCount} have no headcount`
                      : "Weighted by covered headcount"
                }
              />
              <StatTile label="Tax" value={money(totals.taxCents + totals.additionalTaxCents)} />
              <StatTile label="Service charge" value={money(totals.serviceChargeCents)} />
            </dl>
          </section>

          <section aria-label="F&B readiness and actions" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(
              [
                ["ready", totals.readyCount],
                ["needsWork", totals.needsWorkCount],
                ["blocked", totals.blockedCount],
              ] as Array<[FnbFunctionReadinessState, number]>
            ).map(([state, count]) => (
              <button
                key={state}
                type="button"
                onClick={() => setReadinessFilter((current) => (current === state ? "all" : state))}
                aria-pressed={readinessFilter === state}
                className={`rounded-xl border p-3 text-left transition ${READINESS_TONE[state]} ${
                  readinessFilter === state ? "ring-2 ring-slate-900/20" : ""
                }`}
              >
                <span className="block text-2xl font-semibold">{count}</span>
                <span className="text-xs font-semibold">{READINESS_LABEL[state]}</span>
                <span className="mt-0.5 block text-[11px] font-normal opacity-80">
                  {state === "blocked"
                    ? "Missing a prerequisite"
                    : state === "needsWork"
                      ? "Actionable and incomplete"
                      : "Nothing outstanding"}
                </span>
              </button>
            ))}
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Needs action</p>
              <ul className="mt-1 space-y-0.5 text-sm text-slate-800">
                <li>
                  <strong>{totals.openRequirementCount}</strong> open dietary/allergen requirement
                  {totals.openRequirementCount === 1 ? "" : "s"}
                  {totals.accommodationCount > 0 ? ` · ${totals.accommodationCount} accommodations` : ""}
                </li>
                <li>
                  <strong>{totals.approvalsPending}</strong> budget line{totals.approvalsPending === 1 ? "" : "s"} awaiting approval
                </li>
                <li>
                  <strong>{totals.unpricedItemCount}</strong> unpriced item{totals.unpricedItemCount === 1 ? "" : "s"}
                </li>
              </ul>
            </div>
          </section>

          {showCreate && canWrite ? (
            <form
              onSubmit={createFunction}
              aria-label="Create an F&B function"
              className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              <p className="text-xs text-slate-600 sm:col-span-2 lg:col-span-3">
                A content session is not required. Leave the Run of Show association empty to create a
                standalone function such as a breakfast or coffee break.
              </p>
              <label className="text-xs font-semibold text-slate-700">
                Run of Show association (optional)
                <select name="sessionId" className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm">
                  <option value="">Standalone function</option>
                  {linkableSessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {dayLabel(session.date)} {timeLabel(session.startTime)} · {session.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Function name
                <input name="name" className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" placeholder="Breakfast" />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Type
                <select name="type" defaultValue="BREAKFAST" className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm">
                  {FUNCTION_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {value.charAt(0) + value.slice(1).toLowerCase()}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Date
                <input name="date" type="date" className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Start
                <input name="startTime" type="time" className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                End
                <input name="endTime" type="time" className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Location
                <input name="location" className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" placeholder="Expo Hall" />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Expected attendance
                <input name="attendance" type="number" min={0} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Guarantee
                <input name="guarantee" type="number" min={0} className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" />
              </label>
              <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
                <button
                  disabled={creating}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
                  Save function
                </button>
                <button type="button" onClick={() => setShowCreate(false)} className="h-10 px-3 text-sm font-semibold text-slate-600">
                  Cancel
                </button>
              </div>
            </form>
          ) : null}

          <section className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                <CalendarDays className="h-4 w-4" aria-hidden />
                Cost by day
              </h2>
              {costByDay.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">No F&amp;B functions scheduled yet.</p>
              ) : (
                <ul className="mt-3 space-y-1.5">
                  {costByDay.map((day) => (
                    <li key={day.date} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-slate-700">
                        {dayLabel(day.date)}{" "}
                        <span className="text-xs text-slate-500">
                          · {day.functionCount} function{day.functionCount === 1 ? "" : "s"}
                        </span>
                      </span>
                      <span className="font-semibold text-slate-950">{money(day.totalEstimatedCents)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                <Utensils className="h-4 w-4" aria-hidden />
                Cost by function type
              </h2>
              {costByType.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">No F&amp;B functions scheduled yet.</p>
              ) : (
                <ul className="mt-3 space-y-1.5">
                  {costByType.map((type) => (
                    <li key={type.typeLabel} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-slate-700">
                        {type.typeLabel}{" "}
                        <span className="text-xs text-slate-500">
                          · {type.functionCount} function{type.functionCount === 1 ? "" : "s"}
                        </span>
                      </span>
                      <span className="font-semibold text-slate-950">{money(type.totalEstimatedCents)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-950">
                Functions in chronological order
                {readinessFilter !== "all" ? (
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    filtered to {READINESS_LABEL[readinessFilter].toLowerCase()}
                  </span>
                ) : null}
              </h2>
              {readinessFilter !== "all" ? (
                <button
                  type="button"
                  onClick={() => setReadinessFilter("all")}
                  className="text-xs font-semibold text-slate-700 underline"
                >
                  Clear filter
                </button>
              ) : null}
            </div>

            {functions.length === 0 ? (
              <div className="py-12 text-center">
                <Utensils className="mx-auto h-7 w-7 text-slate-400" aria-hidden />
                <h3 className="mt-3 font-semibold text-slate-900">No F&amp;B functions yet</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Create a function to start planning what is served across this event. A content session
                  is not required.
                </p>
              </div>
            ) : visibleFunctions.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">
                No functions are {READINESS_LABEL[readinessFilter as FnbFunctionReadinessState].toLowerCase()}.
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {visibleFunctions.map((entry) => (
                  <li key={entry.sessionId}>
                    <article className="rounded-xl border border-slate-200 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            href={entry.href}
                            className="inline-flex items-center gap-1 text-base font-semibold text-slate-950 underline-offset-2 hover:underline"
                          >
                            {entry.name}
                            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                          </Link>
                          <p className="mt-0.5 text-xs text-slate-600">
                            {dayLabel(entry.date)} · {serviceWindow(entry)} · {entry.location ?? "Location not set"}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {entry.typeLabel} ·{" "}
                            {entry.isSessionLinked ? "Linked to a Run of Show session" : "Independent function"}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full border px-2 py-1 text-xs font-semibold ${READINESS_TONE[entry.readiness]}`}
                        >
                          {READINESS_LABEL[entry.readiness]}
                        </span>
                      </div>

                      <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-3 xl:grid-cols-6">
                        <div>
                          <dt className="text-slate-500">Attendance / guarantee</dt>
                          <dd className="font-medium text-slate-800">
                            {entry.attendance?.toLocaleString() ?? "—"} / {entry.guarantee?.toLocaleString() ?? "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Assigned items</dt>
                          <dd className="font-medium text-slate-800">
                            {entry.assignedItemCount}
                            {entry.unpricedItemCount > 0 ? ` · ${entry.unpricedItemCount} unpriced` : ""}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Estimated</dt>
                          <dd className="font-medium text-slate-800">{money(entry.calculation.totalEstimatedCents)}</dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Per person</dt>
                          <dd className="font-medium text-slate-800">{preciseMoney(entry.calculation.perPersonCents)}</dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Budget variance</dt>
                          <dd className="font-medium text-slate-800">{money(entry.budgetVarianceCents)}</dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Approvals pending</dt>
                          <dd className="font-medium text-slate-800">{entry.approvalsPending}</dd>
                        </div>
                      </dl>

                      {entry.warnings.length > 0 ? (
                        <ul className="mt-3 space-y-1" aria-label={`${entry.name} outstanding actions`}>
                          {entry.warnings.map((warning) => (
                            <li
                              key={warning.code}
                              className={`rounded-lg border px-3 py-2 text-xs ${
                                warning.tone === "critical"
                                  ? "border-rose-200 bg-rose-50 text-rose-900"
                                  : "border-amber-200 bg-amber-50 text-amber-900"
                              }`}
                            >
                              <span className="font-semibold">{warning.label}.</span> {warning.nextAction}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </article>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
