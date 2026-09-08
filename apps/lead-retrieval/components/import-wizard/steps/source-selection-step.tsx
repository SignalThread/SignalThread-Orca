"use client";

import { useCallback, useId, useRef, useState, type ChangeEvent, type ComponentType, type DragEvent, type FormEvent } from "react";
import { isSpreadsheetReadableForMapping } from "@/lib/import-wizard/csv-import-guard";
import type { ImportWizardParsedSource } from "@/lib/import-wizard/parsed-source";
import { IMPORT_SOURCE_OPTIONS, type ImportSourceId } from "@/lib/import-wizard/source-types";

const MAX_FILE_BYTES = 50 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function IconCsv({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 3h8l4 4v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path d="M14 3v4h4" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M8 13h8M8 17h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconCrm({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <ellipse cx="12" cy="5" rx="7" ry="3" stroke="currentColor" strokeWidth="1.75" />
      <path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5" stroke="currentColor" strokeWidth="1.75" />
      <path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function IconCloud({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 18h11a4 4 0 0 0 0-8 4.5 4.5 0 0 0-8.7-1.1A4 4 0 0 0 7 18Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconApi({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M10 13a5 5 0 0 1 0-7l1.5 1.5M14 11a5 5 0 0 1 0 7l-1.5-1.5M8 12h8"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

const ICONS: Record<ImportSourceId, ComponentType<{ className?: string }>> = {
  csv: IconCsv,
  crm: IconCrm,
  cloud: IconCloud,
  api: IconApi,
};

function SpreadsheetSelectedFilePanel({
  file,
  onReplace,
  onRemove,
  canContinue,
  onContinue,
}: {
  file: File;
  onReplace: () => void;
  onRemove: () => void;
  canContinue: boolean;
  onContinue: () => void;
}) {
  const tooLarge = file.size > MAX_FILE_BYTES;
  const readable = isSpreadsheetReadableForMapping(file);
  const ready = !tooLarge && readable;
  const statusLabel = tooLarge
    ? "File too large"
    : !readable
      ? "Not ready — use a CSV, XLSX, or XLS file"
      : "Ready for field mapping";
  const statusClass = tooLarge
    ? "bg-amber-100 text-amber-900 ring-amber-200"
    : !readable
      ? "bg-amber-100 text-amber-900 ring-amber-200"
      : "bg-emerald-100 text-emerald-900 ring-emerald-200";

  return (
    <div
      data-testid="import-wizard-csv-selected-state"
      className="mx-auto w-full max-w-xl text-left"
      role="region"
      aria-label="Selected import file"
    >
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50/90 p-4 shadow-sm ring-1 ring-slate-200/60 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="flex min-w-0 flex-1 gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-accent shadow-sm ring-1 ring-border">
            <IconCsv className="h-7 w-7" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <p
              className="truncate text-sm font-semibold text-slate-950 sm:text-base"
              title={file.name}
              data-testid="import-wizard-csv-filename"
            >
              {file.name}
            </p>
            <p className="text-sm text-slate-600">{formatFileSize(file.size)}</p>
            <p className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ${statusClass}`}
                data-testid="import-wizard-csv-ready-status"
              >
                {statusLabel}
              </span>
              {ready ? <span className="text-xs text-slate-500">You can continue to field mapping.</span> : null}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-stretch">
          {ready ? (
            <button
              type="button"
              onClick={onContinue}
              disabled={!canContinue}
              className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              Continue to Field Mapping
            </button>
          ) : null}
          <button
            type="button"
            onClick={onReplace}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            Replace
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

function GoogleSheetsSelectedSourcePanel({
  source,
  onRemove,
  canContinue,
  onContinue,
}: {
  source: ImportWizardParsedSource;
  onRemove: () => void;
  canContinue: boolean;
  onContinue: () => void;
}) {
  return (
    <div
      data-testid="import-wizard-google-sheets-selected-state"
      className="mx-auto w-full max-w-xl text-left"
      role="region"
      aria-label="Selected Google Sheet"
    >
      <div className="flex flex-col gap-4 rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 shadow-sm ring-1 ring-emerald-100 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0 flex-1 space-y-2">
          <p className="truncate text-sm font-semibold text-slate-950 sm:text-base" title={source.sourceName}>
            {source.sourceName}
          </p>
          <p className="text-sm text-slate-700">
            {source.headers.length} column{source.headers.length === 1 ? "" : "s"} · {source.dataRows.length} data row
            {source.dataRows.length === 1 ? "" : "s"}
          </p>
          <p className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900 ring-1 ring-emerald-200">
              Ready for field mapping
            </span>
            <span className="text-xs text-slate-600">You can continue to field mapping.</span>
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-stretch">
          <button
            type="button"
            onClick={onContinue}
            disabled={!canContinue}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            Continue to Field Mapping
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

function GoogleSheetsLinkImport({
  googleSheetsSource,
  onGoogleSheetsSourceChange,
  onLocalCsvFileChange,
}: {
  googleSheetsSource: ImportWizardParsedSource | null;
  onGoogleSheetsSourceChange: (source: ImportWizardParsedSource | null) => void;
  onLocalCsvFileChange: (file: File | null) => void;
}) {
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (submitting) return;

      const nextUrl = url.trim();
      if (!nextUrl) {
        setError("Paste a Google Sheets link.");
        return;
      }

      setSubmitting(true);
      setError(null);
      try {
        const response = await fetch("/api/exhibitor/import-wizard/google-sheets", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: nextUrl }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          error?: unknown;
          source?: ImportWizardParsedSource;
        };
        if (!response.ok || !payload.source) {
          setError(typeof payload.error === "string" ? payload.error : "Could not import this Google Sheet.");
          return;
        }
        onLocalCsvFileChange(null);
        onGoogleSheetsSourceChange(payload.source);
      } catch {
        setError("Could not import this Google Sheet. Try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [onGoogleSheetsSourceChange, onLocalCsvFileChange, submitting, url]
  );

  return (
    <div
      className="mt-5 w-full max-w-xl rounded-xl border border-slate-200 bg-white/80 p-3 text-left"
      data-testid="import-wizard-google-sheets-inline"
    >
      <div className="mb-2">
        <label htmlFor="import-wizard-google-sheets-link" className="text-sm font-semibold text-slate-800">
          Google Sheets link
        </label>
      </div>
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handleSubmit}>
        <input
          id="import-wizard-google-sheets-link"
          type="url"
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
            setError(null);
          }}
          placeholder="Paste a Google Sheets link"
          className="min-h-10 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
        />
        <button
          type="submit"
          disabled={submitting}
          className="min-h-10 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Importing..." : "Import from Google Sheets"}
        </button>
      </form>
      <p className="mt-2 text-xs text-slate-500">
        Use a Google Sheet that is shared with anyone who has the link.
      </p>
      {error ? (
        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-950">{error}</p>
      ) : null}
      {googleSheetsSource ? (
        <p className="mt-2 text-xs font-semibold text-emerald-700">
          Imported {googleSheetsSource.dataRows.length} row{googleSheetsSource.dataRows.length === 1 ? "" : "s"} from Google Sheets.
        </p>
      ) : null}
    </div>
  );
}

export type SourceSelectionStepProps = {
  selectedId: ImportSourceId | null;
  onSelect: (id: ImportSourceId) => void;
  /** Selected spreadsheet file for step 1 field mapping (in-memory only). */
  localCsvFile: File | null;
  onLocalCsvFileChange: (file: File | null) => void;
  googleSheetsSource: ImportWizardParsedSource | null;
  onGoogleSheetsSourceChange: (source: ImportWizardParsedSource | null) => void;
  canContinue: boolean;
  onContinue: () => void;
};

export function SourceSelectionStep({
  selectedId,
  onSelect,
  localCsvFile,
  onLocalCsvFileChange,
  googleSheetsSource,
  onGoogleSheetsSourceChange,
  canContinue,
  onContinue,
}: SourceSelectionStepProps) {
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const clearFile = useCallback(() => {
    onLocalCsvFileChange(null);
    const input = fileInputRef.current;
    if (input) input.value = "";
  }, [onLocalCsvFileChange]);

  const onFileInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] ?? null;
      onGoogleSheetsSourceChange(null);
      onLocalCsvFileChange(file);
    },
    [onGoogleSheetsSourceChange, onLocalCsvFileChange],
  );

  const onEmptyDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onEmptyDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const f = e.dataTransfer.files?.[0] ?? null;
      if (f) {
        onGoogleSheetsSourceChange(null);
        onLocalCsvFileChange(f);
      }
    },
    [onGoogleSheetsSourceChange, onLocalCsvFileChange],
  );

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div className="import-wizard-source-selection space-y-4" data-testid="import-wizard-source-selection">
      <div className="grid gap-3 sm:grid-cols-2">
        {IMPORT_SOURCE_OPTIONS.map((opt) => {
          const selected = selectedId === opt.id;
          const Icon = ICONS[opt.id];

          if (!opt.available) {
            return (
              <div
                key={opt.id}
                role="group"
                aria-disabled="true"
                data-testid={`import-wizard-source-card-${opt.id}`}
                data-selected="false"
                data-available="false"
                className="relative flex w-full flex-col gap-2 rounded-xl border border-slate-200 bg-white/60 p-3 text-left opacity-70 shadow-none"
              >
                <span className="absolute right-2.5 top-2.5 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Coming soon
                </span>
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-bold text-slate-600">{opt.title}</p>
                  <p className="text-xs leading-snug text-slate-500">{opt.description}</p>
                </div>
              </div>
            );
          }

          return (
            <button
              key={opt.id}
              type="button"
              data-testid={`import-wizard-source-card-${opt.id}`}
              data-selected={selected ? "true" : "false"}
              data-available="true"
              onClick={() => onSelect(opt.id)}
              className={`group relative flex w-full flex-col gap-3 rounded-2xl border p-4 text-left shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 ${
                selected
                  ? "border-accent bg-accentSoft ring-2 ring-accent"
                  : "border-border bg-card hover:border-slate-300 hover:bg-slate-50/80"
              }`}
            >
              {opt.recommended ? (
                <span className="absolute right-3 top-3 rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                  Recommended
                </span>
              ) : null}
              <div
                className={`inline-flex h-11 w-11 items-center justify-center rounded-xl text-white transition ${
                  selected ? "bg-accent" : "bg-slate-200 text-slate-600 group-hover:bg-slate-300"
                }`}
              >
                <Icon className={`h-6 w-6 ${selected ? "text-white" : ""}`} />
              </div>
              <div className="min-w-0 space-y-1">
                <p className="text-base font-bold text-slate-950">{opt.title}</p>
                <p className="text-sm leading-snug text-slate-600">{opt.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      {selectedId === "csv" ? (
        <div
          className={`rounded-2xl border-2 border-dashed px-4 py-6 transition sm:px-6 sm:py-8 ${
            localCsvFile
              ? "border-slate-300 bg-white"
              : "border-slate-300 bg-slate-50/80 text-center hover:border-accent/50 hover:bg-accentSoft/40"
          }`}
          data-testid="import-wizard-csv-dropzone"
        >
          <input
            ref={fileInputRef}
            id={fileInputId}
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/csv,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={onFileInputChange}
          />

          {!localCsvFile && !googleSheetsSource ? (
            <div
              data-testid="import-wizard-csv-empty-state"
              onDragOver={onEmptyDragOver}
              onDrop={onEmptyDrop}
              className="flex flex-col items-center"
            >
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white text-accent shadow-sm ring-1 ring-border">
                <IconCsv className="h-7 w-7" />
              </div>
              <p className="text-base font-semibold text-slate-900">Drop your lead data file here or click to browse</p>
              <p className="mt-1 text-sm text-slate-600">
                Supported formats: CSV, XLSX, XLS (max 50MB), and public Google Sheets links.
              </p>
              <div className="mt-5 flex flex-col items-center gap-2">
                <label
                  htmlFor={fileInputId}
                  className="inline-flex cursor-pointer items-center justify-center rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-600 hover:to-violet-700 focus-within:outline-none focus-within:ring-2 focus-within:ring-indigo-400"
                >
                  Choose file
                </label>
                <p className="text-xs text-slate-500">
                  Choose a lead data file to continue — field mapping uses your real headers.
                </p>
              </div>
              <GoogleSheetsLinkImport
                googleSheetsSource={googleSheetsSource}
                onGoogleSheetsSourceChange={onGoogleSheetsSourceChange}
                onLocalCsvFileChange={onLocalCsvFileChange}
              />
            </div>
          ) : googleSheetsSource ? (
            <GoogleSheetsSelectedSourcePanel
              source={googleSheetsSource}
              onRemove={() => onGoogleSheetsSourceChange(null)}
              canContinue={canContinue}
              onContinue={onContinue}
            />
          ) : localCsvFile ? (
            <SpreadsheetSelectedFilePanel
              file={localCsvFile}
              onReplace={openFilePicker}
              onRemove={clearFile}
              canContinue={canContinue}
              onContinue={onContinue}
            />
          ) : null}
        </div>
      ) : null}

    </div>
  );
}
