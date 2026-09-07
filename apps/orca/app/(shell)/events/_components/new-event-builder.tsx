"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleMinus,
  ClipboardList,
  FileSpreadsheet,
  LayoutTemplate,
  RotateCcw,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DateField } from "@/components/date-field";
import { parseUploadedFile, type ImportFieldSpec, type ImportMapping, type ParsedSheet, type ParsedWorkbook } from "@/lib/import";
import {
  buildMatrixInitialMapping,
  MATRIX_IMPORT_FIELD_SPECS,
  validateMatrixMapping,
  type MatrixImportField,
} from "@/lib/matrix-import-mapping";
import {
  BUDGET_IMPORT_FIELD_SPECS,
  buildBudgetInitialMapping,
  validateBudgetMapping,
  type BudgetImportField,
} from "@/lib/budget-import-mapping";
import {
  buildTimelineInitialMapping,
  TIMELINE_IMPORT_FIELD_SPECS,
  validateTimelineMapping,
  type TimelineImportField,
} from "@/lib/timeline-import-mapping";
import {
  buildBudgetPreview,
  buildInitialWorkbookSheetSelections,
  buildRunOfShowPreview,
  buildTimelinePreview,
  buildWorkbookSourcesCreatePlan,
  createImportPreviewFromWorkbookSources,
  detectWorkbookSheets,
  WORKBOOK_MODULE_LABEL,
  workbookSourceSheetName,
  type WorkbookSheetConfidence,
  type WorkbookSheetColumnMappings,
  type WorkbookSheetModule,
  type WorkbookSheetSelections,
} from "@/lib/event-import-builder";
import { buildAgendaCreatePlan, buildAgendaPreview } from "@/lib/event-import-agenda";
import { buildTemplateCreatePlan, buildTemplatePreview } from "@/lib/event-import-templates";
import {
  emptyEventImportPreview,
  summarizeEventImportPreview,
  type EventImportBasics,
  type EventImportCreatePlan,
  type EventImportMethod,
  type EventImportPreview,
  type ImportWarning,
} from "@/lib/event-import-types";
import { getEventCreationDefaultTimezone, isSupportedTimezone } from "@/lib/timezones";
import {
  DEFAULT_ADDITIONAL_DOC_CATEGORY_SLUG,
  uploadAdditionalDocs,
  validateAdditionalDocFile,
  type DocumentUploadResult,
} from "@/lib/documents-upload-client";
import { EventImportMethodCard } from "./event-import-method-card";
import { EventImportPreviewPanel } from "./event-import-preview";
import {
  AdditionalDocsPreviewSummary,
  AdditionalDocsPostCreatePanel,
  EventBuilderAdditionalDocs,
  type AdditionalDocItem,
} from "./event-builder-additional-docs";

type BuilderStep = "basics" | "source" | "mapping" | "preview";
type UploadedWorkbookFile = {
  id: string;
  file: File;
  fileName: string;
  workbook: ParsedWorkbook | null;
  error: string | null;
};
type WorkbookParsingProgress = { completedFiles: number; totalFiles: number; currentFileName: string };
type ExistingEventSearchResult = { id: string; name: string; startDate: string | null; endDate: string | null };

const TEMPLATE_OPTIONS = [
  { key: "conference", label: "Conference", badges: ["Sessions", "Budget shell", "Timeline tasks"] },
  { key: "trade_show", label: "Trade Show", badges: ["Sessions", "Budget shell", "Timeline tasks"] },
  { key: "gala", label: "Gala / Awards", badges: ["Sessions", "Budget shell", "Timeline tasks"] },
  { key: "training", label: "Training", badges: ["Sessions", "Budget shell", "Timeline tasks"] },
  { key: "workshop", label: "Workshop", badges: ["Sessions", "Budget shell", "Timeline tasks"] },
  { key: "corporate_meeting", label: "Corporate Meeting", badges: ["Sessions", "Budget shell", "Timeline tasks"] },
];

const PASTE_PLACEHOLDER = `9:00 AM Opening Remarks - Main Ballroom - Sarah Lee
10:00 AM Breakout: Sponsor Strategy - Room 204
11:00 AM Coffee Break - Foyer`;

function emptyBasics(): EventImportBasics {
  return {
    name: "",
    clientId: null,
    startDate: "",
    endDate: "",
    venueName: "",
    city: "",
    timezone: getEventCreationDefaultTimezone(),
  };
}

function validateBasics(basics: EventImportBasics): string | null {
  if (!basics.name.trim()) return "Event name is required.";
  if (!basics.startDate) return "Start date is required.";
  if (!basics.endDate) return "End date is required.";
  if (basics.endDate < basics.startDate) return "End date cannot be before the start date.";
  if (!basics.timezone || !isSupportedTimezone(basics.timezone)) return "Select a valid timezone.";
  return null;
}

const STEP_LABELS: { key: BuilderStep; label: string }[] = [
  { key: "basics", label: "Event details" },
  { key: "source", label: "Choose a starting point" },
  { key: "preview", label: "Review & create" },
];

type SupportedWorkbookModule = "runOfShow" | "budget" | "timeline";
type WorkbookModuleStatus = "detected" | "needsReview" | "ready" | "skipped" | "missing";

const WORKBOOK_MAPPING_SPECS: Record<SupportedWorkbookModule, ImportFieldSpec<string>[]> = {
  runOfShow: MATRIX_IMPORT_FIELD_SPECS,
  budget: BUDGET_IMPORT_FIELD_SPECS,
  timeline: TIMELINE_IMPORT_FIELD_SPECS,
};

type SheetPreviewField = {
  label: string;
  value: string;
};

type SheetImportReview = {
  totalSourceRows: number;
  importableRows: number;
  skippedRows: number;
  warnings: ImportWarning[];
  previewRows: Array<{
    fields: SheetPreviewField[];
    sourceRow: ParsedSheet["rows"][number] | null;
  }>;
};

const WORKBOOK_MODULE_ORDER: SupportedWorkbookModule[] = ["budget", "timeline", "runOfShow"];

const WORKBOOK_MODULE_STATUS_LABEL: Record<WorkbookModuleStatus, string> = {
  detected: "Detected",
  needsReview: "Needs review",
  ready: "Ready",
  skipped: "Skipped",
  missing: "Missing",
};

const WORKBOOK_MODULE_STATUS_CLASSES: Record<WorkbookModuleStatus, string> = {
  detected: "border-blue-200 bg-blue-50 text-blue-700",
  needsReview: "border-amber-200 bg-amber-50 text-amber-800",
  ready: "border-emerald-200 bg-emerald-50 text-emerald-700",
  skipped: "border-slate-200 bg-slate-100 text-slate-600",
  missing: "border-slate-200 bg-white text-slate-500",
};

