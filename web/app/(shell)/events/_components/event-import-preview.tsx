"use client";

import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  summarizeEventImportPreview,
  type BudgetPreviewRow,
  type EventImportPreview,
  type ImportWarning,
  type RunOfShowPreviewRow,
  type TimelinePreviewRow,
} from "@/lib/event-import-types";

const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

type ModuleKey = "runOfShow" | "budget" | "timeline";
type ModuleStatus = "Ready" | "Needs review" | "Skipped";
type PreviewTab = "records" | "issues" | "mapping";

type MappingRow = {
  plannerField: string;
  spreadsheetColumn: string;
  sampleValue: string;
};

type ReviewIssue = {
  id: string;
  module: ModuleKey;
  moduleName: string;
  severity: "blocking" | "warning" | "review";
  reason: string;
  sourceFileName: string;
  sheetName: string;
  rowNumber?: number;
  field?: string;
};

type PreviewRecord = {
  values: string[];
};

type ModuleSummary = {
  key: ModuleKey;
  name: string;
  status: ModuleStatus;
  source: string;
  willCreate: string[];
  issueCount: number;
  skippedCount: number;
  warnings: ImportWarning[];
  issues: ReviewIssue[];
  muted: boolean;
  columns: string[];
  records: PreviewRecord[];
  mappingRows: MappingRow[];
};

const MODULE_LABEL: Record<ModuleKey, string> = {
  runOfShow: "Run of Show",
  budget: "Budget",
  timeline: "Timeline",
};

function formatMoney(cents: number | null): string {
  if (cents == null) return "Not mapped";
  return moneyFormatter.format(cents / 100);
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function humanizeField(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (letter) => letter.toUpperCase());
}

