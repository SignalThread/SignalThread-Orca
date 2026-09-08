"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ImportWizardShell } from "@/components/import-wizard";
import {
  EnrichmentStep,
  type EnrichmentPhase,
  type WizardEnrichmentRunResult,
} from "@/components/import-wizard/steps/enrichment-step";
import { FieldMappingStep } from "@/components/import-wizard/steps/field-mapping-step";
import { PublishStep, type PublishPhase } from "@/components/import-wizard/steps/publish-step";
import { SourceSelectionStep } from "@/components/import-wizard/steps/source-selection-step";
import { ValidationStep } from "@/components/import-wizard/steps/validation-step";
import { renderWizardFooter } from "@/components/import-wizard/wizard-footer-config";
import { isSpreadsheetReadableForMapping } from "@/lib/import-wizard/csv-import-guard";
import type { EnrichmentProviderId, EnrichmentProviderOption } from "@/lib/import-wizard/enrichment-providers-config";
import type { ImportWizardParsedSource } from "@/lib/import-wizard/parsed-source";
import { IMPORT_WIZARD_BASE_PATH, importWizardPath } from "@/lib/import-wizard/paths";
import { parseImportWizardStepParam, shouldNormalizeImportWizardStepUrl } from "@/lib/import-wizard/step-url";
import type { ImportSourceId } from "@/lib/import-wizard/source-types";
import {
  isImportWizardRouteEngagedForUser,
  markImportWizardRouteEngaged,
} from "@/lib/import-wizard/wizard-transient-session";
import { isEnrichmentOutputStaleForBatch } from "@/lib/import-wizard/batch-downstream-stale";

const STEP_SUBTITLES: Record<number, string> = {
  0: "Choose how you'd like to import your lead data. We support multiple formats and integrations to fit your workflow.",
  1: "Align your source data columns with SignalThread Lead Retrieval's canonical fields. We've suggested mappings based on your header names.",
  2: "Enhance your lead data using the sources you've connected — profile context, firmographics, and other structured fields you enable.",
  3: "Confirm import readiness: blocking issues must be fixed; optional warnings won't stop you from importing.",
  4: "Confirm and import your leads into Leads Intelligence.",
};

type EnrichmentConfigResponse = {
  availableProviders: EnrichmentProviderOption[];
  workspaceDefaultWizardId: EnrichmentProviderId | null;
  initialBatchProviderId: EnrichmentProviderId | null;
  maxLeadsPerRun: number;
};

type ImportWizardFlowProps = {
  /** Current authenticated user — used to invalidate tab session on user change. */
  sessionUserId: string;
  /** Server-resolved event scope. Imported leads must always be materialized into this event. */
  activeEventId: string | null;
};

/**
 * Client orchestration for the import wizard: URL step, footer actions, and local step state.
 */