function formatHumanList(values: string[]): string {
  if (values.length === 0) return "";
  if (values.length === 1) return values[0]!;
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

function pluralizeCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function humanizeImportStatus(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatCents(value: number | null): string {
  if (value === null) return "Not mapped";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value / 100);
}

function selectedColumnForField(mapping: ImportMapping<string>, field: string): string {
  return Object.entries(mapping).find(([, mappedField]) => mappedField === field)?.[0] ?? "";
}

function sampleValueForColumn(sheet: ParsedSheet, columnId: string): string {
  const column = sheet.columns.find((candidate) => candidate.id === columnId);
  return column?.samples.find((sample) => sample.trim().length > 0)?.trim() ?? "";
}

function rowValueForColumn(sheet: ParsedSheet, row: ParsedSheet["rows"][number] | null, columnId: string): string {
  if (!row || !columnId) return "";
  const columnIndex = sheet.columns.findIndex((column) => column.id === columnId);
  if (columnIndex < 0) return "";
  return row.values[columnIndex]?.trim() ?? "";
}

function rowValueForField(sheet: ParsedSheet, row: ParsedSheet["rows"][number] | null, mapping: ImportMapping<string>, field: string): string {
  return rowValueForColumn(sheet, row, selectedColumnForField(mapping, field));
}

function sheetWarningsByReason(warnings: ImportWarning[]): Array<{ reason: string; rows: number[] }> {
  const groups = new Map<string, number[]>();
  for (const warning of warnings.filter((item) => item.severity === "error")) {
    const reason = warning.message.trim() || "Invalid row";
    groups.set(reason, [...(groups.get(reason) ?? []), warning.rowNumber ?? 0].filter(Boolean));
  }
  return Array.from(groups, ([reason, rows]) => ({ reason, rows: rows.slice(0, 5) }));
}

function blankRowWarnings(sheet: ParsedSheet, module: ImportWarning["module"]): ImportWarning[] {
  return sheet.rows
    .filter((row) => row.values.every((value) => value.trim().length === 0))
    .slice(0, 50)
    .map((row) => ({
      module,
      severity: "error" as const,
      rowNumber: row.rowNumber,
      message: "Empty row.",
    }));
}

function buildSheetImportReview(
  sheet: ParsedSheet,
  target: SupportedWorkbookModule,
  mapping: ImportMapping<string>,
): SheetImportReview {
  const totalSourceRows = sheet.rows.length;
  const sourceRows = sheet.rows;

  if (target === "runOfShow") {
    const preview = buildRunOfShowPreview(sheet, mapping as ImportMapping<MatrixImportField>);
    return {
      totalSourceRows,
      importableRows: preview.validRowCount,
      skippedRows: Math.max(0, totalSourceRows - preview.validRowCount),
      warnings: [...preview.warnings, ...blankRowWarnings(sheet, "runOfShow")],
      previewRows: preview.rows.slice(0, 10).map((row) => ({
        sourceRow: sourceRows.find((sourceRow) => sourceRow.rowNumber === row.sourceRowNumber) ?? null,
        fields: [
          { label: "Session", value: row.title || "Missing" },
          { label: "Date", value: row.date || "Missing" },
          { label: "Start", value: row.startTime || "Missing" },
          { label: "End", value: row.endTime || "Missing" },
          { label: "Room", value: row.roomName || "Unassigned" },
          { label: "Setup", value: row.setupType || "Not mapped" },
          { label: "AV", value: row.avNeeds || "Not mapped" },
          { label: "Notes", value: row.notes || "Not mapped" },
        ],
      })),
    };
  }

  if (target === "budget") {
    const preview = buildBudgetPreview(sheet, mapping as ImportMapping<BudgetImportField>);
    return {
      totalSourceRows,
      importableRows: preview.validRowCount,
      skippedRows: Math.max(0, totalSourceRows - preview.validRowCount),
      warnings: [...preview.warnings, ...blankRowWarnings(sheet, "budget")],
      previewRows: preview.rows.slice(0, 10).map((row) => {
        const sourceRow = sourceRows.find((candidate) => candidate.rowNumber === row.sourceRowNumber) ?? null;
        return {
          sourceRow,
          fields: [
            { label: "Category", value: row.category || "Missing" },
            { label: "Subcategory", value: rowValueForField(sheet, sourceRow, mapping, "subcategory") || "Not mapped" },
            { label: "Line item", value: row.lineItem || "Not mapped" },
            { label: "Planned / Forecast", value: formatCents(row.estimatedCents) },
            { label: "Actual", value: formatCents(row.actualCents) },
            { label: "Vendor", value: row.vendor || "Not mapped" },
            { label: "Status", value: rowValueForField(sheet, sourceRow, mapping, "status") || "Not mapped" },
          ],
        };
      }),
    };
  }

  const preview = buildTimelinePreview(sheet, mapping as ImportMapping<TimelineImportField>);
  return {
    totalSourceRows,
    importableRows: preview.validRowCount,
    skippedRows: Math.max(0, totalSourceRows - preview.validRowCount),
    warnings: [...preview.warnings, ...blankRowWarnings(sheet, "timeline")],
    previewRows: preview.rows.slice(0, 10).map((row) => ({
      sourceRow: sourceRows.find((sourceRow) => sourceRow.rowNumber === row.sourceRowNumber) ?? null,
      fields: [
        { label: "Item", value: row.task || "Missing" },
        { label: "Workstream", value: row.workstream ? humanizeImportStatus(row.workstream) : "Not mapped" },
        { label: "Planning Stage", value: row.planningStage ? humanizeImportStatus(row.planningStage) : "Not mapped" },
        { label: "Status", value: humanizeImportStatus(row.status) },
        { label: "Priority", value: humanizeImportStatus(row.priority) },
        { label: "Start", value: row.startDate || "Not mapped" },
        { label: "End", value: row.endDate || "Not mapped" },
        { label: "Critical Path", value: row.isCriticalPath ? "Yes" : "No" },
        { label: "Owner", value: row.owner || "Unassigned" },
        { label: "Notes", value: row.notes || "Not mapped" },
      ],
    })),
  };
}

type WorkbookMappingWorkbenchRow = {
  key: string;
  field: string;
  clearFields: string[];
  label: string;
  required: boolean;
  selectedColumn: string;
  sampleValue: string;
};

const BUDGET_WORKBENCH_FIELDS: Array<{
  key: string;
  label: string;
  field: BudgetImportField;
  clearFields: BudgetImportField[];
}> = [
  { key: "category", label: "Category", field: "category", clearFields: ["category"] },
  { key: "subcategory", label: "Subcategory", field: "subcategory", clearFields: ["subcategory"] },
  { key: "lineItem", label: "Line item", field: "lineItem", clearFields: ["lineItem"] },
  { key: "forecast", label: "Planned / Forecast", field: "forecast", clearFields: ["forecast"] },
  { key: "actual", label: "Actual", field: "actual", clearFields: ["actual"] },
  { key: "vendor", label: "Vendor", field: "vendor", clearFields: ["vendor"] },
  { key: "status", label: "Status", field: "status", clearFields: ["status"] },
];

function buildWorkbookMappingRows(
  sheet: ParsedSheet,
  target: SupportedWorkbookModule,
  mapping: ImportMapping<string>,
): WorkbookMappingWorkbenchRow[] {
  if (target === "budget") {
    const budgetSpecsByField = new Map(BUDGET_IMPORT_FIELD_SPECS.map((spec) => [spec.field, spec]));
    return BUDGET_WORKBENCH_FIELDS.map((definition) => {
      const selectedColumn = definition.clearFields.map((field) => selectedColumnForField(mapping, field)).find(Boolean) ?? "";
      const spec = budgetSpecsByField.get(definition.field);
      return {
        key: definition.key,
        field: definition.field,
        clearFields: definition.clearFields,
        label: definition.label,
        required: Boolean(spec?.required),
        selectedColumn,
        sampleValue: sampleValueForColumn(sheet, selectedColumn),
      };
    });
  }

  return WORKBOOK_MAPPING_SPECS[target].map((spec) => {
    const selectedColumn = selectedColumnForField(mapping, spec.field);
    return {
      key: spec.field,
      field: spec.field,
      clearFields: [spec.field],
      label: spec.label,
      required: Boolean(spec.required),
      selectedColumn,
      sampleValue: sampleValueForColumn(sheet, selectedColumn),
    };
  });
}

function WorkbookMappingWorkbench({
  sourceSheet,
  target,
  mapping,
  errors,
  review,
  previewIndex,
  maxPreviewIndex,
  previewRow,
  skippedReasons,
  onResetMapping,
  onFieldMappingChange,
  onPreviewIndexChange,
}: {
  sourceSheet: ParsedSheet;
  target: SupportedWorkbookModule;
  mapping: ImportMapping<string>;
  errors: string[];
  review: SheetImportReview;
  previewIndex: number;
  maxPreviewIndex: number;
  previewRow: SheetImportReview["previewRows"][number] | null;
  skippedReasons: Array<{ reason: string; rows: number[] }>;
  onResetMapping: () => void;
  onFieldMappingChange: (field: string, columnId: string) => void;
  onPreviewIndexChange: (nextIndex: number) => void;
}) {
  const rows = buildWorkbookMappingRows(sourceSheet, target, mapping);
  const sourceRowColumns = rows
    .filter((row) => row.selectedColumn)
    .map((row) => {
      const column = sourceSheet.columns.find((candidate) => candidate.id === row.selectedColumn);
      return {
        key: row.key,
        label: column?.header || row.label,
        value: rowValueForColumn(sourceSheet, previewRow?.sourceRow ?? null, row.selectedColumn) || "-",
      };
    });
  const currentPreviewRow = review.previewRows.length > 0 ? previewIndex + 1 : 0;
  const targetLabel = WORKBOOK_MODULE_LABEL[target];

  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-[20px] font-semibold text-slate-950">Map {targetLabel} fields</h4>
          <p className="mt-1 text-[13px] text-slate-600">Choose which spreadsheet column should fill each Planner field.</p>
        </div>
        <button
          type="button"
          onClick={onResetMapping}
          className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] font-semibold text-[#28439A] hover:bg-[#28439A]/[0.06]"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Reset mapping
        </button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(380px,1fr)]">
        <div className="min-w-0 space-y-3">
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="min-w-0 md:min-w-[920px]" role="table" aria-label={`${targetLabel} field mapping`}>
              <div className="hidden grid-cols-[minmax(150px,1.1fr)_120px_minmax(180px,1.1fr)_minmax(240px,1.5fr)_130px] gap-4 border-b border-slate-200 bg-slate-50/70 px-4 py-3 text-[10px] font-bold uppercase tracking-wide text-slate-500 md:grid">
                <span>Planner field</span>
                <span>Requirement</span>
                <span>Source column</span>
                <span>Sample from spreadsheet</span>
                <span>Status</span>
              </div>
              {rows.map((row) => {
                const isMapped = Boolean(row.selectedColumn);
                const rowStatus = isMapped ? "ready" : row.required ? "needsMapping" : "notMapped";
                return (
                  <div
                    key={row.key}
                    role="row"
                    className="grid gap-3 border-b border-slate-100 px-4 py-4 last:border-b-0 md:grid-cols-[minmax(150px,1.1fr)_120px_minmax(180px,1.1fr)_minmax(240px,1.5fr)_130px] md:items-center md:gap-4"
                  >
                    <div className="min-w-0">
                      <span className="block text-[13px] font-semibold text-slate-900">{row.label}</span>
                    </div>
                    <div>
                      {row.required ? (
                        <span className="inline-flex rounded-md bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700">Required</span>
                      ) : (
                        <span className="inline-flex rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">Optional</span>
                      )}
                    </div>
                    <label className="block min-w-0">
                      <span className="sr-only">{row.label} source column</span>
                      <select
                        value={row.selectedColumn}
                        onChange={(event) => onFieldMappingChange(row.field, event.target.value)}
                        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-medium text-slate-700 outline-none transition focus:border-[#28439A] focus:ring-2 focus:ring-[#28439A]/10"
                      >
                        <option value="">Do not map</option>
                        {sourceSheet.columns.map((column) => (
                          <option key={column.id} value={column.id}>
                            {column.header}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="min-w-0 text-[12px] font-medium text-slate-700">
                      <span className="md:hidden text-[10px] font-bold uppercase tracking-wide text-slate-400">Sample: </span>
                      <span className="break-words">{row.sampleValue || "-"}</span>
                    </div>
                    <div>
                      {rowStatus === "ready" ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                          Ready
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            rowStatus === "needsMapping" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          <CircleMinus className="h-3.5 w-3.5" aria-hidden />
                          {rowStatus === "needsMapping" ? "Needs mapping" : "Not mapped"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {errors.length > 0 ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              {errors.map((error) => (
                <p key={error}>{error}</p>
              ))}
            </div>
          ) : null}

          <p className="text-[12px] font-medium text-[#28439A]">Tip: Required fields must be mapped to continue.</p>
        </div>

        <aside className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:sticky xl:top-4 xl:self-start">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="text-[16px] font-semibold text-slate-950">Sample imported record</h4>
              <p className="mt-1 text-[12px] text-slate-500">
                Preview of row {currentPreviewRow} of {review.importableRows}
              </p>
            </div>
            <div className="inline-flex items-center gap-2">
              <button
                type="button"
                disabled={previewIndex <= 0}
                onClick={() => onPreviewIndexChange(Math.max(0, previewIndex - 1))}
                className="rounded-lg border border-slate-200 px-3 py-2 text-[12px] font-semibold text-slate-600 disabled:opacity-40"
              >
                Prev
              </button>
              <button
                type="button"
                disabled={previewIndex >= maxPreviewIndex}
                onClick={() => onPreviewIndexChange(Math.min(maxPreviewIndex, previewIndex + 1))}
                className="rounded-lg border border-slate-300 px-3 py-2 text-[12px] font-semibold text-[#28439A] disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
            {previewRow ? (
              <div className="space-y-3">
                {previewRow.fields.map((field) => (
                  <div key={field.label} className="grid grid-cols-[130px_minmax(0,1fr)] gap-3 text-[12px]">
                    <span className="font-semibold text-slate-500">{field.label}</span>
                    <span className="min-w-0 break-words font-medium text-slate-800">{field.value}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-slate-500">No importable rows yet. Check required mappings and skipped-row reasons.</p>
            )}
          </div>

          <details className="mt-3 rounded-xl border border-slate-200 bg-white" open>
            <summary className="cursor-pointer px-4 py-3 text-[12px] font-semibold text-slate-800">Source row</summary>
            <div className="border-t border-slate-100">
              {sourceRowColumns.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-[11px]">
                    <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      <tr>
                        {sourceRowColumns.map((column) => (
                          <th key={column.key} scope="col" className="whitespace-nowrap px-3 py-2">
                            {column.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        {sourceRowColumns.map((column) => (
                          <td key={column.key} className="max-w-[180px] px-3 py-3 align-top font-medium text-slate-700">
                            <span className="line-clamp-3">{column.value}</span>
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="px-4 py-3 text-[12px] text-slate-500">Map a source column to inspect the original row values.</p>
              )}
            </div>
          </details>

          {review.skippedRows > 0 ? (
            <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-[12px] text-amber-900">
              <p className="font-semibold">{review.skippedRows} rows will be skipped</p>
              <div className="mt-2 space-y-2">
                {skippedReasons.length > 0 ? (
                  skippedReasons.map((group) => (
                    <p key={group.reason}>
                      <span className="font-semibold">{group.reason}</span>
                      {group.rows.length > 0 ? <span> · rows {group.rows.join(", ")}</span> : null}
                    </p>
                  ))
                ) : (
                  <p>Rows are missing required values or contain invalid data.</p>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-3 inline-flex w-full items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-[12px] font-semibold text-emerald-700">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              No skipped rows detected.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export function NewEventBuilder() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedMethod = searchParams.get("method");
  const hasRequestedMethod = ["workbook", "pasteAgenda", "template", "blank"].includes(requestedMethod ?? "");
  const initialMethod = (hasRequestedMethod ? requestedMethod : "workbook") as EventImportMethod;

  const [step, setStep] = useState<BuilderStep>("basics");
  const [basics, setBasics] = useState<EventImportBasics>(emptyBasics);
  const [method, setMethod] = useState<EventImportMethod>(initialMethod);
  const [hasSelectedStartingPoint, setHasSelectedStartingPoint] = useState(hasRequestedMethod);
  const [pasteText, setPasteText] = useState("");
  const [templateKey, setTemplateKey] = useState("conference");
  const [workbookFiles, setWorkbookFiles] = useState<UploadedWorkbookFile[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [workbookParsingProgress, setWorkbookParsingProgress] = useState<WorkbookParsingProgress | null>(null);
  const [isContinuing, setIsContinuing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<EventImportPreview | null>(null);
  const [workbookSelections, setWorkbookSelections] = useState<WorkbookSheetSelections>({});
  const [workbookColumnMappings, setWorkbookColumnMappings] = useState<WorkbookSheetColumnMappings>({});
  const [workbookExplicitSkippedSheetKeys, setWorkbookExplicitSkippedSheetKeys] = useState<Set<string>>(() => new Set());
  const [activeWorkbookFileName, setActiveWorkbookFileName] = useState("");
  const [workbookPreviewRowIndexes, setWorkbookPreviewRowIndexes] = useState<Record<string, number>>({});
  const [additionalDocs, setAdditionalDocs] = useState<AdditionalDocItem[]>([]);
  const [createdEventId, setCreatedEventId] = useState<string | null>(null);
  const [additionalDocResults, setAdditionalDocResults] = useState<DocumentUploadResult[] | null>(null);
  const [isRetryingAdditionalDocs, setIsRetryingAdditionalDocs] = useState(false);
  const [omissionsAcknowledged, setOmissionsAcknowledged] = useState(false);
  const [existingEventSearch, setExistingEventSearch] = useState("");
  const [existingEvents, setExistingEvents] = useState<ExistingEventSearchResult[]>([]);
  const [existingEventsStatus, setExistingEventsStatus] = useState<"loading" | "loaded" | "error">("loading");
  const importIdempotencyKeyRef = useRef<string | null>(null);
  const workbookParsingGenerationRef = useRef(0);
  const workbookParsingActiveRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/events", { credentials: "include", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Failed to load events: ${response.status}`);
        return (await response.json()) as ExistingEventSearchResult[];
      })
      .then((events) => {
        setExistingEvents(Array.isArray(events) ? events : []);
        setExistingEventsStatus("loaded");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error("Failed to load existing events in Event Builder", error);
        setExistingEventsStatus("error");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => () => {
    workbookParsingGenerationRef.current += 1;
    workbookParsingActiveRef.current = false;
  }, []);
  const stepLabels = useMemo(
    () => {
      if (method === "workbook") {
        return [
          STEP_LABELS[0]!,
          STEP_LABELS[1]!,
          { key: "mapping" as const, label: "Map spreadsheets" },
          STEP_LABELS[2]!,
        ];
      }
      return STEP_LABELS;
    },
    [method],
  );
  const displayedStep = step;
  const stepIndex = stepLabels.findIndex((s) => s.key === displayedStep);
  const parsedWorkbookSources = useMemo(
    () =>
      workbookFiles
        .filter((file): file is UploadedWorkbookFile & { workbook: ParsedWorkbook } => Boolean(file.workbook))
        .map((file) => ({ fileName: file.fileName, workbook: file.workbook })),
    [workbookFiles],
  );
  const matchingExistingEvents = useMemo(() => {
    const query = existingEventSearch.trim().toLowerCase();
    if (!query) return [];
    return existingEvents.filter((event) => event.name.toLowerCase().includes(query)).slice(0, 5);
  }, [existingEventSearch, existingEvents]);
  const workbookDetectionGroups = useMemo(
    () =>
      parsedWorkbookSources.map((source) => ({
        fileName: source.fileName,
        workbook: source.workbook,
        detection: detectWorkbookSheets(source.workbook, source.fileName),
      })),
    [parsedWorkbookSources],
  );
  const workbookUsableSheetCount = useMemo(
    () => parsedWorkbookSources.reduce((count, source) => count + source.workbook.sheets.filter((sheet) => sheet.columns.length > 0).length, 0),
    [parsedWorkbookSources],
  );
  const workbookMappedModuleEntries = useMemo(
    () => {
      const entries: Array<[string, SupportedWorkbookModule]> = [];
      for (const group of workbookDetectionGroups) {
        for (const sheet of group.workbook.sheets) {
          const key = workbookSourceSheetName(group.fileName, sheet.name);
          const target = workbookSelections[key];
          if (target === "runOfShow" || target === "budget" || target === "timeline") {
            entries.push([key, target]);
          }
        }
      }
      return entries;
    },
    [workbookDetectionGroups, workbookSelections],
  );
  const workbookMappedModules = useMemo(
    () =>
      WORKBOOK_MODULE_ORDER.filter((moduleKey) =>
        workbookMappedModuleEntries.some(([, value]) => value === moduleKey),
      ).map((moduleKey) => WORKBOOK_MODULE_LABEL[moduleKey]),
    [workbookMappedModuleEntries],
  );
  const workbookCandidateModuleEntries = useMemo(
    () => {
      const entries: Array<{ key: string; module: SupportedWorkbookModule; confidence: WorkbookSheetConfidence }> = [];
      for (const group of workbookDetectionGroups) {
        for (const suggestion of group.detection.sheets) {
          if (suggestion.suggestedModule !== "runOfShow" && suggestion.suggestedModule !== "budget" && suggestion.suggestedModule !== "timeline") {
            continue;
          }
          entries.push({
            key: workbookSourceSheetName(group.fileName, suggestion.sheetName),
            module: suggestion.suggestedModule,
            confidence: suggestion.confidence,
          });
        }
      }
      return entries;
    },
    [workbookDetectionGroups],
  );
  const workbookMissingModules = useMemo(
    () =>
      WORKBOOK_MODULE_ORDER
        .filter((moduleKey) => !workbookMappedModuleEntries.some(([, value]) => value === moduleKey))
        .map((moduleKey) => WORKBOOK_MODULE_LABEL[moduleKey]),
    [workbookMappedModuleEntries],
  );
  const workbookCanMap = parsedWorkbookSources.length > 0 && workbookUsableSheetCount > 0;

  function isSupportedWorkbookModule(value: WorkbookSheetModule): value is SupportedWorkbookModule {
    return value === "runOfShow" || value === "budget" || value === "timeline";
  }

  function initialMappingForSheet(sheet: ParsedSheet, module: SupportedWorkbookModule): ImportMapping<string> {
    if (module === "runOfShow") return buildMatrixInitialMapping(sheet.columns);
    if (module === "budget") {
      const mapping = buildBudgetInitialMapping(sheet.columns);
      return Object.fromEntries(
        Object.entries(mapping).map(([columnId, field]) => [
          columnId,
          field === "session" || field === "group" ? "" : field,
        ]),
      );
    }
    return buildTimelineInitialMapping(sheet.columns);
  }

  function validateMappingForTarget(module: SupportedWorkbookModule, mapping: ImportMapping<string>): string[] {
    if (module === "runOfShow") return validateMatrixMapping(mapping as ImportMapping<MatrixImportField>);
    if (module === "budget") return validateBudgetMapping(mapping as ImportMapping<BudgetImportField>);
    return validateTimelineMapping(mapping as ImportMapping<TimelineImportField>);
  }

  function mappingErrorsForSheet(sheet: ParsedSheet, target: WorkbookSheetModule, key: string): string[] {
    if (!isSupportedWorkbookModule(target)) return [];
    return validateMappingForTarget(target, workbookColumnMappings[key] ?? initialMappingForSheet(sheet, target));
  }

  const workbookMappingErrors = useMemo(() => {
    const errors: Record<string, string[]> = {};
    for (const group of workbookDetectionGroups) {
      for (const sheet of group.workbook.sheets.filter((candidate) => candidate.columns.length > 0)) {
        const key = workbookSourceSheetName(group.fileName, sheet.name);
        const target = workbookSelections[key] ?? "notIncluded";
        const sheetErrors = mappingErrorsForSheet(sheet, target, key);
        if (sheetErrors.length > 0) errors[key] = sheetErrors;
      }
    }
    return errors;
  }, [workbookColumnMappings, workbookDetectionGroups, workbookSelections]);
  const workbookModuleStatuses = useMemo(
    () => {
      const statuses: Record<SupportedWorkbookModule, WorkbookModuleStatus> = {
        budget: "missing",
        timeline: "missing",
        runOfShow: "missing",
      };

      for (const moduleKey of WORKBOOK_MODULE_ORDER) {
        const mappedEntries = workbookMappedModuleEntries.filter(([, value]) => value === moduleKey);
        const candidateEntries = workbookCandidateModuleEntries.filter((entry) => entry.module === moduleKey);

        if (mappedEntries.length > 0) {
          const hasMappingErrors = mappedEntries.some(([key]) => (workbookMappingErrors[key]?.length ?? 0) > 0);
          const hasLowConfidenceCandidate = mappedEntries.some(([key]) =>
            workbookCandidateModuleEntries.some((entry) => entry.key === key && entry.confidence === "low"),
          );
          statuses[moduleKey] = hasMappingErrors || hasLowConfidenceCandidate ? "needsReview" : step === "source" ? "detected" : "ready";
          continue;
        }

        if (candidateEntries.length > 0) {
          const allExplicitlySkipped = candidateEntries.every((entry) => workbookExplicitSkippedSheetKeys.has(entry.key));
          statuses[moduleKey] = allExplicitlySkipped ? "skipped" : "needsReview";
        }
      }

      return statuses;
    },
    [step, workbookCandidateModuleEntries, workbookExplicitSkippedSheetKeys, workbookMappedModuleEntries, workbookMappingErrors],
  );
  const workbookDetectedModules = useMemo(
    () =>
      WORKBOOK_MODULE_ORDER
        .filter((moduleKey) => workbookModuleStatuses[moduleKey] !== "missing" && workbookModuleStatuses[moduleKey] !== "skipped")
        .map((moduleKey) => WORKBOOK_MODULE_LABEL[moduleKey]),
    [workbookModuleStatuses],
  );
  const workbookNeedsReviewModules = useMemo(
    () =>
      WORKBOOK_MODULE_ORDER
        .filter((moduleKey) => workbookModuleStatuses[moduleKey] === "needsReview")
        .map((moduleKey) => WORKBOOK_MODULE_LABEL[moduleKey]),
    [workbookModuleStatuses],
  );
  const workbookTrulyMissingModules = useMemo(
    () =>
      WORKBOOK_MODULE_ORDER
        .filter((moduleKey) => workbookModuleStatuses[moduleKey] === "missing")
        .map((moduleKey) => WORKBOOK_MODULE_LABEL[moduleKey]),
    [workbookModuleStatuses],
  );
  const workbookSkippedModules = useMemo(
    () =>
      WORKBOOK_MODULE_ORDER
        .filter((moduleKey) => workbookModuleStatuses[moduleKey] === "skipped")
        .map((moduleKey) => WORKBOOK_MODULE_LABEL[moduleKey]),
    [workbookModuleStatuses],
  );
  const workbookStatusMessage = useMemo(() => {
    if (workbookFiles.length === 0) return null;
    if (parsedWorkbookSources.length === 0) {
      return {
        tone: "error" as const,
        message: "No readable files were found. Upload a different .xlsx or .csv file.",
      };
    }
    if (workbookUsableSheetCount === 0) {
      return {
        tone: "error" as const,
        message: "No readable sheets were found in these files. Upload a different .xlsx or .csv file.",
      };
    }
    if (workbookDetectedModules.length > 0) {
      const reviewCopy =
        workbookNeedsReviewModules.length > 0
          ? ` ${formatHumanList(workbookNeedsReviewModules)} ${workbookNeedsReviewModules.length === 1 ? "needs" : "need"} mapping review before import.`
          : " Next, review mappings before creating the workspace.";
      const missingCopy =
        workbookTrulyMissingModules.length > 0
          ? ` ${formatHumanList(workbookTrulyMissingModules)} ${workbookTrulyMissingModules.length === 1 ? "was" : "were"} not detected and can be added later.`
          : "";
      const skippedCopy =
        workbookSkippedModules.length > 0
          ? ` ${formatHumanList(workbookSkippedModules)} ${workbookSkippedModules.length === 1 ? "is" : "are"} skipped.`
          : "";
      return {
        tone: "success" as const,
        message: `Detected ${formatHumanList(workbookDetectedModules)}.${reviewCopy}${missingCopy}${skippedCopy}`,
      };
    }
    return {
      tone: "info" as const,
      message: "Files are readable. Continue to map spreadsheets and choose what each sheet should import as.",
    };
  }, [
    parsedWorkbookSources.length,
    workbookDetectedModules,
    workbookFiles.length,
    workbookNeedsReviewModules,
    workbookSkippedModules,
    workbookTrulyMissingModules,
    workbookUsableSheetCount,
  ]);
  const workbookSheetReviews = useMemo(() => {
    const reviews: Record<string, SheetImportReview> = {};
    for (const group of workbookDetectionGroups) {
      for (const sheet of group.workbook.sheets.filter((candidate) => candidate.columns.length > 0)) {
        const key = workbookSourceSheetName(group.fileName, sheet.name);
        const target = workbookSelections[key];
        if (!isSupportedWorkbookModule(target)) continue;
        const mapping = workbookColumnMappings[key] ?? initialMappingForSheet(sheet, target);
        reviews[key] = buildSheetImportReview(sheet, target, mapping);
      }
    }
    return reviews;
  }, [workbookColumnMappings, workbookDetectionGroups, workbookSelections]);
  const workbookSkippedRowCount = useMemo(
    () => Object.values(workbookSheetReviews).reduce((sum, review) => sum + review.skippedRows, 0),
    [workbookSheetReviews],
  );
  const workbookCanContinue = workbookMappedModules.length > 0 && Object.keys(workbookMappingErrors).length === 0;
  const activeWorkbookGroup = workbookDetectionGroups.find((group) => group.fileName === activeWorkbookFileName) ?? workbookDetectionGroups[0] ?? null;

  function updateBasics<K extends keyof EventImportBasics>(key: K, value: EventImportBasics[K]) {
    setBasics((prev) => ({ ...prev, [key]: value }));
  }

  function goToSource() {
    const error = validateBasics(basics);
    if (error) {
      setErrorMessage(error);
      return;
    }
    setErrorMessage(null);
    setStep("source");
  }

  function selectStartingPoint(nextMethod: EventImportMethod) {
    if (nextMethod !== "workbook" && workbookParsingActiveRef.current) {
      workbookParsingGenerationRef.current += 1;
    }
    setMethod(nextMethod);
    setHasSelectedStartingPoint(true);
    setPreview(null);
    setErrorMessage(null);
    setNotice(null);
  }

  function handleAdditionalDocsSelected(fileList: FileList | File[] | null | undefined) {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;

    setAdditionalDocs((current) => {
      const existingKeys = new Set(current.map((doc) => doc.id));
      const next = [...current];
      for (const file of files) {
        const id = `${file.name}:${file.size}:${file.lastModified}`;
        if (existingKeys.has(id)) continue;
        existingKeys.add(id);
        next.push({
          id,
          file,
          fileName: file.name,
          sizeBytes: file.size,
          categorySlug: DEFAULT_ADDITIONAL_DOC_CATEGORY_SLUG,
          included: true,
          error: validateAdditionalDocFile(file),
        });
      }
      return next;
    });
  }

  function removeAdditionalDoc(id: string) {
    setAdditionalDocs((current) => current.filter((doc) => doc.id !== id));
  }

  function updateAdditionalDocCategory(id: string, categorySlug: string) {
    setAdditionalDocs((current) =>
      current.map((doc) => (doc.id === id ? { ...doc, categorySlug } : doc)),
    );
  }

  function updateAdditionalDocIncluded(id: string, included: boolean) {
    setAdditionalDocs((current) => current.map((doc) => (doc.id === id ? { ...doc, included } : doc)));
  }

  async function handleWorkbookSelected(fileList: FileList | File[] | undefined | null, retryFileId?: string) {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;
    if (workbookParsingActiveRef.current) {
      setNotice("Wait for the current spreadsheet to finish before adding another file.");
      return;
    }
    setPreview(null);
    setErrorMessage(null);
    setNotice(null);
    workbookParsingActiveRef.current = true;
    const parsingGeneration = workbookParsingGenerationRef.current + 1;
    workbookParsingGenerationRef.current = parsingGeneration;
    setIsParsing(true);

    const existingKeys = new Set(workbookFiles.filter((file) => file.id !== retryFileId).map((file) => file.id));
    const incoming = files.filter((file) => {
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      return !existingKeys.has(key);
    });

    if (incoming.length === 0) {
      setNotice("That file is already in the upload list.");
      workbookParsingActiveRef.current = false;
      setIsParsing(false);
      return;
    }

    try {
      const parsedFiles: UploadedWorkbookFile[] = [];
      for (const [index, file] of incoming.entries()) {
        if (workbookParsingGenerationRef.current !== parsingGeneration) return;
        setWorkbookParsingProgress({ completedFiles: index, totalFiles: incoming.length, currentFileName: file.name });
        const id = `${file.name}:${file.size}:${file.lastModified}`;
        try {
          const workbook = await parseUploadedFile(file);
          if (workbookParsingGenerationRef.current !== parsingGeneration) return;
          parsedFiles.push({ id, file, fileName: file.name, workbook, error: null });
        } catch {
          if (workbookParsingGenerationRef.current !== parsingGeneration) return;
          parsedFiles.push({ id, file, fileName: file.name, workbook: null, error: "We couldn't read this file. Upload an .xlsx or .csv file and try again." });
        }
      }
      if (workbookParsingGenerationRef.current !== parsingGeneration) return;
      setWorkbookFiles((current) => retryFileId
        ? current.map((item) => item.id === retryFileId ? parsedFiles[0]! : item)
        : [...current, ...parsedFiles]);
      setWorkbookSelections((current) => {
        const next = { ...current };
        for (const parsed of parsedFiles) {
          if (!parsed.workbook) continue;
          const detection = detectWorkbookSheets(parsed.workbook, parsed.fileName);
          const selections = buildInitialWorkbookSheetSelections(detection);
          for (const [sheetName, moduleKey] of Object.entries(selections)) {
            next[workbookSourceSheetName(parsed.fileName, sheetName)] = moduleKey;
          }
        }
        return next;
      });
      setWorkbookColumnMappings((current) => {
        const next = { ...current };
        for (const parsed of parsedFiles) {
          if (!parsed.workbook) continue;
          const detection = detectWorkbookSheets(parsed.workbook, parsed.fileName);
          const selections = buildInitialWorkbookSheetSelections(detection);
          for (const sheet of parsed.workbook.sheets) {
            const moduleKey = selections[sheet.name];
            const key = workbookSourceSheetName(parsed.fileName, sheet.name);
            if (moduleKey === "runOfShow" || moduleKey === "budget" || moduleKey === "timeline") {
              next[key] = initialMappingForSheet(sheet, moduleKey);
            }
          }
        }
        return next;
      });
      setActiveWorkbookFileName((current) => current || parsedFiles.find((file) => file.workbook)?.fileName || "");
    } finally {
      workbookParsingActiveRef.current = false;
      setIsParsing(false);
      setWorkbookParsingProgress(null);
    }
  }

  function retryWorkbookFile(fileId: string) {
    const failedFile = workbookFiles.find((file) => file.id === fileId && file.error);
    if (!failedFile) return;
    void handleWorkbookSelected([failedFile.file], failedFile.id);
  }

  function removeWorkbookFile(fileId: string) {
    const file = workbookFiles.find((item) => item.id === fileId);
    setWorkbookFiles((current) => current.filter((item) => item.id !== fileId));
    const workbook = file?.workbook;
    if (workbook) {
      setWorkbookSelections((current) => {
        const next = { ...current };
        for (const sheet of workbook.sheets) {
          delete next[workbookSourceSheetName(file.fileName, sheet.name)];
        }
        return next;
      });
      setWorkbookColumnMappings((current) => {
        const next = { ...current };
        for (const sheet of workbook.sheets) {
          delete next[workbookSourceSheetName(file.fileName, sheet.name)];
        }
        return next;
      });
      setWorkbookExplicitSkippedSheetKeys((current) => {
        const next = new Set(current);
        for (const sheet of workbook.sheets) {
          next.delete(workbookSourceSheetName(file.fileName, sheet.name));
        }
        return next;
      });
    }
    setActiveWorkbookFileName((current) => (current === file?.fileName ? "" : current));
    if (workbookFiles.length === 1) {
      setPreview(null);
      setNotice(null);
      setErrorMessage(null);
    }
  }

  function updateWorkbookSheetTarget(key: string, sheet: ParsedSheet, target: WorkbookSheetModule) {
    setWorkbookSelections((prev) => ({ ...prev, [key]: target }));
    setWorkbookExplicitSkippedSheetKeys((current) => {
      const next = new Set(current);
      if (target === "notIncluded") {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
    setWorkbookColumnMappings((prev) => {
      const next = { ...prev };
      if (isSupportedWorkbookModule(target)) {
        next[key] = initialMappingForSheet(sheet, target);
      } else {
        delete next[key];
      }
      return next;
    });
  }

  function updateWorkbookFieldMapping(
    key: string,
    sheet: ParsedSheet,
    target: SupportedWorkbookModule,
    field: string,
    columnId: string,
  ) {
    setWorkbookColumnMappings((prev) => {
      const current = prev[key] ?? initialMappingForSheet(sheet, target);
      const next = Object.fromEntries(
        sheet.columns.map((column) => [column.id, current[column.id] === field ? "" : current[column.id] ?? ""]),
      ) as ImportMapping<string>;
      if (columnId) next[columnId] = field;
      return { ...prev, [key]: next };
    });
  }

  function goToWorkbookMapping() {
    if (!workbookCanMap) {
      setErrorMessage("Upload at least one readable spreadsheet before mapping.");
      return;
    }
    setErrorMessage(null);
    setNotice(null);
    setActiveWorkbookFileName((current) => current || workbookDetectionGroups[0]?.fileName || "");
    setStep("mapping");
  }

  function goToWorkbookMappingTarget(module?: SupportedWorkbookModule) {
    if (method !== "workbook") {
      setStep("source");
      return;
    }

    if (module) {
      const targetGroup = workbookDetectionGroups.find((group) =>
        group.workbook.sheets.some((sheet) => workbookSelections[workbookSourceSheetName(group.fileName, sheet.name)] === module),
      );
      if (targetGroup) {
        setActiveWorkbookFileName(targetGroup.fileName);
      }
    }

    setStep("mapping");
  }

  async function buildPreview() {
    importIdempotencyKeyRef.current = null;
    setErrorMessage(null);
    setNotice(null);
    setIsContinuing(true);
    if (method === "workbook") {
      if (parsedWorkbookSources.length === 0) {
        setErrorMessage("Upload at least one readable workbook or CSV to preview your event.");
        setIsContinuing(false);
        return;
      }
      if (!workbookCanContinue) {
        setErrorMessage(
          Object.keys(workbookMappingErrors).length > 0
            ? "Resolve missing required column mappings before continuing to Review & create."
            : "Map at least one sheet to Run of Show, Budget, or Timeline to continue.",
        );
        setIsContinuing(false);
        return;
      }
      const nextPreview = createImportPreviewFromWorkbookSources(
        parsedWorkbookSources,
        basics,
        workbookSelections,
        workbookColumnMappings,
      );
      if (!summarizeEventImportPreview(nextPreview).hasAnyValidRows) {
        setErrorMessage("No importable Run of Show, Budget, or Timeline rows were detected in the mapped sheets.");
        setIsContinuing(false);
        return;
      }
      setPreview(nextPreview);
      setOmissionsAcknowledged(false);
      setStep("preview");
      setIsContinuing(false);
      return;
    }
    if (method === "pasteAgenda") {
      if (!pasteText.trim()) {
        setErrorMessage("Paste your agenda to preview the Run of Show.");
        setIsContinuing(false);
        return;
      }
      setPreview(buildAgendaPreview(pasteText, basics));
      setStep("preview");
      setIsContinuing(false);
      return;
    }
    if (method === "template") {
      setPreview(buildTemplatePreview(templateKey, basics));
      setStep("preview");
      setIsContinuing(false);
      return;
    }
    setPreview(emptyEventImportPreview(basics, "blank"));
    setStep("preview");
    setIsContinuing(false);
  }

  async function handleCreate() {
    setErrorMessage(null);
    setNotice(null);

    // Keep the key for an interrupted request: the server may have committed
    // the workspace and a retry must replay that exact outcome. A response
    // carrying an error, however, is terminal in the durable import ledger,
    // so the next explicit retry needs a fresh request key.
    let receivedCreateResponse = false;

    let plan: EventImportCreatePlan;
    if (method === "workbook") {
      if (parsedWorkbookSources.length === 0) {
        setErrorMessage("Upload at least one readable workbook or CSV before creating the workspace.");
        return;
      }
      plan = buildWorkbookSourcesCreatePlan(parsedWorkbookSources, basics, workbookSelections, workbookColumnMappings);
    } else if (method === "pasteAgenda") {
      if (!pasteText.trim()) {
        setErrorMessage("Paste your agenda before creating the workspace.");
        return;
      }
      plan = buildAgendaCreatePlan(pasteText, basics);
    } else if (method === "template") {
      plan = buildTemplateCreatePlan(templateKey, basics);
    } else {
      // Blank: create just the workspace.
      plan = {
        eventBasics: basics,
        sourceType: "blank",
        runOfShow: [],
        budget: [],
        timeline: [],
        timelineDependencies: [],
      };
    }

    setIsCreating(true);
    try {
      const idempotencyKey = importIdempotencyKeyRef.current ?? crypto.randomUUID();
      importIdempotencyKeyRef.current = idempotencyKey;
      const response = await fetch("/api/events/import/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...plan,
          idempotencyKey,
          approval: {
            confirmed: true,
            reviewedAt: new Date().toISOString(),
            evidence: "FINAL_REVIEW",
            omissionsAcknowledged: method === "workbook" ? omissionsAcknowledged : true,
            omissions: method === "workbook"
              ? workbookOmissions
              : { skippedSheets: [], skippedColumns: [], skippedRows: [] },
          },
        }),
      });
      receivedCreateResponse = true;
      const payload = (await response.json().catch(() => null)) as
        | ({ eventId?: string; error?: string; message?: string; code?: string })
        | null;
      if (!response.ok || !payload?.eventId) {
        throw new Error(payload?.message ?? payload?.error ?? "Failed to create the event workspace.");
      }

      const eventId = payload.eventId;
      const uploadableDocs = additionalDocs.filter((doc) => doc.included && !doc.error);
      if (uploadableDocs.length === 0) {
        router.replace(`/events/${payload.eventId}?created=1`);
        return;
      }

      // The event is already created and valid. Uploading Additional Docs into
      // Docs Hub happens after creation and must never roll back the event.
      try {
        const results = await uploadAdditionalDocs({
          eventId,
          docs: uploadableDocs.map((doc) => ({ id: doc.id, file: doc.file, categorySlug: doc.categorySlug })),
        });
        if (results.every((result) => result.ok)) {
          router.replace(`/events/${eventId}?created=1`);
        } else {
          // The workspace is committed; keep failed files available for a focused retry
          // without re-uploading documents that already reached the Docs Hub.
          setCreatedEventId(eventId);
          setAdditionalDocResults(results);
        }
      } catch (uploadError) {
        console.error("Additional Docs upload failed after event creation:", uploadError);
        router.replace(`/events/${eventId}?created=1&docsUpload=retry`);
      }
    } catch (error) {
      if (receivedCreateResponse) {
        importIdempotencyKeyRef.current = null;
      }
      setErrorMessage(error instanceof Error ? error.message : "Failed to create the event workspace.");
      setIsCreating(false);
    }
  }

  async function retryFailedAdditionalDocs() {
    if (!createdEventId || !additionalDocResults) return;
    const failedIds = new Set(additionalDocResults.filter((result) => !result.ok).map((result) => result.id));
    const retryDocs = additionalDocs.filter((doc) => doc.included && !doc.error && failedIds.has(doc.id));
    if (retryDocs.length === 0) return;

    setIsRetryingAdditionalDocs(true);
    try {
      const retriedResults = await uploadAdditionalDocs({
        eventId: createdEventId,
        docs: retryDocs.map((doc) => ({
          id: doc.id,
          file: doc.file,
          categorySlug: doc.categorySlug,
          documentId: additionalDocResults.find((result) => result.id === doc.id)?.documentId ?? null,
        })),
      });
      const mergedResults = additionalDocResults.map((result) => retriedResults.find((retry) => retry.id === result.id) ?? result);
      if (mergedResults.every((result) => result.ok)) {
        router.push(`/events/${createdEventId}?created=1`);
        return;
      }
      setAdditionalDocResults(mergedResults);
    } finally {
      setIsRetryingAdditionalDocs(false);
    }
  }

  const previewSummary = useMemo(
    () => (preview ? summarizeEventImportPreview(preview) : null),
    [preview],
  );
  const previewHasBlockingIssues = preview?.globalWarnings.some((warning) => warning.severity === "error") ?? false;
  const workbookReviewRows = useMemo(() => {
    return workbookDetectionGroups.flatMap((group) =>
      group.detection.sheets.map((sheet) => {
        const selectionKey = workbookSourceSheetName(group.fileName, sheet.sheetName);
        return {
          ...sheet,
          fileName: group.fileName,
          selectionKey,
          selectedModule: workbookSelections[selectionKey] ?? "notIncluded",
        };
      }),
    );
  }, [workbookDetectionGroups, workbookSelections]);
  const workbookOmissions = useMemo(() => {
    const skippedSheets: Array<{ fileName: string; sheetName: string }> = [];
    const skippedColumns: Array<{ fileName: string; sheetName: string; column: string }> = [];
    const skippedRows: Array<{ fileName: string; sheetName: string; rowNumber: number; reason: string }> = [];
    const seenRows = new Set<string>();

    for (const group of workbookDetectionGroups) {
      for (const sheet of group.workbook.sheets) {
        const key = workbookSourceSheetName(group.fileName, sheet.name);
        const target = workbookSelections[key] ?? "notIncluded";
        if (!isSupportedWorkbookModule(target)) {
          skippedSheets.push({ fileName: group.fileName, sheetName: sheet.name });
          continue;
        }
        const mapping = workbookColumnMappings[key] ?? initialMappingForSheet(sheet, target);
        const mappedColumnIds = new Set(
          Object.entries(mapping)
            .filter(([, field]) => Boolean(field))
            .map(([columnId]) => columnId),
        );
        for (const column of sheet.columns) {
          if (!mappedColumnIds.has(column.id)) {
            skippedColumns.push({ fileName: group.fileName, sheetName: sheet.name, column: column.header });
          }
        }
        for (const warning of workbookSheetReviews[key]?.warnings ?? []) {
          if (!warning.rowNumber || warning.severity !== "error") continue;
          const rowKey = `${group.fileName}:${sheet.name}:${warning.rowNumber}:${warning.message}`;
          if (seenRows.has(rowKey)) continue;
          seenRows.add(rowKey);
          skippedRows.push({
            fileName: group.fileName,
            sheetName: sheet.name,
            rowNumber: warning.rowNumber,
            reason: warning.message,
          });
        }
      }
    }
    return { skippedSheets, skippedColumns, skippedRows };
  }, [workbookColumnMappings, workbookDetectionGroups, workbookSelections, workbookSheetReviews]);
  const workbookOmissionCount = workbookOmissions.skippedSheets.length
    + workbookOmissions.skippedColumns.length
    + workbookOmissions.skippedRows.length;

  const shellClassName =
    step === "mapping" && method === "workbook"
      ? "mx-auto w-full max-w-[1560px] px-4 py-6 sm:px-6 lg:px-8"
      : "mx-auto w-full max-w-5xl px-4 py-6";

  if (createdEventId && additionalDocResults) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10">
        <AdditionalDocsPostCreatePanel
          results={additionalDocResults}
          isRetrying={isRetryingAdditionalDocs}
          onRetry={() => void retryFailedAdditionalDocs()}
          onGoToEvent={() => router.push(`/events/${createdEventId}?created=1`)}
          onOpenDocsHub={() => router.push(`/events/${createdEventId}/docs`)}
        />
      </div>
    );
  }

  return (
    <div className={shellClassName}>
      {/* Progress indicator */}
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-[#28439A]" aria-hidden />
          <h1 className="text-[22px] font-semibold text-slate-900">Create event workspace</h1>
        </div>
        <p className="mt-0.5 text-[13px] text-slate-500">
          Set up an event from planning files, a pasted agenda, or a starter template.
        </p>
        <ol className="mt-4 flex flex-wrap items-center gap-2" aria-label="Event setup steps">
          {stepLabels.map((s, index) => {
            const state = index < stepIndex ? "done" : index === stepIndex ? "current" : "upcoming";
            return (
              <li key={s.key} className="flex items-center gap-2">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${
                    state === "current"
                      ? "bg-[#28439A] text-white"
                      : state === "done"
                        ? "bg-emerald-500 text-white"
                        : "bg-slate-100 text-slate-500"
                  }`}
                  aria-current={state === "current" ? "step" : undefined}
                >
                  {index + 1}
                </span>
                <span className={`text-[12px] ${state === "current" ? "font-semibold text-slate-900" : "text-slate-500"}`}>
                  {s.label}
                </span>
                {index < stepLabels.length - 1 ? <span className="mx-1 h-px w-6 bg-slate-200" aria-hidden /> : null}
              </li>
            );
          })}
        </ol>
      </div>

      {errorMessage ? (
        <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700" role="alert">
          {errorMessage}
        </p>
      ) : null}
      {notice ? (
        <p className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[13px] text-blue-700">{notice}</p>
      ) : null}

      {/* Step: Basics */}
      {step === "basics" ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h2 className="text-[14px] font-semibold text-slate-900">Open an existing event</h2>
            <p className="mt-0.5 text-[12px] text-slate-500">Search before creating so you can go straight to a workspace that already exists.</p>
            <label className="mt-3 block">
              <span className="sr-only">Search existing events</span>
              <input type="search" value={existingEventSearch} onChange={(event) => setExistingEventSearch(event.target.value)} placeholder="Search existing events" className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] outline-none focus:border-slate-300" />
            </label>
            {existingEventSearch.trim() ? (
              <div className="mt-2" aria-live="polite">
                {existingEventsStatus === "loading" ? (
                  <p className="text-[12px] text-slate-500">Loading events…</p>
                ) : existingEventsStatus === "error" ? (
                  <p className="text-[12px] text-rose-600">Existing events are unavailable. You can still create a new event.</p>
                ) : matchingExistingEvents.length === 0 ? (
                  <p className="text-[12px] text-slate-500">No existing events match your search.</p>
                ) : (
                  <ul className="space-y-1">
                    {matchingExistingEvents.map((event) => (
                      <li key={event.id}>
                        <button type="button" onClick={() => router.push(`/events/${event.id}`)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:border-slate-300">
                          <span className="truncate text-[12px] font-semibold text-slate-800">{event.name}</span>
                          <span className="shrink-0 text-[11px] text-slate-500">{event.startDate?.slice(0, 10) ?? "Date not set"}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
          <h2 className="text-[16px] font-semibold text-slate-900">Event details</h2>
          <p className="mt-0.5 text-[12px] text-slate-500">Just enough to create the workspace and frame your import.</p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="mb-1 block text-[13px] font-medium text-slate-700">Event name</span>
              <input
                value={basics.name}
                onChange={(e) => updateBasics("name", e.target.value)}
                placeholder="Annual Customer Conference"
                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-[14px] outline-none focus:border-slate-300"
              />
            </label>
            <label>
              <span className="mb-1 block text-[13px] font-medium text-slate-700">Event start</span>
              <DateField value={basics.startDate} onChange={(v) => updateBasics("startDate", v)} ariaLabel="Event start" />
            </label>
            <label>
              <span className="mb-1 block text-[13px] font-medium text-slate-700">Event end</span>
              <DateField
                value={basics.endDate}
                min={basics.startDate || undefined}
                onChange={(v) => updateBasics("endDate", v)}
                ariaLabel="Event end"
                popoverClassName="sm:right-0 sm:left-auto"
              />
            </label>
            <label className="sm:col-span-2">
              <span className="mb-1 block text-[13px] font-medium text-slate-700">Venue / city</span>
              <input
                value={basics.venueName ?? ""}
                onChange={(e) => updateBasics("venueName", e.target.value)}
                placeholder="Grand City Hotel"
                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-[14px] outline-none focus:border-slate-300"
              />
            </label>
          </div>
          <div className="mt-5 flex justify-between">
            <button
              type="button"
              onClick={() => router.push("/events")}
              className="h-11 rounded-xl border border-slate-200 px-4 text-[14px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={goToSource}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#28439A] px-4 text-[14px] font-semibold text-white hover:bg-[#243d8e]"
            >
              Continue
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </section>
      ) : null}

      {/* Step: Source */}
      {step === "source" ? (
        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-[16px] font-semibold text-slate-900">Choose a starting point</h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label="Starting method">
              <EventImportMethodCard
                method="workbook"
                title="Upload Spreadsheet"
                description="Import Run of Show, Budget, and Timeline from one or more spreadsheets."
                icon={<FileSpreadsheet className="h-4 w-4" aria-hidden />}
                badge="Recommended"
                selected={method === "workbook"}
                onSelect={selectStartingPoint}
              />
              <EventImportMethodCard
                method="pasteAgenda"
                title="Paste Agenda"
                description="Paste a rough schedule and we’ll create your Run of Show."
                icon={<ClipboardList className="h-4 w-4" aria-hidden />}
                selected={method === "pasteAgenda"}
                onSelect={selectStartingPoint}
              />
              <EventImportMethodCard
                method="template"
                title="Use Template"
                description="Use a starter structure for a common event type."
                icon={<LayoutTemplate className="h-4 w-4" aria-hidden />}
                selected={method === "template"}
                onSelect={selectStartingPoint}
              />
              <EventImportMethodCard
                method="blank"
                title="Start Blank"
                description="Create the workspace only."
                icon={<Sparkles className="h-4 w-4" aria-hidden />}
                selected={method === "blank"}
                onSelect={selectStartingPoint}
              />
            </div>

            {hasSelectedStartingPoint ? (
              <div className="mt-5 space-y-4 border-t border-slate-100 pt-5" data-testid="selected-starting-point-panel">
                {method === "workbook" ? (
                  <div>
                    <h3 className="text-[15px] font-semibold text-slate-900">Upload your planning files</h3>
                    <p className="mt-0.5 text-[12px] text-slate-500">
                      Import Run of Show, Budget, and Timeline from one or more spreadsheets.
                    </p>
                    <p className="mt-0.5 text-[12px] text-slate-500">
                      We inspect sheet names plus columns inside each file, suggest import targets, and let you confirm before anything is created.
                    </p>
                    <label
                      className={`mt-3 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center ${isParsing ? "cursor-wait opacity-70" : "cursor-pointer hover:border-slate-400"}`}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = isParsing ? "none" : "copy";
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (isParsing) return;
                        void handleWorkbookSelected(event.dataTransfer.files);
                      }}
                    >
                      <UploadCloud className="h-6 w-6 text-slate-400" aria-hidden />
                      <span className="text-[13px] font-medium text-slate-700">
                        {isParsing && workbookParsingProgress
                          ? `Reading file ${Math.min(workbookParsingProgress.completedFiles + 1, workbookParsingProgress.totalFiles)} of ${workbookParsingProgress.totalFiles}: ${workbookParsingProgress.currentFileName}`
                          : workbookFiles.length > 0
                            ? "Add another file"
                            : "Drop .xlsx or .csv files here or click to browse"}
                      </span>
                      {isParsing ? <span className="text-[11px] text-slate-500" role="status" aria-live="polite">Files are read one at a time. Keep this page open until parsing finishes.</span> : null}
                      <span className="text-[11px] text-slate-400">.xlsx preferred · .csv supported</span>
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        multiple
                        className="sr-only"
                        disabled={isParsing}
                        onChange={(e) => {
                          void handleWorkbookSelected(e.target.files);
                          e.currentTarget.value = "";
                        }}
                      />
                    </label>
                    {workbookFiles.length > 0 ? (
                      <div className="mt-2 space-y-2">
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {workbookFiles.map((file) => {
                            const readableSheets = file.workbook?.sheets.filter((sheet) => sheet.columns.length > 0).length ?? 0;
                            return (
                              <div key={file.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
                                <div className="min-w-0">
                                  <p className="truncate text-[12px] font-semibold text-slate-800">{file.fileName}</p>
                                  <p className={`mt-0.5 text-[11px] ${file.error ? "text-rose-600" : "text-slate-500"}`}>
                                    {file.error ?? `${readableSheets} detected sheet${readableSheets === 1 ? "" : "s"}`}
                                  </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                  {file.error ? <button type="button" onClick={() => retryWorkbookFile(file.id)} disabled={isParsing} className="rounded-lg px-2 py-1 text-[11px] font-semibold text-[#28439A] hover:bg-blue-50 disabled:opacity-50">Retry</button> : null}
                                  <button type="button" onClick={() => removeWorkbookFile(file.id)} disabled={isParsing} className="rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50">Remove</button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {workbookStatusMessage ? (
                          <p
                            className={`rounded-lg border px-3 py-2 text-[12px] ${
                              workbookStatusMessage.tone === "error"
                                ? "border-rose-200 bg-rose-50 text-rose-700"
                                : workbookStatusMessage.tone === "info"
                                  ? "border-slate-200 bg-slate-50 text-slate-700"
                                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
                            }`}
                          >
                            {workbookStatusMessage.message}
                          </p>
                        ) : null}
                        {workbookDetectionGroups.length > 0 ? (
                          <div className="grid gap-2 sm:grid-cols-3">
                            {WORKBOOK_MODULE_ORDER.map((moduleKey) => {
                              const status = workbookModuleStatuses[moduleKey];
                              return (
                                <div key={moduleKey} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[12px] font-semibold text-slate-800">{WORKBOOK_MODULE_LABEL[moduleKey]}</span>
                                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${WORKBOOK_MODULE_STATUS_CLASSES[status]}`}>
                                      {WORKBOOK_MODULE_STATUS_LABEL[status]}
                                    </span>
                                  </div>
                                  <p className="mt-1 text-[11px] leading-4 text-slate-500">
                                    {status === "detected"
                                      ? "Candidate found. Review mappings next."
                                      : status === "needsReview"
                                        ? "Candidate found, but mapping needs confirmation."
                                        : status === "ready"
                                          ? "Mapped and ready for preview."
                                          : status === "skipped"
                                            ? "Explicitly skipped for this import."
                                            : "No candidate found in uploaded files."}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                        {workbookDetectionGroups.length > 0 ? (
                          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <p className="text-[12px] font-semibold text-slate-800">Ready to map spreadsheets</p>
                            <p className="mt-0.5 text-[12px] text-slate-500">
                              Next, review each file and confirm sheet targets, required columns, skipped sheets, and warnings.
                            </p>
                          </div>
                        ) : null}
                        <div className="flex flex-wrap items-center gap-2">
                          {workbookDetectedModules.length === 0 ? (
                            <span className="text-[11px] text-slate-500">Map at least one sheet to continue.</span>
                          ) : workbookNeedsReviewModules.length > 0 ? (
                            <span className="text-[11px] text-slate-500">
                              Review mappings for {formatHumanList(workbookNeedsReviewModules)} before creating the workspace.
                            </span>
                          ) : workbookTrulyMissingModules.length > 0 ? (
                            <span className="text-[11px] text-slate-500">
                              Partial import is supported. {formatHumanList(workbookTrulyMissingModules)} can be added later.
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

              {method === "pasteAgenda" ? (
                <div>
                  <h3 className="text-[15px] font-semibold text-slate-900">Paste agenda</h3>
                  <p className="mt-0.5 text-[12px] text-slate-500">
                    One row per line. We’ll build your Run of Show — Budget and Timeline can be added later.
                  </p>
                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder={PASTE_PLACEHOLDER}
                    rows={8}
                    aria-label="Paste agenda"
                    className="mt-3 w-full rounded-xl border border-slate-200 p-3 text-[13px] outline-none focus:border-slate-300"
                  />
                </div>
              ) : null}

              {method === "template" ? (
                <div>
                  <h3 className="text-[15px] font-semibold text-slate-900">Choose template</h3>
                  <p className="mt-0.5 text-[12px] text-slate-500">Creates editable starter content you can refine.</p>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Template">
                    {TEMPLATE_OPTIONS.map((tpl) => (
                      <button
                        key={tpl.key}
                        type="button"
                        role="radio"
                        aria-checked={templateKey === tpl.key}
                        onClick={() => setTemplateKey(tpl.key)}
                        className={`rounded-xl border p-3 text-left transition ${
                          templateKey === tpl.key
                            ? "border-[#28439A] bg-[#28439A]/[0.04]"
                            : "border-slate-200 bg-white hover:border-slate-300"
                        }`}
                      >
                        <p className="text-[13px] font-semibold text-slate-900">{tpl.label}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {tpl.badges.map((b) => (
                            <span key={b} className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                              {b}
                            </span>
                          ))}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {method === "blank" ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <h3 className="text-[15px] font-semibold text-slate-900">Start blank</h3>
                  <p className="mt-0.5 text-[12px] text-slate-500">
                    Only the event workspace is created. You can add Run of Show, Budget, and Timeline from the dashboard.
                  </p>
                </div>
              ) : null}

                <EventBuilderAdditionalDocs
                  docs={additionalDocs}
                  disabled={isCreating}
                  variant="inline"
                  onSelectFiles={handleAdditionalDocsSelected}
                  onRemove={removeAdditionalDoc}
                  onCategoryChange={updateAdditionalDocCategory}
                  onIncludeChange={updateAdditionalDocIncluded}
                />
              </div>
            ) : null}
          </div>

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setStep("basics")}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-[14px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Edit details
            </button>
            <button
              type="button"
              onClick={() =>
                method === "blank"
                  ? void buildPreview()
                  : method === "workbook"
                    ? goToWorkbookMapping()
                    : void buildPreview()
              }
              disabled={
                !hasSelectedStartingPoint ||
                isParsing ||
                isContinuing ||
                isCreating ||
                (method === "workbook" && !workbookCanMap)
              }
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#28439A] px-4 text-[14px] font-semibold text-white hover:bg-[#243d8e] disabled:opacity-50"
            >
              {!hasSelectedStartingPoint
                ? "Choose a starting point"
                : method === "blank"
                ? isContinuing
                  ? "Preparing review…"
                  : "Review & create"
                : isContinuing
                  ? "Preparing preview…"
                  : method === "workbook"
                    ? "Map spreadsheets"
                    : "Preview event shell"}
              {hasSelectedStartingPoint ? <ArrowRight className="h-4 w-4" aria-hidden /> : null}
            </button>
          </div>
        </section>
      ) : null}

      {/* Step: Mapping */}
      {step === "mapping" && method === "workbook" ? (
        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-[16px] font-semibold text-slate-900">Map spreadsheets</h2>
                <p className="mt-0.5 text-[12px] text-slate-500">
                  Work through each uploaded file. Confirm sheet targets, required column mappings, and any warnings before review.
                </p>
              </div>
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
                Sheets marked Skip will not be imported.
              </p>
            </div>

            <div className="mt-4 flex gap-2 overflow-x-auto border-b border-slate-200 pb-2" role="tablist" aria-label="Uploaded files">
              {workbookDetectionGroups.map((group) => {
                const hasErrors = group.workbook.sheets.some((sheet) => {
                  const key = workbookSourceSheetName(group.fileName, sheet.name);
                  return Boolean(workbookMappingErrors[key]?.length);
                });
                const mappedCount = group.workbook.sheets.filter((sheet) => {
                  const target = workbookSelections[workbookSourceSheetName(group.fileName, sheet.name)];
                  return target === "runOfShow" || target === "budget" || target === "timeline";
                }).length;
                const skippedCount = group.workbook.sheets.filter((sheet) => {
                  const target = workbookSelections[workbookSourceSheetName(group.fileName, sheet.name)] ?? "notIncluded";
                  return target === "notIncluded" || target === "fnbCatalog";
                }).length;
                const issueCount = group.workbook.sheets.reduce((count, sheet) => {
                  const key = workbookSourceSheetName(group.fileName, sheet.name);
                  const target = workbookSelections[key] ?? "notIncluded";
                  if (!isSupportedWorkbookModule(target)) return count;
                  return count + (workbookMappingErrors[key]?.length ?? 0) + (workbookSheetReviews[key]?.skippedRows ?? 0);
                }, 0);
                return (
                  <button
                    key={group.fileName}
                    type="button"
                    role="tab"
                    aria-selected={activeWorkbookGroup?.fileName === group.fileName}
                    onClick={() => setActiveWorkbookFileName(group.fileName)}
                    className={`shrink-0 rounded-xl border px-3 py-2 text-left text-[12px] font-semibold ${
                      activeWorkbookGroup?.fileName === group.fileName
                        ? "border-[#28439A] bg-[#28439A]/[0.06] text-[#28439A]"
                        : hasErrors
                          ? "border-amber-300 bg-amber-50 text-amber-800"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <span className="block">{group.fileName}</span>
                    <span className="mt-0.5 block text-[10px] font-medium opacity-80">
                      {mappedCount} mapped · {issueCount > 0 ? pluralizeCount(issueCount, "issue") : `${skippedCount} skip`}
                      {hasErrors ? " · needs attention" : ""}
                    </span>
                  </button>
                );
              })}
            </div>

            {activeWorkbookGroup ? (
              <div className="mt-4 space-y-3">
                {activeWorkbookGroup.detection.sheets.map((suggestion) => {
                  const sourceSheet = activeWorkbookGroup.workbook.sheets.find((sheet) => sheet.name === suggestion.sheetName);
                  if (!sourceSheet) return null;
                  const selectionKey = workbookSourceSheetName(activeWorkbookGroup.fileName, suggestion.sheetName);
                  const selectedTarget = workbookSelections[selectionKey] ?? "notIncluded";
                  const supportedTarget = isSupportedWorkbookModule(selectedTarget) ? selectedTarget : null;
                  const mapping = supportedTarget
                    ? workbookColumnMappings[selectionKey] ?? initialMappingForSheet(sourceSheet, supportedTarget)
                    : {};
                  const errors = workbookMappingErrors[selectionKey] ?? [];
                  const review = supportedTarget ? workbookSheetReviews[selectionKey] ?? buildSheetImportReview(sourceSheet, supportedTarget, mapping) : null;
                  const maxPreviewIndex = Math.max(0, (review?.previewRows.length ?? 1) - 1);
                  const previewIndex = Math.min(workbookPreviewRowIndexes[selectionKey] ?? 0, maxPreviewIndex);
                  const previewRow = review?.previewRows[previewIndex] ?? null;
                  const skippedReasons = review ? sheetWarningsByReason(review.warnings) : [];
                  const sheetIssueCount = errors.length + (review?.skippedRows ?? 0);
                  const sheetToneClass = selectedTarget === "notIncluded"
                    ? "border-slate-200 bg-slate-50/80 opacity-80"
                    : errors.length > 0 || suggestion.confidence === "low" || (review?.skippedRows ?? 0) > 0
                      ? "border-amber-300 bg-amber-50/40"
                      : "border-slate-200 bg-white";
                  return (
                    <div
                      key={selectionKey}
                      className={`rounded-2xl border p-4 ${sheetToneClass}`}
                    >
                      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-[14px] font-semibold text-slate-900">{suggestion.sheetName}</h3>
                            <ConfidenceBadge confidence={suggestion.confidence} />
                            {errors.length > 0 ? (
                              <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                                Missing mappings
                              </span>
                            ) : null}
                            {sheetIssueCount > 0 ? (
                              <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                                {pluralizeCount(sheetIssueCount, "issue")}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-[12px] text-slate-600">
                            Suggested target: {WORKBOOK_MODULE_LABEL[suggestion.suggestedModule]}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-500">{suggestion.reason}</p>
                          {review ? (
                            <p className="mt-2 text-[11px] font-medium text-slate-600">
                              {review.importableRows} importable · {review.skippedRows} skipped · {review.totalSourceRows} source rows
                            </p>
                          ) : null}
                        </div>
                        <label>
                          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Import target
                          </span>
                          <select
                            value={selectedTarget}
                            onChange={(event) =>
                              updateWorkbookSheetTarget(
                                selectionKey,
                                sourceSheet,
                                event.target.value as WorkbookSheetModule,
                              )
                            }
                            className={`h-10 w-full rounded-xl border bg-white px-3 text-[13px] text-slate-700 outline-none ${
                              errors.length > 0 || suggestion.confidence === "low"
                                ? "border-amber-400 shadow-sm focus:border-amber-500"
                                : "border-slate-200 focus:border-slate-300"
                            }`}
                          >
                            <option value="runOfShow">Run of Show</option>
                            <option value="budget">Budget</option>
                            <option value="timeline">Timeline</option>
                            <option value="notIncluded">Don&apos;t include</option>
                          </select>
                        </label>
                      </div>

                      {selectedTarget === "notIncluded" ? (
                        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
                          This sheet will be skipped.
                        </div>
                      ) : supportedTarget ? (
                        <WorkbookMappingWorkbench
                          sourceSheet={sourceSheet}
                          target={supportedTarget}
                          mapping={mapping}
                          errors={errors}
                          review={review ?? buildSheetImportReview(sourceSheet, supportedTarget, mapping)}
                          previewIndex={previewIndex}
                          maxPreviewIndex={maxPreviewIndex}
                          previewRow={previewRow}
                          skippedReasons={skippedReasons}
                          onResetMapping={() => {
                            setWorkbookColumnMappings((current) => ({
                              ...current,
                              [selectionKey]: initialMappingForSheet(sourceSheet, supportedTarget),
                            }));
                            setWorkbookPreviewRowIndexes((current) => ({ ...current, [selectionKey]: 0 }));
                          }}
                          onFieldMappingChange={(field, columnId) => {
                            updateWorkbookFieldMapping(selectionKey, sourceSheet, supportedTarget, field, columnId);
                            setWorkbookPreviewRowIndexes((current) => ({ ...current, [selectionKey]: 0 }));
                          }}
                          onPreviewIndexChange={(nextIndex) =>
                            setWorkbookPreviewRowIndexes((current) => ({ ...current, [selectionKey]: nextIndex }))
                          }
                        />
                      ) : (
                        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
                          This sheet type is recognized, but it is not importable yet. Choose a supported target or Don&apos;t include.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className={`rounded-2xl border px-4 py-3 text-[13px] ${
            workbookSkippedRowCount > 0
              ? "border-amber-300 bg-amber-50 text-amber-900"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}>
            <p className="font-semibold">
              {workbookMappedModules.length > 0
                ? `Preview will import ${formatHumanList(workbookMappedModules)}.`
                : "No import targets selected yet."}
            </p>
            <p className="mt-1">
              {workbookSkippedRowCount > 0
                ? `${pluralizeCount(workbookSkippedRowCount, "row")} across mapped sheets will be skipped. Review skipped-row reasons above.`
                : "No skipped rows detected across mapped sheets."}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setStep("source")}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-[14px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to upload
            </button>
            <button
              type="button"
              onClick={() => void buildPreview()}
              disabled={isContinuing || !workbookCanContinue}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#28439A] px-5 text-[14px] font-semibold text-white hover:bg-[#243d8e] disabled:opacity-50"
            >
              {isContinuing ? "Preparing review…" : "Review & create"}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </section>
      ) : null}

      {/* Step: Preview */}
      {step === "preview" && preview ? (
        <section className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-[16px] font-semibold text-slate-900">{basics.name || "New event"}</h2>
                <p className="text-[12px] text-slate-500">
                  {basics.startDate} – {basics.endDate}
                  {basics.venueName ? ` · ${basics.venueName}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStep(method === "workbook" ? "mapping" : "source")}
                className="text-[12px] font-medium text-slate-500 hover:text-slate-700 hover:underline"
              >
                {method === "workbook" ? "Back to mapping" : "Back to source"}
              </button>
            </div>
          </div>

          {method === "workbook" && workbookReviewRows.length > 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-[15px] font-semibold text-slate-900">Confirmed sheet mappings</h3>
              <p className="mt-0.5 text-[12px] text-slate-500">
                Read-only summary of the spreadsheet mappings you confirmed.
              </p>
              <div className="mt-3 space-y-2">
                {workbookReviewRows.map((sheet) => (
                  <div key={sheet.selectionKey} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-slate-900">{sheet.sheetName}</p>
                      <p className="text-[11px] text-slate-500">{sheet.fileName} · {sheet.reason}</p>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700">
                      {WORKBOOK_MODULE_LABEL[sheet.selectedModule]}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid gap-2 text-[12px] text-slate-600 sm:grid-cols-2">
                <p>Selected mappings: {workbookMappedModules.length > 0 ? workbookMappedModules.join(", ") : "None"}</p>
                <p>
                  Skipped sheets:{" "}
                  {workbookReviewRows
                    .filter((sheet) => sheet.selectedModule === "notIncluded")
                    .map((sheet) => `${sheet.fileName} / ${sheet.sheetName}`)
                    .join(", ") || "None"}
                </p>
              </div>
              {workbookMissingModules.length > 0 ? (
                <p className="mt-2 text-[12px] text-slate-500">Missing modules: {workbookMissingModules.join(", ")}.</p>
              ) : null}
            </div>
          ) : null}

          {method === "workbook" && workbookOmissionCount > 0 ? (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950">
              <h3 className="text-[15px] font-semibold">Reviewed data that will not be imported</h3>
              <p className="mt-1 text-[12px] text-amber-900">
                These omissions are saved with the import approval. Usable mapped rows and columns will still be imported.
              </p>
              <div className="mt-3 grid gap-3 text-[12px] sm:grid-cols-3">
                <div>
                  <p className="font-semibold">Skipped sheets ({workbookOmissions.skippedSheets.length})</p>
                  <p className="mt-1 break-words">
                    {workbookOmissions.skippedSheets.map((item) => `${item.fileName} / ${item.sheetName}`).join(", ") || "None"}
                  </p>
                </div>
                <div>
                  <p className="font-semibold">Unmapped columns ({workbookOmissions.skippedColumns.length})</p>
                  <p className="mt-1 break-words">
                    {workbookOmissions.skippedColumns.map((item) => `${item.sheetName}: ${item.column}`).join(", ") || "None"}
                  </p>
                </div>
                <div>
                  <p className="font-semibold">Skipped rows ({workbookOmissions.skippedRows.length})</p>
                  <p className="mt-1 break-words">
                    {workbookOmissions.skippedRows.map((item) => `${item.sheetName} row ${item.rowNumber}: ${item.reason}`).join("; ") || "None"}
                  </p>
                </div>
              </div>
              <label className="mt-4 flex items-start gap-2 text-[12px] font-semibold">
                <input
                  type="checkbox"
                  checked={omissionsAcknowledged}
                  onChange={(event) => setOmissionsAcknowledged(event.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                I reviewed these skipped sheets, columns, and rows and approve creating the event with the remaining mapped data.
              </label>
            </div>
          ) : null}

          <AdditionalDocsPreviewSummary docs={additionalDocs} />

          <EventImportPreviewPanel preview={preview} onBackToMapping={(module) => goToWorkbookMappingTarget(module)} />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setStep(method === "workbook" ? "mapping" : "source")}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-[14px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              {method === "workbook" ? "Back to mapping" : "Back to source"}
            </button>
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={
                isCreating
                || previewHasBlockingIssues
                || (!previewSummary?.hasAnyValidRows && method !== "blank")
                || (method === "workbook" && workbookOmissionCount > 0 && !omissionsAcknowledged)
              }
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#28439A] px-5 text-[14px] font-semibold text-white hover:bg-[#243d8e] disabled:opacity-50"
            >
              {isCreating ? "Creating workspace…" : errorMessage ? "Retry create event workspace" : "Create event workspace"}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: WorkbookSheetConfidence }) {
  const className =
    confidence === "high"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : confidence === "medium"
        ? "border-blue-200 bg-blue-50 text-blue-700"
        : confidence === "low"
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-slate-200 bg-white text-slate-500";
  const label =
    confidence === "high"
      ? "High confidence"
      : confidence === "medium"
        ? "Medium confidence"
        : confidence === "low"
          ? "Needs review"
          : "No confidence";

  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${className}`}>
      {label}
    </span>
  );
}
