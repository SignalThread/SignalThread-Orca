"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BriefingBatchWorkspaceShell } from "@/components/exhibitor/briefing-batch-workspace-shell";
import { BriefingWorkspaceCancelAction } from "@/components/exhibitor/briefing-workspace-cancel-action";
import { exhibitorBriefingsIntroProseClass } from "@/lib/exhibitor-briefings-shell";
import type { ImportBriefingManualContextV1 } from "@/lib/import-wizard/briefing-content-json";
import type { BriefingDetailView, BriefingQueueItemView } from "@/lib/import-wizard/briefing-detail-model";
import { batchBriefingsReviewPath, EXHIBITOR_BRIEFINGS_SETUP_PATH } from "@/lib/import-wizard/paths";

const BATCH_NOTES_DEBOUNCE_MS = 700;

type QueueResponse = {
  queue: BriefingQueueItemView[];
  totalRowsInBatch: number;
  allApproved: boolean;
};

function badgeClass(tone: string): string {
  switch (tone) {
    case "emerald": return "bg-emerald-100 text-emerald-800";
    case "rose": return "bg-rose-100 text-rose-800";
    case "amber": return "bg-amber-100 text-amber-800";
    case "indigo": return "bg-indigo-100 text-indigo-800";
    default: return "bg-slate-100 text-slate-700";
  }
}

function emptyManual(): ImportBriefingManualContextV1 {
  return { whyMatters: "", whatWeKnow: "", suspectedPain: "", conversationStarter: "", competitorMentioned: "", priorityOverride: "auto", internalNotes: "" };
}

function normalizeManual(m: ImportBriefingManualContextV1): ImportBriefingManualContextV1 {
  const t = (s: string | undefined) => (typeof s === "string" ? s.trim() : "");
  return { whyMatters: t(m.whyMatters), whatWeKnow: t(m.whatWeKnow), suspectedPain: t(m.suspectedPain), conversationStarter: t(m.conversationStarter), competitorMentioned: t(m.competitorMentioned), priorityOverride: m.priorityOverride ?? "auto", internalNotes: t(m.internalNotes) };
}

/** Prep tab: import/identity status only — no brief approval labels. */
function prepWorkspaceRowBadge(item: BriefingQueueItemView): { label: string; tone: "emerald" | "rose" | "amber" | "slate" | "indigo" } {
  if (!item.identityComplete) {
    return { label: "Missing required mapped data", tone: "rose" };
  }
  if (item.approvalStatus === "needs_review") {
    return { label: "Needs attention", tone: "amber" };
  }
  if (item.approvalStatus === "failed") {
    return { label: "Failed", tone: "rose" };
  }
  return { label: "Import ready", tone: "indigo" };
}

