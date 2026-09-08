"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  deriveFieldMappingUi,
  assignFieldMappingSelection,
  type FieldMappingSourceRow,
  isFieldMappingReady,
  identityReadinessSummaryText,
  type MappingRowStatus,
} from "@/lib/import-wizard/field-mapping-logic";
import { buildPreviewColumnsFromParse } from "@/lib/import-wizard/parse-csv-sample";
import { parseImportFileHeadersAndAllDataRows } from "@/lib/import-wizard/parse-import-file";
import type { ImportWizardParsedSource } from "@/lib/import-wizard/parsed-source";
import {
  availableLeadImportOptionsForHeaders,
  dedupeSuggestedMappings,
  suggestMappingsFromHeaders,
} from "@/lib/import-wizard/field-mapping-suggest";
import {
  ALL_LEAD_IMPORT_OPTIONS,
  labelForLeadImportKey,
  type LeadImportCanonicalKey,
} from "@/lib/import-wizard/lead-import-field-contract";
import {
  CUSTOM_FIELD_PREFIX,
  generateCustomStorageKey,
  isCustomMappingValue,
  parseCustomStorageKey,
  pruneCustomFieldDefinitions,
  type CustomFieldDefinitions,
  MAX_CUSTOM_FIELD_DEFINITIONS,
} from "@/lib/import-wizard/custom-field-mapping";
import { fieldMappingPersistFingerprint } from "@/lib/import-wizard/field-mapping-persist-fingerprint";

const ADD_CUSTOM_FIELD = "__add_custom_field__";

function statusBadge(status: MappingRowStatus) {
  if (status === "canonical") {
    return null;
  }
  if (status === "custom") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-violet-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-violet-800">
        Custom
      </span>
    );
  }
  if (status === "conflict") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-900">
        Conflict
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-600">
      Unmapped
    </span>
  );
}

function headersEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function mergeSelectionsForColumnCount(n: number, server: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < n; i++) {
    const id = String(i);
    out[id] = server[id] ?? "";
  }
  return out;
}

function MappingRowView({
  row,
  status,
  value,
  onChange,
  definitions,
  onAddCustom,
  onCustomLabelChange,
  options,
}: {
  row: FieldMappingSourceRow;
  status: MappingRowStatus;
  value: string;
  onChange: (next: string) => void;
  definitions: CustomFieldDefinitions;
  onAddCustom: () => void;
  onCustomLabelChange: (storageKey: string, label: string) => void;
  options: readonly LeadImportCanonicalKey[];
}) {
  const borderClass =
    status === "conflict"
      ? "border-amber-300 ring-1 ring-amber-200"
      : status === "unmapped"
        ? "border-border border-dashed"
        : "border-border";

  return (
    <div
      className={`import-wizard-mapping-row grid gap-2 rounded-lg border bg-card px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_1.5rem_minmax(14rem,1fr)_auto] sm:items-center sm:gap-3 ${borderClass}`}
      data-testid={`import-wizard-mapping-row-${row.id}`}
      data-mapping-status={status}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-sm font-semibold text-slate-800" title={row.sourceColumn}>
          {row.sourceColumn}
        </p>
      </div>
      <div className="hidden shrink-0 items-center justify-center text-slate-400 sm:flex" aria-hidden="true">
        <span className="text-base font-bold">→</span>
      </div>
      <div className="min-w-0 flex-1">
        <label className="sr-only" htmlFor={`map-${row.id}`}>
          Map {row.sourceColumn} to canonical field
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <select
            id={`map-${row.id}`}
            className="min-h-10 w-full min-w-[12rem] flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            value={
              value === "" ||
              (ALL_LEAD_IMPORT_OPTIONS as readonly string[]).includes(value) ||
              isCustomMappingValue(value)
                ? value
                : ""
            }
            onChange={(e) => {
              const v = e.target.value;
              if (v === ADD_CUSTOM_FIELD) {
                onAddCustom();
              } else {
                onChange(v);
              }
            }}
          >
            <option value="">Unmapped</option>
            {options.map((opt) => (
              <option key={opt} value={opt}>
                {labelForLeadImportKey(opt as LeadImportCanonicalKey)}
              </option>
            ))}
            {isCustomMappingValue(value) ? (
              <option value={value}>
                Custom: {definitions[parseCustomStorageKey(value)!]?.label ?? parseCustomStorageKey(value) ?? "field"}
              </option>
            ) : null}
            <optgroup label="Custom">
              <option value={ADD_CUSTOM_FIELD}>Save as custom field…</option>
            </optgroup>
          </select>
          {isCustomMappingValue(value) ? (
            <input
              type="text"
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs font-medium text-slate-800 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              value={definitions[parseCustomStorageKey(value)!]?.label ?? ""}
              onChange={(e) => {
                const k = parseCustomStorageKey(value);
                if (k) onCustomLabelChange(k, e.target.value);
              }}
              placeholder="Label shown in exports"
              aria-label={`Custom field label for ${row.sourceColumn}`}
            />
          ) : null}
        </div>
      </div>
      {statusBadge(status)}
    </div>
  );
}

