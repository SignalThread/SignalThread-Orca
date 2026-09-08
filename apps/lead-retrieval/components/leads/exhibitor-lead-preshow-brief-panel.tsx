"use client";

import { LEAD_TEMPERATURE_LABEL, type LeadTemperature } from "@/lib/leads/temperature";
import type { BriefSection } from "@/lib/leads/exhibitor-lead-preshow-brief-sections";
import { BriefSectionView } from "@/components/leads/exhibitor-lead-preshow-brief-blocks";

function formatBriefingAge(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 45) return "Updated just now";
  if (sec < 3600) return `Updated ${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `Updated ${Math.floor(sec / 3600)}h ago`;
  return `Updated ${Math.floor(sec / 86400)}d ago`;
}

function temperatureBadgeClass(t: LeadTemperature | null): string {
  switch (t) {
    case "hot":
      return "bg-rose-50 text-rose-800 ring-rose-200/80";
    case "warm":
      return "bg-amber-50 text-amber-900 ring-amber-200/80";
    case "cold":
      return "bg-sky-50 text-sky-900 ring-sky-200/80";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200/80";
  }
}

export function ExhibitorLeadPreShowBriefPanel({
  leadFullName,
  companyText,
  temperature,
  rawLeadBriefing,
  briefingUpdatedAt,
  briefingHasSections,
  briefingSections
}: {
  leadFullName: string;
  companyText: string | null;
  temperature: LeadTemperature | null;
  rawLeadBriefing: unknown | null;
  briefingUpdatedAt: string | null;
  briefingHasSections: boolean;
  briefingSections: BriefSection[];
}) {
  const updatedLabel = formatBriefingAge(briefingUpdatedAt);
  const company = (companyText ?? "").trim() || "—";

  const hasRenderableBody = briefingSections.length > 0;
  const ready = Boolean(rawLeadBriefing && briefingHasSections);

  return (
    <div className="mx-auto w-full max-w-[720px] pb-6" role="region" aria-label="Pre-Show Brief">
      <header className="sticky top-0 z-20 -mx-5 mb-10 border-b border-slate-200/90 bg-slate-50/95 px-5 py-3.5 backdrop-blur-md sm:-mx-8 sm:px-8">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 break-words text-base font-bold tracking-tight text-slate-950 sm:text-lg">
              {leadFullName || "Lead"}
            </p>
            {ready ? (
              <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-200/90">
                Brief Ready
              </span>
            ) : null}
            <span
              className={
                "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 " +
                temperatureBadgeClass(temperature)
              }
            >
              {temperature ? LEAD_TEMPERATURE_LABEL[temperature] : "Unassessed"}
            </span>
          </div>
          <p className="break-words text-sm text-slate-700">{company}</p>
        </div>
      </header>

      {!rawLeadBriefing ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">Pre-Show Brief not ready</p>
          <p className="mt-1 text-sm text-slate-600">No approved briefing is available for this lead yet.</p>
        </div>
      ) : !briefingHasSections ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">Pre-Show Brief pending</p>
          <p className="mt-1 text-sm text-slate-600">Briefing exists, but strategic sections are not populated yet.</p>
        </div>
      ) : !hasRenderableBody ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">Pre-Show Brief pending</p>
          <p className="mt-1 text-sm text-slate-600">Briefing exists, but no sections are available to display yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-12">
          {briefingSections.map((section, index) => (
            <BriefSectionView
              key={section.id}
              section={section}
              headerRight={
                index === 0 && updatedLabel ? (
                  <span className="text-[11px] font-medium text-slate-400">{updatedLabel}</span>
                ) : null
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
