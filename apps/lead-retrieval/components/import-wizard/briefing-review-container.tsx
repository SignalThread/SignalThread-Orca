"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AiBriefingReviewStep } from "@/components/import-wizard/steps/ai-briefing-review-step";
import type { ImportBriefingManualContextV1 } from "@/lib/import-wizard/briefing-content-json";
import type { BriefingDetailView, BriefingQueueItemView } from "@/lib/import-wizard/briefing-detail-model";

type QueueResponse = {
  queue: BriefingQueueItemView[];
  totalRowsInBatch: number;
  openValidationIssues: null;
  allApproved: boolean;
};

export function BriefingReviewContainer({
  batchId,
  batchDataRevision,
  onAllApprovedChange,
}: {
  batchId: string | null;
  /** Reload queue when staged data / mappings bump `import_batches.data_revision`. */
  batchDataRevision: number;
  onAllApprovedChange: (allApproved: boolean) => void;
}) {
  const onApprovedRef = useRef(onAllApprovedChange);
  onApprovedRef.current = onAllApprovedChange;

  const [queue, setQueue] = useState<BriefingQueueItemView[]>([]);
  const [totalRowsInBatch, setTotalRowsInBatch] = useState(0);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BriefingDetailView | null>(null);
  const [queueLoading, setQueueLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const initialSelectionDone = useRef(false);

  const mergeQueuePayload = useCallback((data: QueueResponse) => {
    setQueue(data.queue);
    setTotalRowsInBatch(data.totalRowsInBatch);
    onApprovedRef.current(data.allApproved);
    if (data.queue.length === 0) {
      setSelectedRowId(null);
      return;
    }
    if (!initialSelectionDone.current) {
      initialSelectionDone.current = true;
      setSelectedRowId(data.queue[0]!.batchRowId);
    }
  }, []);

  const loadQueueFromApi = useCallback(async () => {
    if (!batchId) return;
    const res = await fetch(`/api/exhibitor/import-wizard/batches/${encodeURIComponent(batchId)}/briefing-queue`, {
      credentials: "include",
    });
    const json = (await res.json()) as QueueResponse & { error?: string };
    if (!res.ok) {
      throw new Error(typeof json.error === "string" ? json.error : "Failed to load briefing queue.");
    }
    mergeQueuePayload(json);
  }, [mergeQueuePayload, batchId]);

  useEffect(() => {
    initialSelectionDone.current = false;
    setSelectedRowId(null);
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
          if (!cancelled) {
            setDetail(null);
            if (res.status === 404) {
              setErrorMessage("This row is no longer in the import batch.");
              setSelectedRowId(null);
              await loadQueueFromApi();
            }
          }
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
  }, [batchId, selectedRowId, loadQueueFromApi]);

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

  const handleApproveSelected = useCallback(async () => {
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

  const handleBulkApprove = useCallback(async () => {
    if (!batchId || actionBusy) return;
    setActionBusy(true);
    try {
      const res = await fetch(
        `/api/exhibitor/import-wizard/batches/${encodeURIComponent(batchId)}/briefing-rows/approve-all`,
        {
          method: "POST",
          credentials: "include",
        }
      );
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        throw new Error(typeof j.error === "string" ? j.error : "Bulk approve failed.");
      }
      setErrorMessage(null);
      await loadQueueFromApi();
      if (selectedRowId) await reloadDetail(selectedRowId);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Bulk approve failed.");
    } finally {
      setActionBusy(false);
    }
  }, [actionBusy, loadQueueFromApi, reloadDetail, selectedRowId, batchId]);

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

  if (!batchId) {
    return (
      <p className="rounded-xl border border-border bg-slate-50/80 px-4 py-6 text-center text-sm text-slate-600">
        Loading import batch…
      </p>
    );
  }

  return (
    <AiBriefingReviewStep
      queue={queue}
      totalRowsInBatch={totalRowsInBatch}
      selectedRowId={selectedRowId}
      onSelectRow={setSelectedRowId}
      detail={detail}
      detailLoading={detailLoading}
      queueLoading={queueLoading}
      errorMessage={errorMessage}
      onApproveSelected={handleApproveSelected}
      onBulkApprove={handleBulkApprove}
      onSaveManualContext={handleSaveManualContext}
      actionBusy={actionBusy}
    />
  );
}
