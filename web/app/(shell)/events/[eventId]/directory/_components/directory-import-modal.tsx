"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { parseUploadedFile, type ImportMapping, type ParsedSheet } from "@/lib/import";
import {
  buildDirectoryDraftRows,
  buildDirectoryInitialMapping,
  DIRECTORY_IMPORT_FIELD_SPECS,
  parseDirectoryImportRow,
  type DirectoryImportField,
} from "@/lib/event-directory-import";
import { DIRECTORY_ROLE_OPTIONS, type DirectoryRole } from "./directory-constants";

type ImportCounts = { created: number; updated: number; duplicateReview: number; invalid: number; skipped: number };
type ResultRow = {
  rowNumber: number;
  rawName: string | null;
  rawEmail: string | null;
  rawCompany: string | null;
  result: string;
  errorMessage: string | null;
};

const CONTACT_ROLES: DirectoryRole[] = ["PROSPECT"];

export function DirectoryImportModal({
  eventId,
  onClose,
  onImported,
}: {
  eventId: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const [sourceLabel, setSourceLabel] = useState("");
  const [targetRole, setTargetRole] = useState<DirectoryRole>("ATTENDEE");
  const [fileName, setFileName] = useState<string | null>(null);
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<ImportMapping<DirectoryImportField>>({});
  const [error, setError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [counts, setCounts] = useState<ImportCounts | null>(null);
  const [resultRows, setResultRows] = useState<ResultRow[]>([]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setError(null);
    setSheet(null);
    setMapping({});
    setIsParsing(true);
    try {
      const workbook = await parseUploadedFile(file);
      const readableSheets = workbook.sheets.filter((candidate) => candidate.columns.length > 0);
      if (readableSheets.length > 1) {
        setError("This workbook has multiple sheets. Export the directory sheet as CSV or a single-sheet workbook and try again.");
        return;
      }
      const firstSheet = readableSheets[0] ?? null;
      if (!firstSheet) {
        setError("No readable columns were found in that file.");
        return;
      }
      setSheet(firstSheet);
      setMapping(buildDirectoryInitialMapping(firstSheet.columns));
    } catch {
      setError("We couldn't read that file. Upload a .csv or .xlsx and try again.");
    } finally {
      setIsParsing(false);
    }
  }

  const preview = useMemo(() => {
    if (!sheet) return { rows: [] as ReturnType<typeof parseDirectoryImportRow>[], total: 0, invalid: 0 };
    const { draftRows } = buildDirectoryDraftRows(sheet, mapping);
    const parsed = draftRows.map(parseDirectoryImportRow);
    return {
      rows: parsed.slice(0, 6),
      total: draftRows.length,
      invalid: parsed.filter((r) => r.result === "invalid").length,
    };
  }, [sheet, mapping]);

  async function runImport() {
    if (!sheet) return;
    if (!sourceLabel.trim()) {
      setError("Add a source label so you can recognize this import later.");
      return;
    }
    setIsImporting(true);
    setError(null);
    const { draftRows, rowNumbers } = buildDirectoryDraftRows(sheet, mapping);
    try {
      const response = await fetch(`/api/events/${eventId}/directory/imports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sourceLabel, targetRole, sourceType: "CSV_IMPORT", fileName, rows: draftRows, rowNumbers }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Import failed");
      setCounts(payload.counts as ImportCounts);
      const rowsRes = await fetch(`/api/events/${eventId}/directory/imports/${payload.batchId}/rows`, { credentials: "include" });
      const rowsPayload = await rowsRes.json().catch(() => null);
      if (rowsRes.ok) setResultRows((rowsPayload.rows as ResultRow[]) ?? []);
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setIsImporting(false);
    }
  }

  const isContactRole = CONTACT_ROLES.includes(targetRole);
  const peopleNoun = isContactRole ? "contacts" : targetRole === "ATTENDEE" ? "attendees" : "people";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-[16px] font-semibold text-slate-900">Import people</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700" role="alert">{error}</p> : null}

          {counts ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <Count label="Created" value={counts.created} />
                <Count label="Updated" value={counts.updated} />
                <Count label="Duplicate review" value={counts.duplicateReview} alert />
                <Count label="Invalid" value={counts.invalid} alert />
                <Count label="Skipped" value={counts.skipped} />
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[560px] text-left text-[12px]">
                  <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
                    <tr>
                      <th className="px-2 py-1.5">Row</th><th className="px-2 py-1.5">Name</th><th className="px-2 py-1.5">Email</th>
                      <th className="px-2 py-1.5">Company</th><th className="px-2 py-1.5">Result</th><th className="px-2 py-1.5">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultRows.map((r) => (
                      <tr key={r.rowNumber} className="border-t border-slate-100">
                        <td className="px-2 py-1.5 text-slate-400">{r.rowNumber}</td>
                        <td className="px-2 py-1.5 text-slate-700">{r.rawName ?? "—"}</td>
                        <td className="px-2 py-1.5 text-slate-600">{r.rawEmail ?? "—"}</td>
                        <td className="px-2 py-1.5 text-slate-600">{r.rawCompany ?? "—"}</td>
                        <td className="px-2 py-1.5 font-medium text-slate-700">{r.result.replace(/_/g, " ").toLowerCase()}</td>
                        <td className="px-2 py-1.5 text-rose-600">{r.errorMessage ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-[13px] font-medium text-slate-700">Source label</span>
                  <input value={sourceLabel} onChange={(e) => setSourceLabel(e.target.value)} placeholder="e.g. Initial attendee upload" className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-[13px] outline-none focus:border-slate-300" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[13px] font-medium text-slate-700">These people are</span>
                  <select value={targetRole} onChange={(e) => setTargetRole(e.target.value as DirectoryRole)} className="h-9 w-full rounded-lg border border-slate-200 px-2 text-[13px] text-slate-700">
                    {DIRECTORY_ROLE_OPTIONS.map((role) => (
                      <option key={role.value} value={role.value}>{role.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              {isContactRole ? (
                <p className="text-[12px] text-slate-500">These will be imported as {peopleNoun}, not attendees.</p>
              ) : null}

              <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center hover:border-slate-400">
                <span className="text-[13px] font-medium text-slate-700">{isParsing ? "Reading file…" : fileName ?? "Upload a CSV of people"}</span>
                <span className="text-[11px] text-slate-400">Columns like name, email, company, title are auto-detected</span>
                <input type="file" accept=".csv,.xlsx,.xls" className="sr-only" disabled={isParsing || isImporting} onChange={(e) => void handleFile(e.target.files?.[0])} />
              </label>

              {sheet ? (
                <>
                  <div>
                    <p className="mb-1 text-[13px] font-medium text-slate-700">Map columns</p>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {sheet.columns.map((column) => (
                        <div key={column.id} className="flex items-center gap-2">
                          <span className="w-1/2 truncate text-[12px] text-slate-500" title={column.header}>{column.header}</span>
                          <select
                            value={mapping[column.id] ?? ""}
                            onChange={(e) => setMapping((prev) => ({ ...prev, [column.id]: e.target.value as DirectoryImportField | "" }))}
                            aria-label={`Map column ${column.header}`}
                            className="h-8 flex-1 rounded-md border border-slate-200 px-1.5 text-[12px] text-slate-600"
                          >
                            <option value="">Do not import</option>
                            {DIRECTORY_IMPORT_FIELD_SPECS.map((spec) => (
                              <option key={spec.field} value={spec.field}>{spec.label}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-[12px] text-slate-600">
                    <p className="font-medium text-slate-700">Preview ({preview.total} rows{preview.invalid > 0 ? `, ${preview.invalid} missing identity` : ""})</p>
                    <ul className="mt-1 space-y-0.5">
                      {preview.rows.map((row, i) => (
                        <li key={i} className={row.result === "invalid" ? "text-rose-600" : ""}>
                          {row.result === "ok" ? `${row.parsed.displayName}${row.parsed.email ? ` · ${row.parsed.email}` : ""}` : `Row skipped: ${row.reason}`}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : null}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50">
            {counts ? "Done" : "Cancel"}
          </button>
          {!counts ? (
            <button type="button" onClick={() => void runImport()} disabled={!sheet || isParsing || isImporting || !sourceLabel.trim()} className="h-9 rounded-lg bg-[#28439A] px-3 text-[13px] font-semibold text-white hover:bg-[#243d8e] disabled:opacity-50">
              {isImporting ? "Importing…" : `Import ${peopleNoun}`}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Count({ label, value, alert }: { label: string; value: number; alert?: boolean }) {
  return (
    <div className={`rounded-lg border p-2 ${alert && value > 0 ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
      <p className="text-[10px] font-medium text-slate-500">{label}</p>
      <p className={`text-[18px] font-semibold ${alert && value > 0 ? "text-amber-700" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}
