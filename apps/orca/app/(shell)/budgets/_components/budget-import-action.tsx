"use client";

import { Download, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SectionImportModalShell } from "../../_components/section-import-modal-shell";
import {
  buildBudgetImportSuccessOutcome,
  buildBudgetImportTemplateCsv,
  type BudgetImportDraftRow,
  type BudgetImportSuccessOutcome,
  type BudgetImportValidatedRow,
  validateBudgetImportRows,
} from "@/lib/budget-import";
import {
  BUDGET_IMPORT_FIELD_SPECS,
  buildBudgetDraftRows,
  buildBudgetInitialMapping,
  detectNotesColumns,
  validateBudgetMapping,
  type BudgetImportField,
} from "@/lib/budget-import-mapping";
import {
  parseUploadedFile,
  type ImportColumn,
  type ImportMapping,
  type ParsedSheet,
  type ParsedWorkbook,
} from "@/lib/import";
import { buildBudgetCategoryMatchKeys } from "@/lib/budget-category-filter";

type BudgetImportSummary = {
  importedCount: number;
  validCount: number;
  invalidCount: number;
  blankCount: number;
};

export type BudgetImportExistingLineItem = {
  category: string;
  subcategory?: string | null;
};

type BudgetImportTriggerRenderProps = {
  open: () => void;
  disabled: boolean;
  isImporting: boolean;
};

type BudgetImportActionProps = {
  eventId: string;
  disabled?: boolean;
  existingLineItems?: BudgetImportExistingLineItem[];
  onImported?: (outcome: BudgetImportSuccessOutcome) => void | Promise<void>;
  onError?: (message: string) => void;
  trigger: (props: BudgetImportTriggerRenderProps) => ReactNode;
};

const BUDGET_IMPORT_ACCEPT =
  ".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel";

const BUDGET_IMPORT_PREVIEW_PAGE_SIZE = 15;

const BUDGET_IMPORT_FIELD_OPTIONS: { value: BudgetImportField | ""; label: string }[] = [
  { value: "", label: "Do not import" },
  ...BUDGET_IMPORT_FIELD_SPECS.map((spec) => ({
    value: spec.field,
    label: spec.required ? `${spec.label} (required)` : spec.label,
  })),
];

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

