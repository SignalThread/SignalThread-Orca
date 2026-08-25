"use client";

import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { AlertCircle, X } from "lucide-react";
import {
  buildInitialMapping,
  buildMappedRows,
  FIELD_OPTIONS,
  type FieldSelection,
  type ParsedCsv,
  parseCsvText,
  validateMappings,
} from "./marketing-csv-utils";
import { marketingApi, type ImportRecipientsResult, type MarketingAudience } from "./marketing-shared";

type AudienceImportModalProps = {
  eventId: string;
  audiences: MarketingAudience[];
  defaultAudienceId?: string;
  onClose: () => void;
  onImported: (audienceId: string, result: ImportRecipientsResult) => Promise<void> | void;
};

export function AudienceImportModal({
  eventId,
  audiences,
  defaultAudienceId,
  onClose,
  onImported,
}: AudienceImportModalProps) {
  const [audienceId, setAudienceId] = useState<string>(defaultAudienceId ?? audiences[0]?.id ?? "__new__");
  const [newAudienceName, setNewAudienceName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [parsedCsv, setParsedCsv] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<Record<string, FieldSelection>>({});
  const [parseError, setParseError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const mappingErrors = useMemo(() => validateMappings(mapping), [mapping]);
  const mappedRows = useMemo(() => (parsedCsv ? buildMappedRows(parsedCsv, mapping) : []), [mapping, parsedCsv]);
  const creatingAudience = audienceId === "__new__";
  const hasExistingAudiences = audiences.length > 0;

  useEffect(() => {
    if (!file) return;
    let active = true;
    setParseError(null);
    setParsedCsv(null);
    void (async () => {
      try {
        const text = await file.text();
        const parsed = parseCsvText(text);
        if (!active) return;
        setParsedCsv(parsed);
        setMapping(buildInitialMapping(parsed.columns));
      } catch (error) {
        if (!active) return;
        setParseError(error instanceof Error ? error.message : "Failed to parse file.");
      }
    })();
    return () => {
      active = false;
    };
  }, [file]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
  }

  async function handleSubmit() {
    if (isSubmitting || !parsedCsv || mappingErrors.length > 0) return;
    if (creatingAudience && !newAudienceName.trim()) {
      setSubmitError("Name the new audience.");
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      let targetId = audienceId;
      if (creatingAudience) {
        const created = await marketingApi.createAudience(eventId, {
          name: newAudienceName.trim(),
          sourceLabel: file?.name ?? null,
        });
        targetId = created.id;
      }
      const result = await marketingApi.importRecipients(eventId, targetId, mappedRows);
      await onImported(targetId, result);
      onClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Failed to import recipients.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-[18px] font-semibold text-slate-900">Import audience</h2>
            <p className="mt-0.5 text-[13px] text-slate-500">
              Upload a CSV. Map columns to recipient fields, then import. Rows are de-duped by email.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-6 py-5">
          <div className="space-y-3">
            {hasExistingAudiences ? (
              <label className="block">
                <span className="text-[12px] font-semibold text-slate-700">Import destination</span>
                <select
                  value={audienceId}
                  onChange={(event) => setAudienceId(event.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-[14px] text-slate-800 outline-none focus:border-slate-300"
                >
                  {audiences.map((audience) => (
                    <option key={audience.id} value={audience.id}>
                      Add recipients to existing audience: {audience.name} ({audience.recipientCount})
                    </option>
                  ))}
                  <option value="__new__">Create new audience</option>
                </select>
              </label>
            ) : null}
            {creatingAudience ? (
              <label className="block">
                <span className="text-[12px] font-semibold text-slate-700">Audience name</span>
                <input
                  value={newAudienceName}
                  onChange={(event) => setNewAudienceName(event.target.value)}
                  placeholder="e.g. 2026 prospect list"
                  className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-[14px] text-slate-800 outline-none focus:border-slate-300"
                />
              </label>
            ) : (
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
                Add recipients to existing audience.
              </p>
            )}
          </div>

          <label className="block">
            <span className="text-[12px] font-semibold text-slate-700">CSV file</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="mt-1 block w-full text-[13px] text-slate-600 file:mr-3 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-3 file:py-2 file:text-[13px] file:font-semibold file:text-slate-700"
            />
          </label>

          {parseError ? (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] text-rose-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{parseError}</span>
            </div>
          ) : null}

          {parsedCsv ? (
            <div className="space-y-3">
              <div className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">
                Map columns · {mappedRows.length} rows
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-left text-[13px]">
                  <thead className="bg-slate-50/70 text-[10px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">CSV column</th>
                      <th className="px-3 py-2">Sample</th>
                      <th className="px-3 py-2">Maps to</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedCsv.columns.map((column) => (
                      <tr key={column.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-medium text-slate-800">{column.header}</td>
                        <td className="px-3 py-2 text-slate-500">{column.samples[0] ?? "—"}</td>
                        <td className="px-3 py-2">
                          <select
                            value={mapping[column.id] ?? ""}
                            onChange={(event) =>
                              setMapping((prev) => ({ ...prev, [column.id]: event.target.value as FieldSelection }))
                            }
                            className="h-9 w-full rounded-lg border border-slate-200 px-2 text-[13px] text-slate-800 outline-none focus:border-slate-300"
                          >
                            <option value="">— ignore —</option>
                            {FIELD_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                                {option.required ? " *" : ""}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {mappingErrors.length > 0 ? (
                <ul className="space-y-1 text-[12px] text-rose-600">
                  {mappingErrors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {submitError ? <div className="text-[13px] text-rose-600">{submitError}</div> : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center rounded-lg border border-slate-300 px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !parsedCsv || mappingErrors.length > 0}
            className="inline-flex h-10 items-center rounded-lg bg-[#28439A] px-4 text-[13px] font-semibold text-white hover:bg-[#243d8e] disabled:opacity-60"
          >
            {isSubmitting ? "Importing…" : "Import recipients"}
          </button>
        </div>
      </div>
    </div>
  );
}