export type FieldMappingStepProps = {
  /** Active draft import batch (server); field mapping is persisted per batch id. */
  importBatchId: string | null;
  importBatchLoading: boolean;
  importBatchError: string | null;
  importFile: File | null;
  parsedSource: ImportWizardParsedSource | null;
  onFieldMappingReadyChange: (ready: boolean) => void;
  /** Called after a successful POST so downstream steps can refresh `data_revision` / staleness. */
  onBatchDataRevision?: (dataRevision: number) => void;
  canContinue: boolean;
  onBack: () => void;
  onContinue: () => void;
};

export function FieldMappingStep({
  importBatchId,
  importBatchLoading,
  importBatchError,
  importFile,
  parsedSource,
  onFieldMappingReadyChange,
  onBatchDataRevision,
  canContinue,
  onBack,
  onContinue,
}: FieldMappingStepProps) {
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedTextKey, setParsedTextKey] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewColumns, setPreviewColumns] = useState<{ csvColumn: string; cells: string[] }[]>([]);
  /** All source data rows (aligned to headers) — persisted for batch validation. */
  const [stagedRows, setStagedRows] = useState<string[][]>([]);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [customFieldDefinitions, setCustomFieldDefinitions] = useState<CustomFieldDefinitions>({});
  const [hydrated, setHydrated] = useState(false);
  const [serverLoadError, setServerLoadError] = useState<string | null>(null);
  /** Matches last successful GET merge or POST — Continue stays disabled until mapping is persisted. */
  const [lastSavedFingerprint, setLastSavedFingerprint] = useState<string | null>(null);
  const [persistError, setPersistError] = useState<string | null>(null);

  const initKeyRef = useRef<string | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldApplyServerBaselineRef = useRef(false);
  const persistGenRef = useRef(0);
  const lastSavedFingerprintRef = useRef<string | null>(null);
  const persistFingerprintRef = useRef("");
  const persistErrorRef = useRef<string | null>(null);

  useEffect(() => {
    lastSavedFingerprintRef.current = lastSavedFingerprint;
  }, [lastSavedFingerprint]);

  useEffect(() => {
    persistErrorRef.current = persistError;
  }, [persistError]);

  useEffect(() => {
    lastSavedFingerprintRef.current = null;
    setLastSavedFingerprint(null);
    setPersistError(null);
  }, [importBatchId]);

  useEffect(() => {
    if (parsedSource) {
      setParseError(null);
      setHydrated(false);
      initKeyRef.current = null;
      const key = [
        parsedSource.kind,
        parsedSource.sourceUrl ?? parsedSource.sourceName,
        parsedSource.headers.join("\0"),
        String(parsedSource.dataRows.length),
      ].join("\0");
      setParsedTextKey(key);
      setHeaders(parsedSource.headers);
      setStagedRows(parsedSource.dataRows);
      setPreviewColumns(
        buildPreviewColumnsFromParse({
          headers: parsedSource.headers,
          dataRows: parsedSource.dataRows.slice(0, 3),
        })
      );
      if (parsedSource.headers.length === 0) {
        setParseError("Could not detect a header row in this Google Sheet.");
        setSelections({});
        setHydrated(true);
      }
      return;
    }

    if (!importFile) {
      setParseError(null);
      setParsedTextKey(null);
      setHeaders([]);
      setPreviewColumns([]);
      setStagedRows([]);
      setSelections({});
      setCustomFieldDefinitions({});
      setHydrated(false);
      initKeyRef.current = null;
      lastSavedFingerprintRef.current = null;
      setLastSavedFingerprint(null);
      setPersistError(null);
      return;
    }

    let cancelled = false;
    setParseError(null);
    setHydrated(false);
    initKeyRef.current = null;

    parseImportFileHeadersAndAllDataRows(importFile)
      .then((full) => {
        if (cancelled) return;
        const key = `${importFile.name}-${importFile.lastModified}-${full.headers.join("\0")}`;
        setParsedTextKey(key);
        setHeaders(full.headers);
        setStagedRows(full.dataRows);
        const previewSample = { headers: full.headers, dataRows: full.dataRows.slice(0, 3) };
        setPreviewColumns(buildPreviewColumnsFromParse(previewSample));
        if (full.headers.length === 0) {
          setParseError("This file has no header row or is empty.");
          setSelections({});
          setHydrated(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setParseError("Could not read this spreadsheet file.");
          setHeaders([]);
          setPreviewColumns([]);
          setStagedRows([]);
          setSelections({});
          setHydrated(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [importFile, parsedSource]);

  useEffect(() => {
    const hasSource = importFile != null || parsedSource != null;
    if (!importBatchId || !hasSource || !parsedTextKey || headers.length === 0 || parseError) {
      return;
    }
    const loadKey = `${importBatchId ?? ""}\0${parsedTextKey}`;
    if (initKeyRef.current === loadKey) {
      return;
    }
    initKeyRef.current = loadKey;

    let cancelled = false;
    setServerLoadError(null);

    (async () => {
      try {
        const res = await fetch(
          `/api/exhibitor/import-wizard/batches/${encodeURIComponent(importBatchId)}/field-mapping`,
          { credentials: "include" }
        );
        if (!res.ok) {
          throw new Error("load_failed");
        }
        const data = (await res.json()) as null | {
          csv_headers?: string[];
          selections?: Record<string, string>;
          custom_field_definitions?: CustomFieldDefinitions;
        };
        if (cancelled) return;
        if (data && Array.isArray(data.csv_headers) && headersEqual(data.csv_headers, headers) && data.selections) {
          shouldApplyServerBaselineRef.current = true;
          setSelections(mergeSelectionsForColumnCount(headers.length, data.selections));
          setCustomFieldDefinitions(
            data.custom_field_definitions && typeof data.custom_field_definitions === "object"
              ? data.custom_field_definitions
              : {}
          );
        } else {
          shouldApplyServerBaselineRef.current = false;
          setSelections(dedupeSuggestedMappings(suggestMappingsFromHeaders(headers)));
          setCustomFieldDefinitions({});
        }
      } catch {
        if (!cancelled) {
          shouldApplyServerBaselineRef.current = false;
          setServerLoadError("Could not load saved mapping; using suggestions.");
          setSelections(dedupeSuggestedMappings(suggestMappingsFromHeaders(headers)));
          setCustomFieldDefinitions({});
        }
      } finally {
        if (!cancelled) {
          setHydrated(true);
        }
      }
    })();
  }, [importFile, parsedSource, parsedTextKey, headers, parseError, importBatchId]);

  const sourceRows = useMemo<FieldMappingSourceRow[]>(
    () => headers.map((h, i) => ({ id: String(i), sourceColumn: h || `(Column ${i + 1})` })),
    [headers]
  );
  const mappingOptions = useMemo(() => availableLeadImportOptionsForHeaders(headers), [headers]);

  const derived = useMemo(() => deriveFieldMappingUi(selections, sourceRows), [selections, sourceRows]);

  const persistPayload = useMemo(() => {
    return {
      csv_headers: headers,
      preview_rows: previewColumns,
      selections,
      custom_field_definitions: pruneCustomFieldDefinitions(selections, customFieldDefinitions),
      staged_rows: stagedRows,
      source_filename: importFile?.name ?? parsedSource?.sourceName ?? null,
    };
  }, [headers, previewColumns, selections, customFieldDefinitions, stagedRows, importFile?.name, parsedSource?.sourceName]);

  const persistFingerprint = useMemo(
    () => fieldMappingPersistFingerprint(persistPayload),
    [persistPayload]
  );
  persistFingerprintRef.current = persistFingerprint;

  const persistSynced =
    lastSavedFingerprint !== null && lastSavedFingerprint === persistFingerprint && persistError === null;

  useEffect(() => {
    setPersistError(null);
  }, [persistFingerprint]);

  useEffect(() => {
    if (!hydrated || !shouldApplyServerBaselineRef.current) {
      return;
    }
    shouldApplyServerBaselineRef.current = false;
    // Do NOT mark as saved here. The server GET returns selections/headers but
    // not staged_rows (those live in import_batch_rows). Marking local state as
    // "already saved" would skip the persist effect, leaving stale rows in the
    // DB when the user uploaded a new source file with the same column headers.
    // The persist effect will save the full payload (including staged_rows) and
    // set lastSavedFingerprint on success.
    setPersistError(null);
  }, [hydrated, persistPayload]);

  const handleAddCustom = useCallback(
    (rowId: string) => {
      const row = sourceRows.find((r) => r.id === rowId);
      const header = row?.sourceColumn ?? "Field";
      setCustomFieldDefinitions((defs) => {
        if (Object.keys(defs).length >= MAX_CUSTOM_FIELD_DEFINITIONS) return defs;
        const key = generateCustomStorageKey(header, `${rowId}-${Date.now()}`);
        setSelections((prev) => ({ ...prev, [rowId]: `${CUSTOM_FIELD_PREFIX}${key}` }));
        return { ...defs, [key]: { label: header } };
      });
    },
    [sourceRows]
  );

  const handleCustomLabelChange = useCallback((storageKey: string, label: string) => {
    setCustomFieldDefinitions((prev) => ({ ...prev, [storageKey]: { label } }));
  }, []);

  useEffect(() => {
    if (!headers.length || !hydrated) {
      onFieldMappingReadyChange(false);
      return;
    }
    onFieldMappingReadyChange(isFieldMappingReady(derived) && persistSynced);
  }, [derived, headers.length, hydrated, onFieldMappingReadyChange, persistSynced]);

  useEffect(() => {
    if (!hydrated || (!importFile && !parsedSource) || headers.length === 0 || !importBatchId) return;

    const fp = fieldMappingPersistFingerprint(persistPayload);
    if (persistErrorRef.current === null && fp === lastSavedFingerprintRef.current) {
      return;
    }

    persistGenRef.current += 1;
    const gen = persistGenRef.current;

    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = setTimeout(() => {
      const body = persistPayload;
      const fpAtSend = fieldMappingPersistFingerprint(body);
      void (async () => {
        try {
          const res = await fetch(
            `/api/exhibitor/import-wizard/batches/${encodeURIComponent(importBatchId)}/field-mapping`,
            {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }
          );
          const json = (await res.json().catch(() => ({}))) as {
            error?: unknown;
            code?: unknown;
            data_revision?: unknown;
          };
          if (gen !== persistGenRef.current) return;
          if (!res.ok) {
            const msg = typeof json.error === "string" ? json.error : "Could not save mapping.";
            setPersistError(msg);
            return;
          }
          if (fpAtSend !== persistFingerprintRef.current) return;
          lastSavedFingerprintRef.current = fpAtSend;
          setLastSavedFingerprint(fpAtSend);
          setPersistError(null);
          if (typeof json.data_revision === "number") {
            onBatchDataRevision?.(json.data_revision);
          }
        } catch {
          if (gen !== persistGenRef.current) return;
          setPersistError("Could not save mapping.");
        }
      })();
    }, 600);

    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
      }
    };
  }, [persistPayload, hydrated, importFile, parsedSource, headers.length, importBatchId]);

  const setRowValue = useCallback((id: string, value: string) => {
    setSelections((prev) => assignFieldMappingSelection(prev, id, value));
  }, []);

  const sourceName = parsedSource?.sourceName ?? importFile?.name ?? "Lead data source";
  const sourceKindLabel = parsedSource ? "Google Sheets" : "Spreadsheet file";
  const identityBandText = derived.continueAllowed
    ? identityReadinessSummaryText(derived).replace(/^Identity:\s*/, "")
    : "Map Email, LinkedIn URL, or Full Name (or First + Last) + Company";
  const optionalGapText =
    derived.duplicateCanonicalTargets.length > 0
      ? `Resolve duplicates: ${derived.duplicateCanonicalTargets.map((key) => labelForLeadImportKey(key)).join(", ")}`
      : derived.warnings.length > 0
        ? `Optional missing: ${derived.warnings.map((warning) => warning.label).join(", ")}`
        : "No optional gaps";
  const readinessStateLabel = canContinue
    ? "Ready to continue"
    : derived.continueAllowed
      ? "Saving mappings"
      : "Needs identity";

  if (importBatchError) {
    return (
      <div className="import-wizard-field-mapping space-y-4 rounded-2xl border border-red-200 bg-red-50/80 p-6 text-sm text-red-950" data-testid="import-wizard-field-mapping">
        <p className="font-semibold">Import batch unavailable</p>
        <p>{importBatchError}</p>
      </div>
    );
  }

  if (importBatchLoading || !importBatchId) {
    return (
      <div className="import-wizard-field-mapping rounded-2xl border border-border bg-card p-8 text-center text-sm text-slate-600" data-testid="import-wizard-field-mapping">
        Loading import batch…
      </div>
    );
  }

  if (!importFile && !parsedSource) {
    return (
      <div className="import-wizard-field-mapping space-y-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-6 text-sm text-amber-950" data-testid="import-wizard-field-mapping">
        <p className="font-semibold">No lead data source in memory</p>
        <p className="text-amber-900/90">
          Go back to the previous step and choose a spreadsheet file or import a Google Sheet to map columns.
        </p>
      </div>
    );
  }

  if (parseError) {
    return (
      <div className="import-wizard-field-mapping space-y-4 rounded-2xl border border-red-200 bg-red-50/80 p-6 text-sm text-red-950" data-testid="import-wizard-field-mapping">
        <p className="font-semibold">Could not read spreadsheet</p>
        <p>{parseError}</p>
      </div>
    );
  }

  if (!hydrated && headers.length > 0) {
    return (
      <div className="import-wizard-field-mapping rounded-2xl border border-border bg-card p-8 text-center text-sm text-slate-600" data-testid="import-wizard-field-mapping">
        Loading field mapping…
      </div>
    );
  }

  return (
    <div className="import-wizard-field-mapping space-y-6" data-testid="import-wizard-field-mapping">
      {serverLoadError ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{serverLoadError}</p>
      ) : null}
      {persistError ? (
        <p
          className="rounded-lg border border-red-200 bg-red-50/90 px-3 py-2 text-sm text-red-950"
          data-testid="import-wizard-mapping-persist-error"
        >
          {persistError} Mapping not saved — Continue is disabled until a save succeeds.
        </p>
      ) : null}

      <div>
        <section className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)] sm:p-5">
          <div className="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Map your columns</h2>
              <p className="mt-1 text-sm text-slate-600">Match each source column to a Lead Retrieval field.</p>
            </div>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <button
                type="button"
                onClick={onBack}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              >
                Back
              </button>
              <button
                type="button"
                onClick={onContinue}
                disabled={!canContinue}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              >
                Continue to Enrichment
              </button>
            </div>
          </div>

          <div
            className="mt-4 overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-600 to-purple-700 p-4 text-white shadow-[0_14px_30px_rgba(99,102,241,0.24)]"
            data-testid="import-wizard-mapping-summary-band"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-white/70">Import readiness</p>
                <p className="mt-1 text-xl font-bold tracking-tight">{readinessStateLabel}</p>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-white/80">{identityBandText}</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[27rem]">
                <div className="rounded-xl bg-white/15 px-3 py-2.5 ring-1 ring-white/20">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-white/70">Mapped fields</p>
                  <p className="mt-1 text-2xl font-bold tracking-tight">
                    {derived.canonicalMappedCount}
                    <span className="text-sm font-semibold text-white/70"> / {derived.totalSourceColumns}</span>
                  </p>
                </div>
                <div className="rounded-xl bg-white/15 px-3 py-2.5 ring-1 ring-white/20">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-white/70">Coverage</p>
                  <p className="mt-1 text-2xl font-bold tracking-tight">{derived.fieldCoveragePercent}%</p>
                </div>
                <div className="rounded-xl bg-white/15 px-3 py-2.5 ring-1 ring-white/20">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-white/70">Warnings</p>
                  <p className="mt-1 truncate text-sm font-semibold text-white" title={optionalGapText}>
                    {optionalGapText}
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-white transition-all"
                style={{ width: `${derived.fieldCoveragePercent}%` }}
              />
            </div>
          </div>

          <div
            className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
            data-testid="import-wizard-source-summary"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-950" title={sourceName}>
                {sourceName}
              </p>
              <p className="mt-1 text-xs font-medium text-slate-600">
                {sourceKindLabel} · {stagedRows.length} row{stagedRows.length === 1 ? "" : "s"} · {headers.length} column
                {headers.length === 1 ? "" : "s"}
              </p>
            </div>
            <button
              type="button"
              onClick={onBack}
              className="self-start rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 sm:self-auto"
            >
              Change source
            </button>
          </div>

          <div className="mt-4 space-y-2.5">
            {sourceRows.map((row) => (
              <MappingRowView
                key={row.id}
                row={row}
                status={derived.rowStatusById[row.id] ?? "unmapped"}
                value={selections[row.id] ?? ""}
                onChange={(next) => setRowValue(row.id, next)}
                definitions={customFieldDefinitions}
                onAddCustom={() => handleAddCustom(row.id)}
                onCustomLabelChange={handleCustomLabelChange}
                options={mappingOptions}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