function buildExistingCategoryMap(existingLineItems: BudgetImportExistingLineItem[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();

  for (const item of existingLineItems) {
    const categoryKeys = buildBudgetCategoryMatchKeys(item.category);
    if (categoryKeys.length === 0) continue;
    for (const categoryKey of categoryKeys) {
      const subcategorySet = map.get(categoryKey) ?? new Set<string>();
      const subcategory = item.subcategory?.trim().toLowerCase();
      if (subcategory) subcategorySet.add(subcategory);
      map.set(categoryKey, subcategorySet);
    }
  }

  return map;
}

export function downloadBudgetImportTemplate() {
  const csv = buildBudgetImportTemplateCsv();
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "budget-import-template.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function BudgetImportAction({
  eventId,
  disabled = false,
  existingLineItems = [],
  onImported,
  onError,
  trigger,
}: BudgetImportActionProps) {
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importHeaderError, setImportHeaderError] = useState<string | null>(null);
  const [importDraftRows, setImportDraftRows] = useState<BudgetImportDraftRow[]>([]);
  const [importRowNumbers, setImportRowNumbers] = useState<number[]>([]);
  const [importPreviewRows, setImportPreviewRows] = useState<BudgetImportValidatedRow[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importPreviewPage, setImportPreviewPage] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [importWorkbook, setImportWorkbook] = useState<ParsedWorkbook | null>(null);
  const [importSheetName, setImportSheetName] = useState<string | null>(null);
  const [importMapping, setImportMapping] = useState<ImportMapping<BudgetImportField>>({});
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

  const existingCategoryMap = useMemo(
    () => buildExistingCategoryMap(existingLineItems),
    [existingLineItems],
  );

  const importSheet = useMemo<ParsedSheet | null>(() => {
    if (!importWorkbook || !importSheetName) return null;
    return importWorkbook.sheets.find((sheet) => sheet.name === importSheetName) ?? null;
  }, [importWorkbook, importSheetName]);

  const importNeedsSheetPick = Boolean(
    importWorkbook && importWorkbook.sheetNames.length > 1 && !importSheetName,
  );

  const importMappingErrors = useMemo(
    () => (importSheet ? validateBudgetMapping(importMapping) : []),
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
  const importWarningCount = useMemo(
    () => importRowsForPreview.reduce((sum, row) => sum + row.warnings.length, 0),
    [importRowsForPreview],
  );
  const importNotesDetected = useMemo(
    () => Boolean(importSheet && detectNotesColumns(importSheet.columns).length > 0),
    [importSheet],
  );
  const hasImportFileSelection = Boolean(importWorkbook || importFileName || importHeaderError);

  useEffect(() => {
    setImportPreviewPage(0);
  }, [importPreviewRows]);

  const importPreviewTotalRows = importRowsForPreview.length;
  const importPreviewLastPage = Math.max(0, Math.ceil(importPreviewTotalRows / BUDGET_IMPORT_PREVIEW_PAGE_SIZE) - 1);
  const importPreviewPageIndex = Math.min(importPreviewPage, importPreviewLastPage);
  const importPreviewRangeStart = importPreviewTotalRows === 0 ? 0 : importPreviewPageIndex * BUDGET_IMPORT_PREVIEW_PAGE_SIZE + 1;
  const importPreviewRangeEnd =
    importPreviewTotalRows === 0 ? 0 : Math.min(importPreviewTotalRows, (importPreviewPageIndex + 1) * BUDGET_IMPORT_PREVIEW_PAGE_SIZE);
  const importRowsForPreviewPage = importRowsForPreview.slice(
    importPreviewPageIndex * BUDGET_IMPORT_PREVIEW_PAGE_SIZE,
    importPreviewPageIndex * BUDGET_IMPORT_PREVIEW_PAGE_SIZE + BUDGET_IMPORT_PREVIEW_PAGE_SIZE,
  );

  function resetImportState() {
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

  function applyBudgetMapping(sheet: ParsedSheet, mapping: ImportMapping<BudgetImportField>) {
    const { draftRows, rowNumbers } = buildBudgetDraftRows(sheet, mapping);
    const validation = validateBudgetImportRows(draftRows, { rowNumbers });
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

    const mapping = buildBudgetInitialMapping(sheet.columns);
    setImportMapping(mapping);
    applyBudgetMapping(sheet, mapping);
  }

  function handleMappingChange(columnId: string, field: BudgetImportField | "") {
    if (!importSheet) return;
    const nextMapping = { ...importMapping, [columnId]: field };
    setImportMapping(nextMapping);
    applyBudgetMapping(importSheet, nextMapping);
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
        const mapping = buildBudgetInitialMapping(sheet.columns);
        setImportMapping(mapping);
        applyBudgetMapping(sheet, mapping);
      }
    } catch (error) {
      setImportHeaderError(error instanceof Error ? error.message : "Failed to read import file");
      setImportWorkbook(null);
    }
  }

  async function handleImportBudgetRows() {
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
      const response = await fetch(`/api/events/${eventId}/budget/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: importDraftRows, rowNumbers: importRowNumbers }),
      });

      const payload = (await response.json()) as BudgetImportSummary | { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to import budget rows"));
      }

      const importedCount = "importedCount" in payload ? payload.importedCount : validImportRows.length;
      const skippedCount = invalidImportRows.length;
      const hasOtherSheets =
        (importWorkbook?.sheets.filter((sheet) => sheet.columns.length > 0).length ?? 0) > 1;
      const outcome = buildBudgetImportSuccessOutcome({ importedCount, skippedCount, hasOtherSheets });

      await onImported?.(outcome);

      if (outcome.closeModal) {
        setIsImportModalOpen(false);
        resetImportState();
      }
    } catch (error) {
      onError?.(error instanceof Error ? error.message : "Failed to import budget rows");
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <>
      {trigger({ open: openImportModal, disabled: disabled || !eventId, isImporting })}

      {isImportModalOpen && (
        <SectionImportModalShell
          title="Import Budget Data"
          description="Upload CSV or Excel (.csv, .xlsx, .xls). Headers don't need to match exactly - pick a sheet, map your columns to budget fields, and preview validation before importing."
          detail="The template is recommended, not required. Import commits immediately after confirmation; no additional save needed."
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
                className="inline-flex h-10 items-center rounded-lg bg-[#28439A] px-4 text-[13px] font-semibold text-white hover:bg-[#243d8e] disabled:opacity-60"
                onClick={() => void handleImportBudgetRows()}
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
              onClick={downloadBudgetImportTemplate}
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
                accept={BUDGET_IMPORT_ACCEPT}
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
              Upload your budget file when you&apos;re ready. We&apos;ll show sheet selection, mapping, validation, and the preview after the file is loaded.
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
                    Import one sheet at a time. Each sheet can have its own mapping. Sheets are never merged.
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
                      Map columns from &quot;{importSheet.name}&quot; to budget fields
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Category and Planned/Forecast are required. If Line Item is unmapped, Subcategory is used. A
                      Variance column is ignored - variance is calculated for you.
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Only the selected sheet will be imported. To import another sheet, run a separate import.
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      New categories and subcategories from your file will be added to the imported budget rows.
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
                              handleMappingChange(column.id, event.target.value as BudgetImportField | "")
                            }
                            className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-[12px] text-slate-700"
                          >
                            {BUDGET_IMPORT_FIELD_OPTIONS.map((option) => (
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
                  <div className="shrink-0 grid gap-3 md:grid-cols-4">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-slate-500">Parsed rows</p>
                      <p className="text-[18px] font-semibold text-slate-900">{importDraftRows.length}</p>
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-emerald-700">Valid rows</p>
                      <p className="text-[18px] font-semibold text-emerald-800">{validImportRows.length}</p>
                    </div>
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-rose-700">Invalid rows</p>
                      <p className="text-[18px] font-semibold text-rose-700">{invalidImportRows.length}</p>
                    </div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-amber-700">Warnings</p>
                      <p className="text-[18px] font-semibold text-amber-700">{importWarningCount}</p>
                    </div>
                  </div>

                  {importNotesDetected && (
                    <div className="shrink-0 space-y-2">
                      {importNotesDetected && (
                        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[12px] text-sky-800">
                          Notes were detected but won&apos;t be imported yet.
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
                      <table className="w-full min-w-[1020px] border-separate border-spacing-0">
                        <thead className="sticky top-0 z-10">
                          <tr className="border-b border-slate-200 bg-slate-50 text-left shadow-[0_1px_0_0_rgb(226_232_240)]">
                            <th className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500">Row</th>
                            <th className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500">Category</th>
                            <th className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500">Subcategory</th>
                            <th className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500">Line Item</th>
                            <th className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500">Vendor</th>
                            <th className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500">Forecast</th>
                            <th className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500">Actual</th>
                            <th className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500">Status</th>
                            <th className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500">Row status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importRowsForPreviewPage.map((row) => {
                            const categoryKey = row.raw.Category.trim().toLowerCase();
                            const subcategoryKey = row.raw.Subcategory.trim().toLowerCase();
                            const subcategories = existingCategoryMap.get(categoryKey);
                            const categoryExists = existingCategoryMap.has(categoryKey);
                            const subcategoryExists = !subcategoryKey ? true : Boolean(subcategories?.has(subcategoryKey));

                            return (
                              <tr
                                key={`${row.rowNumber}-${row.raw["Line Item"]}-${row.raw.Category}`}
                                className="border-b border-slate-100 last:border-b-0"
                              >
                                <td className="px-3 py-2 text-[12px] text-slate-600">{row.rowNumber}</td>
                                <td className="px-3 py-2 text-[12px] text-slate-700">
                                  <div>{row.raw.Category || "-"}</div>
                                  {row.raw.Category && (
                                    <div className={`text-[11px] ${categoryExists ? "text-slate-500" : "text-indigo-600"}`}>
                                      {categoryExists ? "Existing category" : "Will create category"}
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-[12px] text-slate-700">
                                  <div>{row.raw.Subcategory || "-"}</div>
                                  {row.raw.Subcategory && (
                                    <div className={`text-[11px] ${subcategoryExists ? "text-slate-500" : "text-indigo-600"}`}>
                                      {subcategoryExists ? "Existing subcategory" : "Will create subcategory"}
                                    </div>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-[12px] text-slate-700">
                                  <div>{row.normalized?.lineItem || row.raw["Line Item"] || "-"}</div>
                                </td>
                                <td className="px-3 py-2 text-[12px] text-slate-700">{row.normalized?.vendor || row.raw.Vendor || "-"}</td>
                                <td className="px-3 py-2 text-[12px] text-slate-700">{row.raw.Forecast || "-"}</td>
                                <td className="px-3 py-2 text-[12px] text-slate-700">{row.raw.Actual || <span className="text-slate-400">$0 (default)</span>}</td>
                                <td className="px-3 py-2 text-[12px] text-slate-700">{row.raw.Status || <span className="text-slate-400">Planned (default)</span>}</td>
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
                                  {row.warnings.length > 0 && (
                                    <p className="mt-1 text-[11px] text-amber-700">{row.warnings.join(" ")}</p>
                                  )}
                                </td>
                              </tr>
                            );
                          })}

                          {importRowsForPreview.length === 0 && (
                            <tr>
                              <td colSpan={9} className="px-4 py-8 text-center text-[13px] text-slate-500">
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
