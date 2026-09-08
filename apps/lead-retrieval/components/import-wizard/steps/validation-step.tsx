"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type {
  ImportBatchValidationResult,
  ImportValidationIssueBucket,
  ImportValidationIssueKind,
} from "@/lib/import-wizard/import-batch-validation-derive";
import { importWizardPath } from "@/lib/import-wizard/paths";

function issueIcon(severity: ImportValidationIssueBucket["severity"]) {
  if (severity === "must_fix") {
    return (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700" aria-hidden="true">
        ✕
      </span>
    );
  }
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800" aria-hidden="true">
      !
    </span>
  );
}

const KIND_ORDER: ImportValidationIssueKind[] = [
  "no_usable_identity",
  "duplicate_email",
  "invalid_email_non_blocking",
  "invalid_linkedin_non_blocking",
  "missing_job_title",
  "missing_company_warning",
  "missing_email_warning",
  "missing_linkedin_warning",
];

function IssueRow({ issue }: { issue: ImportValidationIssueBucket }) {
  const showActions = issue.severity === "must_fix" && issue.actions.length > 0;

  return (
    <div
      className={`flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between ${
        issue.severity === "must_fix" ? "bg-rose-50/40" : ""
      }`}
      data-testid={`import-wizard-validation-issue-${issue.kind}`}
      data-severity={issue.severity}
    >
      <div className="flex min-w-0 gap-3">
        {issueIcon(issue.severity)}
        <div className="min-w-0">
          <p className="font-semibold text-slate-950">{issue.title}</p>
          <p className="mt-0.5 text-sm text-slate-600">{issue.detail}</p>
          <p className="mt-1 text-xs font-medium text-slate-500">
            {issue.affectedRowCount.toLocaleString()} row{issue.affectedRowCount === 1 ? "" : "s"} affected
            {issue.severity === "must_fix" ? " · blocking" : " · optional"}
          </p>
          {issue.severity === "review_recommended" ? (
            <p className="mt-1 text-xs font-medium text-amber-900" data-testid="import-wizard-validation-warning-nonblocking">
              Optional warning — import can proceed, and you can clean this up from Leads later.
            </p>
          ) : (
            <p className="mt-1 text-xs font-medium text-rose-800" data-testid="import-wizard-validation-blocking-hint">
              Fix this before you can import — adjust Source or Mapping so every row has a usable identity.
            </p>
          )}
        </div>
      </div>
      {showActions ? (
        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          {issue.actions.map((a) => (
            <Link
              key={`${issue.kind}-${a.label}`}
              href={importWizardPath(a.stepIndex)}
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-white px-4 py-2 text-center text-xs font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              data-testid={`import-wizard-validation-action-${issue.kind}-${a.stepIndex}`}
            >
              {a.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export type ValidationStepProps = {
  importBatchId: string | null;
  importBatchLoading: boolean;
  importBatchError: string | null;
  /** When this changes, validation is recomputed from the server for the same batch id. */
  batchDataRevision: number;
  onValidationContinueAllowedChange: (allowed: boolean) => void;
  /** Row count for count-aware Import CTA when the batch can proceed (null when blocked or unknown). */
  onValidationImportableRowCountChange?: (count: number | null) => void;
  canImport: boolean;
  importableRowCount: number | null;
  importing: boolean;
  onImport: () => void | Promise<void>;
};

export function ValidationStep({
  importBatchId,
  importBatchLoading,
  importBatchError,
  batchDataRevision,
  onValidationContinueAllowedChange,
  onValidationImportableRowCountChange,
  canImport,
  importableRowCount,
  importing,
  onImport,
}: ValidationStepProps) {
  const continueCb = useRef(onValidationContinueAllowedChange);
  continueCb.current = onValidationContinueAllowedChange;
  const importCountCb = useRef(onValidationImportableRowCountChange);
  importCountCb.current = onValidationImportableRowCountChange;

  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dataRevision, setDataRevision] = useState<number | null>(null);
  const [result, setResult] = useState<ImportBatchValidationResult | null>(null);

  useEffect(() => {
    if (!importBatchId || importBatchLoading || importBatchError) {
      continueCb.current(false);
      importCountCb.current?.(null);
      setLoading(importBatchLoading || !importBatchId);
      return;
    }

    let cancelled = false;
    continueCb.current(false);
    importCountCb.current?.(null);
    setLoading(true);
    setLoadError(null);

    (async () => {
      try {
        const res = await fetch(
          `/api/exhibitor/import-wizard/batches/${encodeURIComponent(importBatchId)}/validation`,
          { credentials: "include" }
        );
        if (!res.ok) {
          throw new Error("validation_failed");
        }
        const json = (await res.json()) as {
          dataRevision: number;
          validation: ImportBatchValidationResult;
        };
        if (cancelled) return;
        setDataRevision(json.dataRevision);
        setResult(json.validation);
        const v = json.validation;
        continueCb.current(v.continueAllowed);
        importCountCb.current?.(
          v.continueAllowed && v.totalRows > 0 ? v.totalRows : null
        );
      } catch {
        if (!cancelled) {
          setLoadError("Could not load validation for this batch.");
          setResult(null);
          continueCb.current(false);
          importCountCb.current?.(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [importBatchId, importBatchLoading, importBatchError, batchDataRevision]);

  if (importBatchError) {
    return (
      <div className="import-wizard-validation space-y-4 rounded-2xl border border-red-200 bg-red-50/80 p-6 text-sm text-red-950" data-testid="import-wizard-validation">
        <p className="font-semibold">Import batch unavailable</p>
        <p>{importBatchError}</p>
      </div>
    );
  }

  if (importBatchLoading || !importBatchId || loading) {
    return (
      <div className="import-wizard-validation rounded-2xl border border-border bg-card p-8 text-center text-sm text-slate-600" data-testid="import-wizard-validation">
        Running validation…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="import-wizard-validation space-y-4 rounded-2xl border border-red-200 bg-red-50/80 p-6 text-sm text-red-950" data-testid="import-wizard-validation">
        <p className="font-semibold">Validation failed</p>
        <p>{loadError}</p>
      </div>
    );
  }

  if (!result) {
    return null;
  }

  const blockingRowCount = result.rowsWithMustFix;
  const warningRowCount = Math.max(0, result.totalRows - result.fullyValidRows - blockingRowCount);
  const rowsWithIdentity = result.totalRows - blockingRowCount;
  const hasWarningsOnly = result.continueAllowed && warningRowCount > 0;
  const allClean = result.continueAllowed && warningRowCount === 0 && result.totalRows > 0;
  const importCount =
    result.continueAllowed && result.totalRows > 0
      ? importableRowCount ?? result.totalRows
      : 0;
  const importLabel =
    importCount > 0
      ? `Import ${importCount.toLocaleString()} ${importCount === 1 ? "lead" : "leads"}`
      : "Import leads";

  const issueOrder = (k: ImportValidationIssueKind) => {
    const i = KIND_ORDER.indexOf(k);
    return i === -1 ? 999 : i;
  };

  const visibleIssues = [...result.issues]
    .filter((i) => i.affectedRowCount > 0)
    .sort((a, b) => issueOrder(a.kind) - issueOrder(b.kind));

  const blockingIssues = visibleIssues.filter((i) => i.severity === "must_fix");
  const warningIssues = visibleIssues.filter((i) => i.severity === "review_recommended");

  return (
    <div className="import-wizard-validation space-y-5" data-testid="import-wizard-validation">
      {dataRevision != null ? (
        <p className="text-xs font-medium text-slate-500" data-testid="import-wizard-validation-revision">
          Batch data revision {dataRevision} · checks reflect your current file and field mapping.
        </p>
      ) : null}

      {result.totalRows === 0 ? (
        <div className="rounded-2xl border border-amber-200/90 bg-amber-50/80 p-5 text-sm text-amber-950">
          <p className="font-semibold">No data rows in this batch</p>
          <p className="mt-1 text-amber-900/90">Add rows in Source or Mapping before you can import.</p>
        </div>
      ) : null}

      <section
        className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)] sm:p-5"
        data-testid="import-wizard-validation-readiness-section"
      >
        <div className="flex flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h2 className="mb-1 text-base font-bold text-slate-950">Import readiness</h2>
            <p className="text-sm text-slate-600">
              <span className="font-medium text-slate-800">Blocking</span> means a row can&apos;t be imported until it
              has a valid email, a valid LinkedIn URL, or a usable full name (or First + Last) and company.{" "}
              <span className="font-medium text-slate-800">Warnings</span> are optional — you can import and clean up
              in Leads later.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
            <Link
              href={importWizardPath(2)}
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              data-testid="import-wizard-validation-back"
            >
              Back
            </Link>
            <button
              type="button"
              onClick={onImport}
              disabled={!canImport || importing || !result.continueAllowed || importCount <= 0}
              className="inline-flex min-h-10 items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              data-testid="import-wizard-validation-import"
            >
              {importing ? "Importing..." : importLabel}
            </button>
          </div>
        </div>

        {result.totalRows > 0 ? (
          <div
            className={`mt-4 rounded-xl border p-4 ${
              result.continueAllowed
                ? hasWarningsOnly
                  ? "border-emerald-200/90 bg-emerald-50/70"
                  : "border-emerald-200/90 bg-emerald-50/90"
                : "border-rose-200/90 bg-rose-50/80"
            }`}
            data-testid={result.continueAllowed ? "import-wizard-validation-ready-status" : "import-wizard-validation-blocked-status"}
          >
            <p className={`text-base font-bold ${result.continueAllowed ? "text-emerald-950" : "text-rose-950"}`}>
              {result.continueAllowed
                ? allClean
                  ? "You're ready to import this batch."
                  : "These leads are still ready to import."
                : "Import is paused until blocking issues are fixed"}
            </p>
            <p className={`mt-2 text-sm ${result.continueAllowed ? "text-emerald-900/95" : "text-rose-900/95"}`}>
              {result.continueAllowed
                ? allClean
                  ? `All ${result.totalRows.toLocaleString()} row${result.totalRows === 1 ? "" : "s"} have what we need to create leads. Click ${importLabel} to import now.`
                  : `All ${result.totalRows.toLocaleString()} row${result.totalRows === 1 ? "" : "s"} have a usable identity. Some fields are missing or could be cleaner — you can edit details later from Leads.`
                : rowsWithIdentity > 0
                  ? `${rowsWithIdentity.toLocaleString()} row${rowsWithIdentity === 1 ? "" : "s"} already have a usable identity, but every row must have one before you can import this batch. Use the blocking section below — go back to Source or Mapping only when needed.`
                  : `Every row needs at least one identity path: a valid email, a valid LinkedIn URL, or a usable full name (or First + Last) and company. Fix the blocking items below.`}
            </p>
          </div>
        ) : null}

        {result.totalRows > 0 ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div
              className="rounded-2xl border border-border bg-card p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
              data-testid="import-wizard-validation-stat-ready"
            >
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Ready to import</p>
              <p className="mt-2 text-3xl font-bold text-slate-950">
                {result.continueAllowed ? result.totalRows.toLocaleString() : rowsWithIdentity.toLocaleString()}
              </p>
              <p className="mt-2 text-xs text-slate-600">
                {result.continueAllowed
                  ? `Lead row${result.totalRows === 1 ? "" : "s"} we can import with current rules.`
                  : `Row${rowsWithIdentity === 1 ? "" : "s"} with a usable identity — fix blocking rows to import the full batch.`}
              </p>
            </div>

            <div
              className={`rounded-2xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)] ${
                blockingRowCount > 0 ? "border-rose-200/90 bg-rose-50/50" : "border-border bg-card"
              }`}
              data-testid="import-wizard-validation-stat-blocking"
            >
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Blocking issues</p>
              <p className={`mt-2 text-3xl font-bold ${blockingRowCount > 0 ? "text-rose-800" : "text-slate-950"}`}>
                {blockingRowCount.toLocaleString()}
              </p>
              <p className="mt-2 text-xs text-slate-600">
                {blockingRowCount > 0
                  ? "Row(s) missing a usable identity path — must fix to import."
                  : "None — every row can be identified."}
              </p>
            </div>

            <div
              className={`rounded-2xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)] ${
                warningRowCount > 0 ? "border-amber-200/90 bg-amber-50/70" : "border-border bg-card"
              }`}
              data-testid="import-wizard-validation-stat-warnings"
            >
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Warnings</p>
              <p className={`mt-2 text-3xl font-bold ${warningRowCount > 0 ? "text-amber-900" : "text-slate-950"}`}>
                {warningRowCount.toLocaleString()}
              </p>
              <p className="mt-2 text-xs text-slate-600">
                {warningRowCount > 0
                  ? "Row(s) with optional gaps or duplicate emails — does not block import."
                  : "No optional data-quality flags."}
              </p>
            </div>
          </div>
        ) : null}

        {visibleIssues.length === 0 ? (
          <p className="mt-4 rounded-xl border border-border bg-slate-50/80 px-4 py-3 text-sm text-slate-600" data-testid="import-wizard-validation-no-issues">
            No issues flagged — this batch matches the checks above.
          </p>
        ) : (
          <div className="mt-4 space-y-6">
            {blockingIssues.length > 0 ? (
              <div>
                <h3 className="mb-2 text-sm font-bold text-rose-900">Blocking</h3>
                <div className="divide-y divide-border rounded-xl border border-rose-200/80 bg-rose-50/30 px-4 sm:px-5">
                  {blockingIssues.map((issue) => (
                    <IssueRow key={issue.kind} issue={issue} />
                  ))}
                </div>
              </div>
            ) : null}
            {warningIssues.length > 0 ? (
              <div>
                <h3 className="mb-2 text-sm font-bold text-amber-900">Warnings (optional)</h3>
                <div className="divide-y divide-border rounded-xl border border-amber-200/80 bg-amber-50/30 px-4 sm:px-5">
                  {warningIssues.map((issue) => (
                    <IssueRow key={issue.kind} issue={issue} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
