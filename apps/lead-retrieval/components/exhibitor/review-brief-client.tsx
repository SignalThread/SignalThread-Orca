"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BriefingBatchWorkspaceShell } from "@/components/exhibitor/briefing-batch-workspace-shell";
import { exhibitorBriefingsIntroProseClass } from "@/lib/exhibitor-briefings-shell";
import { ImportBriefingViewSections } from "@/components/import-wizard/import-briefing-view-sections";
import { briefingRowReadinessBadgeV1 } from "@/lib/import-wizard/briefing-readiness-v1";
import type { BriefingDetailView, BriefingQueueItemView } from "@/lib/import-wizard/briefing-detail-model";
import type { BatchBriefingContextV1 } from "@/lib/import-wizard/batch-briefing-context";
import type { BriefingPolishedBundle } from "@/lib/import-wizard/briefing-polished-types";
import {
  batchBriefingsPath,
  batchBriefingsReviewBrowseApprovedPath,
  BRIEFING_REVIEW_BROWSE_APPROVED_PARAM,
  EXHIBITOR_BRIEFINGS_PATH,
  EXHIBITOR_BRIEFINGS_SETUP_PATH,
  EXHIBITOR_LEADS_PATH
} from "@/lib/import-wizard/paths";

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

function BriefingToastStack({
  toasts,
}: {
  toasts: Array<{ id: number; tone: "success" | "error"; message: string }>;
}): ReactNode {
  if (toasts.length === 0) return null;
  return (
    <div
      className="pointer-events-none fixed right-4 top-4 z-[60] flex w-[min(100vw-2rem,380px)] flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto rounded-lg border px-3 py-2.5 text-sm font-medium shadow-lg ${
            toast.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}

export function BatchReviewBriefClient({
  batchId,
  batchDataRevision,
  workspaceHeadline,
  workspaceSubline,
  batchStatus,
  statusBadgeLabel,
}: {
  batchId: string;
  batchDataRevision: number;
  workspaceHeadline: string;
  workspaceSubline: string | null;
  batchStatus: string;
  statusBadgeLabel: string;
}) {
  const searchParams = useSearchParams();
  const browsingApprovedBriefs =
    searchParams.get(BRIEFING_REVIEW_BROWSE_APPROVED_PARAM) === "1";

  const [queue, setQueue] = useState<BriefingQueueItemView[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [detail, setDetail] = useState<BriefingDetailView | null>(null);
  const [queueLoading, setQueueLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [batchContext, setBatchContext] = useState<BatchBriefingContextV1>({});
  const [knowledgeTotal, setKnowledgeTotal] = useState<number | null>(null);
  const [polishedByRow, setPolishedByRow] = useState<Record<string, BriefingPolishedBundle>>({});
  const [polishBusy, setPolishBusy] = useState(false);
  const [polishError, setPolishError] = useState<string | null>(null);
  const [editSaveBusy, setEditSaveBusy] = useState(false);
  const [toasts, setToasts] = useState<Array<{ id: number; tone: "success" | "error"; message: string }>>([]);
  const toastSeq = useRef(0);
  const initialDone = useRef(false);
  const autoPolishAttempted = useRef<Set<string>>(new Set());
  /** From briefing-queue API: full-batch counts and server-derived allApproved (not capped-queue guesswork). */
  const [queueMeta, setQueueMeta] = useState<{ totalRowsInBatch: number; allApproved: boolean }>({
    totalRowsInBatch: 0,
    allApproved: false,
  });

  const selectedRowId = queue[selectedIndex]?.batchRowId ?? null;
  const polishedForRow = selectedRowId ? polishedByRow[selectedRowId] ?? detail?.polished ?? undefined : undefined;

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const res = await fetch(`/api/exhibitor/import-wizard/batches/${encodeURIComponent(batchId)}/briefing-context`, { credentials: "include" });
        if (res.ok) {
          const json = (await res.json()) as { context?: BatchBriefingContextV1 };
          if (!c && json.context) setBatchContext(json.context);
        }
      } catch { /* non-critical — sections render without it */ }
    })();
    return () => { c = true; };
  }, [batchId]);

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const res = await fetch(`/api/exhibitor/briefing-knowledge?setup=1`, { credentials: "include" });
        if (!res.ok) return;
        const j = (await res.json()) as { counts?: { total: number } };
        if (!c && j.counts) setKnowledgeTotal(j.counts.total);
      } catch {
        /* optional banner */
      }
    })();
    return () => {
      c = true;
    };
  }, [batchId]);

  const pushToast = useCallback((tone: "success" | "error", message: string) => {
    const id = ++toastSeq.current;
    setToasts((prev) => [...prev, { id, tone, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4800);
  }, []);

  const loadQueue = useCallback(async (): Promise<QueueResponse> => {
    const res = await fetch(`/api/exhibitor/import-wizard/batches/${encodeURIComponent(batchId)}/briefing-queue`, { credentials: "include" });
    const json = (await res.json()) as QueueResponse & { error?: string };
    if (!res.ok) throw new Error(json.error ?? "Failed to load queue.");
    setQueue(json.queue);
    setQueueMeta({
      totalRowsInBatch: typeof json.totalRowsInBatch === "number" ? json.totalRowsInBatch : json.queue.length,
      allApproved: json.allApproved === true,
    });
    if (json.queue.length > 0 && !initialDone.current) {
      initialDone.current = true;
      setSelectedIndex(0);
    }
    return json;
  }, [batchId]);

  useEffect(() => {
    initialDone.current = false;
    setSelectedIndex(0);
  }, [batchId, batchDataRevision]);

  useEffect(() => {
    let c = false;
    (async () => {
      try { setQueueLoading(true); setError(null); await loadQueue(); }
      catch (e) { if (!c) setError(e instanceof Error ? e.message : "Load failed."); }
      finally { if (!c) setQueueLoading(false); }
    })();
    return () => { c = true; };
  }, [loadQueue, batchDataRevision]);

  useEffect(() => {
    if (!batchId || !selectedRowId) { setDetail(null); return; }
    let c = false;
    (async () => {
      try {
        setDetailLoading(true);
        setPolishError(null);
        const res = await fetch(`/api/exhibitor/import-wizard/batches/${encodeURIComponent(batchId)}/briefing-rows/${encodeURIComponent(selectedRowId)}`, { credentials: "include" });
        const json = (await res.json()) as { detail?: BriefingDetailView };
        if (!c && res.ok && json.detail) {
          setDetail(json.detail);
          if (json.detail.polished) {
            setPolishedByRow((prev) => ({ ...prev, [selectedRowId]: json.detail!.polished! }));
          }
          setError(null);
        }
      } finally { if (!c) setDetailLoading(false); }
    })();
    return () => { c = true; };
  }, [batchId, selectedRowId]);

  const handleAiPolish = useCallback(async (opts?: { forceOverwriteManualEdits?: boolean; automatic?: boolean }) => {
    if (!selectedRowId || polishBusy || !detail) return;
    setPolishBusy(true);
    setPolishError(null);
    try {
      const res = await fetch(
        `/api/exhibitor/import-wizard/batches/${encodeURIComponent(batchId)}/briefing-rows/${encodeURIComponent(selectedRowId)}/ai-polish`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ forceOverwriteManualEdits: opts?.forceOverwriteManualEdits === true }),
        }
      );
      const json = (await res.json()) as { polished?: BriefingPolishedBundle; error?: string; code?: string };
      if (!res.ok) {
        throw new Error(json.error ?? "AI polish failed.");
      }
      if (!json.polished) {
        throw new Error("No polished content returned.");
      }
      setPolishedByRow((prev) => ({ ...prev, [selectedRowId]: json.polished! }));
      setDetail((prev) =>
        prev
          ? { ...prev, polished: json.polished!, hasManualBriefEdits: opts?.forceOverwriteManualEdits ? false : prev.hasManualBriefEdits }
          : prev
      );
      if (!opts?.automatic) pushToast("success", "Brief polished.");
    } catch (e) {
      setPolishError(e instanceof Error ? e.message : "AI polish failed.");
    } finally {
      setPolishBusy(false);
    }
  }, [batchId, selectedRowId, polishBusy, detail, pushToast]);

  useEffect(() => {
    if (!detail || !selectedRowId || detail.polished || detail.hasManualBriefEdits || detail.approvalStatus === "approved") return;
    if (autoPolishAttempted.current.has(selectedRowId)) return;
    autoPolishAttempted.current.add(selectedRowId);
    void handleAiPolish({ automatic: true });
  }, [detail, selectedRowId, handleAiPolish]);

  const handleManualRepolish = useCallback(() => {
    if (!detail) return;
    if (detail.hasManualBriefEdits) {
      const ok = window.confirm("Re-polishing may rewrite text you edited. Continue?");
      if (!ok) return;
    }
    void handleAiPolish({ forceOverwriteManualEdits: detail.hasManualBriefEdits });
  }, [detail, handleAiPolish]);

  const handleSaveEditedBrief = useCallback(async (next: BriefingPolishedBundle) => {
    if (!selectedRowId || editSaveBusy) return;
    setEditSaveBusy(true);
    try {
      const res = await fetch(`/api/exhibitor/import-wizard/batches/${encodeURIComponent(batchId)}/briefing-rows/${encodeURIComponent(selectedRowId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_brief_edits", polished: next }),
      });
      const json = (await res.json()) as { polished?: BriefingPolishedBundle; error?: string };
      if (!res.ok || !json.polished) {
        throw new Error(json.error ?? "Could not save brief edits.");
      }
      setPolishedByRow((prev) => ({ ...prev, [selectedRowId]: json.polished! }));
      setDetail((prev) => (prev ? { ...prev, polished: json.polished!, hasManualBriefEdits: true } : prev));
      pushToast("success", "Brief edits saved.");
    } catch (e) {
      pushToast("error", e instanceof Error ? e.message : "Could not save brief edits.");
      throw e;
    } finally {
      setEditSaveBusy(false);
    }
  }, [batchId, selectedRowId, editSaveBusy, pushToast]);

  const handleApprove = useCallback(async () => {
    if (!selectedRowId || actionBusy) return;
    setActionBusy(true);
    try {
      const res = await fetch(`/api/exhibitor/import-wizard/batches/${encodeURIComponent(batchId)}/briefing-rows/${encodeURIComponent(selectedRowId)}`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      const patchJson = (await res.json()) as {
        ok?: boolean;
        approvalUpdated?: boolean;
        syncSucceeded?: boolean;
        failureReason?: string | null;
        progress?: { totalRowsInBatch: number; allApproved: boolean; approvedRowCount: number };
        error?: string;
      };
      if (!res.ok) throw new Error(patchJson.error ?? "Approve failed.");

      if (patchJson.approvalUpdated && patchJson.ok === false) {
        pushToast(
          "error",
          patchJson.failureReason
            ? `Brief marked approved, but it was not saved to the lead briefing: ${patchJson.failureReason}`
            : "Brief marked approved, but it was not saved to the lead briefing. Check linkage and field mapping, or contact support."
        );
      }

      const q = await loadQueue();
      const total = patchJson.progress?.totalRowsInBatch ?? q.totalRowsInBatch;
      const approved = patchJson.progress?.approvedRowCount ?? 0;
      const allDone = patchJson.progress?.allApproved ?? q.allApproved;

      if (allDone && patchJson.ok !== false) {
        pushToast(
          "success",
          `Brief approved · all ${total.toLocaleString()} brief${total === 1 ? "" : "s"} in this run are approved.`
        );
        return;
      }

      if (patchJson.ok !== false) {
        pushToast(
          "success",
          `Brief approved · ${approved.toLocaleString()} of ${total.toLocaleString()} in this run. Next: review another brief in the list, or use Approve all to finish.`
        );
      }

      const nextIdx = q.queue.findIndex((row) => row.approvalStatus !== "approved");
      const rowIdForDetail =
        nextIdx >= 0 ? q.queue[nextIdx]!.batchRowId : selectedRowId;
      if (nextIdx >= 0) {
        setSelectedIndex(nextIdx);
      }
      const reloadRes = await fetch(
        `/api/exhibitor/import-wizard/batches/${encodeURIComponent(batchId)}/briefing-rows/${encodeURIComponent(rowIdForDetail)}`,
        { credentials: "include" }
      );
      const j = (await reloadRes.json()) as { detail?: BriefingDetailView };
      if (reloadRes.ok && j.detail) setDetail(j.detail);

      if (
        patchJson.ok !== false &&
        nextIdx < 0 &&
        !allDone &&
        q.queue.length > 0 &&
        q.queue.every((row) => row.approvalStatus === "approved")
      ) {
        pushToast(
          "success",
          `Every brief in this on-screen list is approved, but this run still has more rows in the batch (${total.toLocaleString()} total). Use Approve all to finish the rest.`
        );
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Approve failed."); }
    finally { setActionBusy(false); }
  }, [batchId, selectedRowId, actionBusy, loadQueue, pushToast]);

  const handleBulkApprove = useCallback(async () => {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      const res = await fetch(`/api/exhibitor/import-wizard/batches/${encodeURIComponent(batchId)}/briefing-rows/approve-all`, { method: "POST", credentials: "include" });
      const json = (await res.json()) as QueueResponse & {
        ok?: boolean;
        error?: string;
        progress?: { totalRowsInBatch: number; allApproved: boolean; approvedRowCount: number };
        syncFailedCount?: number;
        syncFailures?: Array<{ batchRowId: string; failureReason: string | null }>;
      };
      if (!res.ok) throw new Error(json.error ?? "Bulk approve failed.");

      if (Array.isArray(json.queue)) {
        setQueue(json.queue);
        setQueueMeta({
          totalRowsInBatch:
            typeof json.progress?.totalRowsInBatch === "number"
              ? json.progress.totalRowsInBatch
              : typeof json.totalRowsInBatch === "number"
                ? json.totalRowsInBatch
                : json.queue.length,
          allApproved: json.progress?.allApproved === true || json.allApproved === true,
        });
      } else {
        await loadQueue();
      }

      if (json.ok === false) {
        const n = typeof json.syncFailedCount === "number" ? json.syncFailedCount : 0;
        const first = json.syncFailures?.[0]?.failureReason;
        pushToast(
          "error",
          n > 0
            ? `All briefs are marked approved, but ${n} could not be synced to lead briefings.${first ? ` (${first})` : ""}`
            : "Approve all finished with sync issues. Try refreshing; if it persists, contact support."
        );
      }

      const serverAllApproved = json.progress?.allApproved === true || json.allApproved === true;

      if (!serverAllApproved) {
        pushToast(
          "error",
          "Approve all finished, but the server still reports briefs that are not approved. Try refreshing this page. If it keeps happening, contact support."
        );
      }

      if (serverAllApproved && json.ok !== false) {
        return;
      }
      if (selectedRowId) {
        const r2 = await fetch(`/api/exhibitor/import-wizard/batches/${encodeURIComponent(batchId)}/briefing-rows/${encodeURIComponent(selectedRowId)}`, { credentials: "include" });
        const j2 = (await r2.json()) as { detail?: BriefingDetailView };
        if (r2.ok && j2.detail) setDetail(j2.detail);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Approve failed."); }
    finally { setActionBusy(false); }
  }, [batchId, selectedRowId, actionBusy, loadQueue, pushToast]);

  const goPrev = useCallback(() => setSelectedIndex((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(() => setSelectedIndex((i) => Math.min(queue.length - 1, i + 1)), [queue.length]);

  const approvedCount = queue.filter((q) => q.approvalStatus === "approved").length;
  const n = queue.length;
  const pos = n > 0 ? selectedIndex + 1 : 0;
  /** In-queue progress only; full-batch completion uses queueMeta.allApproved from the API. */
  const allApprovedInView = n > 0 && approvedCount === n;
  /** Full-batch approved: show celebration unless user chose to keep browsing this run’s approved briefs. */
  const showReviewCompleteScreen =
    !queueLoading &&
    queueMeta.totalRowsInBatch > 0 &&
    queueMeta.allApproved === true &&
    !browsingApprovedBriefs;
  const currentItem = queue[selectedIndex];
  const currentBadge = currentItem ? briefingRowReadinessBadgeV1(currentItem) : null;

  return (
    <BriefingBatchWorkspaceShell
      batchId={batchId}
      workspaceHeadline={workspaceHeadline}
      workspaceSubline={workspaceSubline}
      batchStatus={batchStatus}
      statusBadgeLabel={statusBadgeLabel}
    >
      <BriefingToastStack toasts={toasts} />
      {showReviewCompleteScreen ? (
        <p className="sr-only">All briefs in this batch run are approved. Follow links below to view leads or pick another run.</p>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="sr-only">Review</h2>
            <p className={`${exhibitorBriefingsIntroProseClass} text-sm text-slate-600`}>
              Inspect each lead&apos;s brief and approve when satisfied. Event-wide AI context and reference material live in the{" "}
              <span className="font-medium text-slate-700">AI Briefing Strategy</span> block on the Briefings hub.
            </p>
          </div>
          {!queueLoading && n > 0 ? (
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5">
              <span className={`h-2 w-2 rounded-full ${allApprovedInView ? "bg-emerald-500" : "bg-amber-400"}`} />
              <span className="text-xs font-semibold text-slate-700">
                {approvedCount}/{n} in view
                {queueMeta.totalRowsInBatch > n ? ` · ${queueMeta.totalRowsInBatch} total in batch` : ""}
              </span>
            </div>
          ) : null}
        </div>
      )}

      {knowledgeTotal != null && knowledgeTotal > 0 ? (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/80 px-4 py-3 text-sm text-indigo-950">
          <span className="font-semibold">
            {knowledgeTotal} briefing source{knowledgeTotal === 1 ? "" : "s"}
          </span>{" "}
          saved for this event. They are not automatically merged into draft brief text yet — they prepare the team for what to emphasize.{" "}
          <Link href={EXHIBITOR_BRIEFINGS_SETUP_PATH} className="font-semibold text-indigo-700 underline-offset-2 hover:underline">
            Manage sources & strategy
          </Link>
        </div>
      ) : null}

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-900" role="alert">{error}</div> : null}

      {queueLoading ? (
        <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center">
          <p className="text-sm text-slate-500">Loading leads…</p>
        </div>
      ) : n === 0 ? (
        <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center">
          <p className="text-sm font-medium text-slate-700">No leads in this batch</p>
          <p className="mt-1 text-xs text-slate-500">
            <Link href={batchBriefingsPath(batchId)} className="font-semibold text-indigo-600 hover:underline">Go to Prepare</Link> to check your import.
          </p>
        </div>
      ) : showReviewCompleteScreen ? (
        <div
          className="rounded-2xl border border-emerald-200/90 bg-gradient-to-b from-emerald-50/95 via-white to-white px-6 py-10 text-center shadow-[0_8px_30px_rgba(15,23,42,0.06)] sm:px-10 sm:py-12"
          data-testid="review-briefs-complete"
        >
          <div
            className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-2xl font-semibold text-emerald-700 shadow-sm ring-1 ring-emerald-200/70"
            aria-hidden="true"
          >
            ✓
          </div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-800/85">Review complete</p>
          <h3 className="mt-3 text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">
            All {queueMeta.totalRowsInBatch.toLocaleString()} brief{queueMeta.totalRowsInBatch === 1 ? "" : "s"} approved
          </h3>
          <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-slate-600">
            This import run is finished on your side. Approvals are saved on each row in this batch. When the system can
            match a row to a lead in Leads Intelligence, the approved brief is also written to that lead&apos;s briefing
            record — rows without a confident match stay approved here only until you resolve linkage.
          </p>
          <div className="mx-auto mt-8 flex w-full max-w-md flex-col gap-2.5 sm:max-w-lg">
            <Link
              href={batchBriefingsReviewBrowseApprovedPath(batchId)}
              data-testid="review-briefs-complete-browse-approved-cta"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-6 text-sm font-semibold text-white shadow-md transition hover:from-indigo-600 hover:to-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2"
            >
              Review approved briefs for this run
            </Link>
            <Link
              href={EXHIBITOR_LEADS_PATH}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-200/90 bg-white px-6 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/80 focus-visible:ring-offset-2"
            >
              View leads
            </Link>
            <Link
              href={`${EXHIBITOR_BRIEFINGS_PATH}#briefings-workspaces`}
              className="inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-slate-200/90 bg-white px-5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/80 focus-visible:ring-offset-2"
            >
              Back to Briefings hub
            </Link>
            <p className="pt-1 text-center text-xs text-slate-500">
              Event-wide AI context and trusted sources:{" "}
              <Link href={EXHIBITOR_BRIEFINGS_SETUP_PATH} className="font-semibold text-indigo-600 underline-offset-2 hover:underline">
                Briefings hub
              </Link>
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Lead selector + actions */}
          <div className="rounded-2xl border border-border bg-card shadow-sm" data-testid="review-selector-bar">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="flex items-center gap-1.5">
                  <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm text-slate-600 transition hover:bg-slate-50 disabled:opacity-40" disabled={selectedIndex <= 0 || actionBusy} onClick={goPrev} aria-label="Previous lead">‹</button>
                  <span className="min-w-[3.5rem] text-center text-xs font-bold text-slate-700">{pos} / {n}</span>
                  <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm text-slate-600 transition hover:bg-slate-50 disabled:opacity-40" disabled={selectedIndex >= n - 1 || actionBusy} onClick={goNext} aria-label="Next lead">›</button>
                </div>
                <select
                  className="rounded-lg border border-border bg-white px-2.5 py-1.5 text-sm font-medium text-slate-800"
                  value={selectedRowId ?? ""}
                  onChange={(e) => {
                    const idx = queue.findIndex((q) => q.batchRowId === e.target.value);
                    if (idx >= 0) setSelectedIndex(idx);
                  }}
                  aria-label="Select lead"
                  data-testid="review-row-select"
                >
                  {queue.map((q, i) => (
                    <option key={q.batchRowId} value={q.batchRowId}>
                      {q.personName}{q.company ? ` — ${q.company}` : ""}{q.approvalStatus === "approved" ? " ✓" : ""}
                    </option>
                  ))}
                </select>
                {currentBadge ? (
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${badgeClass(currentBadge.tone)}`}>
                    {currentBadge.label}
                  </span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={actionBusy || !detail || detail.approvalStatus === "approved"}
                  onClick={() => void handleApprove()}
                  className={`rounded-lg px-4 py-1.5 text-sm font-semibold shadow-sm transition disabled:opacity-50 ${
                    detail?.approvalStatus === "approved"
                      ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "bg-emerald-600 text-white hover:bg-emerald-700"
                  }`}
                  data-testid="review-approve"
                >
                  {detail?.approvalStatus === "approved" ? "Approved ✓" : "Approve"}
                </button>
                <button
                  type="button"
                  disabled={actionBusy || queueMeta.allApproved}
                  onClick={() => void handleBulkApprove()}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                  data-testid="review-approve-all"
                >
                  Approve all
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2">
              <p className="text-xs text-slate-500">
                Need to add lead context?{" "}
                <Link href={batchBriefingsPath(batchId)} className="font-semibold text-indigo-600 hover:underline">
                  Edit on Prepare leads
                </Link>
              </p>
              <details className="relative">
                <summary
                  className="cursor-pointer list-none rounded-md px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                  data-testid="brief-secondary-actions"
                >
                  More actions
                </summary>
                <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                  <button
                    type="button"
                    disabled={polishBusy || actionBusy}
                    onClick={handleManualRepolish}
                    className="w-full rounded-md px-2.5 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                    data-testid="brief-ai-polish"
                  >
                    {polishBusy ? "Polishing..." : "Polish again"}
                  </button>
                </div>
              </details>
            </div>
          </div>

          {/* Brief content — focal area */}
          {detailLoading ? (
            <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center">
              <p className="text-sm text-slate-500">Loading brief…</p>
            </div>
          ) : detail ? (
            <div className="space-y-3">
              {polishError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50/90 px-3 py-2 text-xs text-rose-900" role="alert">
                  {polishError}
                </div>
              ) : null}
              <ImportBriefingViewSections
                detail={detail}
                batchContext={batchContext}
                polished={polishedForRow ?? null}
                viewVariant={polishedForRow ? "polished" : "deterministic"}
                editable={detail.approvalStatus !== "approved"}
                saveBusy={editSaveBusy}
                onSaveEditedBrief={handleSaveEditedBrief}
              />
            </div>
          ) : (
            <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center">
              <p className="text-sm text-slate-500">Select a lead above to view its brief.</p>
            </div>
          )}
        </>
      )}
    </BriefingBatchWorkspaceShell>
  );
}
