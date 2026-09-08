"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PageHeader, PageShell } from "@/components/layout/page-header";

type CampaignApiRow = {
  id: string;
  name: string;
  mode: "single" | "group";
  status: "draft" | "scheduled" | "sending" | "sent" | "failed";
  created_at: string;
  subject_line?: string | null;
  draft_subject?: string | null;
  draft_body_text?: string | null;
  scheduled_at?: string | null;
  recipients_count?: number;
  sent_count?: number;
  opened_count?: number;
  clicked_count?: number;
  replied_count?: number;
  opened_at?: string | null;
  clicked_at?: string | null;
  replied_at?: string | null;
  last_sent_at?: string | null;
  preview_subject?: string | null;
  preview_text?: string | null;
  primary_recipient_name?: string | null;
  primary_recipient_company?: string | null;
};

type CampaignsApiResponse = { campaigns: CampaignApiRow[]; error?: string };
type CampaignFilter = "all" | "single" | "group";
type SortBy = "recent" | "name";

/* ─── Helpers ─── */

function metaDate(c: CampaignApiRow) {
  const iso = c.scheduled_at || c.last_sent_at || c.created_at;
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getInitials(v: string) {
  const parts = v.trim().split(/\s+/).slice(0, 2);
  return parts.length ? parts.map((p) => p.charAt(0).toUpperCase()).join("") : "NA";
}

function formatRate(n: number, d: number) {
  return d ? `${Math.round((n / d) * 100)}%` : "—";
}
function mv(v: number | undefined, fb = 0) {
  return Number.isFinite(v) ? Number(v) : fb;
}

/** Summary metrics (not campaign state): neutral tiles, sentence-case labels — distinct from row status chips. */
type StatTone = "slate" | "violet" | "sky" | "zinc" | "emerald";

const STAT_TONES: Record<StatTone, { bg: string; value: string; dot: string }> = {
  slate: { bg: "bg-slate-50", value: "text-slate-900", dot: "bg-slate-400" },
  violet: { bg: "bg-violet-50", value: "text-violet-700", dot: "bg-violet-400" },
  sky: { bg: "bg-sky-50", value: "text-sky-700", dot: "bg-sky-400" },
  zinc: { bg: "bg-zinc-50", value: "text-zinc-900", dot: "bg-zinc-400" },
  emerald: { bg: "bg-emerald-50", value: "text-emerald-700", dot: "bg-emerald-400" }
};

function StatCard({ value, label, tone }: { value: number; label: string; tone: StatTone }) {
  const t = STAT_TONES[tone];
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border border-slate-200/80 ${t.bg} px-3 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-slate-200/50 transition-shadow hover:shadow-sm sm:px-4 sm:py-3`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${t.dot}`} aria-hidden />
      <div className="min-w-0">
        <p className={`text-lg font-bold leading-none tracking-tight tabular-nums sm:text-xl ${t.value}`}>
          {value.toLocaleString()}
        </p>
        <p className="mt-0.5 truncate text-[10px] font-medium leading-snug text-slate-600 sm:text-[11px]">{label}</p>
      </div>
    </div>
  );
}

/* Status chip — real campaign status only */
const STATUS_CHIP: Record<
  CampaignApiRow["status"],
  { label: string; className: string }
> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-700 ring-slate-200/80" },
  scheduled: { label: "Scheduled", className: "bg-blue-50 text-blue-800 ring-blue-200/80" },
  sending: { label: "Sending", className: "bg-amber-50 text-amber-800 ring-amber-200/80" },
  sent: { label: "Sent", className: "bg-emerald-50 text-emerald-800 ring-emerald-200/80" },
  failed: { label: "Failed", className: "bg-rose-50 text-rose-800 ring-rose-200/80" },
};

