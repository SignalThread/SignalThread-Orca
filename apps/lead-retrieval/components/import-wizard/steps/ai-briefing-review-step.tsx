"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { hasManualContextInStored, type ImportBriefingManualContextV1 } from "@/lib/import-wizard/briefing-content-json";
import { briefingRowReadinessBadgeV1 } from "@/lib/import-wizard/briefing-readiness-v1";
import type { BriefingDetailView, BriefingQueueItemView } from "@/lib/import-wizard/briefing-detail-model";

export type AiBriefingReviewStepProps = {
  queue: BriefingQueueItemView[];
  totalRowsInBatch: number;
  selectedRowId: string | null;
  onSelectRow: (batchRowId: string) => void;
  detail: BriefingDetailView | null;
  detailLoading: boolean;
  queueLoading: boolean;
  errorMessage: string | null;
  onApproveSelected: () => void | Promise<void>;
  onBulkApprove: () => void | Promise<void>;
  onSaveManualContext: (batchRowId: string, manual: ImportBriefingManualContextV1) => Promise<void>;
  actionBusy: boolean;
};

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)] sm:p-5">
      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="mt-3 space-y-2 text-sm text-slate-700">{children}</div>
    </section>
  );
}

function badgeToneClass(tone: ReturnType<typeof briefingRowReadinessBadgeV1>["tone"]): string {
  switch (tone) {
    case "emerald":
      return "bg-emerald-100 text-emerald-900";
    case "rose":
      return "bg-rose-100 text-rose-900";
    case "amber":
      return "bg-amber-100 text-amber-900";
    case "indigo":
      return "bg-indigo-100 text-indigo-900";
    default:
      return "bg-slate-100 text-slate-800";
  }
}

function emptyManual(): ImportBriefingManualContextV1 {
  return {
    whyMatters: "",
    whatWeKnow: "",
    suspectedPain: "",
    conversationStarter: "",
    competitorMentioned: "",
    priorityOverride: "auto",
    internalNotes: "",
  };
}

function normalizeManualForSave(m: ImportBriefingManualContextV1): ImportBriefingManualContextV1 {
  const trim = (s: string | undefined) => (typeof s === "string" ? s.trim() : "");
  return {
    whyMatters: trim(m.whyMatters),
    whatWeKnow: trim(m.whatWeKnow),
    suspectedPain: trim(m.suspectedPain),
    conversationStarter: trim(m.conversationStarter),
    competitorMentioned: trim(m.competitorMentioned),
    priorityOverride: m.priorityOverride ?? "auto",
    internalNotes: trim(m.internalNotes),
  };
}

