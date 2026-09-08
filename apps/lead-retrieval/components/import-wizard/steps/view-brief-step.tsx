"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ImportBriefingViewSections } from "@/components/import-wizard/import-briefing-view-sections";
import { hasManualContextInStored, type ImportBriefingManualContextV1 } from "@/lib/import-wizard/briefing-content-json";
import type { BriefingDetailView, BriefingQueueItemView } from "@/lib/import-wizard/briefing-detail-model";
import { batchBriefingsPath } from "@/lib/import-wizard/paths";

type QueueResponse = {
  queue: BriefingQueueItemView[];
  totalRowsInBatch: number;
  allApproved: boolean;
};

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

export type ViewBriefStepProps = {
  batchId: string | null;
  batchDataRevision: number;
};

/**
 * Single-row brief review between Brief Readiness and Import — uses same APIs as batch briefing.
 */
export function ViewBriefStep({ batchId, batchDataRevision }: ViewBriefStepProps) {
  const [queue, setQueue] = useState<BriefingQueueItemView[]>([]);
  const [totalRowsInBatch, setTotalRowsInBatch] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [detail, setDetail] = useState<BriefingDetailView | null>(null);
  const [queueLoading, setQueueLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const initialIndexDone = useRef(false);

  const [contextOpen, setContextOpen] = useState(false);
  const [draftManual, setDraftManual] = useState<ImportBriefingManualContextV1>(emptyManual);
  const [saveError, setSaveError] = useState<string | null>(null);

  const selectedRowId = queue[selectedIndex]?.batchRowId ?? null;

  const loadQueueFromApi = useCallback(async () => {
    if (!batchId) return;
    const res = await fetch(`/api/exhibitor/import-wizard/batches/${encodeURIComponent(batchId)}/briefing-queue`, {
      credentials: "include",
    });
    const json = (await res.json()) as QueueResponse & { error?: string };
    if (!res.ok) {
      throw new Error(typeof json.error === "string" ? json.error : "Failed to load briefing queue.");
    }
    setQueue(json.queue);
    setTotalRowsInBatch(json.totalRowsInBatch);
    if (json.queue.length === 0) {
      setSelectedIndex(0);
      return;
    }
    if (!initialIndexDone.current) {
      initialIndexDone.current = true;
      setSelectedIndex(0);
    } else {
      setSelectedIndex((i) => Math.min(i, Math.max(0, json.queue.length - 1)));
    }
  }, [batchId]);

  useEffect(() => {
    initialIndexDone.current = false;
    setSelectedIndex(0);
  }, [batchId, batchDataRevision]);

  useEffect(() => {
    if (!batchId) return;
    let cancelled = false;
    (async () => {
      try {
        setQueueLoading(true);
        setErrorMessage(null);
        await loadQueueFromApi();
      } catch (e) {
        if (!cancelled) {
          setErrorMessage(e instanceof Error ? e.message : "Failed to load briefing queue.");
        }
      } finally {
        if (!cancelled) setQueueLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadQueueFromApi, batchId, batchDataRevision]);

  useEffect(() => {
    if (!batchId || !selectedRowId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setDetailLoading(true);
        const res = await fetch(
          `/api/exhibitor/import-wizard/batches/${encodeURIComponent(batchId)}/briefing-rows/${encodeURIComponent(selectedRowId)}`,
          { credentials: "include" }
        );
        const json = (await res.json()) as { detail?: BriefingDetailView; error?: string };
        if (!res.ok) {
          if (!cancelled) setDetail(null);
          return;
        }
        if (!cancelled && json.detail) {
          setDetail(json.detail);
          setErrorMessage(null);
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [batchId, selectedRowId]);

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

  const reloadDetail = useCallback(
    async (rowId: string) => {
      if (!batchId) return;
      const res = await fetch(
        `/api/exhibitor/import-wizard/batches/${encodeURIComponent(batchId)}/briefing-rows/${encodeURIComponent(rowId)}`,
        { credentials: "include" }
      );
      const json = (await res.json()) as { detail?: BriefingDetailView };
      if (res.ok && json.detail) setDetail(json.detail);
    },
    [batchId]
  );

  const handleApprove = useCallback(async () => {
    if (!batchId || !selectedRowId || actionBusy) return;
    setActionBusy(true);
    try {
      const res = await fetch(
        `/api/exhibitor/import-wizard/batches/${encodeURIComponent(batchId)}/briefing-rows/${encodeURIComponent(selectedRowId)}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "approve" }),
        }
      );
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        throw new Error(typeof j.error === "string" ? j.error : "Approve failed.");
      }
      setErrorMessage(null);
      await loadQueueFromApi();
      await reloadDetail(selectedRowId);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Approve failed.");
    } finally {
      setActionBusy(false);
    }
  }, [batchId, selectedRowId, actionBusy, loadQueueFromApi, reloadDetail]);

  const handleApproveAll = useCallback(async () => {
    if (!batchId || actionBusy) return;
    setActionBusy(true);
    try {
      const res = await fetch(
        `/api/exhibitor/import-wizard/batches/${encodeURIComponent(batchId)}/briefing-rows/approve-all`,
        { method: "POST", credentials: "include" }
      );
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        throw new Error(typeof j.error === "string" ? j.error : "Approve all failed.");
      }
      setErrorMessage(null);
      await loadQueueFromApi();
      if (selectedRowId) await reloadDetail(selectedRowId);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Approve all failed.");
    } finally {
      setActionBusy(false);
    }
  }, [batchId, actionBusy, loadQueueFromApi, reloadDetail, selectedRowId]);

  const handleSaveManualContext = useCallback(
    async (rowId: string, manual: ImportBriefingManualContextV1) => {
      if (!batchId || actionBusy) return;
      setActionBusy(true);
      try {
        const res = await fetch(
          `/api/exhibitor/import-wizard/batches/${encodeURIComponent(batchId)}/briefing-rows/${encodeURIComponent(rowId)}`,
          {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "save_manual_context", manualContext: manual }),
          }
        );
        if (!res.ok) {
          const j = (await res.json()) as { error?: string };
          throw new Error(typeof j.error === "string" ? j.error : "Save failed.");
        }
        setErrorMessage(null);
        await loadQueueFromApi();
        await reloadDetail(rowId);
      } catch (e) {
        throw e instanceof Error ? e : new Error("Save failed.");
      } finally {
        setActionBusy(false);
      }
    },
    [batchId, actionBusy, loadQueueFromApi, reloadDetail]
  );

  const handleSaveContext = useCallback(async () => {
    if (!selectedRowId) return;
    setSaveError(null);
    try {
      await handleSaveManualContext(selectedRowId, normalizeManualForSave(draftManual));
      setContextOpen(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed.");
    }
  }, [selectedRowId, draftManual, handleSaveManualContext]);

  const goPrev = useCallback(() => {
    setSelectedIndex((i) => Math.max(0, i - 1));
  }, []);

  const goNext = useCallback(() => {
    setSelectedIndex((i) => Math.min(queue.length - 1, i + 1));
  }, [queue.length]);

  const onSelectRowFromDropdown = useCallback((batchRowId: string) => {
    const idx = queue.findIndex((q) => q.batchRowId === batchRowId);
    if (idx >= 0) setSelectedIndex(idx);
  }, [queue]);

  if (!batchId) {
    return (
      <p className="rounded-xl border border-border bg-slate-50/80 px-4 py-6 text-center text-sm text-slate-600">
        Loading import batch…
      </p>
    );
  }

  const n = queue.length;
  const pos = n > 0 ? selectedIndex + 1 : 0;
  const cappedNote = totalRowsInBatch > n;

  return (
    <div className="import-wizard-view-brief space-y-4" data-testid="import-wizard-view-brief">
      {errorMessage ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-900" role="alert">
          {errorMessage}
        </div>
      ) : null}

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <p className="text-sm font-semibold text-slate-900">View brief</p>
        <p className="mt-1 text-sm text-slate-600">
          One lead at a time. Content is from your mapped import and stored draft briefing — deterministic refresh when
          source data or mappings change. No external AI regeneration.
        </p>
      </div>

      {queueLoading ? (
        <p className="text-sm text-slate-600">Loading…</p>
      ) : n === 0 ? (
        <p className="rounded-xl border border-border bg-slate-50/80 px-4 py-6 text-center text-sm text-slate-600">
          No rows in this batch. Go back to field mapping or brief readiness.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-800" data-testid="view-brief-lead-position">
                Lead {pos} of {n}
                {cappedNote ? <span className="font-normal text-slate-500"> (showing first {n} of {totalRowsInBatch})</span> : null}
              </span>
              <select
                className="rounded-lg border border-border px-2 py-1.5 text-sm"
                value={selectedRowId ?? ""}
                onChange={(e) => onSelectRowFromDropdown(e.target.value)}
                aria-label="Select lead row"
                data-testid="view-brief-row-select"
              >
                {queue.map((q) => (
                  <option key={q.batchRowId} value={q.batchRowId}>
                    {q.personName}
                    {q.company ? ` — ${q.company}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 disabled:opacity-50"
                disabled={selectedIndex <= 0 || actionBusy}
                onClick={goPrev}
                data-testid="view-brief-prev"
              >
                Previous
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 disabled:opacity-50"
                disabled={selectedIndex >= n - 1 || actionBusy}
                onClick={goNext}
                data-testid="view-brief-next"
              >
                Next
              </button>
              <button
                type="button"
                className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-900 disabled:opacity-50"
                disabled={actionBusy || !detail}
                onClick={() => setContextOpen(true)}
                data-testid="view-brief-manual-context"
              >
                Manual context
              </button>
              <button
                type="button"
                className="rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                disabled={actionBusy || !detail || detail.approvalStatus === "approved"}
                onClick={() => void handleApprove()}
                data-testid="view-brief-approve"
              >
                {detail?.approvalStatus === "approved" ? "Approved" : "Approve brief"}
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-700"
                disabled={actionBusy}
                onClick={() => void handleApproveAll()}
                data-testid="view-brief-approve-all"
              >
                Approve all
              </button>
            </div>
          </div>

          <Link
            href={batchBriefingsPath(batchId)}
            className="inline-block text-sm font-medium text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline"
          >
            ← Back to Brief Readiness
          </Link>

          {detailLoading ? (
            <p className="text-sm text-slate-600">Loading brief…</p>
          ) : detail ? (
            <ImportBriefingViewSections detail={detail} />
          ) : (
            <p className="text-sm text-slate-600">Could not load this row.</p>
          )}
        </>
      )}

      {contextOpen && selectedRowId ? (
        <div
          className="fixed inset-0 z-50 flex justify-end p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="vb-manual-context-title"
          data-testid="view-brief-manual-context-panel"
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
              <h2 id="vb-manual-context-title" className="text-lg font-bold text-slate-950">
                Manual context
              </h2>
              <p className="text-sm text-slate-600">{detail?.headline ?? "Selected row"}</p>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {saveError ? (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">{saveError}</p>
              ) : null}
              <p className="text-xs text-slate-600">Stored on this draft batch in `import_batch_row_briefings.content`.</p>
              <label className="block text-xs font-semibold text-slate-700">
                Why this lead matters
                <textarea
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                  rows={2}
                  value={draftManual.whyMatters ?? ""}
                  onChange={(e) => setDraftManual((d) => ({ ...d, whyMatters: e.target.value }))}
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
                  data-testid="view-brief-manual-notes"
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
                data-testid="view-brief-manual-save"
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