function CampaignModeChip({ mode }: { mode: CampaignApiRow["mode"] }) {
  const isGroup = mode === "group";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
        isGroup
          ? "bg-violet-50 text-violet-800 ring-violet-200/80"
          : "bg-sky-50 text-sky-800 ring-sky-200/80"
      }`}
    >
      {isGroup ? (
        <svg
          className="h-3 w-3 shrink-0 text-violet-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      ) : (
        <svg
          className="h-3 w-3 shrink-0 text-sky-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
          />
        </svg>
      )}
      {isGroup ? "Group" : "Individual"}
    </span>
  );
}

/* ═══════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════ */

export function CampaignsList() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<CampaignApiRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<CampaignFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("recent");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch("/api/campaigns", { cache: "no-store" });
        const p = (await r.json()) as CampaignsApiResponse;
        if (!r.ok) throw new Error(p.error ?? "Failed to load campaigns");
        if (!active) return;
        setCampaigns(p.campaigns ?? []);
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Failed to load campaigns");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  async function createDraft() {
    setCreating(true);
    setError(null);
    try {
      const r = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const p = (await r.json()) as { campaignId?: string; error?: string };
      if (!r.ok || !p.campaignId) throw new Error(p.error ?? "Failed to create campaign");
      router.push(`/campaigns/${encodeURIComponent(p.campaignId)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create campaign");
      setCreating(false);
    }
  }

  async function deleteCampaign(campaign: CampaignApiRow) {
    if (deletingId) return;
    const confirmed = window.confirm(`Delete campaign "${campaign.name}"? This cannot be undone.`);
    if (!confirmed) return;

    setDeletingId(campaign.id);
    setError(null);
    try {
      const r = await fetch(`/api/campaigns/${encodeURIComponent(campaign.id)}`, {
        method: "DELETE"
      });
      const p = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(p.error ?? "Failed to delete campaign");
      setCampaigns((current) => current.filter((item) => item.id !== campaign.id));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete campaign");
    } finally {
      setDeletingId(null);
    }
  }

  const filtered = useMemo(
    () => (activeFilter === "all" ? campaigns : campaigns.filter((c) => c.mode === activeFilter)),
    [activeFilter, campaigns]
  );

  const sorted = useMemo(() => {
    const list = [...filtered];
    if (sortBy === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name));
      return list;
    }
    list.sort((a, b) => {
      const ta = new Date(a.last_sent_at || a.scheduled_at || a.created_at).getTime();
      const tb = new Date(b.last_sent_at || b.scheduled_at || b.created_at).getTime();
      return tb - ta;
    });
    return list;
  }, [filtered, sortBy]);

  const totals = useMemo(() => {
    const sentCampaigns = campaigns.filter((c) => c.status === "sent").length;
    const opens = campaigns.reduce((s, c) => s + mv(c.opened_count), 0);
    return {
      total: campaigns.length,
      group: campaigns.filter((c) => c.mode === "group").length,
      individual: campaigns.filter((c) => c.mode === "single").length,
      sentCampaigns,
      opens
    };
  }, [campaigns]);

  const tabs: { key: CampaignFilter; label: string }[] = [
    { key: "all", label: `All (${totals.total})` },
    { key: "group", label: `Group (${totals.group})` },
    { key: "single", label: `Individual (${totals.individual})` },
  ];

  return (
    <PageShell>
      <PageHeader
        title="Campaigns"
        subtitle="Manage outreach sequences and individual follow-ups"
        actions={
          <button
            type="button"
            disabled={creating}
            onClick={() => void createDraft()}
            className="inline-flex h-10 shrink-0 items-center gap-2 self-start rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:opacity-60 sm:self-center"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" d="M12 4v16m8-8H4" />
            </svg>
            {creating ? "Creating…" : "New Campaign"}
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
        <StatCard value={totals.total} label="Total campaigns" tone="slate" />
        <StatCard value={totals.group} label="Group campaigns" tone="violet" />
        <StatCard value={totals.individual} label="Individual campaigns" tone="sky" />
        <StatCard value={totals.sentCampaigns} label="Sent campaigns" tone="zinc" />
        <StatCard value={totals.opens} label="Message opens" tone="emerald" />
      </div>

      <div className="flex flex-col gap-2 pt-0.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex w-fit rounded-xl bg-slate-100/90 p-1 ring-1 ring-slate-200/60">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveFilter(t.key)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                activeFilter === t.key
                  ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <span className="font-medium text-slate-500">Sort by:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="cursor-pointer rounded-lg border border-slate-200 bg-white py-1.5 pl-2.5 pr-8 text-sm font-semibold text-slate-900 shadow-sm outline-none transition hover:border-slate-300 focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="recent">Recent</option>
            <option value="name">Name</option>
          </select>
        </label>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
          Loading campaigns…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {error}
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <p className="text-sm font-medium text-slate-500">
            {campaigns.length === 0 ? "No campaigns yet. Create your first one." : "No campaigns match the selected filter."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((c) => (
            <CampaignCard
              key={c.id}
              campaign={c}
              isDeleting={deletingId === c.id}
              onDelete={() => void deleteCampaign(c)}
            />
          ))}
        </div>
      )}
    </PageShell>
  );
}

