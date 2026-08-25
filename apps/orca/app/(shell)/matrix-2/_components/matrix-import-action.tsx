"use client";

import { Download, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useEventTerminology } from "@/components/event-terminology-context";
import { SectionImportModalShell } from "../../_components/section-import-modal-shell";
import {
  buildMatrixImportSuccessOutcome,
  buildMatrixImportTemplateCsv,
  validateMatrixImportRows,
  type MatrixImportDraftRow,
  type MatrixImportSuccessOutcome,
  type MatrixImportValidatedRow,
} from "@/lib/matrix-import";
import {
  MATRIX_IMPORT_FIELD_SPECS,
  buildMatrixDraftRows,
  buildMatrixInitialMapping,
  detectActionColumns,
  detectCapacityColumns,
  detectConflictColumns,
  detectDayColumns,
  validateMatrixMapping,
  type MatrixImportField,
} from "@/lib/matrix-import-mapping";
import {
  parseUploadedFile,
  type ImportColumn,
  type ImportMapping,
  type ParsedSheet,
  type ParsedWorkbook,
} from "@/lib/import";

type MatrixImportSummary = {
  importedCount: number;
  validCount: number;
  invalidCount: number;
  blankCount: number;
  duplicateCount: number;
  replayed: boolean;
};

type MatrixImportTriggerRenderProps = {
  open: () => void;
  disabled: boolean;
  isImporting: boolean;
};

type MatrixImportActionProps = {
  eventId: string;
  disabled?: boolean;
  onImported?: (outcome: MatrixImportSuccessOutcome) => void | Promise<void>;
  onError?: (message: string) => void;
  trigger: (props: MatrixImportTriggerRenderProps) => ReactNode;
};

const MATRIX_IMPORT_ACCEPT =
  ".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel";

const MATRIX_IMPORT_PREVIEW_PAGE_SIZE = 15;

const MATRIX_IMPORT_FIELD_OPTIONS: { value: MatrixImportField | ""; label: string }[] = [
  { value: "", label: "Do not import" },
  ...MATRIX_IMPORT_FIELD_SPECS.map((spec) => ({
    value: spec.field,
    label: spec.required ? `${spec.label} (required)` : spec.label,
  })),
];

function toErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string") {
    return payload.error;
  }
  if (typeof payload === "object" && payload !== null && "message" in payload && typeof payload.message === "string") {
    return payload.message;
  }
  return fallback;
}