export function BatchBriefReadinessClient({
  batchId,
  batchDataRevision,
  workspaceHeadline,
  workspaceSubline,
  batchStatus,
  statusBadgeLabel,
  canCancelSelectedLeadDraft = false,
}: {
  batchId: string;
  batchDataRevision: number;
  workspaceHeadline: string;
  workspaceSubline: string | null;
  batchStatus: string;
  statusBadgeLabel: string;
  canCancelSelectedLeadDraft?: boolean;
}) {
  const [queue, setQueue] = useState<BriefingQueueItemView[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const [batchNotes, setBatchNotes] = useState("");
  const [notesHydrated, setNotesHydrated] = useState(false);
  const [notesSaveUi, setNotesSaveUi] = useState<"saving" | "saved" | "error">("saved");
  const [notesError, setNotesError] = useState<string | null>(null);
  const baselineNotesRef = useRef("");

  const [contextRowId, setContextRowId] = useState<string | null>(null);
  const [contextDetail, setContextDetail] = useState<BriefingDetailView | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [draftManual, setDraftManual] = useState<ImportBriefingManualContextV1>(emptyManual);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    const res = await fetch(`/api/exhibitor/import-wizard/batches/${encodeURIComponent(batchId)}/briefing-queue`, { credentials: "include" });
    const json = (await res.json()) as QueueResponse & { error?: string };
    if (!res.ok) throw new Error(json.error ?? "Failed to load queue.");
    setQueue(json.queue);
    setTotalRows(json.totalRowsInBatch);
  }, [batchId]);

  useEffect(() => {
    let c = false;
    (async () => {
      try { setLoading(true); setError(null); await loadQueue(); }
      catch (e) { if (!c) setError(e instanceof Error ? e.message : "Load failed."); }
      finally { if (!c) setLoading(false); }
    })();
    return () => { c = true; };
  }, [loadQueue, batchDataRevision]);

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/exhibitor/import-wizard/batches/${encodeURIComponent(batchId)}/briefing-context`,
          { credentials: "include" }
        );
        if (res.ok) {
          const json = (await res.json()) as { context?: { batchNotes?: string } };
          const n = typeof json.context?.batchNotes === "string" ? json.context.batchNotes : "";
          if (!c) {
            setBatchNotes(n);
            baselineNotesRef.current = n;
            setNotesSaveUi("saved");
          }
        }
      } finally {
        if (!c) setNotesHydrated(true);
      }
    })();
    return () => {
      c = true;
    };
  }, [batchId]);

  const flushBatchNotes = useCallback(async () => {
    if (!notesHydrated) return;
    if (batchNotes === baselineNotesRef.current) {
      setNotesSaveUi("saved");
      return;
    }
    setNotesSaveUi("saving");
    setNotesError(null);
    try {
      const res = await fetch(`/api/exhibitor/import-wizard/batches/${encodeURIComponent(batchId)}/briefing-context`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: { batchNotes } }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Save failed.");
      }
      baselineNotesRef.current = batchNotes;
      setNotesSaveUi("saved");
    } catch (e) {
      setNotesError(e instanceof Error ? e.message : "Save failed.");
      setNotesSaveUi("error");
    }
  }, [batchId, batchNotes, notesHydrated]);

  useEffect(() => {
    if (!notesHydrated) return;
    if (batchNotes === baselineNotesRef.current) return;
    const t = window.setTimeout(() => {
      void flushBatchNotes();
    }, BATCH_NOTES_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [batchNotes, notesHydrated, flushBatchNotes]);

  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState !== "hidden") return;
      if (batchNotes === baselineNotesRef.current) return;
      void flushBatchNotes();
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => document.removeEventListener("visibilitychange", onHidden);
  }, [batchNotes, flushBatchNotes]);

  const openContextPanel = useCallback(async (rowId: string) => {
    setContextRowId(rowId);
    setContextLoading(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/exhibitor/import-wizard/batches/${encodeURIComponent(batchId)}/briefing-rows/${encodeURIComponent(rowId)}`, { credentials: "include" });
      const json = (await res.json()) as { detail?: BriefingDetailView };
      if (res.ok && json.detail) {
        setContextDetail(json.detail);
        const m = json.detail.manualContext;
        setDraftManual(m ? { whyMatters: m.whyMatters ?? "", whatWeKnow: m.whatWeKnow ?? "", suspectedPain: m.suspectedPain ?? "", conversationStarter: m.conversationStarter ?? "", competitorMentioned: m.competitorMentioned ?? "", priorityOverride: m.priorityOverride ?? "auto", internalNotes: m.internalNotes ?? "" } : emptyManual());
      }
    } finally { setContextLoading(false); }
  }, [batchId]);

  const handleSaveContext = useCallback(async () => {
    if (!contextRowId || actionBusy) return;
    setActionBusy(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/exhibitor/import-wizard/batches/${encodeURIComponent(batchId)}/briefing-rows/${encodeURIComponent(contextRowId)}`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_manual_context", manualContext: normalizeManual(draftManual) }),
      });
      if (!res.ok) { const j = (await res.json()) as { error?: string }; throw new Error(j.error ?? "Save failed."); }
      setContextRowId(null);
      await loadQueue();
    } catch (e) { setSaveError(e instanceof Error ? e.message : "Save failed."); }
    finally { setActionBusy(false); }
  }, [batchId, contextRowId, actionBusy, draftManual, loadQueue]);

  const manualCount = queue.filter((q) => q.hasManualContext).length;
  const reviewedCount = queue.filter((q) => q.approvalStatus === "approved").length;
  const readyForReviewCount = queue.filter((q) => q.identityComplete).length;
  const needsIdentityCount = queue.length - readyForReviewCount;
  const nextStepHeadline =
    readyForReviewCount > 0 ? "Review and approve your draft briefs" : "Complete lead data before review";
  const nextStepCopy =
    readyForReviewCount > 0
      ? `${readyForReviewCount} lead${readyForReviewCount === 1 ? "" : "s"} are import ready. Review each brief, add context if needed, and approve them before use.`
      : `No leads are review-ready yet. Resolve missing required mapped data, then go to Review for this run.`;

  return (
    <BriefingBatchWorkspaceShell
      batchId={batchId}
      workspaceHeadline={workspaceHeadline}
      workspaceSubline={workspaceSubline}
      batchStatus={batchStatus}
      statusBadgeLabel={statusBadgeLabel}
      headerActions={
        canCancelSelectedLeadDraft ? <BriefingWorkspaceCancelAction batchId={batchId} /> : undefined
      }
    >
      <div>
        <p className="max-w-2xl text-sm text-slate-600">
          Add batch notes, scan the lead list, and capture per-lead context for your team.
        </p>
      </div>

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-900" role="alert">{error}</div> : null}

      <section
        className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4 shadow-sm sm:p-5"
        data-testid="readiness-batch-notes"
        aria-label="Batch notes"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Batch notes</h3>
            <p className="mt-0.5 text-xs text-slate-600">
              Notes for this import batch only — handoffs, priorities, or caveats for your team. Event-wide AI context lives in the{" "}
              <Link href={EXHIBITOR_BRIEFINGS_SETUP_PATH} className="font-semibold text-indigo-700 underline-offset-2 hover:underline">
                AI Briefing Strategy
              </Link>{" "}
              section on the Briefings hub.
            </p>
          </div>
          <div className="text-xs font-medium text-slate-600" data-testid="readiness-batch-notes-save-status">
            {!notesHydrated ? "Loading…" : notesSaveUi === "saving" ? "Saving…" : notesSaveUi === "error" ? "Couldn’t save" : "Saved"}
          </div>
        </div>
        {notesError ? <p className="mt-2 text-xs text-rose-700">{notesError}</p> : null}
        <textarea
          className="mt-3 w-full rounded-xl border border-border bg-white px-4 py-3 text-sm placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          rows={4}
          placeholder="e.g., This batch is from the pre-event webinar list — prioritize enterprise titles."
          value={batchNotes}
          onChange={(e) => setBatchNotes(e.target.value)}
          disabled={!notesHydrated}
          data-testid="readiness-batch-notes-input"
        />
      </section>

      {/* Summary cards — prep scope only (no brief approval) */}
      <div className="grid w-full gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-card p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold text-slate-600">
              {loading ? "…" : totalRows}
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">Total leads</p>
              <p className="text-xs text-slate-500">In this batch</p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-card p-4">
          <div className="flex items-center gap-2">
            <span className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold ${manualCount > 0 ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"}`}>
              {loading ? "…" : manualCount}
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">With context</p>
              <p className="text-xs text-slate-500">Individual notes added</p>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center">
          <p className="text-sm text-slate-500">Loading leads…</p>
        </div>
      ) : queue.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center">
          <p className="text-sm font-medium text-slate-700">No leads in this batch</p>
          <p className="mt-1 text-xs text-slate-500">Return to the Import Wizard and upload a CSV with data rows.</p>
        </div>
      ) : (
        <>
          {/* Leads table */}
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-2.5">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Leads in batch</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm" data-testid="readiness-leads-table">
                <thead className="border-b border-slate-100 bg-white text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Lead</th>
                    <th className="px-4 py-2.5 font-semibold">Company</th>
                    <th className="px-4 py-2.5 font-semibold">Import status</th>
                    <th className="px-4 py-2.5 font-semibold">Context</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {queue.map((item) => {
                    const badge = prepWorkspaceRowBadge(item);
                    return (
                      <tr key={item.batchRowId} className="bg-white transition hover:bg-slate-50/60" data-testid={`readiness-row-${item.batchRowId}`}>
                        <td className="whitespace-nowrap px-4 py-3">
                          <p className="font-semibold text-slate-900">{item.personName}</p>
                          {item.title ? <p className="text-xs text-slate-500">{item.title}</p> : null}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{item.company ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${badgeClass(badge.tone)}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {item.hasManualContext ? (
                            <span className="font-medium text-indigo-700">Added</span>
                          ) : (
                            <span>None</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <button
                            type="button"
                            className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800 transition hover:bg-indigo-100"
                            onClick={() => void openContextPanel(item.batchRowId)}
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
            <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-2.5">
              <p className="text-xs text-slate-500">
                {manualCount} of {queue.length} with individual context
              </p>
            </div>
          </div>
        </>
      )}

      {/* Next-step action card */}
      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-white to-indigo-50/40 px-5 py-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-600">Next step</p>
            <h3 className="text-lg font-semibold tracking-tight text-slate-950">{nextStepHeadline}</h3>
            <p className="max-w-2xl text-sm text-slate-600">
              {nextStepCopy} AI context and reference material stay available in the{" "}
              <Link href={EXHIBITOR_BRIEFINGS_SETUP_PATH} className="font-semibold text-indigo-700 underline-offset-2 hover:underline">
                AI Briefing Strategy
              </Link>{" "}
              block on the Briefings hub.
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700">
                {reviewedCount} of {queue.length} reviewed
              </span>
              <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 font-semibold text-indigo-700">
                {readyForReviewCount} ready for review
              </span>
              {needsIdentityCount > 0 ? (
                <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">
                  {needsIdentityCount} need required data
                </span>
              ) : null}
            </div>
          </div>
          <Link
            href={batchBriefingsReviewPath(batchId)}
            className="inline-flex min-h-10 items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-600 hover:to-violet-700"
            data-testid="readiness-continue-review"
          >
            Continue to Review
          </Link>
        </div>
      </div>

      {/* Individual lead context panel */}
      {contextRowId ? (
        <div className="fixed inset-0 z-50 flex justify-end p-0 sm:p-4" role="dialog" aria-modal="true" data-testid="readiness-context-panel">
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={() => { setSaveError(null); setContextRowId(null); }} />
          <div className="relative z-10 flex h-full w-full max-w-md flex-col bg-card shadow-2xl sm:max-h-[min(100%,48rem)] sm:rounded-2xl sm:border sm:border-border">
            <div className="border-b border-border px-5 py-4">
              <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">Individual lead context</p>
              <h2 className="mt-1 text-lg font-bold text-slate-950">
                {contextDetail?.headline ?? queue.find((q) => q.batchRowId === contextRowId)?.personName ?? "Selected lead"}
              </h2>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {contextLoading ? <p className="text-sm text-slate-500">Loading…</p> : null}
              {saveError ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">{saveError}</p> : null}
              <p className="text-xs text-slate-500">These notes are saved on this batch for the Review step.</p>
              {[
                { key: "whyMatters", label: "Why this lead matters" },
                { key: "whatWeKnow", label: "What we already know" },
                { key: "suspectedPain", label: "Suspected pain point" },
                { key: "conversationStarter", label: "Conversation starter" },
                { key: "competitorMentioned", label: "Competitor mentioned" },
              ].map(({ key, label }) => (
                <label key={key} className="block">
                  <span className="text-xs font-semibold text-slate-700">{label}</span>
                  <textarea
                    className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm placeholder:text-slate-400"
                    rows={2}
                    value={(draftManual as Record<string, string>)[key] ?? ""}
                    onChange={(e) => setDraftManual((d) => ({ ...d, [key]: e.target.value }))}
                  />
                </label>
              ))}
              <label className="block">
                <span className="text-xs font-semibold text-slate-700">Priority override</span>
                <select
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                  value={draftManual.priorityOverride ?? "auto"}
                  onChange={(e) => setDraftManual((d) => ({ ...d, priorityOverride: e.target.value as ImportBriefingManualContextV1["priorityOverride"] }))}
                >
                  <option value="auto">Auto (no override)</option>
                  <option value="high">High</option>
                  <option value="normal">Normal</option>
                  <option value="low">Low</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-700">Internal notes</span>
                <textarea className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm placeholder:text-slate-400" rows={3} value={draftManual.internalNotes ?? ""} onChange={(e) => setDraftManual((d) => ({ ...d, internalNotes: e.target.value }))} />
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
              <button type="button" className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50" onClick={() => { setSaveError(null); setContextRowId(null); }}>Cancel</button>
              <button type="button" disabled={actionBusy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50" onClick={() => void handleSaveContext()}>Save</button>
            </div>
          </div>
        </div>
      ) : null}
    </BriefingBatchWorkspaceShell>
  );
}
