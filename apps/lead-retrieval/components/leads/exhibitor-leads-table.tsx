"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LeadCardDateField } from "@/components/leads/lead-card-date-field";
import { toDateInputValue } from "@/lib/leads/leadDateInput";
import {
  LEAD_TEMPERATURE_LABEL,
  LEAD_TEMPERATURE_VALUES,
  parseLeadTemperature,
  type LeadTemperature
} from "@/lib/leads/temperature";
import { computeExhibitorLeadsBulkScope } from "@/lib/leads/exhibitorLeadsBulkScope";
import { patchExhibitorLead, type ExhibitorLeadPatchRow } from "@/lib/leads/patchExhibitorLead";
import { seededAvatarSrc } from "@/lib/leads/leadCardAvatar";
import {
  followUpFilterLabel,
  ratingFilterLabel,
  temperatureLabel,
  type LeadFollowUpFilter,
  type LeadListFilters,
  type LeadRatingFilter
} from "@/lib/leads/exhibitor-lead-list-filters";
import {
  workflowStatusLabel,
  type LeadWorkflowStatusFilter,
  type LeadWorkflowSummary
} from "@/lib/exhibitor/workflows/workflow-lead-activity";

export type LeadRow = {
  id: string;
  full_name: string;
  email: string | null;
  job_title: string | null;
  company_text: string | null;
  temperature: LeadTemperature | null;
  priority_score: number;
  rating: number;
  status: "new" | "follow_up" | "closed";
  follow_up_date: string | null;
  updated_at: string;
  created_at: string;
  /** Server-derived from `lead_briefings` + renderable content rule (matches lead detail AI Brief tab). */
  aiBriefRenderable?: boolean;
  workflowSummary?: LeadWorkflowSummary;
};

type SortColumn = "full_name" | "email" | "job_title" | "temperature" | "rating" | "follow_up_date";
type SortDirection = "asc" | "desc";
type SavingField = "temperature" | "follow_up_date";
type DeleteIntent = { mode: "single"; lead: LeadRow } | { mode: "bulk"; leads: LeadRow[] } | null;

function toComparableDate(value: string | null) {
  return value ?? "";
}

