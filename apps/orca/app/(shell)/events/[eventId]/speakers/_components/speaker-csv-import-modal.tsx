"use client";

import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import {
  buildInitialMapping,
  buildMappedRows,
  FIELD_OPTIONS,
  type FieldSelection,
  type ParsedCsv,
  parseCsvText,
  validateMappings,
} from "./speaker-csv-import-utils";
import { STATUS_OPTIONS, statusLabel } from "./speaker-profile-shared";

export type SpeakerCsvImportSummary = {
  imported: number;
  skipped: number;
  duplicates: number;
  failed: number;
  errors?: Array<{
    row: number;
    message: string;
  }>;
};

type SpeakerCsvImportModalProps = {
  eventId: string;
  file: File;
  onClose: () => void;
  onImported: (summary: SpeakerCsvImportSummary) => Promise<void>;
};

function toErrorMessage(payload: unknown, fallback: string): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }

  if (
    typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof payload.message === "string"
  ) {
    return payload.message;
  }

  return fallback;
}

export function SpeakerCsvImportModal({ eventId, file, onClose, onImported }: SpeakerCsvImportModalProps) {
  const [parsedCsv, setParsedCsv] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<Record<string, FieldSelection>>({});
  const [parseError, setParseError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const mappingErrors = useMemo(() => validateMappings(mapping), [mapping]);
  const mappedRows = useMemo(() => (parsedCsv ? buildMappedRows(parsedCsv, mapping) : []), [mapping, parsedCsv]);
  const emailMapped = Object.values(mapping).includes("email");

  useEffect(() => {
    let isActive = true;

    async function parseFile() {
      setIsParsing(true);
      setParseError(null);
      setImportError(null);
      setParsedCsv(null);

      try {
        const text = await file.text();
        const nextParsedCsv = parseCsvText(text);
        if (!isActive) return;
        setParsedCsv(nextParsedCsv);
        setMapping(buildInitialMapping(nextParsedCsv.columns));
      } catch (error) {
        if (!isActive) return;
        setParseError(error instanceof Error ? error.message : "Failed to parse CSV.");
      } finally {
        if (isActive) {
          setIsParsing(false);
        }
      }
    }

    void parseFile();

    return () => {
      isActive = false;
    };
  }, [file]);

  async function handleImport() {
    if (!parsedCsv || mappingErrors.length > 0 || isImporting) return;

    setIsImporting(true);
    setImportError(null);

    try {
      const response = await fetch(`/api/events/${eventId}/speakers/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: mappedRows }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to import CSV"));
      }

      await onImported(payload as SpeakerCsvImportSummary);
      onClose();
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Failed to import CSV.");
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h4 className="text-[18px] font-semibold text-slate-900">Import Speakers from CSV</h4>
            <p className="mt-1 text-[13px] text-slate-500">{file.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isImporting}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
            aria-label="Close CSV import"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {!parsedCsv ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-[14px] text-slate-700">
                {isParsing ? "Parsing CSV columns and sample values..." : "CSV could not be parsed."}
              </p>
              {parseError ? (
                <p className="mt-3 flex items-center gap-2 text-[13px] text-rose-600">
                  <AlertCircle className="h-4 w-4" />
                  {parseError}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              {parsedCsv.warnings.map((warning) => (
                <p key={warning} className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
                  <AlertCircle className="h-4 w-4" />
                  {warning}
                </p>
              ))}

              {!emailMapped ? (
                <p className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[13px] text-blue-800">
                  <AlertCircle className="h-4 w-4" />
                  Email is strongly recommended for safer duplicate detection.
                </p>
              ) : null}

              {mappingErrors.length > 0 ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
                  {mappingErrors.map((error) => (
                    <p key={error}>{error}</p>
                  ))}
                </div>
              ) : (
                <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  Required mappings are ready. {mappedRows.length} non-empty rows will be validated during import.
                </p>
              )}

              {importError ? <p className="text-[13px] text-rose-600">{importError}</p> : null}

              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full min-w-[840px]">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left">
                      <th className="px-4 py-3 text-[10px] uppercase tracking-wide text-slate-500">CSV Column</th>
                      <th className="px-4 py-3 text-[10px] uppercase tracking-wide text-slate-500">Sample Values</th>
                      <th className="px-4 py-3 text-[10px] uppercase tracking-wide text-slate-500">Mapped Field</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedCsv.columns.map((column) => (
                      <tr key={column.id} className="border-b border-slate-100 last:border-b-0">
                        <td className="px-4 py-3 align-top">
                          <p className="text-[13px] font-semibold text-slate-900">{column.header}</p>
                          {column.duplicateHeader ? <p className="mt-1 text-[12px] text-amber-700">Duplicate header</p> : null}
                        </td>
                        <td className="px-4 py-3 align-top">
                          {column.samples.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {column.samples.map((sample, index) => (
                                <span key={`${column.id}:${index}`} className="rounded-md bg-slate-100 px-2 py-1 text-[12px] text-slate-700">
                                  {sample}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[12px] text-slate-400">No non-empty samples</span>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <select
                            value={mapping[column.id] ?? ""}
                            onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                              setMapping((current) => ({ ...current, [column.id]: event.target.value as FieldSelection }))
                            }
                            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] text-slate-800 outline-none focus:border-slate-300"
                          >
                            <option value="">Do not import</option>
                            {FIELD_OPTIONS.map((field) => (
                              <option key={field.value} value={field.value}>
                                {field.label}
                                {field.required ? " (required)" : ""}
                                {field.recommended ? " (recommended)" : ""}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">Status Values</p>
                <p className="mt-1 text-[13px] text-slate-600">
                  Blank status becomes {statusLabel("NEEDS_INFO")}. Accepted values: {STATUS_OPTIONS.map(statusLabel).join(", ")}.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-6 py-4">
          <p className="text-[12px] text-slate-500">
            {parsedCsv ? `${parsedCsv.columns.length} columns detected` : "No rows will be imported until mappings are confirmed."}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isImporting}
              className="inline-flex h-10 items-center rounded-lg border border-slate-300 px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Cancel
            </button>
            {parsedCsv ? (
              <button
                type="button"
                onClick={() => {
                  void handleImport();
                }}
                disabled={isImporting || mappingErrors.length > 0}
                className="inline-flex h-10 items-center rounded-lg bg-[#28439A] px-3 text-[13px] font-semibold text-white hover:bg-[#243d8e] disabled:opacity-60"
              >
                {isImporting ? "Importing..." : "Import Speakers"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
