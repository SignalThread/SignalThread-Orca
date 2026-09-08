"use client";

import { useMemo, useState } from "react";
import {
  OrganizerFilterBar,
  OrganizerFilterField,
  OrganizerFilterSelect,
  OrganizerSearchField
} from "@/components/organizer/organizer-filter-bar";

export type OrganizerPerformanceRow = {
  exhibitorId: string;
  companyId: string;
  exhibitorName: string;
  leadCount: number;
  percentOfEvent: number;
  activeUsers: number;
  seatsUsed: number;
  seatsTotal: number;
  utilizationPct: number;
  lastActivityAt: string | null;
  engagement: number;
};

export type OrganizerPerformanceSummary = {
  totalExhibitors: number;
  withLeadsPct: number;
  totalLeads: number;
  avgPerExhibitor: number;
  zeroLeads: number;
  mostActiveName: string;
};

type PerformanceTier = "all" | "high" | "medium" | "low" | "zero";
type UtilizationFilter = "all" | "lt50" | "50to79" | "80plus";

export function OrganizerPerformanceClient({
  rows,
  summary
}: {
  rows: OrganizerPerformanceRow[];
  summary: OrganizerPerformanceSummary;
}) {
  const [search, setSearch] = useState("");
  const [tier, setTier] = useState<PerformanceTier>("all");
  const [utilizationFilter, setUtilizationFilter] = useState<UtilizationFilter>("all");

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (normalizedSearch && !row.exhibitorName.toLowerCase().includes(normalizedSearch)) {
        return false;
      }

      if (tier === "high" && row.leadCount < 50) return false;
      if (tier === "medium" && (row.leadCount < 10 || row.leadCount > 49)) return false;
      if (tier === "low" && (row.leadCount < 1 || row.leadCount > 9)) return false;
      if (tier === "zero" && row.leadCount !== 0) return false;

      if (utilizationFilter === "lt50" && row.utilizationPct >= 50) return false;
      if (utilizationFilter === "50to79" && (row.utilizationPct < 50 || row.utilizationPct >= 80)) return false;
      if (utilizationFilter === "80plus" && row.utilizationPct < 80) return false;

      return true;
    });
  }, [rows, search, tier, utilizationFilter]);

  return (
    <section className="w-full max-w-full min-w-0 space-y-7 overflow-x-hidden">
      <section className="grid w-full max-w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="Total Exhibitors" value={String(summary.totalExhibitors)} />
        <Metric label="With Leads (%)" value={`${summary.withLeadsPct}%`} />
        <Metric label="Total Leads" value={summary.totalLeads.toLocaleString("en-US")} />
        <Metric label="Avg per Exhibitor" value={summary.avgPerExhibitor.toFixed(1)} />
        <Metric label="Zero Leads" value={String(summary.zeroLeads)} />
        <Metric label="Most Active" value={summary.mostActiveName} />
      </section>

      <OrganizerFilterBar
        filters={
          <>
            <OrganizerFilterField label="Performance tier">
              <OrganizerFilterSelect
                value={tier}
                onChange={(event) => setTier(event.target.value as PerformanceTier)}
                aria-label="Performance tier"
              >
                <option value="all">All</option>
                <option value="high">High ({">="} 50)</option>
                <option value="medium">Medium (10-49)</option>
                <option value="low">Low (1-9)</option>
                <option value="zero">Zero (0)</option>
              </OrganizerFilterSelect>
            </OrganizerFilterField>
            <OrganizerFilterField label="License utilization">
              <OrganizerFilterSelect
                value={utilizationFilter}
                onChange={(event) => setUtilizationFilter(event.target.value as UtilizationFilter)}
                aria-label="License utilization"
              >
                <option value="all">All</option>
                <option value="lt50">&lt; 50%</option>
                <option value="50to79">50-79%</option>
                <option value="80plus">80%+</option>
              </OrganizerFilterSelect>
            </OrganizerFilterField>
          </>
        }
        search={
          <OrganizerFilterField label="Search" className="w-full">
            <OrganizerSearchField
              value={search}
              onChange={setSearch}
              placeholder="Search exhibitors…"
              aria-label="Search exhibitors"
            />
          </OrganizerFilterField>
        }
      />

      <section className="w-full max-w-full min-w-0 overflow-x-hidden rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)] md:p-5">
        <div className="w-full max-w-full min-w-0 overflow-x-hidden">
          <table className="w-full table-fixed text-left text-sm">
            <thead className="border-b border-border bg-slate-50 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th className="w-[30%] px-2 py-3 sm:px-3 lg:px-4">Exhibitor Name</th>
                <th className="w-[12%] px-2 py-3 sm:px-3 lg:px-4">Leads Captured</th>
                <th className="w-[18%] px-2 py-3 sm:px-3 md:hidden">Utilization</th>
                <th className="hidden w-[12%] px-2 py-3 sm:px-3 lg:table-cell lg:px-4">% of Event</th>
                <th className="hidden w-[12%] px-2 py-3 sm:px-3 md:table-cell lg:px-4">Active Users</th>
                <th className="hidden w-[14%] px-2 py-3 sm:px-3 md:table-cell lg:px-4">License Seats</th>
                <th className="hidden w-[18%] px-2 py-3 sm:px-3 md:table-cell lg:px-4">Utilization</th>
                <th className="hidden w-[14%] px-2 py-3 sm:px-3 lg:table-cell lg:px-4">Last Activity</th>
                <th className="w-[10%] px-2 py-3 text-right sm:px-3 lg:px-4">Engagement</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={`${row.exhibitorId}:${row.companyId}`} className="border-b border-border/70 text-slate-700 last:border-none hover:bg-slate-50/70">
                  <td
                    className="max-w-[180px] truncate px-2 py-3.5 font-semibold text-slate-900 sm:max-w-[240px] sm:px-3 lg:px-4"
                    title={row.exhibitorName}
                  >
                    {row.exhibitorName}
                  </td>
                  <td className="px-2 py-3.5 font-semibold sm:px-3 lg:px-4">{row.leadCount}</td>
                  <td className="px-2 py-3.5 md:hidden sm:px-3">
                    <div className="text-xs font-semibold text-slate-900">
                      {row.seatsUsed} / {row.seatsTotal}
                    </div>
                    <div className="text-xs text-slate-600">{row.utilizationPct.toFixed(0)}%</div>
                  </td>
                  <td className="hidden px-2 py-3.5 sm:px-3 lg:table-cell lg:px-4">{row.percentOfEvent.toFixed(1)}%</td>
                  <td className="hidden px-2 py-3.5 sm:px-3 md:table-cell lg:px-4">{row.activeUsers}</td>
                  <td className="hidden px-2 py-3.5 sm:px-3 md:table-cell lg:px-4">
                    {row.seatsUsed} / {row.seatsTotal}
                  </td>
                  <td className="hidden px-2 py-3.5 sm:px-3 md:table-cell lg:px-4">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-full max-w-20 rounded-full bg-slate-100 lg:max-w-24">
                        <div
                          className="h-2.5 rounded-full bg-accent"
                          style={{ width: `${Math.max(0, Math.min(100, row.utilizationPct))}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold lg:text-sm">{row.utilizationPct.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="hidden max-w-[220px] truncate px-2 py-3.5 sm:px-3 lg:table-cell lg:px-4" title={formatTimestamp(row.lastActivityAt)}>
                    {formatTimestamp(row.lastActivityAt)}
                  </td>
                  <td className="px-2 py-3.5 text-right sm:px-3 lg:px-4">
                    <EngagementBadge score={row.engagement} />
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                    {rows.length === 0 ? "No exhibitors yet." : "No exhibitors match the selected filters."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function formatTimestamp(value: string | null) {
  if (!value) return "No activity";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No activity";
  return date.toLocaleString();
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
      <p className="truncate text-2xl font-bold text-slate-950" title={value}>
        {value}
      </p>
      <p className="mt-1 truncate text-sm font-semibold text-slate-600" title={label}>
        {label}
      </p>
    </article>
  );
}

function EngagementBadge({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const toneClass = clamped >= 80 ? "bg-emerald-100 text-emerald-700" : clamped >= 60 ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700";

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${toneClass}`}>
      {clamped}
    </span>
  );
}
