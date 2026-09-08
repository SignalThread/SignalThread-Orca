"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { batchBriefingsPath, exhibitorLeadsAfterImportHref } from "@/lib/import-wizard/paths";

export type PublishPhase = "pre_publish" | "publishing" | "published" | "publish_failed";

export type PublishReadinessData = {
  batchStatus: string;
  dataRevision: number;
  totalRows: number;
  rowsWithIdentity: number;
  rowsWithMustFix: number;
  /** Rows in `import_batch_row_briefings` with `approval_status = approved` (informational). */
  briefingRowsApproved: number;
  /** Rows with any status other than `approved` (informational). */
  briefingRowsNotApproved: number;
};

export type PublishStepProps = {
  batchId: string | null;
  batchLoading: boolean;
  batchDisplayLabel: string;
  phase: PublishPhase;
  onPublish: () => void;
  publishError: string | null;
  /** Called when readiness loads so the footer can enable/disable Import. */
  onImportGateChange?: (blocked: boolean) => void;
  /** Count returned by the publish API after leads are materialized (preferred over readiness rows). */
  importedLeadCount: number | null;
  /** Event scope used to materialize this batch's leads. */
  activeEventId: string | null;
};

function ReadinessBanner({ blocked }: { blocked: boolean }) {
  if (!blocked) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        <span className="font-bold">Ready to import</span>
        <span className="text-emerald-800">
          Validation passed for this batch. Import materializes eligible rows into Leads Intelligence.
        </span>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
      <span className="font-bold">Cannot import yet</span>
      <p className="mt-1">
        Fix blocking issues in Validation or Mapping, or ensure this batch has rows with a usable identity path.
      </p>
    </div>
  );
}

function MetricTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "slate" | "emerald";
}) {
  const tones = {
    slate: "text-slate-700",
    emerald: "text-emerald-600",
  };
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${tones[tone]}`}>{value}</p>
      <p className="mt-1 text-xs text-slate-600">{hint}</p>
    </div>
  );
}

function PreImport({
  data,
  blocked,
  batchLabel,
}: {
  data: PublishReadinessData;
  blocked: boolean;
  batchLabel: string;
}) {
  const briefingApproved = data.briefingRowsApproved ?? 0;
  const briefingNotApproved = data.briefingRowsNotApproved ?? 0;

  return (
    <div className="import-wizard-import-pre space-y-6" data-testid="import-wizard-publish-pre">
      <ReadinessBanner blocked={blocked} />

      <div className="grid gap-3 sm:grid-cols-2">
        <MetricTile
          label="Leads ready to import"
          value={data.rowsWithIdentity.toLocaleString()}
          hint="Rows with a usable identity path after validation (same rules as materialization)."
          tone="emerald"
        />
        <MetricTile
          label="Rows in this batch"
          value={data.totalRows.toLocaleString()}
          hint={`Batch ${batchLabel} — staged from your source file.`}
          tone="slate"
        />
      </div>

      <div
        className="rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 text-sm text-slate-700"
        data-testid="import-wizard-publish-briefing-stats"
      >
        <p className="font-semibold text-slate-900">Draft brief rows (informational)</p>
        <p className="mt-1 text-slate-600">
          <span className="font-medium text-slate-800">{briefingApproved.toLocaleString()}</span> approved ·{" "}
          <span className="font-medium text-slate-800">{briefingNotApproved.toLocaleString()}</span> not approved
        </p>
        <p className="mt-2 text-xs text-slate-600">
          Import does <span className="font-semibold">not</span> require brief approval. Draft brief content in this
          batch is not copied into Leads when you import — only leads are materialized.
        </p>
      </div>

      <p className="text-center text-xs text-slate-500">
        Use <span className="font-semibold text-slate-700">Import leads</span> in the footer when you are ready.
        {blocked ? (
          <span className="block pt-2 font-medium text-rose-700">Import stays disabled until this batch is ready.</span>
        ) : (
          <span className="mt-2 block text-slate-500">
            This action updates the batch to published and inserts rows into Leads Intelligence from your staged
            import. It does not change post-publish brief storage.
          </span>
        )}
      </p>
    </div>
  );
}

function ImportSuccess({
  batchId,
  importedLeadCount,
  rowsWithIdentityFallback,
  activeEventId,
}: {
  batchId: string;
  importedLeadCount: number | null;
  rowsWithIdentityFallback: number;
  activeEventId: string;
}) {
  const importedCount = importedLeadCount ?? rowsWithIdentityFallback;

  const viewImportedHref = exhibitorLeadsAfterImportHref({
    batchId,
    importedCount,
    eventId: activeEventId,
  });
  const briefingsHref = batchBriefingsPath(batchId);

  return (
    <div className="import-wizard-import-success w-full space-y-6 md:space-y-8" data-testid="import-wizard-publish-post">
      <div className="rounded-2xl border border-emerald-200/90 bg-gradient-to-b from-emerald-50/95 via-white to-white px-9 py-11 text-center shadow-[0_10px_40px_rgba(15,23,42,0.07)] sm:px-10 sm:py-12">
        <div
          className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100 text-[1.75rem] font-semibold leading-none text-emerald-700 shadow-sm ring-1 ring-emerald-200/70"
          aria-hidden="true"
        >
          ✓
        </div>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-800/85">Import finished</p>
        <h2 className="mt-3 text-[1.875rem] font-bold leading-[1.15] tracking-tight text-slate-950 sm:text-[2.125rem]">
          {importedCount.toLocaleString()} lead{importedCount === 1 ? "" : "s"} added
        </h2>
        <div className="mx-auto mt-5 max-w-md space-y-2.5 text-sm leading-relaxed text-slate-600">
          <p>
            They&apos;re in your Leads list. Sort by recent activity or search to find them — there isn&apos;t a separate
            saved view for this import alone.
          </p>
          <p>
            AI briefs for these leads are handled in{" "}
            <span className="font-medium text-slate-800">AI Briefings</span> — open the workspace for this import when
            you&apos;re ready; brief text is not auto-attached to each profile from this step.
          </p>
        </div>
      </div>

      <div className="space-y-3" data-testid="import-wizard-publish-success-next">
        <p className="text-center text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          What&apos;s next
        </p>
        <div className="rounded-2xl border border-slate-200/90 bg-slate-50/70 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] sm:p-6">
          <div className="flex flex-col gap-2.5">
            <Link
              href={viewImportedHref}
              className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-6 text-sm font-semibold text-white shadow-md transition hover:from-indigo-600 hover:to-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2"
              data-testid="import-wizard-success-view-imported"
            >
              View leads
            </Link>
            <Link
              href={briefingsHref}
              className="inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-slate-200/90 bg-white px-5 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/80 focus-visible:ring-offset-2"
              data-testid="import-wizard-success-prepare-briefings"
            >
              Open workspace
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PublishStep({
  batchId,
  batchLoading,
  batchDisplayLabel,
  phase,
  onPublish: _onPublish,
  publishError,
  onImportGateChange,
  importedLeadCount,
  activeEventId,
}: PublishStepProps) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [data, setData] = useState<PublishReadinessData | null>(null);
  const fetchedForBatch = useRef<string | null>(null);

  const loadData = useCallback(async (bid: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/exhibitor/import-wizard/batches/${encodeURIComponent(bid)}/publish-readiness`,
        { credentials: "include" }
      );
      if (!res.ok) throw new Error("publish_readiness_failed");
      const json = (await res.json()) as PublishReadinessData;
      setData({
        ...json,
        briefingRowsApproved: json.briefingRowsApproved ?? 0,
        briefingRowsNotApproved: json.briefingRowsNotApproved ?? 0,
      });
    } catch {
      setLoadError("Could not load import readiness. Refresh and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!batchId || batchLoading) {
      setLoading(batchLoading);
      return;
    }
    if (fetchedForBatch.current === batchId && phase !== "published") return;
    fetchedForBatch.current = batchId;
    void loadData(batchId);
  }, [batchId, batchLoading, loadData, phase]);

  useEffect(() => {
    if (phase === "published" && batchId) {
      void loadData(batchId);
    }
  }, [phase, batchId, loadData]);

  useEffect(() => {
    if (!data) {
      onImportGateChange?.(true);
      return;
    }
    const blocked = data.totalRows === 0 || data.rowsWithMustFix > 0;
    onImportGateChange?.(blocked);
  }, [data, onImportGateChange]);

  if (batchLoading || loading || !batchId) {
    return (
      <div
        className="import-wizard-import rounded-2xl border border-border bg-card p-8 text-center text-sm text-slate-600"
        data-testid="import-wizard-publish"
      >
        Loading import summary…
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        className="import-wizard-import space-y-4 rounded-2xl border border-red-200 bg-red-50/80 p-6 text-sm text-red-950"
        data-testid="import-wizard-publish"
      >
        <p className="font-semibold">Import summary unavailable</p>
        <p>{loadError}</p>
      </div>
    );
  }

  if (!data) return null;

  if (publishError) {
    return (
      <div
        className="import-wizard-import space-y-4 rounded-2xl border border-red-200 bg-red-50/80 p-6 text-sm text-red-950"
        data-testid="import-wizard-publish"
      >
        <p className="font-semibold">Import failed</p>
        <p>{publishError}</p>
      </div>
    );
  }

  if (phase === "publishing") {
    return (
      <div
        className="import-wizard-import rounded-2xl border border-border bg-card p-8 text-center text-sm text-slate-600"
        data-testid="import-wizard-publish"
      >
        Importing leads for batch {batchDisplayLabel}…
      </div>
    );
  }

  if (phase === "published") {
    return (
      <ImportSuccess
        batchId={batchId}
        importedLeadCount={importedLeadCount}
        rowsWithIdentityFallback={data.rowsWithIdentity}
        activeEventId={activeEventId ?? ""}
      />
    );
  }

  const blocked = data.totalRows === 0 || data.rowsWithMustFix > 0;
  return <PreImport data={data} blocked={blocked} batchLabel={batchDisplayLabel} />;
}