/* ═══════════════════════════════════════════
   CAMPAIGN CARD (mockup-style row)
   ═══════════════════════════════════════════ */

function CampaignCard({
  campaign: c,
  isDeleting,
  onDelete
}: {
  campaign: CampaignApiRow;
  isDeleting: boolean;
  onDelete: () => void;
}) {
  const sent = mv(c.sent_count, c.status === "sent" ? 1 : 0);
  const opened = mv(c.opened_count);
  const recipients = mv(c.recipients_count);
  const isGroup = c.mode === "group";
  const displayName = isGroup ? c.name : c.primary_recipient_name ?? c.name;
  const dateLabel = metaDate(c);
  const status = STATUS_CHIP[c.status] ?? STATUS_CHIP.draft;

  /** Center metric: real data only — open rate when sends exist; else recipients; else em dash. */
  let metricLabel = "Recipients";
  let metricValue: string = "—";
  if (sent > 0) {
    metricLabel = "Open rate";
    metricValue = formatRate(opened, sent);
  } else if (recipients > 0) {
    metricLabel = "Recipients";
    metricValue = String(recipients);
  }

  return (
    <div className="group flex min-h-[5.75rem] items-center gap-3 rounded-xl border border-slate-200/90 bg-white px-5 py-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all hover:border-slate-300 hover:shadow-md sm:min-h-[6.25rem] sm:gap-4 sm:px-6 sm:py-7">
      <Link
        href={`/campaigns/${encodeURIComponent(c.id)}`}
        className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4"
      >
      {/* Icon tile */}
      {isGroup ? (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 ring-1 ring-violet-200/60">
          <svg className="h-[1.35rem] w-[1.35rem]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
        </div>
      ) : (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-[0.8125rem] font-bold leading-none text-white shadow-sm ring-1 ring-indigo-900/10 sm:text-sm">
          {getInitials(displayName)}
        </div>
      )}

      {/* Title + metadata */}
      <div className="min-w-0 flex-1 py-0.5">
        <p className="truncate text-[15px] font-bold leading-snug tracking-tight text-slate-950 transition-colors group-hover:text-indigo-700 sm:text-base">
          {displayName}
        </p>
        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-slate-500">
          <CampaignModeChip mode={c.mode} />
          {dateLabel ? (
            <>
              <span className="text-slate-300" aria-hidden>
                ·
              </span>
              <span className="inline-flex items-center gap-1 tabular-nums text-slate-500">
                <svg className="h-3.5 w-3.5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                {dateLabel}
              </span>
            </>
          ) : null}
        </div>
      </div>
      </Link>

      {/* Metric, status, chevron — grouped to anchor the right side and reduce empty middle drift */}
      <div className="flex shrink-0 items-center gap-3 border-l border-slate-100 py-1 pl-4 sm:gap-4 sm:pl-6">
        <div className="min-w-0 text-right sm:min-w-[5.75rem]">
          <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:text-[10px]">{metricLabel}</p>
          <p className="mt-1 text-lg font-bold tabular-nums tracking-tight text-slate-900 sm:text-xl">{metricValue}</p>
        </div>

        <span
          className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset sm:text-[11px] ${status.className}`}
        >
          {status.label}
        </span>

        {c.status === "draft" ? (
          <button
            type="button"
            onClick={onDelete}
            disabled={isDeleting}
            data-testid={`delete-campaign-${c.id}`}
            className="inline-flex h-9 shrink-0 items-center rounded-lg border border-rose-200 px-3 text-sm font-semibold text-rose-600 transition hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
            title="Delete campaign"
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        ) : null}

        <Link
          href={`/campaigns/${encodeURIComponent(c.id)}`}
          className="flex h-10 w-10 shrink-0 items-center justify-center text-slate-300 transition-colors group-hover:text-indigo-500"
          aria-label={`View ${displayName}`}
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