export function AiBriefingReviewStep({
  queue,
  totalRowsInBatch,
  selectedRowId,
  onSelectRow,
  detail,
  detailLoading,
  queueLoading,
  errorMessage,
  onApproveSelected,
  onBulkApprove,
  onSaveManualContext,
  actionBusy,
}: AiBriefingReviewStepProps) {
  const approvedCount = queue.filter((q) => q.approvalStatus === "approved").length;
  const total = queue.length;
  const pending = total - approvedCount;
  const manualContextCount = queue.filter((q) => q.hasManualContext).length;

  const [contextOpen, setContextOpen] = useState(false);
  const [draftManual, setDraftManual] = useState<ImportBriefingManualContextV1>(emptyManual);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!detail?.manualContext) {
      setDraftManual(emptyManual());
      return;
    }
    const m = detail.manualContext;
    setDraftManual({
      whyMatters: m.whyMatters ?? "",
      whatWeKnow: m.whatWeKnow ?? "",
      suspectedPain: m.suspectedPain ?? "",
      conversationStarter: m.conversationStarter ?? "",
      competitorMentioned: m.competitorMentioned ?? "",
      priorityOverride: m.priorityOverride ?? "auto",
      internalNotes: m.internalNotes ?? "",
    });
  }, [detail?.batchRowId, detail?.manualContext]);

  const handleSaveContext = useCallback(async () => {
    if (!selectedRowId) return;
    setSaveError(null);
    try {
      await onSaveManualContext(selectedRowId, normalizeManualForSave(draftManual));
      setContextOpen(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed.");
    }
  }, [selectedRowId, draftManual, onSaveManualContext]);

  return (
    <div className="import-wizard-ai-briefing space-y-4" data-testid="import-wizard-ai-briefing">
      {errorMessage ? (
        <div
          className="rounded-xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-900"
          role="alert"
        >
          {errorMessage}
        </div>
      ) : null}

      <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)] sm:p-5">
        <p className="text-sm font-semibold text-slate-900">Brief readiness</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          Review deterministic briefing content built from your mapped source data and approval state for this draft batch.
          Approve each row when you are satisfied, then continue to <span className="font-medium text-slate-800">Import</span>{" "}
          to materialize leads.
        </p>
        <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50/90 px-3 py-2 text-xs text-slate-600">
          Briefing blocks refresh from mapped row data when source data or mappings change. No cloud AI or LLM is used in
          this step.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Rows in batch</p>
          <p className="mt-1 text-2xl font-bold text-slate-900" data-testid="brief-readiness-total-batch">
            {queueLoading ? "…" : totalRowsInBatch.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate-600">Staged import rows (queue may cap display).</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Approved</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700" data-testid="brief-readiness-approved">
            {queueLoading ? "…" : approvedCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate-600">Of {queueLoading ? "…" : total} shown in queue</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Not approved</p>
          <p className="mt-1 text-2xl font-bold text-slate-900" data-testid="brief-readiness-pending">
            {queueLoading ? "…" : pending.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate-600">Pending, needs review, or failed</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">With manual context</p>
          <p className="mt-1 text-2xl font-bold text-indigo-700" data-testid="brief-readiness-manual-count">
            {queueLoading ? "…" : manualContextCount.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-slate-600">Saved notes for booth staff</p>
        </div>
      </div>

      {queueLoading ? (
        <p className="text-sm text-slate-600">Loading briefing queue…</p>
      ) : queue.length === 0 ? (
        <p className="rounded-xl border border-border bg-slate-50/80 px-4 py-6 text-center text-sm text-slate-600">
          No rows in this import batch. Return to field mapping and upload a spreadsheet with data rows.
        </p>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Rows</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-100 bg-white text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Lead</th>
                    <th className="px-4 py-2 font-semibold">Company</th>
                    <th className="px-4 py-2 font-semibold">Readiness</th>
                    <th className="px-4 py-2 font-semibold">Manual context</th>
                    <th className="px-4 py-2 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {queue.map((item) => {
                    const badge = briefingRowReadinessBadgeV1(item);
                    const sel = item.batchRowId === selectedRowId;
                    return (
                      <tr
                        key={item.batchRowId}
                        className={sel ? "bg-indigo-50/60" : "hover:bg-slate-50/80"}
                        data-testid={`brief-readiness-row-${item.batchRowId}`}
                      >
                        <td className="whitespace-nowrap px-4 py-2 font-medium text-slate-900">
                          <button
                            type="button"
                            className="text-left font-semibold text-indigo-800 underline-offset-2 hover:underline"
                            onClick={() => onSelectRow(item.batchRowId)}
                          >
                            {item.personName}
                          </button>
                          {item.title ? <span className="mt-0.5 block text-xs font-normal text-slate-600">{item.title}</span> : null}
                        </td>
                        <td className="px-4 py-2 text-slate-700">{item.company ?? "—"}</td>
                        <td className="px-4 py-2">
                          <span
                            className={`inline-flex rounded-md px-2 py-0.5 text-xs font-bold ${badgeToneClass(badge.tone)}`}
                            data-testid={`brief-readiness-status-${item.batchRowId}`}
                          >
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-slate-700" data-testid={`brief-readiness-manual-flag-${item.batchRowId}`}>
                          {item.hasManualContext ? "Yes" : "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2">
                          <button
                            type="button"
                            className="mr-2 text-xs font-semibold text-indigo-700 hover:underline"
                            onClick={() => {
                              onSelectRow(item.batchRowId);
                              setContextOpen(true);
                            }}
                          >
                            {item.hasManualContext ? "Edit context" : "Add context"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={actionBusy}
              onClick={() => void onBulkApprove()}
              className="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition enabled:hover:from-indigo-600 enabled:hover:to-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
              data-testid="import-wizard-briefing-bulk-approve"
            >
              Approve all shown
            </button>
            <p className="text-xs text-slate-600">
              Approved {approvedCount}/{total} shown · Pending {pending}
            </p>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)]">
            <div className="min-w-0 space-y-4">
              {detailLoading ? (
                <p className="text-sm text-slate-600">Loading briefing…</p>
              ) : detail ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium leading-relaxed text-slate-700">{detail.headline}</p>
                    <button
                      type="button"
                      disabled={actionBusy || !detail}
                      onClick={() => void onApproveSelected()}
                      className="rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition enabled:hover:from-indigo-600 enabled:hover:to-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                      data-testid="import-wizard-briefing-approve"
                    >
                      Approve this row
                    </button>
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => setContextOpen(true)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                      data-testid="import-wizard-briefing-open-context"
                    >
                      Manual context
                    </button>
                  </div>

                  <SectionCard title="Company snapshot">
                    <p className="text-base font-bold text-slate-950">{detail.companySnapshot.name}</p>
                    <p className="text-slate-600">{detail.companySnapshot.tagline}</p>
                    <blockquote className="border-l-4 border-accent/40 pl-3 italic text-slate-600">
                      {detail.companySnapshot.quote}
                    </blockquote>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <div className="rounded-lg bg-slate-50 px-3 py-2">
                        <p className="text-[10px] font-bold uppercase text-slate-500">Headcount</p>
                        <p className="font-semibold text-slate-900">{detail.companySnapshot.headcount}</p>
                      </div>
                      <div className="rounded-lg bg-accentSoft/50 px-3 py-2">
                        <p className="text-[10px] font-bold uppercase text-slate-500">Tech sophistication</p>
                        <p className="font-semibold text-accent">{detail.companySnapshot.techSophistication}</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 px-3 py-2">
                        <p className="text-[10px] font-bold uppercase text-slate-500">HQ</p>
                        <p className="font-semibold text-slate-900">{detail.companySnapshot.hq}</p>
                      </div>
                    </div>
                  </SectionCard>

                  <div className="rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-600 to-violet-700 p-4 text-white shadow-md sm:p-5">
                    <h3 className="text-xs font-bold uppercase tracking-wide text-white/80">Why they might be here</h3>
                    {detail.whyHere.length > 0 ? (
                      <ul className="mt-3 space-y-2">
                        {detail.whyHere.map((line) => (
                          <li key={line} className="flex gap-2 text-sm">
                            <span className="text-emerald-300" aria-hidden="true">
                              ✓
                            </span>
                            <span>{line}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 text-sm text-white/85">No lines derived from mapped source fields.</p>
                    )}
                  </div>

                  <SectionCard title="Talking points (from mapped data)">
                    {detail.talkingPoints.length > 0 ? (
                      <ul className="space-y-3">
                        {detail.talkingPoints.map((tp) => (
                          <li key={tp.title} className="border-l-4 border-accent pl-3">
                            <p className="font-semibold text-slate-950">{tp.title}</p>
                            <p className="mt-0.5 text-slate-600">{tp.detail}</p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-slate-500">None yet — add mapped columns or context.</p>
                    )}
                  </SectionCard>

                  <SectionCard title="Questions to ask">
                    {detail.questionsToAsk.length > 0 ? (
                      <ul className="list-inside list-disc space-y-1.5">
                        {detail.questionsToAsk.map((q) => (
                          <li key={q}>{q}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-slate-500">None suggested from stored content.</p>
                    )}
                  </SectionCard>

                  <div className="grid gap-4 md:grid-cols-2">
                    <SectionCard title="Competitor context">
                      {detail.competitorContext.trim() ? (
                        <p>{detail.competitorContext}</p>
                      ) : (
                        <p className="text-sm text-slate-500">None in stored briefing content.</p>
                      )}
                    </SectionCard>
                    <SectionCard title="Cues to watch">
                      {detail.signalsToWatch.length > 0 ? (
                        <ul className="list-inside list-disc space-y-1.5">
                          {detail.signalsToWatch.map((s) => (
                            <li key={s}>{s}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-slate-500">None in stored briefing content.</p>
                      )}
                    </SectionCard>
                  </div>

                  {detail.manualContext && hasManualContextInStored({ manualContext: detail.manualContext }) ? (
                    <SectionCard title="Saved manual context">
                      <dl className="space-y-2 text-sm">
                        {[
                          ["Why this lead matters", detail.manualContext.whyMatters],
                          ["What we already know", detail.manualContext.whatWeKnow],
                          ["Suspected pain point", detail.manualContext.suspectedPain],
                          ["Conversation starter", detail.manualContext.conversationStarter],
                          ["Competitor mentioned", detail.manualContext.competitorMentioned],
                          ["Internal notes", detail.manualContext.internalNotes],
                        ].map(([label, val]) =>
                          val != null && String(val).trim() !== "" ? (
                            <div key={label}>
                              <dt className="text-[10px] font-bold uppercase text-slate-500">{label}</dt>
                              <dd className="mt-0.5 text-slate-800">{String(val)}</dd>
                            </div>
                          ) : null
                        )}
                        {detail.manualContext.priorityOverride != null && detail.manualContext.priorityOverride !== "auto" ? (
                          <div>
                            <dt className="text-[10px] font-bold uppercase text-slate-500">Priority override</dt>
                            <dd className="mt-0.5 text-slate-800">{detail.manualContext.priorityOverride}</dd>
                          </div>
                        ) : null}
                      </dl>
                    </SectionCard>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-slate-600">Select a row to view briefing details.</p>
              )}
            </div>
          </div>
        </>
      )}

      {contextOpen && selectedRowId ? (
        <div
          className="fixed inset-0 z-50 flex justify-end p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="manual-context-title"
          data-testid="import-wizard-manual-context-panel"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close panel"
            onClick={() => {
              setSaveError(null);
              setContextOpen(false);
            }}
          />
          <div className="relative z-10 flex h-full w-full max-w-md flex-col bg-card shadow-2xl sm:max-h-[min(100%,48rem)] sm:rounded-2xl sm:border sm:border-border">
            <div className="border-b border-border px-4 py-3">
              <h2 id="manual-context-title" className="text-lg font-bold text-slate-950">
                Manual context
              </h2>
              <p className="text-sm text-slate-600">
                {detail?.headline ??
                  (() => {
                    const q = queue.find((x) => x.batchRowId === selectedRowId);
                    return q
                      ? `${q.personName}${q.title ? ` — ${q.title}` : ""}${q.company ? ` · ${q.company}` : ""}`
                      : "Selected row";
                  })()}
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {saveError ? (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">{saveError}</p>
              ) : null}
              <p className="text-xs text-slate-600">
                Saved on this draft batch only. Shown to your team here; not sent to an external AI in v1.
              </p>
              <label className="block text-xs font-semibold text-slate-700">
                Why this lead matters
                <textarea
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                  rows={2}
                  value={draftManual.whyMatters ?? ""}
                  onChange={(e) => setDraftManual((d) => ({ ...d, whyMatters: e.target.value }))}
                  data-testid="manual-context-why"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-700">
                What we already know
                <textarea
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                  rows={2}
                  value={draftManual.whatWeKnow ?? ""}
                  onChange={(e) => setDraftManual((d) => ({ ...d, whatWeKnow: e.target.value }))}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-700">
                Suspected pain point
                <textarea
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                  rows={2}
                  value={draftManual.suspectedPain ?? ""}
                  onChange={(e) => setDraftManual((d) => ({ ...d, suspectedPain: e.target.value }))}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-700">
                Conversation starter
                <textarea
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                  rows={2}
                  value={draftManual.conversationStarter ?? ""}
                  onChange={(e) => setDraftManual((d) => ({ ...d, conversationStarter: e.target.value }))}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-700">
                Competitor mentioned
                <textarea
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                  rows={2}
                  value={draftManual.competitorMentioned ?? ""}
                  onChange={(e) => setDraftManual((d) => ({ ...d, competitorMentioned: e.target.value }))}
                />
              </label>
              <label className="block text-xs font-semibold text-slate-700">
                Priority override
                <select
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                  value={draftManual.priorityOverride ?? "auto"}
                  onChange={(e) =>
                    setDraftManual((d) => ({
                      ...d,
                      priorityOverride: e.target.value as ImportBriefingManualContextV1["priorityOverride"],
                    }))
                  }
                >
                  <option value="auto">Auto (no override)</option>
                  <option value="high">High</option>
                  <option value="normal">Normal</option>
                  <option value="low">Low</option>
                </select>
              </label>
              <label className="block text-xs font-semibold text-slate-700">
                Internal notes
                <textarea
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                  rows={3}
                  value={draftManual.internalNotes ?? ""}
                  onChange={(e) => setDraftManual((d) => ({ ...d, internalNotes: e.target.value }))}
                  data-testid="manual-context-notes"
                />
              </label>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-border px-4 py-3">
              <button
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800"
                onClick={() => {
                  setSaveError(null);
                  setContextOpen(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionBusy}
                className="rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                onClick={() => void handleSaveContext()}
                data-testid="manual-context-save"
              >
                Save context
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
