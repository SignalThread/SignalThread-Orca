"use client";

import type { ReactNode } from "react";
import type { EnrichmentRowStatus } from "@/lib/import-wizard/enrichment-run";
import {
  getEnrichmentProviderLabel,
  type EnrichmentProviderId,
  type EnrichmentProviderOption,
} from "@/lib/import-wizard/enrichment-providers-config";
import type { EnrichmentPhase } from "@/lib/import-wizard/enrichment-run";

export type { EnrichmentPhase };

export type WizardEnrichmentRunResult = {
  summary: {
    totalProcessed: number;
    success: number;
    partial: number;
    failed: number;
    noMatch: number;
    coveragePercent: number;
  };
  sampleRows: Array<{
    leadId: string;
    name: string;
    email: string;
    company: string;
    enrichedFields: string;
    status: EnrichmentRowStatus;
  }>;
  provider: string;
  runId: string;
  /** Batch `data_revision` at run completion (server). */
  dataRevision?: number;
};

function RowStatusBadge({ status }: { status: EnrichmentRowStatus }) {
  if (status === "success") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-800">
        Success
      </span>
    );
  }
  if (status === "partial") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-900">
        Partial
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-rose-800">
        Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-slate-200 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-700">
      No match
    </span>
  );
}

function ResultsTable({ rows }: { rows: WizardEnrichmentRunResult["sampleRows"] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-slate-50/90">
            <th className="px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-600">Name</th>
            <th className="px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-600">Email</th>
            <th className="px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-600">Company</th>
            <th className="px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-600">Enriched fields</th>
            <th className="px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-600">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.leadId}
              className="border-b border-border last:border-b-0"
              data-testid={`import-wizard-enrichment-row-${row.leadId}`}
            >
              <td className="px-3 py-2.5 font-medium text-slate-900">{row.name}</td>
              <td className="px-3 py-2.5 text-slate-700">{row.email}</td>
              <td className="px-3 py-2.5 text-slate-700">{row.company}</td>
              <td className="max-w-xs px-3 py-2.5 text-slate-600">{row.enrichedFields}</td>
              <td className="px-3 py-2.5">
                <RowStatusBadge status={row.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export type EnrichmentStepProps = {
  phase: EnrichmentPhase;
  onStartEnrichment: () => void | Promise<void>;
  canContinue: boolean;
  onBack: () => void;
  onContinue: () => void;
  batchProviderId: EnrichmentProviderId | null;
  onBatchProviderChange: (id: EnrichmentProviderId) => void;
  availableProviders: readonly EnrichmentProviderOption[];
  workspaceDefaultProviderId: EnrichmentProviderId | null;
  configLoading: boolean;
  enrichmentRunResult: WizardEnrichmentRunResult | null;
  enrichmentErrorMessage: string | null;
  maxLeadsPerRun: number;
  /** True when a prior success no longer matches the current batch data revision. */
  enrichmentStale: boolean;
};

function EnrichmentProviderPanel({
  batchProviderId,
  onBatchProviderChange,
  availableProviders,
  workspaceDefaultProviderId,
  disabled,
  configLoading,
  embedded,
}: {
  batchProviderId: EnrichmentProviderId | null;
  onBatchProviderChange: (id: EnrichmentProviderId) => void;
  availableProviders: readonly EnrichmentProviderOption[];
  workspaceDefaultProviderId: EnrichmentProviderId | null;
  disabled: boolean;
  configLoading: boolean;
  embedded?: boolean;
}) {
  const shell = embedded
    ? "p-4 sm:p-5"
    : "rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)] sm:p-5";

  if (configLoading) {
    return (
      <div className={shell} data-testid="import-wizard-enrichment-provider-panel">
        <p className="text-sm font-bold text-slate-950">Enrichment provider</p>
        <p className="mt-2 text-sm text-slate-500">Loading provider configuration…</p>
      </div>
    );
  }

  if (availableProviders.length === 0) {
    return (
      <div
        className={
          embedded
            ? "border-b border-amber-200/80 bg-amber-50/90 p-4 sm:p-5"
            : "rounded-2xl border border-amber-200 bg-amber-50/80 p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)] sm:p-5"
        }
        data-testid="import-wizard-enrichment-provider-panel"
      >
        <p className="text-sm font-bold text-amber-950">No enrichment providers configured</p>
        <p className="mt-2 text-sm text-amber-900/90">
          Connect Apollo, ZoomInfo, or PDL under Integrations (or set a server API key) before running batch enrichment.
        </p>
      </div>
    );
  }

  const single = availableProviders.length <= 1;
  const only = availableProviders[0];
  const defaultForLabel = workspaceDefaultProviderId ?? only?.id ?? null;

  return (
    <div className={shell} data-testid="import-wizard-enrichment-provider-panel">
      {single ? (
        <p className="text-sm font-bold text-slate-950">Enrichment provider</p>
      ) : (
        <label className="text-sm font-bold text-slate-950" htmlFor="import-wizard-enrichment-provider">
          Enrichment provider
        </label>
      )}
      {single ? (
        <p className="mt-1 text-xs text-slate-600">
          Only one provider is available for this workspace. It applies to this batch; changing workspace defaults happens
          in settings, not here.
        </p>
      ) : (
        <p className="mt-1 text-xs text-slate-600">
          Your workspace default is preselected. You can change it for this batch.
        </p>
      )}

      {single ? (
        <div className="mt-3">
          <p
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 shadow-sm"
            data-testid="import-wizard-enrichment-provider-locked"
          >
            {only ? getEnrichmentProviderLabel(only.id) : defaultForLabel ? getEnrichmentProviderLabel(defaultForLabel) : "—"}
          </p>
        </div>
      ) : (
        <>
          <select
            id="import-wizard-enrichment-provider"
            className="mt-3 w-full max-w-md rounded-xl border border-border bg-white px-3 py-2.5 text-sm font-medium text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-70"
            value={batchProviderId ?? ""}
            disabled={disabled || batchProviderId == null}
            onChange={(e) => onBatchProviderChange(e.target.value as EnrichmentProviderId)}
            data-testid="import-wizard-enrichment-provider-select"
          >
            {availableProviders.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
                {defaultForLabel && p.id === defaultForLabel ? " (workspace default)" : ""}
              </option>
            ))}
          </select>
          {disabled ? (
            <p className="mt-2 text-xs text-amber-800/90">
              Provider is locked while a run is in progress. Wait for it to finish to choose a different provider for a
              new run.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function BatchProviderHint({ providerId }: { providerId: EnrichmentProviderId | null }) {
  if (!providerId) return null;
  return (
    <p className="mt-3 text-xs font-medium text-slate-600">
      This batch uses <span className="text-slate-900">{getEnrichmentProviderLabel(providerId)}</span>. Your workspace
      default is not changed here.
    </p>
  );
}

function providerLabelFromRun(provider: string): string {
  if (provider === "pdl") return "PDL";
  if (provider === "apollo") return "Apollo";
  if (provider === "zoominfo") return "ZoomInfo";
  return provider;
}

function EnrichmentStepCard({
  children,
  "data-testid": dataTestId,
}: {
  children: ReactNode;
  "data-testid"?: string;
}) {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
      data-testid={dataTestId}
    >
      {children}
    </div>
  );
}

export function EnrichmentStep({
  phase,
  onStartEnrichment,
  canContinue,
  onBack,
  onContinue,
  batchProviderId,
  onBatchProviderChange,
  availableProviders,
  workspaceDefaultProviderId,
  configLoading,
  enrichmentRunResult,
  enrichmentErrorMessage,
  maxLeadsPerRun,
  enrichmentStale,
}: EnrichmentStepProps) {
  const busy = phase === "starting" || phase === "running";
  const providerSelectDisabled = busy;

  const providerStrip = (
    <div className="border-b border-border bg-slate-50/90">
      <EnrichmentProviderPanel
        batchProviderId={batchProviderId}
        onBatchProviderChange={onBatchProviderChange}
        availableProviders={availableProviders}
        workspaceDefaultProviderId={workspaceDefaultProviderId}
        disabled={providerSelectDisabled}
        configLoading={configLoading}
        embedded
      />
    </div>
  );

  if (phase === "succeeded" && enrichmentStale) {
    return (
      <div className="import-wizard-enrichment space-y-5" data-testid="import-wizard-enrichment-stale">
        <EnrichmentStepCard>
          {providerStrip}
          <div className="p-5 sm:p-6">
            <div className="flex flex-col gap-4 rounded-xl border border-amber-200/90 bg-amber-50/80 p-4 sm:flex-row sm:items-start sm:gap-5 sm:p-5">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-lg font-bold text-amber-800"
                aria-hidden="true"
              >
                ↻
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold text-amber-950">Batch data changed since the last enrichment run</p>
                <p className="mt-2 text-sm leading-relaxed text-amber-900/95">
                  Your staged rows or field mappings were updated after enrichment ran. Re-run enrichment to refresh
                  results for this batch before continuing to validation.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void onStartEnrichment()}
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-amber-400 bg-white px-5 text-sm font-semibold text-amber-950 shadow-sm transition hover:bg-amber-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                    data-testid="import-wizard-enrichment-rerun-after-stale"
                  >
                    Re-run enrichment
                  </button>
                </div>
              </div>
            </div>
          </div>
        </EnrichmentStepCard>
      </div>
    );
  }

  if (phase === "failed") {
    return (
      <div className="import-wizard-enrichment space-y-5" data-testid="import-wizard-enrichment">
        <EnrichmentStepCard>
          {providerStrip}
          <div className="p-5 sm:p-6">
            <div className="flex flex-col gap-4 rounded-xl border border-rose-200/90 bg-rose-50/80 p-4 sm:flex-row sm:items-start sm:gap-5 sm:p-5">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-lg font-bold text-rose-700"
                aria-hidden="true"
              >
                !
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-bold text-rose-950">Enrichment run failed</p>
                <p className="mt-2 text-sm leading-relaxed text-rose-900/95">
                  {enrichmentErrorMessage ??
                    "The run stopped before results were ready. Fix the issue below and retry — prior rows may have been partially updated on leads that completed."}
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void onStartEnrichment()}
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-rose-300 bg-white px-5 text-sm font-semibold text-rose-900 shadow-sm transition hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                    data-testid="import-wizard-enrichment-retry"
                  >
                    Retry enrichment
                  </button>
                </div>
              </div>
            </div>
          </div>
        </EnrichmentStepCard>
      </div>
    );
  }

  if (phase === "ready" || busy) {
    const active = phase === "starting" || phase === "running";
    return (
      <div className="import-wizard-enrichment space-y-5" data-testid="import-wizard-enrichment">
        <EnrichmentStepCard>
          {providerStrip}
          <div className="px-6 py-10 text-center sm:px-10">
            <div
              className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accentSoft text-2xl text-accent"
              aria-hidden="true"
            >
              ✦
            </div>
            {active ? (
              <>
                <p className="text-lg font-bold text-slate-950">Running enrichment…</p>
                <p className="mt-2 text-sm text-slate-600">
                  Calling your selected provider for each lead (sequential requests, capped per run).
                </p>
                <BatchProviderHint providerId={batchProviderId} />
                <div className="mt-6 flex justify-center" role="status" aria-live="polite">
                  <span className="inline-block h-9 w-9 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                </div>
              </>
            ) : (
              <>
                <h2 className="text-xl font-bold text-slate-950 sm:text-2xl">Enrich your lead catalog</h2>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  We process leads from your company catalog (most recently updated first), up to {maxLeadsPerRun} per
                  run. Each lead is enriched with the batch provider you select; results are written to lead profiles and
                  stored for audit. Nothing is published until you finish the wizard.
                </p>
                <BatchProviderHint providerId={batchProviderId} />
                <div className="mt-8">
                  <button
                    type="button"
                    disabled={busy || batchProviderId == null || availableProviders.length === 0 || configLoading}
                    onClick={() => void onStartEnrichment()}
                    className="inline-flex min-h-11 items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-6 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-600 hover:to-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
                    data-testid="import-wizard-enrichment-start"
                  >
                    Start enrichment
                  </button>
                </div>
              </>
            )}
          </div>
        </EnrichmentStepCard>
      </div>
    );
  }

  if (!enrichmentRunResult) {
    return (
      <div className="import-wizard-enrichment space-y-5" data-testid="import-wizard-enrichment">
        <EnrichmentStepCard>
          {providerStrip}
          <div className="p-5 sm:p-6">
            <p className="text-sm text-slate-600">No enrichment results loaded.</p>
          </div>
        </EnrichmentStepCard>
      </div>
    );
  }

  const { summary, sampleRows } = enrichmentRunResult;

  return (
    <div className="import-wizard-enrichment space-y-5" data-testid="import-wizard-enrichment-results">
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
        <div className="border-b border-border bg-slate-50/90">
          <EnrichmentProviderPanel
            batchProviderId={batchProviderId}
            onBatchProviderChange={onBatchProviderChange}
            availableProviders={availableProviders}
            workspaceDefaultProviderId={workspaceDefaultProviderId}
            disabled={false}
            configLoading={configLoading}
            embedded
          />
        </div>
        <div className="space-y-5 p-4 sm:p-5">
          <div className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-accent">Enrichment review</p>
              <h2 className="mt-1 text-xl font-bold text-slate-950">Review enrichment outcomes</h2>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">
                Confirm provider results and exceptions before validating the staged leads.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
              <button
                type="button"
                onClick={onBack}
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                data-testid="import-wizard-enrichment-back"
              >
                Back
              </button>
              <button
                type="button"
                onClick={onContinue}
                disabled={!canContinue}
                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-600 hover:to-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
                data-testid="import-wizard-enrichment-continue"
              >
                Continue to Validation
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-border bg-slate-50/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Full success</p>
              <p className="mt-1 text-3xl font-bold text-emerald-600">{summary.success}</p>
            </div>
            <div className="rounded-2xl border border-border bg-slate-50/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Partial match</p>
              <p className="mt-1 text-3xl font-bold text-amber-600">{summary.partial}</p>
            </div>
            <div className="rounded-2xl border border-border bg-slate-50/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Failed</p>
              <p className="mt-1 text-3xl font-bold text-rose-600">{summary.failed}</p>
            </div>
            <div className="rounded-2xl border border-border bg-slate-50/50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">No match</p>
              <p className="mt-1 text-3xl font-bold text-slate-500">{summary.noMatch}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-200/80 bg-accentSoft/60 px-4 py-4 sm:px-6">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-900/80">Enrichment coverage</p>
              <p className="mt-1 text-3xl font-bold text-accent">{summary.coveragePercent}%</p>
              <p className="mt-1 text-xs text-indigo-900/80">
                Of {summary.totalProcessed} lead{summary.totalProcessed === 1 ? "" : "s"} processed (success + partial
                cues).
              </p>
            </div>
            <span className="text-2xl text-accent" aria-hidden="true">
              ✦
            </span>
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)] sm:p-5">
        <h2 className="mb-1 text-base font-bold text-slate-950">Enrichment results</h2>
        <p className="mb-2 text-sm text-slate-700">
          Provider for this batch:{" "}
          <span className="font-semibold text-slate-900">{providerLabelFromRun(enrichmentRunResult.provider)}</span>.
          Change the batch provider in the section above to clear this run and start over.
        </p>
        <p className="mb-3 text-xs text-slate-500">
          Sample of up to {sampleRows.length} rows from this run (run id {enrichmentRunResult.runId.slice(0, 8)}…).
          Summary counts reflect all {summary.totalProcessed} leads processed.
        </p>
        <p className="mb-4 text-sm text-slate-600">
          Review exceptions before validation. Rows with partial or failed status can still proceed — resolve them if you
          need cleaner handoff.
        </p>
        {sampleRows.length > 0 ? (
          <ResultsTable rows={sampleRows} />
        ) : (
          <p className="text-sm text-slate-600">No sample rows returned (all rows may have failed before display).</p>
        )}
      </section>
    </div>
  );
}
