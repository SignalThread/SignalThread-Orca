/**
 * Event Import Builder — workbook → normalized preview (pure, no writes).
 *
 * This composes the existing per-module import + mapping helpers (matrix / budget
 * / timeline) so the builder never duplicates parsing, column mapping, or row
 * validation. It only detects which sheet feeds which module and folds the
 * per-module validation results into one EventImportPreview.
 *
 * No Prisma, no server imports, no DB writes — safe to run in the browser (the
 * same place the budget/matrix/timeline import wizards already parse files).
 */
import type { ImportMapping, ParsedSheet, ParsedWorkbook } from "@/lib/import";
import {
  buildMatrixDraftRows,
  buildMatrixInitialMapping,
  type MatrixImportField,
} from "@/lib/matrix-import-mapping";
import { validateMatrixImportRows } from "@/lib/matrix-import";
import {
  buildBudgetDraftRows,
  buildBudgetInitialMapping,
  type BudgetImportField,
} from "@/lib/budget-import-mapping";
import { validateBudgetImportRows } from "@/lib/budget-import";
import {
  buildTimelineDraftRows,
  buildTimelineInitialMapping,
  type TimelineImportField,
} from "@/lib/timeline-import-mapping";
import { validateTimelineImportRows } from "@/lib/timeline-import";
import {
  emptyBudgetPreview,
  emptyEventImportPreview,
  emptyRunOfShowPreview,
  emptyTimelinePreview,
  type BudgetPreview,
  type BudgetPreviewRow,
  type EventImportBasics,
  type EventImportBudgetInput,
  type EventImportCreatePlan,
  type EventImportPreview,
  type EventImportRunOfShowInput,
  type EventImportTimelineInput,
  type EventImportWorkbookMapping,
  type ImportWarning,
  type ImportWarningModule,
  type RunOfShowPreview,
  type RunOfShowPreviewRow,
  type TimelinePreview,
  type TimelinePreviewRow,
} from "@/lib/event-import-types";

type ModuleKey = "runOfShow" | "budget" | "timeline";
export type WorkbookSheetModule = ModuleKey | "fnbCatalog" | "notIncluded";
export type WorkbookSheetConfidence = "high" | "medium" | "low" | "unknown";
export type WorkbookSheetSelections = Record<string, WorkbookSheetModule>;
export type WorkbookSheetColumnMappings = Record<string, ImportMapping<string>>;
export type WorkbookSource = {
  fileName: string;
  workbook: ParsedWorkbook;
};

const SHEET_ALIASES: Record<ModuleKey, string[]> = {
  runOfShow: ["run of show", "ros", "agenda", "schedule", "program", "sessions"],
  budget: ["budget", "detailed budget", "budget tracker", "forecast", "actuals", "costs", "expenses", "financials"],
  timeline: ["timeline", "project plan", "milestones", "tasks", "production timeline"],
};

const MODULE_SIGNAL_KEYWORDS: Record<Exclude<WorkbookSheetModule, "notIncluded">, string[]> = {
  runOfShow: ["start time", "end time", "time", "session", "title", "room", "location", "speaker", "track", "description", "agenda", "schedule", "program", "ros"],
  budget: ["item", "line item", "category", "subcategory", "vendor", "planned", "forecast", "qty", "quantity", "unit cost", "cost", "price", "total", "estimate", "actual", "actuals", "variance", "budget", "expenses", "financials", "costing"],
  timeline: ["task", "milestone", "deadline", "due date", "owner", "assignee", "status", "dependency", "complete", "roadmap"],
  fnbCatalog: ["menu item", "meal", "service", "package", "per person", "guarantee", "subtotal", "tax", "gratuity", "f&b", "food", "beverage", "catering"],
};

const MODULE_LABEL: Record<ModuleKey, string> = {
  runOfShow: "Run of Show",
  budget: "Budget",
  timeline: "Timeline",
};

export const WORKBOOK_MODULE_LABEL: Record<WorkbookSheetModule, string> = {
  runOfShow: "Run of Show",
  budget: "Budget",
  timeline: "Timeline",
  fnbCatalog: "F&B Budget / Catalog",
  notIncluded: "Don't include",
};