function humanizeStatus(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function sourceLabel(preview: EventImportPreview, sheetName?: string): string {
  if (sheetName) return sheetName.replace(" / ", " \u2192 ");
  if (preview.sourceType === "pasteAgenda") return "Pasted agenda";
  if (preview.sourceType === "template") return preview.templateKey ? `Template: ${preview.templateKey}` : "Starter template";
  return preview.fileName ?? "Selected source";
}

function sourceParts(preview: EventImportPreview, sheetName?: string, warning?: ImportWarning): { sourceFileName: string; sheetName: string } {
  const sourceFileName = warning?.sourceFileName?.trim();
  const sourceSheetName = warning?.sheetName?.trim();
  if (sourceFileName || sourceSheetName) {
    return {
      sourceFileName: sourceFileName || preview.fileName || "Selected source",
      sheetName: sourceSheetName || sheetName || "Selected sheet",
    };
  }

  if (sheetName?.includes(" / ")) {
    const [file, ...sheetParts] = sheetName.split(" / ");
    return {
      sourceFileName: file || preview.fileName || "Selected source",
      sheetName: sheetParts.join(" / ") || sheetName,
    };
  }

  return {
    sourceFileName: preview.fileName || "Selected source",
    sheetName: sheetName || "Selected sheet",
  };
}

function formatHumanList(values: string[]): string {
  if (values.length === 0) return "";
  if (values.length === 1) return values[0]!;
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values[values.length - 1]}`;
}

function mappedColumnRows(
  mappedColumns: Record<string, string | null>,
  sampleForField: (field: string) => string,
): MappingRow[] {
  return Object.entries(mappedColumns)
    .filter(([, field]) => Boolean(field))
    .map(([column, field]) => ({
      plannerField: humanizeField(field ?? ""),
      spreadsheetColumn: column,
      sampleValue: sampleForField(field ?? "") || "No sample value",
    }));
}

function reviewSeverityFor(warning: ImportWarning): ReviewIssue["severity"] {
  if (warning.module === "global" && warning.severity === "error") return "blocking";
  return warning.severity === "warning" ? "warning" : "review";
}

function buildModuleIssues(
  preview: EventImportPreview,
  module: ModuleKey,
  warnings: ImportWarning[],
  skippedCount: number,
  sheetName?: string,
): ReviewIssue[] {
  const moduleName = MODULE_LABEL[module];
  const issues = warnings
    .filter((warning) => warning.severity !== "info")
    .map((warning, index): ReviewIssue => {
      const source = sourceParts(preview, sheetName, warning);
      return {
        id: `${module}-${warning.rowNumber ?? "sheet"}-${warning.field ?? "row"}-${index}`,
        module,
        moduleName,
        severity: reviewSeverityFor(warning),
        reason: warning.message || "Import issue",
        sourceFileName: source.sourceFileName,
        sheetName: source.sheetName,
        rowNumber: warning.rowNumber,
        field: warning.field,
      };
    });

  const missingSkippedRows = Math.max(0, skippedCount - issues.length);
  if (missingSkippedRows > 0) {
    const source = sourceParts(preview, sheetName);
    issues.push({
      id: `${module}-skipped-rows`,
      module,
      moduleName,
      severity: "review",
      reason: `${pluralize(missingSkippedRows, "row")} will be skipped.`,
      sourceFileName: source.sourceFileName,
      sheetName: source.sheetName,
    });
  }

  return issues;
}

function statusFor(detected: boolean, issueCount: number): ModuleStatus {
  if (!detected) return "Skipped";
  return issueCount > 0 ? "Needs review" : "Ready";
}

function statusClass(status: ModuleStatus): string {
  if (status === "Ready") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "Needs review") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-500";
}

function runOfShowRecord(row: RunOfShowPreviewRow): PreviewRecord {
  return {
    values: [
      row.sourceRowNumber ? String(row.sourceRowNumber) : "-",
      row.date ?? "Not mapped",
      row.startTime ?? "Not mapped",
      row.title,
      row.roomName ?? "Unassigned",
      row.setupType ?? "Not mapped",
      row.avNeeds ?? "Not mapped",
      row.notes ?? "Not mapped",
    ],
  };
}

function budgetRecord(row: BudgetPreviewRow): PreviewRecord {
  return {
    values: [
      row.sourceRowNumber ? String(row.sourceRowNumber) : "-",
      row.category,
      row.lineItem || "Not mapped",
      formatMoney(row.estimatedCents),
      formatMoney(row.actualCents),
      humanizeStatus(row.status ?? "PLANNED"),
    ],
  };
}

function timelineRecord(row: TimelinePreviewRow): PreviewRecord {
  return {
    values: [
      row.sourceRowNumber ? String(row.sourceRowNumber) : "-",
      row.task,
      row.workstream ? humanizeStatus(row.workstream) : "Not mapped",
      row.planningStage ? humanizeStatus(row.planningStage) : "Not mapped",
      humanizeStatus(row.status),
      humanizeStatus(row.priority),
      row.startDate ?? "Not mapped",
      row.endDate ?? "Not mapped",
      row.isCriticalPath ? "Yes" : "No",
      row.owner ?? "Unassigned",
    ],
  };
}

function buildModuleSummaries(preview: EventImportPreview): ModuleSummary[] {
  const { runOfShow, budget, timeline } = preview.modules;
  const runOfShowIssues = buildModuleIssues(preview, "runOfShow", runOfShow.warnings, runOfShow.skippedRowCount, runOfShow.sheetName);
  const budgetIssues = buildModuleIssues(preview, "budget", budget.warnings, budget.skippedRowCount, budget.sheetName);
  const timelineIssues = buildModuleIssues(preview, "timeline", timeline.warnings, timeline.skippedRowCount, timeline.sheetName);

  return [
    {
      key: "runOfShow",
      name: "Run of Show",
      status: statusFor(runOfShow.detected, runOfShowIssues.length),
      source: sourceLabel(preview, runOfShow.sheetName),
      willCreate: [
        pluralize(runOfShow.validRowCount, "session"),
        pluralize(runOfShow.roomsToCreate.length, "room"),
      ],
      issueCount: runOfShowIssues.length,
      skippedCount: runOfShow.skippedRowCount,
      warnings: runOfShow.warnings,
      issues: runOfShowIssues,
      muted: !runOfShow.detected,
      columns: ["Source row", "Date", "Time", "Session", "Room", "Setup", "AV", "Notes"],
      records: runOfShow.rows.map(runOfShowRecord),
      mappingRows: mappedColumnRows(runOfShow.mappedColumns, (field) => {
        const sample = runOfShow.sampleRows[0];
        if (!sample) return "";
        if (field === "sessionName" || field === "title") return sample.title;
        if (field === "dayDate" || field === "date") return sample.date ?? "";
        if (field === "startTime") return sample.startTime ?? "";
        if (field === "endTime") return sample.endTime ?? "";
        if (field === "roomName") return sample.roomName ?? "";
        if (field === "setup" || field === "setupType") return sample.setupType ?? "";
        if (field === "av" || field === "avNeeds") return sample.avNeeds ?? "";
        if (field === "notes") return sample.notes ?? "";
        return "";
      }),
    },
    {
      key: "budget",
      name: "Budget",
      status: statusFor(budget.detected, budgetIssues.length),
      source: sourceLabel(preview, budget.sheetName),
      willCreate: [
        pluralize(budget.validRowCount, "line item"),
        pluralize(budget.categoryCount, "category", "categories"),
        `${formatMoney(budget.estimatedTotalCents)} estimated`,
      ],
      issueCount: budgetIssues.length,
      skippedCount: budget.skippedRowCount,
      warnings: budget.warnings,
      issues: budgetIssues,
      muted: !budget.detected,
      columns: ["Source row", "Category", "Line item", "Planned", "Actual", "Status"],
      records: budget.rows.map(budgetRecord),
      mappingRows: mappedColumnRows(budget.mappedColumns, (field) => {
        const sample = budget.sampleRows[0];
        if (!sample) return "";
        if (field === "category") return sample.category;
        if (field === "lineItem") return sample.lineItem;
        if (field === "vendor") return sample.vendor ?? "";
        if (field === "forecast") return formatMoney(sample.estimatedCents);
        if (field === "actual") return formatMoney(sample.actualCents);
        if (field === "status") return humanizeStatus(sample.status ?? "PLANNED");
        return "";
      }),
    },
    {
      key: "timeline",
      name: "Timeline",
      status: statusFor(timeline.detected, timelineIssues.length),
      source: sourceLabel(preview, timeline.sheetName),
      willCreate: [
        pluralize(timeline.validRowCount, "task"),
        pluralize(timeline.dependencyCount, "dependency", "dependencies"),
      ],
      issueCount: timelineIssues.length,
      skippedCount: timeline.skippedRowCount,
      warnings: timeline.warnings,
      issues: timelineIssues,
      muted: !timeline.detected,
      columns: ["Source row", "Item", "Workstream", "Planning Stage", "Status", "Priority", "Start", "End", "CP", "Owner"],
      records: timeline.rows.map(timelineRecord),
      mappingRows: mappedColumnRows(timeline.mappedColumns, (field) => {
        const sample = timeline.sampleRows[0];
        if (!sample) return "";
        if (field === "title" || field === "task") return sample.task;
        if (field === "workstream") return sample.workstream ? humanizeStatus(sample.workstream) : "";
        if (field === "planningStage") return sample.planningStage ? humanizeStatus(sample.planningStage) : "";
        if (field === "status") return humanizeStatus(sample.status);
        if (field === "priority") return humanizeStatus(sample.priority);
        if (field === "startDate") return sample.startDate ?? "";
        if (field === "endDate") return sample.endDate ?? "";
        if (field === "isCriticalPath") return sample.isCriticalPath ? "Yes" : "No";
        if (field === "owner") return sample.owner ?? "";
        return "";
      }),
    },
  ];
}

function footerReadiness(rows: ModuleSummary[], issues: ReviewIssue[], hasBlockingIssues: boolean): string {
  if (hasBlockingIssues) return `Resolve ${pluralize(issues.filter((issue) => issue.severity === "blocking").length, "issue")} before creating workspace.`;
  const included = rows.filter((row) => !row.muted).map((row) => row.name);
  if (issues.length > 0) {
    const modules = Array.from(new Set(issues.map((issue) => issue.moduleName)));
    const modulePrefix = modules.length === 1 ? `${modules[0]} ` : "";
    return `${issues.length} ${modulePrefix}${issues.length === 1 ? "row" : "rows"} will be skipped unless fixed.`;
  }
  return `Ready to create workspace with ${formatHumanList(included)}.`;
}

function ModulePreviewDialog({
  module,
  activeTab,
  page,
  onTabChange,
  onPageChange,
  onClose,
  onEditMapping,
}: {
  module: ModuleSummary;
  activeTab: PreviewTab;
  page: number;
  onTabChange: (tab: PreviewTab) => void;
  onPageChange: (page: number) => void;
  onClose: () => void;
  onEditMapping?: (module: ModuleKey) => void;
}) {
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(module.records.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const visibleRecords = module.records.slice(safePage * pageSize, safePage * pageSize + pageSize);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/35">
      <section className="flex h-full w-full max-w-3xl flex-col bg-white shadow-xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Review preview</p>
              <h3 className="mt-1 text-[18px] font-semibold text-slate-950">{module.name}</h3>
              <p className="mt-1 text-[12px] text-slate-500">Source: {module.source}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
              aria-label="Close preview"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              ["records", "Preview records"],
              ["issues", "Issues"],
              ["mapping", "Mapping"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => onTabChange(key as PreviewTab)}
                className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold ${
                  activeTab === key
                    ? "border-[#28439A] bg-[#EEF3FF] text-[#28439A]"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {activeTab === "records" ? (
            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] font-semibold text-slate-800">
                  {pluralize(module.records.length, "record")} ready to import
                </p>
                <div className="flex items-center gap-2 text-[12px] text-slate-600">
                  <button
                    type="button"
                    disabled={safePage <= 0}
                    onClick={() => onPageChange(Math.max(0, safePage - 1))}
                    className="rounded-lg border border-slate-200 px-2 py-1 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span>Page {safePage + 1} of {totalPages}</span>
                  <button
                    type="button"
                    disabled={safePage >= totalPages - 1}
                    onClick={() => onPageChange(Math.min(totalPages - 1, safePage + 1))}
                    className="rounded-lg border border-slate-200 px-2 py-1 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
              {module.records.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full border-collapse text-left text-[12px]">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        {module.columns.map((column) => (
                          <th key={column} className="border-b border-slate-200 px-3 py-2 font-semibold">{column}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRecords.map((record, index) => (
                        <tr key={`${module.key}-${safePage}-${index}`} className="border-b border-slate-100 last:border-0">
                          {record.values.map((value, valueIndex) => (
                            <td key={`${module.key}-${safePage}-${index}-${valueIndex}`} className="px-3 py-2 text-slate-700">
                              {value}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-[13px] text-slate-600">
                  No records will be imported for this module.
                </div>
              )}
            </div>
          ) : null}

          {activeTab === "issues" ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[12px] text-slate-700">
                <span className="font-semibold text-slate-900">Skipped rows:</span> {module.skippedCount}
              </div>
              {module.issues.length > 0 ? (
                module.issues.map((issue) => (
                  <div key={issue.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <p className="text-[13px] font-semibold text-amber-900">{issue.reason}</p>
                    <p className="mt-1 text-[12px] text-amber-900">
                      {issue.moduleName} · {issue.sourceFileName} → {issue.sheetName}
                      {issue.rowNumber ? ` · Row ${issue.rowNumber}` : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[12px] text-slate-600">
                        Field: <span className="font-semibold text-slate-800">{issue.field ?? "Source row"}</span>
                      </p>
                      {onEditMapping ? (
                        <button
                          type="button"
                          onClick={() => onEditMapping(issue.module)}
                          className="inline-flex h-8 items-center rounded-lg bg-[#28439A] px-3 text-[12px] font-semibold text-white hover:bg-[#20367d]"
                        >
                          Fix in mapping
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white p-5 text-[13px] text-slate-600">
                  No issues found.
                </div>
              )}
            </div>
          ) : null}

          {activeTab === "mapping" ? (
            <div className="space-y-3">
              {module.mappingRows.length > 0 ? (
                module.mappingRows.map((row) => (
                  <div key={`${row.plannerField}-${row.spreadsheetColumn}`} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                    <div>
                      <p className="text-[12px] font-semibold text-slate-900">{row.plannerField}</p>
                      <p className="mt-1 text-[11px] text-slate-500">Planner field</p>
                    </div>
                    <div>
                      <p className="text-[12px] font-semibold text-slate-900">{row.spreadsheetColumn}</p>
                      <p className="mt-1 text-[11px] text-slate-500">Sample: <span className="text-slate-700">{row.sampleValue}</span></p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-[13px] text-slate-600">
                  No column mappings are available for this module.
                </div>
              )}
              {onEditMapping ? (
                <button
                  type="button"
                  onClick={() => onEditMapping(module.key)}
                  className="inline-flex h-10 items-center rounded-lg bg-[#28439A] px-4 text-[13px] font-semibold text-white hover:bg-[#20367d]"
                >
                  Edit mapping
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export function EventImportPreviewPanel({
  preview,
  onBackToMapping,
}: {
  preview: EventImportPreview;
  onBackToMapping?: (module?: ModuleKey) => void;
}) {
  const [selectedModule, setSelectedModule] = useState<ModuleKey | null>(null);
  const [activeTab, setActiveTab] = useState<PreviewTab>("records");
  const [previewPages, setPreviewPages] = useState<Record<ModuleKey, number>>({
    runOfShow: 0,
    budget: 0,
    timeline: 0,
  });
  const rows = useMemo(() => buildModuleSummaries(preview), [preview]);
  const summary = useMemo(() => summarizeEventImportPreview(preview), [preview]);
  const selectedSummary = rows.find((row) => row.key === selectedModule) ?? null;
  const issues = rows.flatMap((row) => row.issues);
  const issueCount = issues.length;
  const hasBlockingIssues = issues.some((issue) => issue.severity === "blocking") ||
    preview.globalWarnings.some((warning) => warning.severity === "error");
  const includedModuleNames = rows.filter((row) => !row.muted).map((row) => row.name);

  function openPreview(key: ModuleKey) {
    setSelectedModule(key);
    setActiveTab("records");
  }

  function openIssues(key: ModuleKey) {
    setSelectedModule(key);
    setActiveTab("issues");
  }

  function editMapping(module?: ModuleKey) {
    setSelectedModule(null);
    onBackToMapping?.(module);
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-[18px] font-semibold text-slate-950">Review workspace import</h3>
            <p className="mt-1 text-[13px] text-slate-500">
              Nothing will be created until you click Create event workspace.
            </p>
          </div>
          {issueCount > 0 ? (
            <p className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[12px] font-semibold text-amber-800">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              {pluralize(issueCount, "issue")} needs review
            </p>
          ) : (
            <p className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[12px] font-semibold text-emerald-700">
              <CheckCircle2 className="h-4 w-4" aria-hidden />
              Ready to create
            </p>
          )}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Run of Show</p>
            <p className="mt-1 text-[18px] font-semibold text-slate-950">{pluralize(summary.runOfShowRowsToCreate, "session")}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Budget</p>
            <p className="mt-1 text-[18px] font-semibold text-slate-950">{pluralize(summary.budgetLineItemsToCreate, "line item")}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Timeline</p>
            <p className="mt-1 text-[18px] font-semibold text-slate-950">{pluralize(summary.timelineItemsToCreate, "task")}</p>
          </div>
          <div className={`rounded-xl border px-4 py-3 ${issueCount > 0 ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
            <p className={`text-[11px] font-semibold uppercase tracking-wide ${issueCount > 0 ? "text-amber-700" : "text-emerald-700"}`}>Issues</p>
            <p className={`mt-1 text-[18px] font-semibold ${issueCount > 0 ? "text-amber-900" : "text-emerald-800"}`}>
              {issueCount > 0 ? `${issueCount} needs review` : "0 needs review"}
            </p>
          </div>
        </div>

        {issues.length > 0 ? (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[13px] font-semibold text-amber-950">Issues to review</p>
                <p className="mt-1 text-[12px] text-amber-900">
                  These rows were also flagged during mapping and will be skipped unless fixed.
                </p>
              </div>
              <span className="rounded-full border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-900">
                {pluralize(issues.length, "issue")}
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {issues.map((issue) => (
                <div key={issue.id} className="rounded-xl border border-amber-200 bg-white p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[13px] font-semibold text-slate-950">{issue.reason}</p>
                      <p className="mt-1 text-[12px] text-slate-600">
                        {issue.moduleName} · {issue.sourceFileName} → {issue.sheetName}
                        {issue.rowNumber ? ` · Row ${issue.rowNumber}` : ""}
                        {issue.field ? ` · ${issue.field}` : ""}
                      </p>
                    </div>
                    {onBackToMapping ? (
                      <button
                        type="button"
                        onClick={() => editMapping(issue.module)}
                        className="inline-flex h-9 items-center rounded-lg bg-[#28439A] px-3 text-[12px] font-semibold text-white hover:bg-[#20367d]"
                      >
                        Fix in mapping
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-5 grid gap-3">
          {rows.map((row) => (
            <article
              key={row.key}
              className={`rounded-2xl border p-4 ${row.muted ? "border-slate-200 bg-slate-50/80 text-slate-500" : "border-slate-200 bg-white"}`}
            >
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(180px,0.7fr)_auto] lg:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className={`text-[15px] font-semibold ${row.muted ? "text-slate-500" : "text-slate-950"}`}>{row.name}</h4>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusClass(row.status)}`}>
                      {row.status}
                    </span>
                    {row.issueCount > 0 ? (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                        {pluralize(row.issueCount, "issue")}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Source</p>
                    <p className="mt-1 text-[13px] text-slate-700">{row.source}</p>
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Will create</p>
                  {row.muted ? (
                    <p className="mt-1 text-[13px] text-slate-500">Nothing from this module</p>
                  ) : (
                    <ul className="mt-1 space-y-1">
                      {row.willCreate.map((item) => (
                        <li key={item} className="text-[13px] text-slate-700">{item}</li>
                      ))}
                    </ul>
                  )}
                  {row.skippedCount > 0 ? (
                    <p className="mt-2 text-[12px] font-semibold text-amber-800">
                      Skipped rows: {row.skippedCount}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <button
                    type="button"
                    onClick={() => openPreview(row.key)}
                    className="inline-flex h-10 items-center rounded-lg border border-slate-200 px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Review preview
                  </button>
                  {row.issueCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => openIssues(row.key)}
                      className="inline-flex h-10 items-center rounded-lg border border-amber-200 bg-amber-50 px-3 text-[13px] font-semibold text-amber-900 hover:bg-amber-100"
                    >
                      Review issues
                    </button>
                  ) : null}
                  {onBackToMapping ? (
                    <button
                      type="button"
                      onClick={() => editMapping(row.key)}
                      className="inline-flex h-10 items-center rounded-lg px-3 text-[13px] font-semibold text-[#28439A] hover:bg-[#EEF3FF]"
                    >
                      Edit mapping
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className={`rounded-xl border px-4 py-3 text-[13px] ${
          hasBlockingIssues ? "border-rose-200 bg-rose-50 text-rose-800" : issueCount > 0 ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-800"
        }`}>
        {footerReadiness(rows, issues, hasBlockingIssues)}
      </div>

      {selectedSummary ? (
        <ModulePreviewDialog
          module={selectedSummary}
          activeTab={activeTab}
          page={previewPages[selectedSummary.key] ?? 0}
          onTabChange={setActiveTab}
          onPageChange={(page) => setPreviewPages((current) => ({ ...current, [selectedSummary.key]: page }))}
          onClose={() => setSelectedModule(null)}
          onEditMapping={onBackToMapping ? editMapping : undefined}
        />
      ) : null}

      <span className="sr-only">
        Final summary includes {formatHumanList(includedModuleNames)}.
      </span>
    </div>
  );
}