export function downloadMatrixImportTemplate() {
  const csv = buildMatrixImportTemplateCsv();
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "run-of-show-import-template.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function MatrixImportAction({
  eventId,
  disabled = false,
  onImported,
  onError,
  trigger,
}: MatrixImportActionProps) {
  const terminology = useEventTerminology();
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importHeaderError, setImportHeaderError] = useState<string | null>(null);
  const [importDraftRows, setImportDraftRows] = useState<MatrixImportDraftRow[]>([]);
  const [importRowNumbers, setImportRowNumbers] = useState<number[]>([]);
  const [importPreviewRows, setImportPreviewRows] = useState<MatrixImportValidatedRow[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importPreviewPage, setImportPreviewPage] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [importWorkbook, setImportWorkbook] = useState<ParsedWorkbook | null>(null);
  const [importSheetName, setImportSheetName] = useState<string | null>(null);
  const [importMapping, setImportMapping] = useState<ImportMapping<MatrixImportField>>({});
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const importIdempotencyKeyRef = useRef<string | null>(null);

  const importSheet = useMemo<ParsedSheet | null>(() => {
    if (!importWorkbook || !importSheetName) return null;
    return importWorkbook.sheets.find((sheet) => sheet.name === importSheetName) ?? null;
  }, [importWorkbook, importSheetName]);

  const importNeedsSheetPick = Boolean(
    importWorkbook && importWorkbook.sheetNames.length > 1 && !importSheetName,
  );

  const importMappingErrors = useMemo(
    () => (importSheet ? validateMatrixMapping(importMapping) : []),
    [importSheet, importMapping],
  );

  const importRowsForPreview = useMemo(
    () => importPreviewRows.filter((row) => !row.isBlank),
    [importPreviewRows],
  );
  const validImportRows = useMemo(
    () => importRowsForPreview.filter((row) => row.isValid && row.normalized).map((row) => row.raw),
    [importRowsForPreview],
  );
  const invalidImportRows = useMemo(
    () => importRowsForPreview.filter((row) => !row.isValid),
    [importRowsForPreview],
  );

  const capacityDetected = useMemo(
    () => Boolean(importSheet && detectCapacityColumns(importSheet.columns).length > 0),
    [importSheet],
  );
  const capacityMapped = useMemo(() => Object.values(importMapping).includes("attendance"), [importMapping]);
  const ignoredColumnLabels = useMemo(() => {
    if (!importSheet) return [] as string[];
    const labels: string[] = [];
    if (detectDayColumns(importSheet.columns).length > 0) labels.push("Day");
    if (detectConflictColumns(importSheet.columns).length > 0) labels.push("Conflicts");
    if (detectActionColumns(importSheet.columns).length > 0) labels.push("Actions");
    return labels;
  }, [importSheet]);

  const hasImportFileSelection = Boolean(importWorkbook || importFileName || importHeaderError);

  useEffect(() => {
    setImportPreviewPage(0);
  }, [importPreviewRows]);

  const importPreviewTotalRows = importRowsForPreview.length;
  const importPreviewLastPage = Math.max(0, Math.ceil(importPreviewTotalRows / MATRIX_IMPORT_PREVIEW_PAGE_SIZE) - 1);
  const importPreviewPageIndex = Math.min(importPreviewPage, importPreviewLastPage);
  const importPreviewRangeStart = importPreviewTotalRows === 0 ? 0 : importPreviewPageIndex * MATRIX_IMPORT_PREVIEW_PAGE_SIZE + 1;
  const importPreviewRangeEnd =
    importPreviewTotalRows === 0 ? 0 : Math.min(importPreviewTotalRows, (importPreviewPageIndex + 1) * MATRIX_IMPORT_PREVIEW_PAGE_SIZE);
  const importRowsForPreviewPage = importRowsForPreview.slice(
    importPreviewPageIndex * MATRIX_IMPORT_PREVIEW_PAGE_SIZE,
    importPreviewPageIndex * MATRIX_IMPORT_PREVIEW_PAGE_SIZE + MATRIX_IMPORT_PREVIEW_PAGE_SIZE,
  );

  function resetImportState() {
    importIdempotencyKeyRef.current = null;
    setImportHeaderError(null);
    setImportDraftRows([]);
    setImportRowNumbers([]);
    setImportPreviewRows([]);
    setImportPreviewPage(0);
    setImportFileName("");
    setImportWorkbook(null);
    setImportSheetName(null);
    setImportMapping({});
    if (importFileInputRef.current) {
      importFileInputRef.current.value = "";
    }
  }

  function openImportModal() {
    if (disabled || !eventId) return;
    resetImportState();
    setIsImportModalOpen(true);
  }

  function applyMatrixMapping(sheet: ParsedSheet, mapping: ImportMapping<MatrixImportField>) {
    const { draftRows, rowNumbers } = buildMatrixDraftRows(sheet, mapping);
    const validation = validateMatrixImportRows(draftRows, { rowNumbers });
    setImportDraftRows(draftRows);
    setImportRowNumbers(rowNumbers);
    setImportPreviewRows(validation.rows);
  }

  function handleSelectImportSheet(sheetName: string) {
    if (!importWorkbook) return;
    const sheet = importWorkbook.sheets.find((candidate) => candidate.name === sheetName);
    if (!sheet) return;

    setImportSheetName(sheetName);
    setImportHeaderError(sheet.columns.length === 0 ? "Selected sheet has no columns to map." : null);

    const mapping = buildMatrixInitialMapping(sheet.columns);
    setImportMapping(mapping);
    applyMatrixMapping(sheet, mapping);
  }

  function handleMappingChange(columnId: string, field: MatrixImportField | "") {
    if (!importSheet) return;
    const nextMapping = { ...importMapping, [columnId]: field };
    setImportMapping(nextMapping);
    applyMatrixMapping(importSheet, nextMapping);
  }

  async function handleImportFileSelected(file: File) {
    setImportFileName(file.name);
    setImportHeaderError(null);
    setImportWorkbook(null);
    setImportSheetName(null);
    setImportMapping({});
    setImportDraftRows([]);
    setImportRowNumbers([]);
    setImportPreviewRows([]);

    try {
      const workbook = await parseUploadedFile(file);
      const usableSheets = workbook.sheets.filter((sheet) => sheet.columns.length > 0);

      if (usableSheets.length === 0) {
        setImportHeaderError("No readable rows found. Add a header row and data, then try again.");
        return;
      }

      setImportWorkbook(workbook);

      if (workbook.sheetNames.length === 1 || usableSheets.length === 1) {
        const sheet = usableSheets[0]!;
        setImportSheetName(sheet.name);
        const mapping = buildMatrixInitialMapping(sheet.columns);
        setImportMapping(mapping);
        applyMatrixMapping(sheet, mapping);
      }
    } catch (error) {
      setImportHeaderError(error instanceof Error ? error.message : "Failed to read import file");
      setImportWorkbook(null);
    }
  }

  async function handleImportMatrixRows() {
    if (!eventId) return;
    if (importMappingErrors.length > 0) {
      onError?.("Finish mapping required columns before importing.");
      return;
    }
    if (validImportRows.length === 0) {
      onError?.("No valid rows available to import.");
      return;
    }

    setIsImporting(true);
    onError?.("");

    try {
      const idempotencyKey = importIdempotencyKeyRef.current ?? crypto.randomUUID();
      importIdempotencyKeyRef.current = idempotencyKey;
      const response = await fetch(`/api/events/${eventId}/matrix-rows/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: importDraftRows, rowNumbers: importRowNumbers, idempotencyKey }),
      });

      const payload = (await response.json()) as MatrixImportSummary | { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, `Failed to import ${terminology.runOfShow} rows`));
      }

      const importedCount = "importedCount" in payload ? payload.importedCount : validImportRows.length;
      const skippedCount = invalidImportRows.length + ("duplicateCount" in payload ? payload.duplicateCount : 0);
      const hasOtherSheets =
        (importWorkbook?.sheets.filter((sheet) => sheet.columns.length > 0).length ?? 0) > 1;
      const outcome = buildMatrixImportSuccessOutcome({ importedCount, skippedCount, hasOtherSheets });

      await onImported?.(outcome);

      if (outcome.closeModal) {
        setIsImportModalOpen(false);
        resetImportState();
      }
    } catch (error) {
      onError?.(error instanceof Error ? error.message : `Failed to import ${terminology.runOfShow} rows`);
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <>
      {trigger({ open: openImportModal, disabled: disabled || !eventId, isImporting })}

      {isImportModalOpen && (
        <SectionImportModalShell
          title="Import Run of Show"
          description="Upload CSV or Excel (.csv, .xlsx, .xls). Headers don't need to match exactly — pick a sheet, map your columns, and preview before importing."
          detail="Supplies and Signage become reusable first-class session requirements. Speakers, Staffing, F&B, and Status remain session notes text. Conflicts are calculated by the app; no speaker, staff, AV, F&B, room, or seating records are created."
          compact={!hasImportFileSelection}
          footer={
            <>
              <button
                type="button"
                className="inline-flex h-10 items-center rounded-lg border border-slate-300 px-4 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                onClick={() => {
                  if (isImporting) return;
                  setIsImportModalOpen(false);
                  resetImportState();
                }}
                disabled={isImporting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex h-10 items-center rounded-lg bg-[#28439A] px-4 text-[13px] font-semibold text-white hover:bg-[#243d8e] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:hover:bg-slate-200"
                onClick={() => void handleImportMatrixRows()}
                disabled={isImporting || validImportRows.length === 0 || importMappingErrors.length > 0}
              >
                {isImporting ? "Importing..." : `Import ${validImportRows.length} row${validImportRows.length === 1 ? "" : "s"}`}
              </button>
            </>
          }
        >
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="inline-flex h-10 items-center rounded-lg border border-slate-300 px-4 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
              onClick={downloadMatrixImportTemplate}
            >
              <Download className="mr-2 h-4 w-4" />
              Download Template (optional)
            </button>
            <label className="inline-flex cursor-pointer items-center rounded-lg bg-[#28439A] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#243d8e]">
              <Upload className="mr-2 h-4 w-4" />
              Choose File
              <input
                ref={importFileInputRef}
                type="file"
                accept={MATRIX_IMPORT_ACCEPT}
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  void handleImportFileSelected(file);
                }}
              />
            </label>
            {importFileName ? <span className="text-[13px] text-slate-600">{importFileName}</span> : null}
          </div>

          {!hasImportFileSelection ? (
            <p className="mt-3 text-[13px] text-slate-500">
              Upload your {terminology.runOfShow} file when you&apos;re ready. We&apos;ll show sheet selection, mapping, validation, and the preview after the file is loaded.
            </p>
          ) : (
            <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4">
              {importHeaderError && (
                <div className="shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
                  {importHeaderError}
                </div>
              )}

              {importWorkbook && importWorkbook.sheetNames.length > 1 && (
                <div className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-[12px] font-semibold text-slate-700">
                    This workbook has {importWorkbook.sheetNames.length} sheets. Choose the one to import:
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Only the selected sheet will be imported. Run a separate import for another sheet.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {importWorkbook.sheets.map((sheet) => {
                      const isSelected = sheet.name === importSheetName;
                      const sheetDisabled = sheet.columns.length === 0;
                      return (
                        <button
                          key={sheet.name}
                          type="button"
                          disabled={sheetDisabled}
                          onClick={() => handleSelectImportSheet(sheet.name)}
                          className={`flex flex-col items-start rounded-lg border px-3 py-2 text-left text-[12px] transition ${
                            isSelected
                              ? "border-[#28439A] bg-white shadow-sm"
                              : "border-slate-300 bg-white hover:bg-slate-50"
                          } ${sheetDisabled ? "cursor-not-allowed opacity-50" : ""}`}
                        >
                          <span className="font-semibold text-slate-800">{sheet.name}</span>
                          <span className="text-[11px] text-slate-500">
                            {sheetDisabled ? "No columns" : `${sheet.rowCount} row${sheet.rowCount === 1 ? "" : "s"}`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {importSheet && (
                <div className="shrink-0 rounded-xl border border-slate-200">
                  <div className="border-b border-slate-200 bg-slate-50 px-4 py-2">
                    <p className="text-[12px] font-semibold text-slate-700">
                      Map columns from &quot;{importSheet.name}&quot; to {terminology.runOfShow} fields
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Session, Date, Start Time, and End Time are required. Speakers, Staffing, F&amp;B, and Status are
                      stored as session notes text — no related records are created.
                    </p>
                  </div>
                  <div className="max-h-48 overflow-auto px-4 py-3">
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {importSheet.columns.map((column: ImportColumn) => (
                        <div key={column.id} className="rounded-lg border border-slate-200 px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-[12px] font-medium text-slate-800" title={column.header}>
                              {column.header}
                            </span>
                            {column.duplicateHeader && (
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                                dup
                              </span>
                            )}
                          </div>
                          {column.samples.length > 0 && (
                            <p className="mt-0.5 truncate text-[11px] text-slate-400" title={column.samples.join(", ")}>
                              e.g. {column.samples.slice(0, 3).join(", ")}
                            </p>
                          )}
                          <select
                            value={importMapping[column.id] ?? ""}
                            onChange={(event) =>
                              handleMappingChange(column.id, event.target.value as MatrixImportField | "")
                            }
                            className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-[12px] text-slate-700"
                          >
                            {MATRIX_IMPORT_FIELD_OPTIONS.map((option) => (
                              <option key={option.value || "none"} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                  {importMappingErrors.length > 0 && (
                    <div className="border-t border-rose-200 bg-rose-50 px-4 py-2 text-[12px] text-rose-700">
                      {importMappingErrors.join(" ")}
                    </div>
                  )}
                </div>
              )}

              {importNeedsSheetPick && (
                <div className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-6 text-center text-[13px] text-slate-500">
                  Select a sheet above to map columns and preview rows.
                </div>
              )}

              {importSheet ? (
                <>
                  <div className="shrink-0 grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-slate-500">Parsed rows</p>
                      <p className="text-[18px] font-semibold text-slate-900">{importRowsForPreview.length}</p>
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-emerald-700">Valid rows</p>
                      <p className="text-[18px] font-semibold text-emerald-800">{validImportRows.length}</p>
                    </div>
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-rose-700">Invalid rows</p>
                      <p className="text-[18px] font-semibold text-rose-700">{invalidImportRows.length}</p>
                    </div>
                  </div>

                  {(capacityDetected || ignoredColumnLabels.length > 0) && (
                    <div className="shrink-0 space-y-2">
                      {capacityDetected && !capacityMapped && (
                        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[12px] text-sky-800">
                          A Capacity column was found. It is treated as room capacity and isn&apos;t imported. Map it to
                          Attendance only if you want it stored as expected attendance.
                        </div>
                      )}
                      {ignoredColumnLabels.length > 0 && (
                        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[12px] text-sky-800">
                          {ignoredColumnLabels.join(", ")} {ignoredColumnLabels.length === 1 ? "is" : "are"} not imported —
                          Day is derived from Date, and Conflicts are calculated by the app.
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex max-h-[26rem] min-h-[18rem] flex-col overflow-hidden rounded-xl border border-slate-200">
                    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-[12px] font-medium text-slate-700">
                        {importPreviewTotalRows === 0
                          ? "Rows 0 of 0"
                          : `Rows ${importPreviewRangeStart}-${importPreviewRangeEnd} of ${importPreviewTotalRows}`}
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={importPreviewPageIndex <= 0}
                          onClick={() => setImportPreviewPage(importPreviewPageIndex - 1)}
                        >
                          Previous
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={importPreviewPageIndex >= importPreviewLastPage}
                          onClick={() => setImportPreviewPage(importPreviewPageIndex + 1)}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-auto">
                      <table className="w-full min-w-[1100px] border-separate border-spacing-0">
                        <thead className="sticky top-0 z-10">
                          <tr className="border-b border-slate-200 bg-slate-50 text-left shadow-[0_1px_0_0_rgb(226_232_240)]">
                            <th className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500">Row</th>
                            <th className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500">Session</th>
                            <th className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500">Date</th>
                            <th className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500">Time</th>
                            <th className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500">Room</th>
                            <th className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500">Speakers</th>
                            <th className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500">AV</th>
                            <th className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500">F&amp;B</th>
                            <th className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500">Staff</th>
                            <th className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500">Attendance</th>
                            <th className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500">Row status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importRowsForPreviewPage.map((row) => (
                            <tr
                              key={`${row.rowNumber}-${row.raw.title}`}
                              className="border-b border-slate-100 last:border-b-0"
                            >
                              <td className="px-3 py-2 text-[12px] text-slate-600">{row.rowNumber}</td>
                              <td className="px-3 py-2 text-[12px] text-slate-700">{row.raw.title || "-"}</td>
                              <td className="px-3 py-2 text-[12px] text-slate-700">{row.normalized?.dayDateIso || row.raw.date || "-"}</td>
                              <td className="px-3 py-2 text-[12px] text-slate-700">
                                {row.normalized
                                  ? `${row.normalized.startTime}-${row.normalized.endTime}`
                                  : [row.raw.startTime, row.raw.endTime].filter(Boolean).join("-") || "-"}
                              </td>
                              <td className="px-3 py-2 text-[12px] text-slate-700">{row.raw.room || "-"}</td>
                              <td className="px-3 py-2 text-[12px] text-slate-700">{row.raw.speakers || "-"}</td>
                              <td className="px-3 py-2 text-[12px] text-slate-700">{row.raw.av || "-"}</td>
                              <td className="px-3 py-2 text-[12px] text-slate-700">{row.raw.fnb || "-"}</td>
                              <td className="px-3 py-2 text-[12px] text-slate-700">{row.raw.staff || "-"}</td>
                              <td className="px-3 py-2 text-[12px] text-slate-700">{row.raw.attendance || "-"}</td>
                              <td className="px-3 py-2 text-[12px]">
                                {row.isValid ? (
                                  <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                                    Valid
                                  </span>
                                ) : (
                                  <span className="rounded-full bg-rose-100 px-2 py-1 text-[11px] font-semibold text-rose-700">
                                    Invalid
                                  </span>
                                )}
                                {row.errors.length > 0 && (
                                  <p className="mt-1 text-[11px] text-rose-600">{row.errors.join(" ")}</p>
                                )}
                              </td>
                            </tr>
                          ))}

                          {importRowsForPreview.length === 0 && (
                            <tr>
                              <td colSpan={11} className="px-4 py-8 text-center text-[13px] text-slate-500">
                                Choose a CSV or Excel file to preview rows.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {invalidImportRows.length > 0 && (
                    <p className="shrink-0 text-[12px] text-slate-600">
                      Invalid rows will be skipped. Only valid rows are imported.
                    </p>
                  )}
                </>
              ) : null}
            </div>
          )}
        </SectionImportModalShell>
      )}
    </>
  );
}