export function ImportWizardFlow({ sessionUserId, activeEventId }: ImportWizardFlowProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const stepParam = searchParams.get("step");
  const displayStep = useMemo(() => parseImportWizardStepParam(stepParam), [stepParam]);

  const [selectedSource, setSelectedSource] = useState<ImportSourceId | null>(null);
  const [localCsvFile, setLocalCsvFile] = useState<File | null>(null);
  const [googleSheetsSource, setGoogleSheetsSource] = useState<ImportWizardParsedSource | null>(null);
  const [fieldMappingReady, setFieldMappingReady] = useState(false);
  const [validationContinueAllowed, setValidationContinueAllowed] = useState(false);
  const [validationImportableRowCount, setValidationImportableRowCount] = useState<number | null>(null);
  const [draftReloadKey, setDraftReloadKey] = useState(0);
  const [activeImportDraft, setActiveImportDraft] = useState<{
    loading: boolean;
    error: string | null;
    batchId: string | null;
    displayLabel: string;
    dataRevision: number;
  }>({
    loading: true,
    error: null,
    batchId: null,
    displayLabel: "…",
    dataRevision: 0,
  });

  /** Legacy sessions may still have an integration source selected; only local lead-data upload is valid now. */
  useLayoutEffect(() => {
    setSelectedSource((s) => (s != null && s !== "csv" ? null : s));
  }, []);
  const [enrichmentPhase, setEnrichmentPhase] = useState<EnrichmentPhase>("ready");
  const [batchEnrichmentProviderId, setBatchEnrichmentProviderId] = useState<EnrichmentProviderId | null>(null);
  const [enrichmentConfig, setEnrichmentConfig] = useState<EnrichmentConfigResponse | null>(null);
  const [enrichmentConfigLoading, setEnrichmentConfigLoading] = useState(true);
  const [enrichmentRunResult, setEnrichmentRunResult] = useState<WizardEnrichmentRunResult | null>(null);
  /** `import_batches.data_revision` captured when the last enrichment run completed successfully. */
  const [enrichmentRunAtDataRevision, setEnrichmentRunAtDataRevision] = useState<number | null>(null);
  const [enrichmentErrorMessage, setEnrichmentErrorMessage] = useState<string | null>(null);
  const enrichmentAbortRef = useRef<AbortController | null>(null);

  const [importBlocked, setImportBlocked] = useState(true);
  const [publishPhase, setPublishPhase] = useState<PublishPhase>("pre_publish");
  const [publishError, setPublishError] = useState<string | null>(null);
  /** Server-reported count after publish (materialized leads). */
  const [importedLeadCount, setImportedLeadCount] = useState<number | null>(null);

  useEffect(() => {
    if (shouldNormalizeImportWizardStepUrl(stepParam, displayStep)) {
      router.replace(`${IMPORT_WIZARD_BASE_PATH}?step=${displayStep}`);
    }
  }, [stepParam, displayStep, router]);

  /** Cold entry (new tab, return after leaving route, logout, user switch): drop stale ?step= and reset UI. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (!isImportWizardRouteEngagedForUser(sessionUserId)) {
        router.replace(IMPORT_WIZARD_BASE_PATH);
        setSelectedSource(null);
        setLocalCsvFile(null);
        setGoogleSheetsSource(null);
        setFieldMappingReady(false);
        setValidationContinueAllowed(false);
        setValidationImportableRowCount(null);
        setDraftReloadKey((k) => k + 1);
        setEnrichmentPhase("ready");
        setEnrichmentRunResult(null);
        setEnrichmentRunAtDataRevision(null);
        setEnrichmentErrorMessage(null);
        enrichmentAbortRef.current?.abort();
        setBatchEnrichmentProviderId(null);
        setImportBlocked(true);
        setPublishPhase("pre_publish");
        setImportedLeadCount(null);
      }
      markImportWizardRouteEngaged(sessionUserId);
    } catch {
      markImportWizardRouteEngaged(sessionUserId);
    }
  }, [sessionUserId, router]);

  useEffect(() => {
    return () => enrichmentAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    setActiveImportDraft((prev) => ({
      ...prev,
      loading: true,
      error: null,
    }));
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/exhibitor/import-wizard/active-draft", { credentials: "include" });
        if (!res.ok) {
          throw new Error("draft_failed");
        }
        const data = (await res.json()) as {
          batch?: { id: string; displayLabel: string; dataRevision: number };
        };
        if (cancelled) return;
        const b = data.batch;
        if (b?.id) {
          setActiveImportDraft({
            loading: false,
            error: null,
            batchId: b.id,
            displayLabel: b.displayLabel,
            dataRevision: b.dataRevision ?? 0,
          });
        } else {
          setActiveImportDraft((prev) => ({
            ...prev,
            loading: false,
            error: "Missing batch in response.",
          }));
        }
      } catch {
        if (!cancelled) {
          setActiveImportDraft((prev) => ({
            ...prev,
            loading: false,
            error: "Could not load import batch. Refresh and try again.",
          }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionUserId, draftReloadKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/exhibitor/import-wizard/enrichment/config", { credentials: "include" });
        if (!res.ok) {
          throw new Error("config_failed");
        }
        const data = (await res.json()) as EnrichmentConfigResponse;
        if (cancelled) return;
        setEnrichmentConfig(data);
      } catch {
        if (!cancelled) {
          setEnrichmentConfig({
            availableProviders: [],
            workspaceDefaultWizardId: null,
            initialBatchProviderId: null,
            maxLeadsPerRun: 50,
          });
        }
      } finally {
        if (!cancelled) {
          setEnrichmentConfigLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!enrichmentConfig) return;
    setBatchEnrichmentProviderId((prev) => prev ?? enrichmentConfig.initialBatchProviderId ?? null);
  }, [enrichmentConfig]);

  /** Enrichment results are per batch id; clear when the active draft batch changes. */
  useEffect(() => {
    enrichmentAbortRef.current?.abort();
    setEnrichmentRunResult(null);
    setEnrichmentRunAtDataRevision(null);
    setEnrichmentErrorMessage(null);
    setEnrichmentPhase("ready");
  }, [activeImportDraft.batchId]);

  const handleBatchEnrichmentProviderChange = useCallback(
    (next: EnrichmentProviderId) => {
      if (next === batchEnrichmentProviderId) return;
      enrichmentAbortRef.current?.abort();
      setEnrichmentRunResult(null);
      setEnrichmentRunAtDataRevision(null);
      setEnrichmentErrorMessage(null);
      setEnrichmentPhase("ready");
      setBatchEnrichmentProviderId(next);
    },
    [batchEnrichmentProviderId]
  );

  const handleBatchDataRevisionFromPersist = useCallback((rev: number) => {
    setActiveImportDraft((prev) => ({ ...prev, dataRevision: rev }));
  }, []);

  const enrichmentStale = isEnrichmentOutputStaleForBatch({
    enrichmentPhase,
    enrichmentRunResult,
    enrichmentRunAtDataRevision,
    currentBatchDataRevision: activeImportDraft.dataRevision,
  });

  const enrichmentCanContinue = enrichmentPhase === "succeeded" && !enrichmentStale;

  const handleStartEnrichment = useCallback(async () => {
    if (batchEnrichmentProviderId == null || !activeImportDraft.batchId) return;

    enrichmentAbortRef.current?.abort();
    const ac = new AbortController();
    enrichmentAbortRef.current = ac;

    setEnrichmentPhase("starting");
    setEnrichmentRunResult(null);
    setEnrichmentErrorMessage(null);

    try {
      const res = await fetch("/api/exhibitor/import-wizard/enrichment/run", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: batchEnrichmentProviderId,
          batchId: activeImportDraft.batchId,
        }),
        signal: ac.signal,
      });

      const json = (await res.json()) as Record<string, unknown>;

      if (!res.ok) {
        setEnrichmentPhase("failed");
        setEnrichmentErrorMessage(typeof json.error === "string" ? json.error : "Enrichment failed.");
        return;
      }

      const runPayload = json as WizardEnrichmentRunResult;
      setEnrichmentRunResult(runPayload);
      const dr =
        typeof runPayload.dataRevision === "number" ? runPayload.dataRevision : activeImportDraft.dataRevision;
      setEnrichmentRunAtDataRevision(dr);
      setActiveImportDraft((prev) => ({ ...prev, dataRevision: dr }));
      setEnrichmentPhase("succeeded");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        return;
      }
      setEnrichmentPhase("failed");
      setEnrichmentErrorMessage(e instanceof Error ? e.message : "Network error.");
    }
  }, [batchEnrichmentProviderId, activeImportDraft.batchId, activeImportDraft.dataRevision]);

  const handleImportLeads = useCallback(async () => {
    if (!activeImportDraft.batchId) return;
    setPublishPhase("publishing");
    setPublishError(null);
    setImportedLeadCount(null);
    try {
      if (!activeEventId) {
        setPublishPhase("publish_failed");
        setPublishError("Select an event before importing leads.");
        return;
      }
      const res = await fetch(
        `/api/exhibitor/import-wizard/batches/${encodeURIComponent(activeImportDraft.batchId)}/complete?eventId=${encodeURIComponent(activeEventId)}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "publish" }),
        }
      );
      const json = (await res.json().catch(() => ({}))) as { error?: string; importedCount?: number };
      if (!res.ok) {
        setPublishPhase("publish_failed");
        setPublishError(typeof json.error === "string" ? json.error : "Publish failed.");
        return;
      }
      setImportedLeadCount(typeof json.importedCount === "number" ? json.importedCount : null);
      setPublishPhase("published");
    } catch (e) {
      setPublishPhase("publish_failed");
      setPublishError(e instanceof Error ? e.message : "Network error.");
    }
  }, [activeEventId, activeImportDraft.batchId]);

  const onFieldMappingReadyChange = useCallback((ready: boolean) => {
    setFieldMappingReady(ready);
  }, []);

  const onValidationContinueAllowedChange = useCallback((allowed: boolean) => {
    setValidationContinueAllowed(allowed);
  }, []);

  const onValidationImportableRowCountChange = useCallback((count: number | null) => {
    setValidationImportableRowCount(count);
  }, []);

  const handleLocalCsvFileChange = useCallback((file: File | null) => {
    if (file) {
      setGoogleSheetsSource(null);
    }
    setLocalCsvFile(file);
  }, []);

  const handleGoogleSheetsSourceChange = useCallback((source: ImportWizardParsedSource | null) => {
    if (source) {
      setLocalCsvFile(null);
    }
    setGoogleSheetsSource(source);
  }, []);

  const csvImportReady =
    selectedSource === "csv" &&
    (googleSheetsSource != null || (localCsvFile != null && isSpreadsheetReadableForMapping(localCsvFile)));

  const goToSourceStep = useCallback(() => {
    router.push(importWizardPath(0));
  }, [router]);

  const goToFieldMappingStep = useCallback(() => {
    if (!csvImportReady) return;
    router.push(importWizardPath(1));
  }, [csvImportReady, router]);

  const returnToFieldMappingStep = useCallback(() => {
    router.push(importWizardPath(1));
  }, [router]);

  const goToEnrichmentStep = useCallback(() => {
    if (!fieldMappingReady) return;
    router.push(importWizardPath(2));
  }, [fieldMappingReady, router]);

  const goToValidationStep = useCallback(() => {
    if (!enrichmentCanContinue) return;
    router.push(importWizardPath(3));
  }, [enrichmentCanContinue, router]);

  const handleValidationImport = useCallback(async () => {
    if (!validationContinueAllowed || publishPhase === "publishing" || !activeImportDraft.batchId) return;
    await handleImportLeads();
    router.push(importWizardPath(4));
  }, [activeImportDraft.batchId, handleImportLeads, publishPhase, router, validationContinueAllowed]);

  const eyebrow = (
    <>
      <span className="rounded-md bg-accentSoft px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-accent">
        Import wizard
      </span>
      <span className="text-slate-400">·</span>
      <span className="font-medium text-slate-600">
        Batch {activeImportDraft.loading ? "…" : activeImportDraft.displayLabel}
      </span>
    </>
  );

  const importFinished = displayStep === 4 && publishPhase === "published";
  const subtitle = importFinished
    ? "Your leads are live in Leads Intelligence."
    : (STEP_SUBTITLES[displayStep] ?? STEP_SUBTITLES[0]!);

  const footer =
    displayStep === 0 || displayStep === 1 || displayStep === 2 || displayStep === 3
      ? null
      : renderWizardFooter({
          displayStep,
          csvImportReady,
          fieldMappingReady,
          validationContinueAllowed,
          validationImportableRowCount,
          enrichmentPhase,
          enrichmentCanContinue,
          importBlocked,
          publishPhase,
          onImport: handleImportLeads,
        });

  return (
    <ImportWizardShell
      currentStepIndex={displayStep}
      stepperTone={importFinished ? "finished" : "default"}
      narrowCenteredLayout={importFinished}
      title={importFinished ? "Import complete" : undefined}
      subtitle={subtitle}
      eyebrowSlot={eyebrow}
      footer={footer}
    >
      {displayStep === 0 ? (
        <SourceSelectionStep
          selectedId={selectedSource}
          onSelect={setSelectedSource}
          localCsvFile={localCsvFile}
          onLocalCsvFileChange={handleLocalCsvFileChange}
          googleSheetsSource={googleSheetsSource}
          onGoogleSheetsSourceChange={handleGoogleSheetsSourceChange}
          canContinue={csvImportReady}
          onContinue={goToFieldMappingStep}
        />
      ) : displayStep === 1 ? (
        <FieldMappingStep
          importBatchId={activeImportDraft.batchId}
          importBatchLoading={activeImportDraft.loading}
          importBatchError={activeImportDraft.error}
          importFile={localCsvFile}
          parsedSource={googleSheetsSource}
          onFieldMappingReadyChange={onFieldMappingReadyChange}
          onBatchDataRevision={handleBatchDataRevisionFromPersist}
          canContinue={fieldMappingReady}
          onBack={goToSourceStep}
          onContinue={goToEnrichmentStep}
        />
      ) : displayStep === 2 ? (
        <EnrichmentStep
          phase={enrichmentPhase}
          onStartEnrichment={handleStartEnrichment}
          canContinue={enrichmentCanContinue}
          onBack={returnToFieldMappingStep}
          onContinue={goToValidationStep}
          batchProviderId={batchEnrichmentProviderId}
          onBatchProviderChange={handleBatchEnrichmentProviderChange}
          availableProviders={enrichmentConfig?.availableProviders ?? []}
          workspaceDefaultProviderId={enrichmentConfig?.workspaceDefaultWizardId ?? null}
          configLoading={enrichmentConfigLoading}
          enrichmentRunResult={enrichmentRunResult}
          enrichmentErrorMessage={enrichmentErrorMessage}
          maxLeadsPerRun={enrichmentConfig?.maxLeadsPerRun ?? 50}
          enrichmentStale={enrichmentStale}
        />
      ) : displayStep === 3 ? (
        <ValidationStep
          importBatchId={activeImportDraft.batchId}
          importBatchLoading={activeImportDraft.loading}
          importBatchError={activeImportDraft.error}
          batchDataRevision={activeImportDraft.dataRevision}
          onValidationContinueAllowedChange={onValidationContinueAllowedChange}
          onValidationImportableRowCountChange={onValidationImportableRowCountChange}
          canImport={validationContinueAllowed}
          importableRowCount={validationImportableRowCount}
          importing={publishPhase === "publishing"}
          onImport={handleValidationImport}
        />
      ) : (
        <PublishStep
          batchId={activeImportDraft.batchId}
          batchLoading={activeImportDraft.loading}
          batchDisplayLabel={activeImportDraft.displayLabel}
          phase={publishPhase}
          onPublish={handleImportLeads}
          publishError={publishError}
          onImportGateChange={setImportBlocked}
          importedLeadCount={importedLeadCount}
          activeEventId={activeEventId}
        />
      )}
    </ImportWizardShell>
  );
}