function formatUpdatedAt(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Recently";
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function initialsFromName(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return "—";
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

function LeadAvatar({ leadId, name }: { leadId: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const src = useMemo(() => seededAvatarSrc(leadId), [leadId]);
  if (failed) {
    return (
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-bold text-white shadow-inner ring-1 ring-slate-900/5"
        aria-hidden
      >
        {initialsFromName(name)}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      width={48}
      height={48}
      loading="lazy"
      decoding="async"
      className="h-12 w-12 shrink-0 rounded-lg object-cover shadow-inner ring-1 ring-slate-900/5"
      onError={() => setFailed(true)}
    />
  );
}

function mapPatchToRow(lead: ExhibitorLeadPatchRow, prev?: LeadRow): LeadRow {
  const parsedTemperature = parseLeadTemperature(lead.temperature);
  return {
    id: lead.id,
    full_name: lead.full_name,
    email: lead.email,
    job_title: lead.job_title,
    company_text: lead.company_text ?? null,
    temperature: parsedTemperature ?? prev?.temperature ?? null,
    priority_score: lead.priority_score,
    rating: Number(lead.rating ?? 0),
    status: prev?.status ?? "new",
    follow_up_date: lead.follow_up_date,
    updated_at: lead.updated_at,
    created_at: lead.created_at,
    aiBriefRenderable: prev?.aiBriefRenderable,
    workflowSummary: prev?.workflowSummary
  };
}

function normalizeLeadRow(row: LeadRow): LeadRow {
  return {
    ...row,
    temperature: parseLeadTemperature(row.temperature),
  };
}

const EMPTY_FILTERS: LeadListFilters = {
  rating: null,
  temperature: null,
  followUp: null,
  workflowStatus: null
};

function temperatureToneClass(value: LeadTemperature | null) {
  switch (value) {
    case "hot":
      return "border-rose-300 bg-rose-50 text-rose-700";
    case "warm":
      return "border-amber-300 bg-amber-50 text-amber-700";
    case "cold":
      return "border-sky-300 bg-sky-50 text-sky-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-500";
  }
}

function LeadCardReadOnlyMetrics({ lead }: { lead: LeadRow }) {
  const ratingClamped = Math.max(0, Math.min(5, Math.round(Number(lead.rating ?? 0))));
  const followUpDisplay = lead.follow_up_date
    ? new Date(`${lead.follow_up_date}T12:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
      })
    : "—";

  return (
    <>
      <div className="flex min-w-[11rem] flex-[0_1_auto] flex-col gap-1">
        <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">Rating</span>
        <div className="flex items-center gap-1" role="img" aria-label={`Rating ${ratingClamped} of 5`}>
          {Array.from({ length: 5 }, (_, i) => (
            <span
              key={i}
              className={`p-0.5 ${i < ratingClamped ? "text-[#FACC15]" : "text-slate-300"}`}
              aria-hidden="true"
            >
              <LeadRowStarIcon filled={i < ratingClamped} />
            </span>
          ))}
        </div>
      </div>

      <div className="flex min-w-[11.5rem] flex-[0_1_auto] flex-col gap-1">
        <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">Temperature</span>
        <div>
          <span
            className={`inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-semibold ${temperatureToneClass(lead.temperature)}`}
          >
            {lead.temperature ? LEAD_TEMPERATURE_LABEL[lead.temperature] : "Unassessed"}
          </span>
        </div>
      </div>

      <div className="flex min-w-[8rem] flex-[0_1_auto] flex-col gap-1">
        <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">Follow-up</span>
        <span className="text-[12px] font-semibold text-slate-700">{followUpDisplay}</span>
      </div>
    </>
  );
}

function LeadTemperatureSegmentedControl({
  leadId,
  temperature,
  saving,
  onChange
}: {
  leadId: string;
  temperature: LeadTemperature | null;
  saving: boolean;
  onChange: (next: LeadTemperature) => void;
}) {
  return (
    <div className="flex min-w-[11.5rem] flex-[0_1_auto] flex-col gap-1" data-interactive onClick={(e) => e.stopPropagation()}>
      <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">Temperature</span>
      <div
        id={`temperature-segmented-${leadId}`}
        role="group"
        aria-label="Lead temperature"
        className="grid grid-cols-3 gap-1 rounded-lg border border-slate-200 bg-white p-1"
      >
        {LEAD_TEMPERATURE_VALUES.map((value) => {
          const selected = value === temperature;
          return (
            <button
              key={`lead-temperature-${leadId}-${value}`}
              type="button"
              disabled={saving}
              aria-pressed={selected}
              onClick={() => onChange(value)}
              className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition disabled:opacity-60 ${
                selected ? temperatureToneClass(value) : "border-transparent bg-transparent text-slate-500 hover:bg-slate-50"
              }`}
            >
              {LEAD_TEMPERATURE_LABEL[value]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DeleteModal({
  intent,
  isDeleting,
  onConfirm,
  onCancel,
  bulkSubjectLabel
}: {
  intent: NonNullable<DeleteIntent>;
  isDeleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** When bulk delete, optional copy (e.g. filter scope). Defaults to “N selected leads”. */
  bulkSubjectLabel?: string;
}) {
  const count = intent.mode === "single" ? 1 : intent.leads.length;
  const label =
    intent.mode === "single"
      ? intent.lead.full_name || "this lead"
      : bulkSubjectLabel ?? `${count} selected lead${count > 1 ? "s" : ""}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100">
          <svg className="h-6 w-6 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </div>
        <h3 className="mt-4 text-center text-lg font-bold text-slate-900">
          Delete {count > 1 ? `${count} Leads` : "Lead"}
        </h3>
        <p className="mt-2 text-center text-sm text-slate-600">
          Are you sure you want to permanently delete <span className="font-semibold text-slate-900">{label}</span>?
          This action cannot be undone.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="flex-1 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-rose-500 disabled:opacity-50"
          >
            {isDeleting ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkBar({
  count,
  leadIds,
  scopeMode,
  scopeLabel,
  eventId,
  q,
  canEdit,
  pipedriveConnected,
  onDelete,
  onClearScope,
  onError
}: {
  count: number;
  leadIds: string[];
  /** manual = checkbox selection; filter = active server-side list filter. */
  scopeMode: "manual" | "filter";
  scopeLabel?: string;
  eventId: string | null;
  q: string | null;
  canEdit: boolean;
  pipedriveConnected: boolean;
  onDelete: () => void;
  onClearScope: () => void;
  onError: (message: string) => void;
}) {
  const [exporting, setExporting] = useState(false);
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [creatingBrief, setCreatingBrief] = useState(false);
  const [syncingToPipedrive, setSyncingToPipedrive] = useState(false);
  const [pipedriveSyncMessage, setPipedriveSyncMessage] = useState<string | null>(null);
  const router = useRouter();

  async function runExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/admin/leads/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadIds,
          eventId: eventId ?? undefined,
          q: q ?? undefined
        })
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Export failed");
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition");
      const match = cd?.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? "leads-export.csv";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  async function createCampaignWithSelected() {
    if (leadIds.length === 0) return;
    setCreatingCampaign(true);
    try {
      const createRes = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: leadIds.length > 1 ? "group" : "single" })
      });
      const createJson = (await createRes.json()) as { campaignId?: string; error?: string };
      if (!createRes.ok || !createJson.campaignId) {
        throw new Error(createJson.error ?? "Failed to create campaign");
      }
      const campaignId = createJson.campaignId;
      const recRes = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/recipients`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds })
      });
      const recJson = (await recRes.json().catch(() => ({}))) as { error?: string };
      if (!recRes.ok) {
        throw new Error(recJson.error ?? "Failed to attach leads to campaign");
      }
      router.push(`/campaigns/${encodeURIComponent(campaignId)}`);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Campaign creation failed");
    } finally {
      setCreatingCampaign(false);
    }
  }

  async function createBriefWithSelected() {
    if (leadIds.length === 0) return;
    setCreatingBrief(true);
    try {
      const res = await fetch("/api/exhibitor/briefings/from-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds, eventId: eventId ?? undefined })
      });
      const json = (await res.json().catch(() => ({}))) as {
        batchId?: string;
        workspaceUrl?: string;
        error?: string;
      };
      if (!res.ok || !json.batchId) {
        throw new Error(json.error ?? "Failed to create brief");
      }
      router.push(json.workspaceUrl ?? `/exhibitor/briefings/${encodeURIComponent(json.batchId)}`);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Brief creation failed");
    } finally {
      setCreatingBrief(false);
    }
  }

  async function syncSelectedToPipedrive() {
    if (leadIds.length === 0) return;
    setSyncingToPipedrive(true);
    setPipedriveSyncMessage(null);
    try {
      const res = await fetch("/api/integrations/pipedrive/bulk-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds })
      });
      const json = (await res.json().catch(() => ({}))) as {
        enqueued?: string[];
        skipped?: Array<{ leadId: string; reason: string }>;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Failed to queue Pipedrive sync");
      const enqueuedCount = json.enqueued?.length ?? 0;
      const skippedCount = json.skipped?.length ?? 0;
      setPipedriveSyncMessage(
        skippedCount > 0
          ? `Queued ${enqueuedCount} for Pipedrive (${skippedCount} already synced or in progress).`
          : `Queued ${enqueuedCount} for Pipedrive.`
      );
      router.refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Pipedrive sync failed");
    } finally {
      setSyncingToPipedrive(false);
    }
  }

  const scopeLegend =
    scopeMode === "manual"
      ? count === 1
        ? "lead selected"
        : "leads selected"
      : [scopeLabel, count === 1 ? "lead in filter" : "leads in filter"].filter(Boolean).join(" ");

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50/90 px-4 py-2.5 shadow-sm"
      data-testid="leads-bulk-action-bar"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="inline-flex h-7 min-w-[28px] shrink-0 items-center justify-center rounded-full bg-indigo-600 px-2 text-xs font-bold text-white">
          {count}
        </span>
        <span className="truncate text-sm font-semibold text-indigo-900">{scopeLegend}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {canEdit ? (
          <button
            type="button"
            onClick={() => void runExport()}
            disabled={exporting}
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
            data-testid="bulk-export-csv"
          >
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
        ) : null}
        {canEdit ? (
          <button
            type="button"
            onClick={() => void createCampaignWithSelected()}
            disabled={creatingCampaign}
            className="inline-flex items-center rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-xs font-semibold text-violet-800 shadow-sm transition hover:bg-violet-50 disabled:opacity-60"
            data-testid="bulk-create-campaign"
          >
            {creatingCampaign ? "Opening…" : "Create campaign"}
          </button>
        ) : null}
        {canEdit && scopeMode === "manual" ? (
          <button
            type="button"
            onClick={() => void createBriefWithSelected()}
            disabled={creatingBrief}
            className="inline-flex items-center rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-800 shadow-sm transition hover:bg-indigo-50 disabled:opacity-60"
            data-testid="bulk-create-brief"
          >
            {creatingBrief ? "Creating…" : "Create brief"}
          </button>
        ) : null}
        {canEdit && scopeMode === "manual" && pipedriveConnected ? (
          <button
            type="button"
            onClick={() => void syncSelectedToPipedrive()}
            disabled={syncingToPipedrive}
            className="inline-flex items-center rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-800 shadow-sm transition hover:bg-indigo-50 disabled:opacity-60"
            data-testid="bulk-send-to-pipedrive"
          >
            {syncingToPipedrive ? "Queuing…" : "Send to Pipedrive"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 shadow-sm transition-colors hover:bg-rose-50"
          data-testid="bulk-delete-selected"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
          Delete
        </button>
        <button
          type="button"
          onClick={onClearScope}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition-colors hover:bg-slate-50"
          data-testid="leads-bulk-clear-scope"
        >
          Clear
        </button>
      </div>
      {pipedriveSyncMessage ? (
        <p className="w-full text-xs font-medium text-indigo-800" data-testid="bulk-send-to-pipedrive-result" role="status">
          {pipedriveSyncMessage}
        </p>
      ) : null}
    </div>
  );
}

function LeadFiltersPanel({
  filters,
  activeFilterSummary,
  resultCount,
  sortState,
  onFilterChange,
  onClearFilters,
  onSortChange
}: {
  filters: LeadListFilters;
  activeFilterSummary: string[];
  resultCount: number;
  sortState: { column: SortColumn; dir: SortDirection } | null;
  onFilterChange: (key: keyof LeadListFilters, value: string | null) => void;
  onClearFilters: () => void;
  onSortChange: (column: SortColumn | null, dir?: SortDirection) => void;
}) {
  const hasFilters = activeFilterSummary.length > 0;
  const sortLabel = sortState ? SORT_LABELS[sortState.column] : "Recent";
  return (
    <section
      className="rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50/85 via-white to-emerald-50/60 p-3 shadow-sm"
      aria-label="Lead filters"
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-[1_1_46rem] space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-700">Filters</span>
            <span className="text-xs font-medium text-slate-500">
              Narrow the lead list. Sorting is separate.
            </span>
          </div>
          <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-2">
            <FilterSelect<LeadRatingFilter>
              label="Rating"
              value={filters.rating}
              placeholder="Any rating"
              options={[
                ["5", "5 stars"],
                ["4_plus", "4+ stars"],
                ["3_or_below", "3 or below"],
                ["unrated", "Unrated"]
              ]}
              onChange={(value) => onFilterChange("rating", value)}
            />
            <FilterSelect
              label="Temperature"
              value={filters.temperature}
              placeholder="Any temperature"
              options={LEAD_TEMPERATURE_VALUES.map((value) => [value, temperatureLabel(value)] as const)}
              onChange={(value) => onFilterChange("temperature", value)}
            />
            <FilterSelect<LeadFollowUpFilter>
              label="Follow-up"
              value={filters.followUp}
              placeholder="Any follow-up"
              options={[
                ["overdue", "Overdue"],
                ["today", "Today"],
                ["this_week", "This week"],
                ["none", "No follow-up date"],
                ["awaiting", "Awaiting action"],
                ["due", "Due or overdue"]
              ]}
              onChange={(value) => onFilterChange("followUp", value)}
            />
            <FilterSelect<LeadWorkflowStatusFilter>
              label="Workflow status"
              value={filters.workflowStatus}
              placeholder="Any workflow status"
              options={[
                ["pending_approval", "Pending approval"],
                ["approved", "Approved"],
                ["rejected", "Rejected"],
                ["failed", "Failed"],
                ["completed", "Synced/completed"]
              ]}
              onChange={(value) => onFilterChange("workflowStatus", value)}
            />
          </div>
        </div>
        <div className="flex flex-[0_1_auto] flex-col items-start gap-2">
          <span className="text-xs font-semibold tabular-nums text-slate-600">
            {resultCount === 1 ? "1 matching lead" : `${resultCount} matching leads`}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm">
              <span className="text-xs font-semibold text-slate-500">Sort:</span>
              <select
                aria-label="Sort leads"
                value={sortState?.column ?? ""}
                onChange={(event) =>
                  onSortChange(event.target.value ? (event.target.value as SortColumn) : null)
                }
                className="h-7 bg-transparent text-xs font-semibold text-slate-800 outline-none"
              >
                <option value="">Recent</option>
                {SORT_OPTIONS.map(({ column, label }) => (
                  <option key={column} value={column}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {sortState ? (
              <button
                type="button"
                onClick={() => onSortChange(sortState.column, sortState.dir === "asc" ? "desc" : "asc")}
                className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                aria-label={`Sort ${sortLabel} ${sortState.dir === "asc" ? "descending" : "ascending"}`}
              >
                {sortState.dir === "asc" ? "Asc" : "Desc"}
              </button>
            ) : null}
          </div>
          {hasFilters ? (
            <button
              type="button"
              onClick={onClearFilters}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              data-testid="clear-lead-filters"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </div>
      {hasFilters ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {filters.rating ? (
            <FilterChip label={`Rating ${ratingFilterLabel(filters.rating)}`} onRemove={() => onFilterChange("rating", null)} />
          ) : null}
          {filters.temperature ? (
            <FilterChip
              label={`Temperature ${temperatureLabel(filters.temperature)}`}
              onRemove={() => onFilterChange("temperature", null)}
            />
          ) : null}
          {filters.followUp ? (
            <FilterChip
              label={`Follow-up ${followUpFilterLabel(filters.followUp)}`}
              onRemove={() => onFilterChange("followUp", null)}
            />
          ) : null}
          {filters.workflowStatus ? (
            <FilterChip
              label={workflowStatusLabel(filters.workflowStatus)}
              onRemove={() => onFilterChange("workflowStatus", null)}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

const SORT_OPTIONS: ReadonlyArray<{ column: SortColumn; label: string }> = [
  { column: "full_name", label: "Name" },
  { column: "email", label: "Email" },
  { column: "job_title", label: "Title" },
  { column: "temperature", label: "Temperature" },
  { column: "rating", label: "Rating" },
  { column: "follow_up_date", label: "Follow-up" }
];

const SORT_LABELS: Record<SortColumn, string> = {
  full_name: "Name",
  email: "Email",
  job_title: "Title",
  temperature: "Temperature",
  rating: "Rating",
  follow_up_date: "Follow-up"
};

function FilterSelect<T extends string>({
  label,
  value,
  placeholder,
  options,
  onChange
}: {
  label: string;
  value: T | null;
  placeholder: string;
  options: ReadonlyArray<readonly [T, string]>;
  onChange: (value: T | null) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</span>
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value ? (event.target.value as T) : null)}
        className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-500/15"
      >
        <option value="">{placeholder}</option>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-white px-2.5 py-1 text-xs font-semibold text-sky-900 shadow-sm">
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="ml-1 rounded-full text-sky-700 hover:bg-sky-50 hover:text-sky-950"
        aria-label={`Remove ${label} filter`}
      >
        ×
      </button>
    </span>
  );
}

function hasWorkflowSummary(summary: LeadWorkflowSummary) {
  return (
    summary.pendingApprovalCount > 0 ||
    summary.approvedCount > 0 ||
    summary.rejectedCount > 0 ||
    summary.failedCount > 0 ||
    summary.completedCount > 0
  );
}

function WorkflowLeadBadges({ summary, compact }: { summary: LeadWorkflowSummary; compact: boolean }) {
  const badges = [
    summary.pendingApprovalCount > 0
      ? { label: `${summary.pendingApprovalCount} pending approval`, className: "border-amber-200 bg-amber-50 text-amber-800" }
      : null,
    compact && summary.approvedCount > 0
      ? { label: `${summary.approvedCount} approved`, className: "border-emerald-200 bg-emerald-50 text-emerald-800" }
      : null,
    compact && summary.rejectedCount > 0
      ? { label: `${summary.rejectedCount} rejected`, className: "border-slate-200 bg-slate-50 text-slate-700" }
      : null,
    compact && summary.failedCount > 0
      ? { label: `${summary.failedCount} failed`, className: "border-rose-200 bg-rose-50 text-rose-700" }
      : null,
    compact && summary.completedCount > 0
      ? { label: `${summary.completedCount} synced`, className: "border-sky-200 bg-sky-50 text-sky-800" }
      : null
  ].filter(Boolean) as Array<{ label: string; className: string }>;
  if (badges.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {badges.map((badge) => (
        <span key={badge.label} className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${badge.className}`}>
          {badge.label}
        </span>
      ))}
    </div>
  );
}

/** Chunky solid star (filled) / outline (empty) — matches premium admin reference, not thin Unicode glyphs */
function LeadRowStarIcon({ filled }: { filled: boolean }) {
  const path =
    "M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.267 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.267-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z";
  if (filled) {
    return (
      <svg viewBox="0 0 24 24" className="h-7 w-7 shrink-0" aria-hidden>
        <path fill="currentColor" fillRule="evenodd" d={path} clipRule="evenodd" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 shrink-0" aria-hidden>
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinejoin="round"
        d={path}
      />
    </svg>
  );
}

function CardRatingEditor({
  lead,
  onUpdate
}: {
  lead: LeadRow;
  onUpdate: (next: LeadRow) => void;
}) {
  const [saving, setSaving] = useState(false);
  const n = Math.max(0, Math.min(5, Math.round(Number(lead.rating ?? 0))));

  async function setRating(next: number) {
    const clamped = Math.max(0, Math.min(5, next));
    if (clamped === lead.rating) return;
    setSaving(true);
    const res = await patchExhibitorLead(lead.id, { rating: clamped });
    setSaving(false);
    if (!res.ok) return;
    onUpdate(mapPatchToRow(res.lead, lead));
  }

  return (
    <div className="flex min-w-[11rem] flex-[0_1_auto] flex-col gap-1" data-interactive onClick={(e) => e.stopPropagation()}>
      <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">Rating</span>
      <div className="flex flex-nowrap items-center gap-1.5">
        <div className="flex items-center gap-1" role="group" aria-label="Rating 1 to 5">
          {Array.from({ length: 5 }, (_, i) => (
            <button
              key={i}
              type="button"
              disabled={saving}
              onClick={(e) => {
                e.stopPropagation();
                void setRating(i + 1);
              }}
              className={`rounded-md p-0.5 transition hover:bg-slate-200/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/45 disabled:opacity-50 ${
                i < n ? "text-[#FACC15]" : "text-slate-300"
              }`}
              aria-label={`Set rating to ${i + 1}`}
            >
              <LeadRowStarIcon filled={i < n} />
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={(e) => {
            e.stopPropagation();
            void setRating(0);
          }}
          className="text-[9px] font-semibold text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

export function ExhibitorLeadsTable({
  leads,
  eventId,
  searchQuery,
  filters = EMPTY_FILTERS,
  activeFilterSummary = [],
  canEdit = true,
  canDelete = canEdit,
  pipedriveConnected = false
}: {
  leads: LeadRow[];
  eventId: string | null;
  searchQuery: string | null;
  filters?: LeadListFilters;
  activeFilterSummary?: string[];
  /**
   * When `false`, hide every write/admin affordance on this surface:
   * bulk-select checkboxes, the bulk action toolbar, the per-row delete
   * button, and the inline rating / temperature / follow-up editors. Used
   * for the read-only `exhibitor_viewer` role. Defaults to `true` so
   * existing `exhibitor_admin` callers are unchanged.
   */
  canEdit?: boolean;
  /** Delete affordances are intentionally decoupled from broader edit controls. */
  canDelete?: boolean;
  /** Whether this company has an active Pipedrive connection — gates the bulk "Send to Pipedrive" action. */
  pipedriveConnected?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [rows, setRows] = useState<LeadRow[]>(() => leads.map(normalizeLeadRow));
  const [sortState, setSortState] = useState<{ column: SortColumn; dir: SortDirection } | null>(null);
  const [savingCells, setSavingCells] = useState<Record<string, boolean>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(() => new Set());
  const [deleteIntent, setDeleteIntent] = useState<DeleteIntent>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setRows(leads.map(normalizeLeadRow));
  }, [leads]);

  const loadedLeadIdSet = useMemo(() => new Set(rows.map((r) => r.id)), [rows]);
  useEffect(() => {
    setSelectedLeadIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (loadedLeadIdSet.has(id)) next.add(id);
        else changed = true;
      }
      if (!changed && next.size === prev.size) return prev;
      return next;
    });
  }, [loadedLeadIdSet]);

  const filteredRows = rows;

  const sortedRows = useMemo(() => {
    if (!sortState) return filteredRows;
    const dir = sortState.dir === "asc" ? 1 : -1;
    const next = [...filteredRows];
    next.sort((a, b) => {
      if (sortState.column === "full_name") return a.full_name.localeCompare(b.full_name) * dir;
      if (sortState.column === "job_title") return (a.job_title ?? "").localeCompare(b.job_title ?? "") * dir;
      if (sortState.column === "email") return (a.email ?? "").localeCompare(b.email ?? "") * dir;
      if (sortState.column === "temperature") return String(a.temperature ?? "").localeCompare(String(b.temperature ?? "")) * dir;
      if (sortState.column === "rating") return (a.rating - b.rating) * dir;
      return toComparableDate(a.follow_up_date).localeCompare(toComparableDate(b.follow_up_date)) * dir;
    });
    return next;
  }, [filteredRows, sortState]);

  const sortedVisibleLeadIds = useMemo(() => sortedRows.map((r) => r.id), [sortedRows]);
  const temperatureView = filters.temperature ?? "all";
  const bulkScope = useMemo(
    () =>
      computeExhibitorLeadsBulkScope({
        selectedLeadIds,
        loadedLeadIds: loadedLeadIdSet,
        temperatureView,
        sortedVisibleLeadIds
      }),
    [selectedLeadIds, loadedLeadIdSet, temperatureView, sortedVisibleLeadIds]
  );
  const bulkTargetLeads = useMemo(() => {
    const byId = new Map(rows.map((r) => [r.id, r] as const));
    return bulkScope.leadIds.map((id) => byId.get(id)).filter(Boolean) as LeadRow[];
  }, [rows, bulkScope.leadIds]);

  const visibleIds = useMemo(() => new Set(sortedRows.map((r) => r.id)), [sortedRows]);
  const visibleSelectedCount = useMemo(
    () => [...selectedLeadIds].filter((id) => visibleIds.has(id)).length,
    [selectedLeadIds, visibleIds]
  );
  const allVisibleSelected = visibleIds.size > 0 && visibleSelectedCount === visibleIds.size;
  const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected;

  function toggleSelectAll() {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  function toggleSelectRow(id: string) {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedLeadIds(new Set());
  }

  function savingKey(leadId: string, field: SavingField) {
    return `${leadId}:${field}`;
  }

  const leadDetailHref = useCallback(
    (leadId: string) => {
      const params = new URLSearchParams();
      if (eventId) params.set("eventId", eventId);
      const qParam = searchParams.get("q");
      if (qParam) params.set("q", qParam);
      const ratingParam = searchParams.get("rating");
      if (ratingParam) params.set("rating", ratingParam);
      const temperatureParam = searchParams.get("temperature");
      if (temperatureParam) params.set("temperature", temperatureParam);
      const followUpParam = searchParams.get("followUp");
      if (followUpParam) params.set("followUp", followUpParam);
      const workflowStatusParam = searchParams.get("workflowStatus");
      if (workflowStatusParam) params.set("workflowStatus", workflowStatusParam);
      const qs = params.toString();
      return `/exhibitor/leads/${encodeURIComponent(leadId)}${qs ? `?${qs}` : ""}`;
    },
    [eventId, searchParams]
  );

  const executeDelete = useCallback(async () => {
    if (!deleteIntent) return;
    setIsDeleting(true);
    setErrorMessage(null);

    try {
      if (deleteIntent.mode === "single") {
        const res = await fetch(`/api/exhibitor/leads/${encodeURIComponent(deleteIntent.lead.id)}`, {
          method: "DELETE"
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            outcome?: string;
            message?: string;
            error?: string;
            reason?: string;
          };
          throw new Error(
            body.message ??
              body.error ??
              body.reason ??
              (body.outcome === "missing" ? "Lead not found." : null) ??
              "Delete failed"
          );
        }
        setRows((cur) => cur.filter((r) => r.id !== deleteIntent.lead.id));
        setSelectedLeadIds((prev) => {
          const n = new Set(prev);
          n.delete(deleteIntent.lead.id);
          return n;
        });
      } else {
        const ids = deleteIntent.leads.map((l) => l.id);
        const res = await fetch("/api/exhibitor/leads/bulk-delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadIds: ids, eventId: eventId ?? undefined })
        });
        const payload = (await res.json().catch(() => ({}))) as {
          outcome?: string;
          deleted?: string[];
          message?: string;
          error?: string;
        };
        if (!res.ok) {
          throw new Error(payload.message ?? payload.error ?? "Bulk delete failed");
        }
        if (payload.outcome !== "completed" || !Array.isArray(payload.deleted)) {
          throw new Error("Unexpected bulk delete response.");
        }
        const removed = new Set(payload.deleted);
        setRows((cur) => cur.filter((r) => !removed.has(r.id)));
        setSelectedLeadIds((prev) => {
          const n = new Set(prev);
          payload.deleted!.forEach((id) => n.delete(id));
          return n;
        });
      }
      router.refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setIsDeleting(false);
      setDeleteIntent(null);
    }
  }, [deleteIntent, router]);

  function setCompactSort(column: SortColumn | null, dir?: SortDirection) {
    if (!column) {
      setSortState(null);
      return;
    }
    setSortState((cur) => ({ column, dir: dir ?? (cur?.column === column ? cur.dir : "asc") }));
  }

  function updateFilter(key: keyof LeadListFilters, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    const paramName =
      key === "followUp" ? "followUp" : key === "workflowStatus" ? "workflowStatus" : key;
    if (!value) params.delete(paramName);
    else params.set(paramName, value);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function clearFilters() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("rating");
    params.delete("temperature");
    params.delete("followUp");
    params.delete("workflowStatus");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  async function applyTemperature(leadId: string, nextTemperature: LeadTemperature) {
    const key = savingKey(leadId, "temperature");
    let rollback: LeadRow | null = null;

    setRows((cur) => {
      const row = cur.find((r) => r.id === leadId);
      if (!row || row.temperature === nextTemperature) return cur;
      rollback = row;
      return cur.map((r) => (r.id === leadId ? { ...r, temperature: nextTemperature } : r));
    });

    if (!rollback) return;

    setSavingCells((cur) => ({ ...cur, [key]: true }));

    const res = await patchExhibitorLead(leadId, { temperature: nextTemperature });
    setSavingCells((cur) => {
      const n = { ...cur };
      delete n[key];
      return n;
    });

    if (!res.ok) {
      setRows((cur) => cur.map((r) => (r.id === leadId ? rollback! : r)));
      setErrorMessage(res.error);
      return;
    }
    setRows((cur) =>
      cur.map((r) => (r.id === res.lead.id ? mapPatchToRow(res.lead, r) : r))
    );
    router.refresh();
  }

  async function applyFollowUpDate(lead: LeadRow, isoYmd: string | null) {
    const nextDate = isoYmd?.trim() || null;
    const prevDate = toDateInputValue(lead.follow_up_date) || null;
    if (nextDate === prevDate) return;

    const key = savingKey(lead.id, "follow_up_date");
    const previous = lead;
    setRows((cur) => cur.map((r) => (r.id === lead.id ? { ...r, follow_up_date: nextDate } : r)));
    setSavingCells((cur) => ({ ...cur, [key]: true }));

    const res = await patchExhibitorLead(lead.id, { follow_up_date: nextDate });
    setSavingCells((cur) => {
      const n = { ...cur };
      delete n[key];
      return n;
    });

    if (!res.ok) {
      setRows((cur) => cur.map((r) => (r.id === previous.id ? previous : r)));
      setErrorMessage(res.error);
      return;
    }
    setRows((cur) =>
      cur.map((r) => (r.id === res.lead.id ? mapPatchToRow(res.lead, r) : r))
    );
    router.refresh();
  }

  function handleCardBackgroundClick(lead: LeadRow) {
    router.push(leadDetailHref(lead.id));
  }

  const deleteBulkSubjectLabel = useMemo(() => {
    if (!deleteIntent || deleteIntent.mode !== "bulk") return undefined;
    if (bulkScope.mode !== "filter") return undefined;
    const n = deleteIntent.leads.length;
    return `${n} lead${n !== 1 ? "s" : ""} in filter`;
  }, [deleteIntent, bulkScope.mode]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div />
        <p className="text-xs font-medium tabular-nums text-slate-500" aria-live="polite">
          {sortedRows.length === 1 ? "1 lead" : `${sortedRows.length} leads`}
        </p>
      </div>

      <LeadFiltersPanel
        filters={filters}
        activeFilterSummary={activeFilterSummary}
        resultCount={sortedRows.length}
        sortState={sortState}
        onFilterChange={updateFilter}
        onClearFilters={clearFilters}
        onSortChange={setCompactSort}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {canDelete ? (
          <label className="inline-flex cursor-pointer select-none items-center gap-2 text-xs font-medium text-slate-600">
            <input
              type="checkbox"
              data-testid="select-all-visible"
              className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              checked={allVisibleSelected}
              ref={(el) => {
                if (el) el.indeterminate = someVisibleSelected;
              }}
              onChange={toggleSelectAll}
              disabled={sortedRows.length === 0}
            />
            <span>Select all in view</span>
          </label>
        ) : (
          <span aria-hidden="true" />
        )}

        <span className="text-xs font-medium text-slate-500">
          {sortState ? `Sorted by ${SORT_LABELS[sortState.column]} ${sortState.dir}` : "Sorted by recent activity"}
        </span>
      </div>

      {canDelete && bulkScope.mode !== "none" ? (
        <BulkBar
          count={bulkScope.leadIds.length}
          leadIds={bulkScope.leadIds}
          scopeMode={bulkScope.mode === "filter" ? "filter" : "manual"}
          scopeLabel={bulkScope.mode === "filter" && filters.temperature ? temperatureLabel(filters.temperature) : undefined}
          eventId={eventId}
          q={searchQuery}
          canEdit={canEdit}
          pipedriveConnected={pipedriveConnected}
          onDelete={() => setDeleteIntent({ mode: "bulk", leads: bulkTargetLeads })}
          onClearScope={() => {
            if (bulkScope.mode === "manual") clearSelection();
            else clearFilters();
          }}
          onError={(msg) => setErrorMessage(msg)}
        />
      ) : null}

      {errorMessage ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="space-y-1.5">
        {sortedRows.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500 shadow-sm">
            <p className="font-medium text-slate-900">
              {activeFilterSummary.length > 0
                ? `No leads match ${activeFilterSummary.join(" and ")}`
                : "No leads match the current search"}
            </p>
            <p className="mt-1 text-xs">Try another filter, clear filters, or adjust search.</p>
          </div>
        ) : (
          sortedRows.map((lead) => {
            const isSelected = selectedLeadIds.has(lead.id);
            const temperatureSaving = Boolean(savingCells[savingKey(lead.id, "temperature")]);
            const dateSaving = Boolean(savingCells[savingKey(lead.id, "follow_up_date")]);
            const detailHref = leadDetailHref(lead.id);
            const workflow = lead.workflowSummary;

            return (
              <article
                key={lead.id}
                data-testid="lead-card"
                data-lead-id={lead.id}
                aria-label={`Lead ${lead.full_name || "Untitled"}`}
                className={`group relative flex min-w-0 flex-wrap items-stretch overflow-hidden rounded-xl border shadow-sm ring-1 transition hover:shadow-md ${
                  isSelected
                    ? "border-indigo-300/80 bg-white ring-indigo-100"
                    : "border-slate-200/90 bg-white ring-slate-900/[0.04]"
                }`}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("[data-interactive]")) return;
                  if (canDelete && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    toggleSelectRow(lead.id);
                    return;
                  }
                  handleCardBackgroundClick(lead);
                }}
              >
                {/* Identity: white panel */}
                <div className="flex min-w-[min(100%,19rem)] flex-[1_1_19rem] items-center gap-3 bg-white px-3 py-4 sm:gap-3.5 sm:px-5">
                  {canDelete ? (
                    <label
                      className="flex shrink-0 cursor-pointer items-start pt-1"
                      data-interactive
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        data-testid="lead-row-select"
                        aria-label={`Select ${lead.full_name || "lead"}`}
                        checked={isSelected}
                        onChange={() => toggleSelectRow(lead.id)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </label>
                  ) : null}
                  <LeadAvatar leadId={lead.id} name={lead.full_name} />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[15px] font-bold leading-snug tracking-tight text-slate-900 sm:text-base">
                      {lead.full_name || "—"}
                    </h3>
                    {lead.job_title || lead.company_text ? (
                      <p className="mt-px break-words text-[13px] leading-snug text-slate-600">
                        {lead.job_title ? <span>{lead.job_title}</span> : null}
                        {lead.job_title && lead.company_text ? <span className="text-slate-400"> at </span> : null}
                        {lead.company_text ? <span className="font-semibold text-slate-700">{lead.company_text}</span> : null}
                      </p>
                    ) : null}
                    <p className="mt-px truncate text-[11px] leading-tight text-slate-500">{lead.email || "No email on file"}</p>
                    <p className="mt-px text-[10px] font-medium leading-tight text-slate-400">
                      Updated {formatUpdatedAt(lead.updated_at)}
                    </p>
                    {workflow && hasWorkflowSummary(workflow) ? (
                      <WorkflowLeadBadges summary={workflow} compact={filters.workflowStatus !== null} />
                    ) : null}
                  </div>
                </div>

                {/* Each functional group participates in one intrinsic wrapping rail. */}
                <div className="flex min-w-0 flex-[0_1_auto] flex-wrap items-end gap-x-5 gap-y-3 border-l border-slate-200/90 bg-slate-100/85 px-3 py-4 sm:px-4">
                  <div className="flex min-w-0 flex-wrap items-end gap-x-6 gap-y-3">
                    {canEdit ? (
                      <>
                        <CardRatingEditor
                          lead={lead}
                          onUpdate={(next) => {
                            setRows((cur) => cur.map((r) => (r.id === next.id ? next : r)));
                            router.refresh();
                          }}
                        />
                        <LeadTemperatureSegmentedControl
                          leadId={lead.id}
                          temperature={lead.temperature}
                          saving={temperatureSaving}
                          onChange={(next) => void applyTemperature(lead.id, next)}
                        />
                        <div
                          className="flex min-w-[8rem] flex-[0_1_auto] flex-col gap-1"
                          data-interactive
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">Follow-up</span>
                          <LeadCardDateField
                            variant="panel"
                            followUpDate={lead.follow_up_date}
                            disabled={dateSaving}
                            onCommit={(iso) => void applyFollowUpDate(lead, iso)}
                          />
                        </div>
                      </>
                    ) : (
                      <LeadCardReadOnlyMetrics lead={lead} />
                    )}
                  </div>

                  <div
                    className="flex min-w-[6.5rem] flex-[0_1_auto] flex-col items-end justify-center gap-1 border-l border-slate-200/80 pl-4"
                    data-interactive
                    onClick={(e) => e.stopPropagation()}
                  >
                    {lead.aiBriefRenderable ? (
                      <a
                        href={`${detailHref}#ai-brief`}
                        data-testid="lead-card-ai-brief"
                        className="text-xs font-semibold text-indigo-700 underline-offset-2 transition hover:text-indigo-900 hover:underline"
                      >
                        Pre-Show Brief
                      </a>
                    ) : null}
                    {workflow?.reviewHref ? (
                      <a
                        href={workflow.reviewHref}
                        data-testid="lead-card-review-approval"
                        className="rounded-md bg-amber-500 px-2.5 py-1 text-center text-xs font-bold text-white shadow-sm transition hover:bg-amber-600"
                      >
                        Review approval
                      </a>
                    ) : null}
                    <a
                      href={detailHref}
                      className="text-xs font-semibold text-slate-800 underline-offset-2 transition hover:text-slate-950 hover:underline"
                    >
                      View detail
                    </a>
                    {canDelete ? (
                      <button
                        type="button"
                        className="text-[11px] font-semibold text-slate-400 transition hover:text-rose-600"
                        onClick={() => setDeleteIntent({ mode: "single", lead })}
                        data-testid="lead-row-delete"
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>

      {deleteIntent ? (
        <DeleteModal
          intent={deleteIntent}
          isDeleting={isDeleting}
          bulkSubjectLabel={deleteBulkSubjectLabel}
          onConfirm={executeDelete}
          onCancel={() => {
            if (!isDeleting) setDeleteIntent(null);
          }}
        />
      ) : null}
    </div>
  );
}
