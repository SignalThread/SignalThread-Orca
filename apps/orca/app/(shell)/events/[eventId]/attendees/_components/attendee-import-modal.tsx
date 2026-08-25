"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { parseUploadedFile, type ImportMapping, type ParsedSheet } from "@/lib/import";
import {
  ATTENDEE_IMPORT_FIELD_SPECS,
  buildAttendeeDraftRows,
  buildAttendeeInitialMapping,
  parseAttendeeImportRow,
  type AttendeeImportField,
} from "@/lib/event-attendee-import";

type ImportCounts = { created: number; updated: number; conflicts: number; invalid: number; skipped: number };
type ResultRow = { rowNumber: number; name: string | null; email: string | null; company: string | null; result: string; reason?: string };

export function AttendeeImportModal({ eventId, onClose, onImported }: { eventId: string; onClose: () => void; onImported: () => void }) {
  const [sourceLabel, setSourceLabel] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<ImportMapping<AttendeeImportField>>({});
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
        setError("This workbook has multiple sheets. Export the attendee sheet as CSV or a single-sheet workbook and try again.");
        return;
      }
      const firstSheet = readableSheets[0] ?? null;
      if (!firstSheet) {
        setError("No readable columns were found in that file.");
        return;
      }
      setSheet(firstSheet);
      setMapping(buildAttendeeInitialMapping(firstSheet.columns));
    } catch {
      setError("We couldn't read that file. Upload a .csv or .xlsx and try again.");
    } finally {
      setIsParsing(false);
    }
  }

  const preview = useMemo(() => {
    if (!sheet) return { rows: [] as ReturnType<typeof parseAttendeeImportRow>[], total: 0, invalid: 0 };
    const { draftRows } = buildAttendeeDraftRows(sheet, mapping);
    const parsed = draftRows.map(parseAttendeeImportRow);
    return { rows: parsed.slice(0, 6), total: draftRows.length, invalid: parsed.filter((r) => r.result === "invalid").length };
  }, [sheet, mapping]);

  async function runImport() {
    if (!sheet) return;
    if (!sourceLabel.trim()) {
      setError("Add a source label so you can recognize this import later.");
      return;
    }
    setIsImporting(true);
    setError(null);
    const { draftRows, rowNumbers } = buildAttendeeDraftRows(sheet, mapping);
    try {
      const response = await fetch(`/api/events/${eventId}/attendees/imports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sourceLabel, rows: draftRows, rowNumbers }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Import failed");
      setCounts(payload.counts as ImportCounts);
      setResultRows((payload.rows as ResultRow[]) ?? []);
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-[16px] font-semibold text-slate-900">Import attendees</h2>
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
                <Count label="Conflicts" value={counts.conflicts} alert />
                <Count label="Invalid" value={counts.invalid} alert />
                <Count label="Skipped" value={counts.skipped} />
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[560px] text-left text-[12px]">
                  <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
                    <tr><th className="px-2 py-1.5">Row</th><th className="px-2 py-1.5">Name</th><th className="px-2 py-1.5">Email</th><th className="px-2 py-1.5">Company</th><th className="px-2 py-1.5">Result</th><th className="px-2 py-1.5">Reason</th></tr>
                  </thead>
                  <tbody>
                    {resultRows.map((r) => (
                      <tr key={r.rowNumber} className="border-t border-slate-100">
                        <td className="px-2 py-1.5 text-slate-400">{r.rowNumber}</td>
                        <td className="px-2 py-1.5 text-slate-700">{r.name ?? "—"}</td>
                        <td className="px-2 py-1.5 text-slate-600">{r.email ?? "—"}</td>
                        <td className="px-2 py-1.5 text-slate-600">{r.company ?? "—"}</td>
                        <td className="px-2 py-1.5 font-medium text-slate-700">{r.result.toLowerCase()}</td>
                        <td className="px-2 py-1.5 text-rose-600">{r.reason ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <>
              <label className="block">
                <span className="mb-1 block text-[13px] font-medium text-slate-700">Source label</span>
                <input value={sourceLabel} onChange={(e) => setSourceLabel(e.target.value)} placeholder="e.g. Bizzabo registrants, Expected attendees" className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-[13px] outline-none focus:border-slate-300" />
              </label>

              <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center hover:border-slate-400">
                <span className="text-[13px] font-medium text-slate-700">{isParsing ? "Reading file…" : fileName ?? "Upload an attendee CSV"}</span>
                <span className="text-[11px] text-slate-400">Name, email, company, registration status/type, ticket, external IDs are auto-detected</span>
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
                          <select value={mapping[column.id] ?? ""} onChange={(e) => setMapping((prev) => ({ ...prev, [column.id]: e.target.value as AttendeeImportField | "" }))} aria-label={`Map column ${column.header}`} className="h-8 flex-1 rounded-md border border-slate-200 px-1.5 text-[12px] text-slate-600">
                            <option value="">Do not import</option>
                            {ATTENDEE_IMPORT_FIELD_SPECS.map((spec) => (
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
                          {row.result === "ok" ? `${row.identity.displayName}${row.identity.email ? ` · ${row.identity.email}` : ""}${row.registration.registrationStatus ? ` · ${row.registration.registrationStatus.toLowerCase()}` : ""}` : `Row skipped: ${row.reason}`}
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
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50">{counts ? "Done" : "Cancel"}</button>
          {!counts ? (
            <button type="button" onClick={() => void runImport()} disabled={!sheet || isParsing || isImporting || !sourceLabel.trim()} className="h-9 rounded-lg bg-[#28439A] px-3 text-[13px] font-semibold text-white hover:bg-[#243d8e] disabled:opacity-50">
              {isImporting ? "Importing…" : "Import attendees"}
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