function normalizeSheetKey(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

export function workbookSourceSheetName(fileName: string, sheetName: string): string {
  return `${fileName} / ${sheetName}`;
}

function combineWorkbookSources(sources: WorkbookSource[]): ParsedWorkbook {
  const sheets = sources.flatMap((source) =>
    source.workbook.sheets.map((sheet) => ({
      ...sheet,
      name: workbookSourceSheetName(source.fileName, sheet.name),
    })),
  );
  return {
    sheetNames: sheets.map((sheet) => sheet.name),
    sheets,
  };
}

export type WorkbookSheetSuggestion = {
  sheetName: string;
  suggestedModule: WorkbookSheetModule;
  confidence: WorkbookSheetConfidence;
  reason: string;
  supported: boolean;
};

export type SheetDetection = {
  matched: Record<ModuleKey, ParsedSheet | null>;
  /** module -> all candidate sheet names (for ambiguity reporting). */
  candidates: Record<ModuleKey, string[]>;
  warnings: ImportWarning[];
  sheets: WorkbookSheetSuggestion[];
  suggestedSelections: WorkbookSheetSelections;
};

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function listColumns(sheet: ParsedSheet, limit = 3): string[] {
  return sheet.columns
    .map((column) => column.header.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function countMappedFields(mapping: Record<string, string | "">): number {
  return Object.values(mapping).filter(Boolean).length;
}

function moduleNameHits(sheetName: string, module: Exclude<WorkbookSheetModule, "notIncluded">, sourceFileName = ""): string[] {
  const normalizedName = normalizeSheetKey(`${sourceFileName} ${sheetName}`);
  const values = module === "fnbCatalog" ? MODULE_SIGNAL_KEYWORDS.fnbCatalog : [MODULE_LABEL[module], ...SHEET_ALIASES[module]];
  return unique(values.filter((candidate) => normalizedName.includes(normalizeSheetKey(candidate))));
}

function keywordHits(values: string[], keywords: string[]): string[] {
  const normalizedValues = values.map(normalizeSheetKey);
  return unique(
    keywords.filter((keyword) =>
      normalizedValues.some((value) => value.includes(normalizeSheetKey(keyword))),
    ),
  );
}

function scoreSupportedModule(sheet: ParsedSheet, module: ModuleKey, sourceFileName = ""): {
  score: number;
  reason: string;
  signalColumns: string[];
} {
  const mapping =
    module === "runOfShow"
      ? buildMatrixInitialMapping(sheet.columns)
      : module === "budget"
        ? buildBudgetInitialMapping(sheet.columns)
        : buildTimelineInitialMapping(sheet.columns);
  const mappedCount = countMappedFields(mapping);
  const missingRequired =
    module === "runOfShow"
      ? mappedCount < 4
      : module === "budget"
        ? mappedCount < 2
        : mappedCount < 2;
  const nameMatches = moduleNameHits(sheet.name, module, sourceFileName);
  const headerMatches = keywordHits(
    sheet.columns.map((column) => column.header),
    MODULE_SIGNAL_KEYWORDS[module],
  );
  const sampleMatches = keywordHits(
    sheet.columns.flatMap((column) => column.samples.slice(0, 3)),
    MODULE_SIGNAL_KEYWORDS[module],
  );
  const signalColumns = sheet.columns
    .filter((column) => headerMatches.includes(normalizeSheetKey(column.header)) || Boolean(mapping[column.id]))
    .map((column) => column.header);
  const score =
    mappedCount * 4 +
    nameMatches.length * 5 +
    headerMatches.length * 3 +
    sampleMatches.length +
    (missingRequired ? 0 : 8);
  const reasonColumns = listColumns(
    {
      ...sheet,
      columns: sheet.columns.filter((column) => signalColumns.includes(column.header)),
    },
    3,
  );
  const reason = reasonColumns.length > 0
    ? `Matched ${MODULE_LABEL[module]} from columns: ${reasonColumns.join(", ")}`
    : nameMatches.length > 0
      ? `Weak match: sheet name suggests ${MODULE_LABEL[module]}, but expected ${MODULE_LABEL[module]} columns were not found`
      : "No clear import columns found";
  return { score, reason, signalColumns: reasonColumns.length > 0 ? reasonColumns : listColumns(sheet) };
}

function scoreFnbModule(sheet: ParsedSheet, sourceFileName = ""): { score: number; reason: string; signalColumns: string[] } {
  const nameMatches = moduleNameHits(sheet.name, "fnbCatalog", sourceFileName);
  const headerMatches = keywordHits(
    sheet.columns.map((column) => column.header),
    MODULE_SIGNAL_KEYWORDS.fnbCatalog,
  );
  const sampleMatches = keywordHits(
    sheet.columns.flatMap((column) => column.samples.slice(0, 3)),
    MODULE_SIGNAL_KEYWORDS.fnbCatalog,
  );
  const score = nameMatches.length * 6 + headerMatches.length * 3 + sampleMatches.length;
  const signalColumns = sheet.columns
    .filter((column) => headerMatches.includes(normalizeSheetKey(column.header)))
    .map((column) => column.header)
    .slice(0, 3);
  const reason =
    signalColumns.length > 0
      ? `Found columns: ${signalColumns.join(", ")}`
      : nameMatches.length > 0
        ? "Sheet name suggests F&B Budget / Catalog"
        : "Looks like a catering or F&B sheet";
  return { score, reason, signalColumns };
}

function confidenceForScores(bestScore: number, secondScore: number): WorkbookSheetConfidence {
  if (bestScore <= 0) return "unknown";
  const margin = bestScore - secondScore;
  if (bestScore >= 18 && margin >= 5) return "high";
  if (bestScore >= 10 && margin >= 3) return "medium";
  if (bestScore >= 6) return "low";
  return "unknown";
}

function suggestModuleForSheet(sheet: ParsedSheet, sourceFileName = ""): WorkbookSheetSuggestion {
  const runOfShow = scoreSupportedModule(sheet, "runOfShow", sourceFileName);
  const budget = scoreSupportedModule(sheet, "budget", sourceFileName);
  const timeline = scoreSupportedModule(sheet, "timeline", sourceFileName);
  const fnbCatalog = scoreFnbModule(sheet, sourceFileName);
  const scored: Array<{ module: Exclude<WorkbookSheetModule, "notIncluded">; score: number; reason: string }> = [
    { module: "runOfShow" as const, score: runOfShow.score, reason: runOfShow.reason },
    { module: "budget" as const, score: budget.score, reason: budget.reason },
    { module: "timeline" as const, score: timeline.score, reason: timeline.reason },
    { module: "fnbCatalog" as const, score: fnbCatalog.score, reason: fnbCatalog.reason },
  ].sort((left, right) => right.score - left.score);

  const best = scored[0]!;
  const second = scored[1]!;
  if (best.score <= 0) {
    return {
      sheetName: sheet.name,
      suggestedModule: "notIncluded",
      confidence: "unknown",
      reason: `No supported import signals found. Available columns: ${listColumns(sheet).join(", ")}`,
      supported: false,
    };
  }

  const confidence = confidenceForScores(best.score, second?.score ?? 0);
  const supported = best.module !== "fnbCatalog";
  const reason =
    best.module === "fnbCatalog"
      ? `${best.reason}. F&B sheets are recognized, but this builder cannot import them yet.`
      : best.reason;
  return {
    sheetName: sheet.name,
    suggestedModule: best.module,
    confidence,
    reason,
    supported,
  };
}

export function buildInitialWorkbookSheetSelections(detection: SheetDetection): WorkbookSheetSelections {
  const selections: WorkbookSheetSelections = Object.fromEntries(
    detection.sheets.map((sheet) => [
      sheet.sheetName,
      sheet.supported && sheet.confidence !== "unknown" ? sheet.suggestedModule : "notIncluded",
    ]),
  );

  for (const moduleKey of Object.keys(MODULE_LABEL) as ModuleKey[]) {
    const selectedSheets = detection.sheets.filter((sheet) => selections[sheet.sheetName] === moduleKey);
    if (selectedSheets.length > 1) {
      for (const sheet of selectedSheets) {
        selections[sheet.sheetName] = "notIncluded";
      }
    }
  }

  return selections;
}

function buildMatchedSheets(
  workbook: ParsedWorkbook,
  selections: WorkbookSheetSelections,
): Record<ModuleKey, ParsedSheet | null> {
  const matched: Record<ModuleKey, ParsedSheet | null> = { runOfShow: null, budget: null, timeline: null };
  for (const moduleKey of Object.keys(MODULE_LABEL) as ModuleKey[]) {
    const selectedSheetName = Object.entries(selections).find(([, selectedModule]) => selectedModule === moduleKey)?.[0];
    matched[moduleKey] = selectedSheetName
      ? workbook.sheets.find((sheet) => sheet.name === selectedSheetName) ?? null
      : null;
  }
  return matched;
}

function buildSelectedSheets(
  workbook: ParsedWorkbook,
  selections: WorkbookSheetSelections,
): Record<ModuleKey, ParsedSheet[]> {
  const selected: Record<ModuleKey, ParsedSheet[]> = { runOfShow: [], budget: [], timeline: [] };
  for (const sheet of workbook.sheets) {
    const moduleKey = selections[sheet.name];
    if (moduleKey === "runOfShow" || moduleKey === "budget" || moduleKey === "timeline") {
      selected[moduleKey].push(sheet);
    }
  }
  return selected;
}

function mappingForSheet(
  sheet: ParsedSheet,
  moduleKey: ModuleKey,
  columnMappings?: WorkbookSheetColumnMappings,
): ImportMapping<string> {
  const override = columnMappings?.[sheet.name];
  if (override) return override;
  if (moduleKey === "runOfShow") return buildMatrixInitialMapping(sheet.columns);
  if (moduleKey === "budget") return buildBudgetInitialMapping(sheet.columns);
  return buildTimelineInitialMapping(sheet.columns);
}

function mergeWarnings<T extends { warnings: ImportWarning[] }>(target: T, warnings: ImportWarning[]): T {
  target.warnings.unshift(...warnings);
  return target;
}

function combineRunOfShowPreviews(previews: RunOfShowPreview[]): RunOfShowPreview {
  if (previews.length === 0) return emptyRunOfShowPreview();
  const combined = emptyRunOfShowPreview();
  combined.detected = true;
  combined.sheetName = previews.map((preview) => preview.sheetName).filter(Boolean).join(", ");
  combined.mappedColumns = previews[0]?.mappedColumns ?? {};
  combined.rows = previews.flatMap((preview) => preview.rows);
  combined.sampleRows = combined.rows.slice(0, 3);
  combined.validRowCount = previews.reduce((sum, preview) => sum + preview.validRowCount, 0);
  combined.skippedRowCount = previews.reduce((sum, preview) => sum + preview.skippedRowCount, 0);
  combined.roomsToCreate = uniqueRoomNames(combined.rows);
  combined.warnings = previews.flatMap((preview) => preview.warnings);
  return combined;
}

function combineBudgetPreviews(previews: BudgetPreview[]): BudgetPreview {
  if (previews.length === 0) return emptyBudgetPreview();
  const combined = emptyBudgetPreview();
  combined.detected = true;
  combined.sheetName = previews.map((preview) => preview.sheetName).filter(Boolean).join(", ");
  combined.mappedColumns = previews[0]?.mappedColumns ?? {};
  combined.rows = previews.flatMap((preview) => preview.rows);
  combined.sampleRows = combined.rows.slice(0, 3);
  combined.validRowCount = previews.reduce((sum, preview) => sum + preview.validRowCount, 0);
  combined.skippedRowCount = previews.reduce((sum, preview) => sum + preview.skippedRowCount, 0);
  combined.estimatedTotalCents = combined.rows.reduce((sum, row) => sum + (row.estimatedCents ?? 0), 0);
  combined.categoryCount = new Set(combined.rows.map((row) => row.category.toLowerCase())).size;
  combined.warnings = previews.flatMap((preview) => preview.warnings);
  return combined;
}

function combineTimelinePreviews(previews: TimelinePreview[]): TimelinePreview {
  if (previews.length === 0) return emptyTimelinePreview();
  const combined = emptyTimelinePreview();
  combined.detected = true;
  combined.sheetName = previews.map((preview) => preview.sheetName).filter(Boolean).join(", ");
  combined.mappedColumns = previews[0]?.mappedColumns ?? {};
  combined.rows = previews.flatMap((preview) => preview.rows);
  combined.sampleRows = combined.rows.slice(0, 3);
  combined.validRowCount = previews.reduce((sum, preview) => sum + preview.validRowCount, 0);
  combined.skippedRowCount = previews.reduce((sum, preview) => sum + preview.skippedRowCount, 0);
  combined.dependencyCount = previews.reduce((sum, preview) => sum + preview.dependencyCount, 0);
  combined.warnings = previews.flatMap((preview) => preview.warnings);
  return combined;
}

/**
 * Detect workbook sheets by sheet name hints plus header/content inspection, then
 * return a user-confirmable mapping model. Suggestions stay pure and never write
 * or silently import ambiguous sheets.
 */
export function detectWorkbookSheets(workbook: ParsedWorkbook, sourceFileName = ""): SheetDetection {
  const candidates: Record<ModuleKey, string[]> = { runOfShow: [], budget: [], timeline: [] };
  const warnings: ImportWarning[] = [];
  const usableSheets = workbook.sheets.filter((sheet) => sheet.columns.length > 0);
  const sheets = usableSheets.map((sheet) => suggestModuleForSheet(sheet, sourceFileName));
  const suggestedSelections = buildInitialWorkbookSheetSelections({
    matched: { runOfShow: null, budget: null, timeline: null },
    candidates,
    warnings: [],
    sheets,
    suggestedSelections: {},
  });

  for (const moduleKey of Object.keys(MODULE_LABEL) as ModuleKey[]) {
    const exactName = normalizeSheetKey(MODULE_LABEL[moduleKey]);
    candidates[moduleKey] = usableSheets
      .filter((sheet) => {
        const normalized = normalizeSheetKey(sheet.name);
        const normalizedSource = normalizeSheetKey(`${sourceFileName} ${sheet.name}`);
        return normalized === exactName || SHEET_ALIASES[moduleKey].includes(normalized) || SHEET_ALIASES[moduleKey].some((alias) => normalizedSource.includes(alias));
      })
      .map((sheet) => sheet.name);

    if (!Object.values(suggestedSelections).includes(moduleKey)) {
      warnings.push({
        module: moduleKey,
        severity: "info",
        message: `No ${MODULE_LABEL[moduleKey]} sheet is mapped yet. You can continue without it.`,
      });
    }
    const moduleSuggestions = sheets.filter((sheet) => sheet.suggestedModule === moduleKey);
    if (moduleSuggestions.length > 1) {
      warnings.push({
        module: moduleKey,
        severity: "warning",
        message: `Multiple sheets could be ${MODULE_LABEL[moduleKey]} (${moduleSuggestions
          .map((sheet) => sheet.sheetName)
          .join(", ")}). Choose the one you want to import.`,
      });
    }
  }

  const matched = buildMatchedSheets(workbook, suggestedSelections);
  return { matched, candidates, warnings, sheets, suggestedSelections };
}

function mappedColumnsDisplay(sheet: ParsedSheet, mapping: Record<string, string | "">): Record<string, string | null> {
  const display: Record<string, string | null> = {};
  for (const column of sheet.columns) {
    const field = mapping[column.id];
    display[column.header] = field ? field : null;
  }
  return display;
}

/** Convert a per-module validation result's row issues into preview warnings. */
function sourcePartsFromSheetName(sheetName: string): { sourceFileName?: string; sheetName: string } {
  const [first, ...rest] = sheetName.split(" / ");
  return rest.length > 0
    ? { sourceFileName: first, sheetName: rest.join(" / ") }
    : { sheetName };
}

function fieldFromIssueMessage(message: string): string | undefined {
  const normalized = message.toLowerCase();
  if (normalized.includes("end date")) return "End Date";
  if (normalized.includes("start date")) return "Start Date";
  if (normalized.includes("start time")) return "Start Time";
  if (normalized.includes("end time")) return "End Time";
  if (normalized.includes("session")) return "Session";
  if (normalized.includes("item")) return "Item";
  if (normalized.includes("category")) return "Category";
  if (normalized.includes("forecast") || normalized.includes("planned")) return "Planned / Forecast";
  if (normalized.includes("date")) return "Date";
  if (normalized.includes("attendance")) return "Attendance";
  return undefined;
}

function collectRowWarnings(
  module: ImportWarningModule,
  sourceSheetName: string,
  rows: Array<{ rowNumber: number; isBlank: boolean; isValid: boolean; errors: string[]; warnings: string[] }>,
  cap = 50,
): ImportWarning[] {
  const out: ImportWarning[] = [];
  const source = sourcePartsFromSheetName(sourceSheetName);
  for (const row of rows) {
    if (out.length >= cap) break;
    if (!row.isBlank && !row.isValid && row.errors.length > 0) {
      const message = row.errors.join(" ");
      out.push({ module, severity: "error", ...source, rowNumber: row.rowNumber, field: fieldFromIssueMessage(message), message });
    } else if (row.warnings.length > 0) {
      const message = row.warnings.join(" ");
      out.push({ module, severity: "warning", ...source, rowNumber: row.rowNumber, field: fieldFromIssueMessage(message), message });
    }
  }
  return out;
}

function uniqueRoomNames(rows: Array<{ roomName: string | null }>): string[] {
  const seen = new Map<string, string>();
  for (const row of rows) {
    const name = row.roomName?.replace(/\s+/g, " ").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (!seen.has(key)) seen.set(key, name);
  }
  return [...seen.values()];
}

export function buildRunOfShowPreview(sheet: ParsedSheet, mapping = buildMatrixInitialMapping(sheet.columns)): RunOfShowPreview {
  const { draftRows, rowNumbers } = buildMatrixDraftRows(sheet, mapping);
  const validation = validateMatrixImportRows(draftRows, { rowNumbers });
  const rows: RunOfShowPreviewRow[] = validation.rows.flatMap((validated) => validated.normalized ? [{
    sourceRowNumber: validated.rowNumber,
    title: validated.normalized.sessionName,
    date: validated.normalized.dayDateIso || null,
    startTime: validated.normalized.startTime || null,
    endTime: validated.normalized.endTime || null,
    roomName: validated.normalized.roomName,
    setupType: validated.normalized.setupType,
    avNeeds: validated.normalized.avNeeds,
    notes: validated.normalized.notes || null,
  }] : []);
  return {
    ...emptyRunOfShowPreview(),
    detected: true,
    sheetName: sheet.name,
    mappedColumns: mappedColumnsDisplay(sheet, mapping),
    rows,
    sampleRows: rows.slice(0, 3),
    validRowCount: validation.validCount,
    skippedRowCount: validation.invalidCount + validation.blankCount,
    roomsToCreate: uniqueRoomNames(validation.validRows),
    warnings: collectRowWarnings("runOfShow", sheet.name, validation.rows),
  };
}

export function buildBudgetPreview(sheet: ParsedSheet, mapping = buildBudgetInitialMapping(sheet.columns)): BudgetPreview {
  const { draftRows, rowNumbers } = buildBudgetDraftRows(sheet, mapping);
  const validation = validateBudgetImportRows(draftRows, { rowNumbers });
  const rows: BudgetPreviewRow[] = validation.rows.flatMap((validated) => validated.normalized ? [{
    sourceRowNumber: validated.rowNumber,
    category: validated.normalized.category,
    lineItem: validated.normalized.lineItem,
    vendor: validated.normalized.vendor ?? null,
    estimatedCents: validated.normalized.forecastCents,
    actualCents: validated.normalized.actualCents,
    status: validated.normalized.status ?? "PLANNED",
  }] : []);
  const estimatedTotalCents = rows.reduce((sum, row) => sum + (row.estimatedCents ?? 0), 0);
  const categoryCount = new Set(rows.map((row) => row.category.toLowerCase())).size;
  return {
    ...emptyBudgetPreview(),
    detected: true,
    sheetName: sheet.name,
    mappedColumns: mappedColumnsDisplay(sheet, mapping),
    rows,
    sampleRows: rows.slice(0, 3),
    validRowCount: validation.validCount,
    skippedRowCount: validation.invalidCount + validation.blankCount,
    estimatedTotalCents,
    categoryCount,
    warnings: collectRowWarnings("budget", sheet.name, validation.rows),
  };
}

export function buildTimelinePreview(sheet: ParsedSheet, mapping = buildTimelineInitialMapping(sheet.columns)): TimelinePreview {
  const { draftRows, rowNumbers } = buildTimelineDraftRows(sheet, mapping);
  const validation = validateTimelineImportRows(draftRows, { rowNumbers });
  const rows: TimelinePreviewRow[] = validation.rows.flatMap((validated) => validated.normalized ? [{
    sourceRowNumber: validated.rowNumber,
    task: validated.normalized.title,
    startDate: validated.normalized.startDateIso || null,
    endDate: validated.normalized.endDateIso || null,
    status: validated.normalized.status,
    priority: validated.normalized.priority,
    workstream: validated.normalized.workstream,
    planningStage: validated.normalized.planningStage,
    isCriticalPath: validated.normalized.isCriticalPath,
    notes: validated.normalized.notes,
    owner: validated.normalized.ownerSource,
    // Dependency columns are not parsed yet.
    dependency: null,
  }] : []);
  const warnings = collectRowWarnings("timeline", sheet.name, validation.rows);
  return {
    ...emptyTimelinePreview(),
    detected: true,
    sheetName: sheet.name,
    mappedColumns: mappedColumnsDisplay(sheet, mapping),
    rows,
    sampleRows: rows.slice(0, 3),
    validRowCount: validation.validCount,
    skippedRowCount: validation.invalidCount + validation.blankCount,
    dependencyCount: 0,
    warnings,
  };
}

/**
 * Build a normalized EventImportPreview from a parsed workbook. Pure: detects
 * sheets, runs each module's existing validation, and assembles the preview.
 * No records are created.
 */
export function createImportPreviewFromWorkbook(
  workbook: ParsedWorkbook,
  eventBasics: EventImportBasics,
  fileName?: string,
  selections?: WorkbookSheetSelections,
  columnMappings?: WorkbookSheetColumnMappings,
): EventImportPreview {
  const preview = emptyEventImportPreview(eventBasics, "workbook");
  preview.fileName = fileName;

  const detection = detectWorkbookSheets(workbook);
  const effectiveSelections = selections ?? detection.suggestedSelections;
  const selected = buildSelectedSheets(workbook, effectiveSelections);
  preview.globalWarnings.push(...detection.warnings.filter((w) => w.severity === "warning"));
  // Per-module "not found / using alias" info notices live on the module card.
  for (const w of detection.warnings.filter((w) => w.severity === "info")) {
    const moduleKey = w.module as ModuleKey;
    if (selected[moduleKey].length > 0) continue;
    if (moduleKey === "runOfShow") preview.modules.runOfShow.warnings.push(w);
    else if (moduleKey === "budget") preview.modules.budget.warnings.push(w);
    else if (moduleKey === "timeline") preview.modules.timeline.warnings.push(w);
  }

  if (selected.runOfShow.length > 0) {
    const rosWarnings = preview.modules.runOfShow.warnings;
    preview.modules.runOfShow = mergeWarnings(
      combineRunOfShowPreviews(
        selected.runOfShow.map((sheet) =>
          buildRunOfShowPreview(
            sheet,
            mappingForSheet(sheet, "runOfShow", columnMappings) as ImportMapping<MatrixImportField>,
          ),
        ),
      ),
      rosWarnings,
    );
  }
  if (selected.budget.length > 0) {
    const budgetWarnings = preview.modules.budget.warnings;
    preview.modules.budget = mergeWarnings(
      combineBudgetPreviews(
        selected.budget.map((sheet) =>
          buildBudgetPreview(sheet, mappingForSheet(sheet, "budget", columnMappings) as ImportMapping<BudgetImportField>),
        ),
      ),
      budgetWarnings,
    );
  }
  if (selected.timeline.length > 0) {
    const timelineWarnings = preview.modules.timeline.warnings;
    preview.modules.timeline = mergeWarnings(
      combineTimelinePreviews(
        selected.timeline.map((sheet) =>
          buildTimelinePreview(
            sheet,
            mappingForSheet(sheet, "timeline", columnMappings) as ImportMapping<TimelineImportField>,
          ),
        ),
      ),
      timelineWarnings,
    );
  }

  const skippedSheets = workbook.sheets
    .filter((sheet) => sheet.columns.length > 0)
    .filter((sheet) => (effectiveSelections[sheet.name] ?? "notIncluded") === "notIncluded");
  if (skippedSheets.length > 0) {
    preview.globalWarnings.push({
      module: "global",
      severity: "info",
      message: `Skipped sheets: ${skippedSheets.map((sheet) => sheet.name).join(", ")}.`,
    });
  }

  if (workbook.sheets.filter((s) => s.columns.length > 0).length === 0) {
    preview.globalWarnings.push({
      module: "global",
      severity: "error",
      message: "No readable sheets were found in this workbook.",
    });
  }

  return preview;
}

export function createImportPreviewFromWorkbookSources(
  sources: WorkbookSource[],
  eventBasics: EventImportBasics,
  selections?: WorkbookSheetSelections,
  columnMappings?: WorkbookSheetColumnMappings,
): EventImportPreview {
  const combined = combineWorkbookSources(sources);
  const preview = createImportPreviewFromWorkbook(
    combined,
    eventBasics,
    sources.map((source) => source.fileName).join(", "),
    selections,
    columnMappings,
  );
  if (sources.length > 1) {
    preview.globalWarnings.push({
      module: "global",
      severity: "info",
      message: `Parsed ${sources.length} source files: ${sources.map((source) => source.fileName).join(", ")}.`,
    });
  }
  return preview;
}

/**
 * Build the server create plan from a parsed workbook. Re-runs the same canonical
 * per-module validation as the preview (deterministic, pure) and emits only the
 * writable normalized rows. The server re-checks access + scope before writing.
 */
export function buildWorkbookCreatePlan(
  workbook: ParsedWorkbook,
  eventBasics: EventImportBasics,
  selections?: WorkbookSheetSelections,
  columnMappings?: WorkbookSheetColumnMappings,
): EventImportCreatePlan {
  const detection = detectWorkbookSheets(workbook);
  const effectiveSelections = selections ?? detection.suggestedSelections;
  const selected = buildSelectedSheets(workbook, effectiveSelections);
  const workbookMappings: EventImportWorkbookMapping[] = workbook.sheets
    .filter((sheet) => sheet.columns.length > 0)
    .map((sheet) => {
      const selectedTarget = effectiveSelections[sheet.name] ?? "notIncluded";
      const [fileName, ...sheetParts] = sheet.name.split(" / ");
      const displaySheetName = sheetParts.length > 0 ? sheetParts.join(" / ") : sheet.name;
      const mapping =
        selectedTarget === "runOfShow" || selectedTarget === "budget" || selectedTarget === "timeline"
          ? mappingForSheet(sheet, selectedTarget, columnMappings)
          : {};
      return {
        fileName: sheetParts.length > 0 ? fileName ?? "" : "",
        sheetName: displaySheetName,
        sourceSheetName: sheet.name,
        selectedTarget:
          selectedTarget === "runOfShow" || selectedTarget === "budget" || selectedTarget === "timeline"
            ? selectedTarget
            : "notIncluded",
        columnMapping: Object.fromEntries(
          sheet.columns.map((column) => [column.header, mapping[column.id] ?? ""]),
        ),
        skipped: selectedTarget === "notIncluded" || selectedTarget === "fnbCatalog",
      };
    });

  const runOfShow: EventImportRunOfShowInput[] = [];
  for (const sheet of selected.runOfShow) {
    const mapping = mappingForSheet(sheet, "runOfShow", columnMappings) as ImportMapping<MatrixImportField>;
    const { draftRows, rowNumbers } = buildMatrixDraftRows(sheet, mapping);
    for (const row of validateMatrixImportRows(draftRows, { rowNumbers }).validRows) {
      runOfShow.push({
        sessionName: row.sessionName,
        dayDateIso: row.dayDateIso,
        startTime: row.startTime,
        endTime: row.endTime,
        roomName: row.roomName,
        setupType: row.setupType,
        avNeeds: row.avNeeds,
        attendance: row.attendance,
        notes: row.notes,
      });
    }
  }

  const budget: EventImportBudgetInput[] = [];
  for (const sheet of selected.budget) {
    const mapping = mappingForSheet(sheet, "budget", columnMappings) as ImportMapping<BudgetImportField>;
    const { draftRows, rowNumbers } = buildBudgetDraftRows(sheet, mapping);
    for (const row of validateBudgetImportRows(draftRows, { rowNumbers }).validRows) {
      budget.push({
        category: row.category,
        subcategory: row.subcategory ?? null,
        lineItem: row.lineItem,
        vendor: row.vendor ?? null,
        forecastCents: row.forecastCents,
        actualCents: row.actualCents,
        status: row.status ?? null,
      });
    }
  }

  const timeline: EventImportTimelineInput[] = [];
  for (const sheet of selected.timeline) {
    const mapping = mappingForSheet(sheet, "timeline", columnMappings) as ImportMapping<TimelineImportField>;
    const { draftRows, rowNumbers } = buildTimelineDraftRows(sheet, mapping);
    for (const row of validateTimelineImportRows(draftRows, { rowNumbers }).validRows) {
      timeline.push({
        title: row.title,
        startDateIso: row.startDateIso,
        endDateIso: row.endDateIso,
        status: row.status,
        priority: row.priority,
        workstream: row.workstream,
        planningStage: row.planningStage,
        isCriticalPath: row.isCriticalPath,
        notes: row.notes,
        owner: row.ownerSource,
      });
    }
  }

  return {
    eventBasics,
    sourceType: "workbook",
    workbookMappings,
    runOfShow,
    budget,
    timeline,
    // Workbook timeline dependency columns are not parsed by the existing import
    // path yet, so no dependencies are inferred from workbooks.
    timelineDependencies: [],
  };
}

export function buildWorkbookSourcesCreatePlan(
  sources: WorkbookSource[],
  eventBasics: EventImportBasics,
  selections?: WorkbookSheetSelections,
  columnMappings?: WorkbookSheetColumnMappings,
): EventImportCreatePlan {
  return buildWorkbookCreatePlan(combineWorkbookSources(sources), eventBasics, selections, columnMappings);
}
