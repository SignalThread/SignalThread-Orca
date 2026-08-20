/**
 * Shared, pure types for the Event Import Builder.
 *
 * These describe the normalized preview/plan that sits between parsing (workbook
 * / pasted agenda / template) and server-side creation. No React, no server, no
 * Prisma imports here so the type can be shared by client UI, server
 * orchestration, and tests. The same shape backs the mock preview (Pass 1) and
 * the real parsed preview (Pass 2+), so the UI never has to be rewritten.
 */

export type EventImportMethod = "workbook" | "pasteAgenda" | "template" | "blank";

export type EventImportBasics = {
  name: string;
  clientId?: string | null;
  /** ISO `YYYY-MM-DD`. */
  startDate: string;
  /** ISO `YYYY-MM-DD`. */
  endDate: string;
  venueName?: string | null;
  city?: string | null;
  timezone: string;
  estimatedAttendees?: number | null;
};

export type ImportWarningSeverity = "info" | "warning" | "error";
export type ImportWarningModule = "runOfShow" | "budget" | "timeline" | "global";

export type ImportWarning = {
  module: ImportWarningModule;
  severity: ImportWarningSeverity;
  sourceFileName?: string;
  sheetName?: string;
  /** 1-based source row number when the warning is row-specific. */
  rowNumber?: number;
  field?: string;
  message: string;
};

// --- Normalized preview rows (align with per-module normalized rows) --------

export type RunOfShowPreviewRow = {
  sourceRowNumber?: number;
  title: string;
  /** ISO `YYYY-MM-DD` or null. */
  date: string | null;
  /** 24h `HH:MM` or null. */
  startTime: string | null;
  /** 24h `HH:MM` or null. */
  endTime: string | null;
  roomName: string | null;
  setupType?: string | null;
  avNeeds?: string | null;
  notes: string | null;
};

export type BudgetPreviewRow = {
  sourceRowNumber?: number;
  category: string;
  lineItem: string;
  vendor: string | null;
  estimatedCents: number | null;
  actualCents: number | null;
  status?: string;
};

export type TimelinePreviewRow = {
  sourceRowNumber?: number;
  task: string;
  /** ISO `YYYY-MM-DD` or null. */
  startDate: string | null;
  /** ISO `YYYY-MM-DD` or null. */
  endDate: string | null;
  /** A canonical TimelineStatus value (NOT_STARTED, IN_PROGRESS, AT_RISK, COMPLETE). */
  status: string;
  priority: string;
  workstream: string | null;
  planningStage: string | null;
  isCriticalPath: boolean;
  notes: string | null;
  /** Exact source identity to resolve safely after the event exists. */
  owner?: string | null;
  /** Raw dependency reference text, unresolved at preview time. */
  dependency: string | null;
};

export type ModulePreview<T> = {
  detected: boolean;
  sheetName?: string;
  mappedColumns: Record<string, string | null>;
  rows: T[];
  validRowCount: number;
  skippedRowCount: number;
  warnings: ImportWarning[];
  sampleRows: T[];
};

export type RunOfShowPreview = ModulePreview<RunOfShowPreviewRow> & {
  roomsToCreate: string[];
};

export type BudgetPreview = ModulePreview<BudgetPreviewRow> & {
  estimatedTotalCents: number;
  categoryCount: number;
};

export type TimelinePreview = ModulePreview<TimelinePreviewRow> & {
  /** Count of dependency references that resolve to exactly one imported task. */
  dependencyCount: number;
};

export type EventImportPreview = {
  eventBasics: EventImportBasics;
  sourceType: EventImportMethod;
  fileName?: string;
  templateKey?: string;
  modules: {
    runOfShow: RunOfShowPreview;
    budget: BudgetPreview;
    timeline: TimelinePreview;
  };
  globalWarnings: ImportWarning[];
};

// --- Create plan (client → server boundary) ---------------------------------
// These rows mirror the per-module import build-helper inputs so the server can
// feed them straight into the canonical buildMatrix/Budget/Timeline create data
// helpers. Kept as plain shapes (no server/Prisma imports) so the plan can be
// serialized over the wire.

export type EventImportRunOfShowInput = {
  sessionName: string;
  /** ISO `YYYY-MM-DD`. */
  dayDateIso: string;
  /** 24h `HH:MM`. */
  startTime: string;
  /** 24h `HH:MM`. */
  endTime: string;
  roomName: string | null;
  setupType: string | null;
  avNeeds: string | null;
  attendance: number | null;
  notes: string;
};

export type EventImportBudgetInput = {
  category: string;
  subcategory: string | null;
  lineItem: string;
  vendor: string | null;
  forecastCents: number;
  actualCents: number;
  status: string | null;
};

export type EventImportTimelineInput = {
  title: string;
  /** ISO `YYYY-MM-DD`. */
  startDateIso?: string | null;
  /** ISO `YYYY-MM-DD`. */
  endDateIso?: string | null;
  /** Canonical TimelineStatus value. */
  status: string;
  priority?: string;
  workstream?: string | null;
  planningStage?: string | null;
  isCriticalPath?: boolean;
  notes?: string | null;
  /** Exact source name/email; server resolves only one same-org match. */
  owner?: string | null;
};

export type EventImportDependencyInput = {
  predecessorTitle: string;
  successorTitle: string;
};

export type EventImportWorkbookMapping = {
  fileName: string;
  sheetName: string;
  sourceSheetName: string;
  selectedTarget: "runOfShow" | "budget" | "timeline" | "notIncluded";
  columnMapping: Record<string, string>;
  skipped: boolean;
};

export type EventImportCreatePlan = {
  eventBasics: EventImportBasics;
  sourceType: EventImportMethod;
  workbookMappings?: EventImportWorkbookMapping[];
  runOfShow: EventImportRunOfShowInput[];
  budget: EventImportBudgetInput[];
  timeline: EventImportTimelineInput[];
  timelineDependencies: EventImportDependencyInput[];
};

export type EventImportApprovalEvidence = {
  confirmed: boolean;
  reviewedAt: string;
  evidence: "FINAL_REVIEW";
  omissionsAcknowledged?: boolean;
  omissions?: {
    skippedSheets: Array<{ fileName: string; sheetName: string }>;
    skippedColumns: Array<{ fileName: string; sheetName: string; column: string }>;
    skippedRows: Array<{ fileName: string; sheetName: string; rowNumber: number; reason: string }>;
  };
};

export type EventImportCreateRequest = EventImportCreatePlan & {
  idempotencyKey: string;
  approval: EventImportApprovalEvidence;
};

export type EventImportCreateResult = {
  eventId: string;
  intentId?: string;
  replayed?: boolean;
  created: {
    rooms: number;
    runOfShowRows: number;
    budgetLineItems: number;
    timelineItems: number;
    timelineDependencies: number;
  };
  skipped: {
    runOfShowRows: number;
    budgetLineItems: number;
    timelineItems: number;
  };
  warnings: ImportWarning[];
};

// --- Factories --------------------------------------------------------------

function baseModulePreview<T>(): ModulePreview<T> {
  return {
    detected: false,
    mappedColumns: {},
    rows: [],
    validRowCount: 0,
    skippedRowCount: 0,
    warnings: [],
    sampleRows: [],
  };
}

export function emptyRunOfShowPreview(): RunOfShowPreview {
  return { ...baseModulePreview<RunOfShowPreviewRow>(), roomsToCreate: [] };
}

export function emptyBudgetPreview(): BudgetPreview {
  return { ...baseModulePreview<BudgetPreviewRow>(), estimatedTotalCents: 0, categoryCount: 0 };
}

export function emptyTimelinePreview(): TimelinePreview {
  return { ...baseModulePreview<TimelinePreviewRow>(), dependencyCount: 0 };
}

export function emptyEventImportPreview(
  eventBasics: EventImportBasics,
  sourceType: EventImportMethod,
): EventImportPreview {
  return {
    eventBasics,
    sourceType,
    modules: {
      runOfShow: emptyRunOfShowPreview(),
      budget: emptyBudgetPreview(),
      timeline: emptyTimelinePreview(),
    },
    globalWarnings: [],
  };
}

export type EventImportPreviewSummary = {
  roomsToCreate: number;
  runOfShowRowsToCreate: number;
  budgetLineItemsToCreate: number;
  timelineItemsToCreate: number;
  timelineDependencies: number;
  estimatedTotalCents: number;
  totalWarnings: number;
  totalSkippedRows: number;
  hasAnyValidRows: boolean;
};

/** Derive aggregate "this will create" counts from a preview. */
export function summarizeEventImportPreview(preview: EventImportPreview): EventImportPreviewSummary {
  const { runOfShow, budget, timeline } = preview.modules;
  const totalWarnings =
    preview.globalWarnings.length +
    runOfShow.warnings.length +
    budget.warnings.length +
    timeline.warnings.length;
  const totalSkippedRows =
    runOfShow.skippedRowCount + budget.skippedRowCount + timeline.skippedRowCount;
  return {
    roomsToCreate: runOfShow.roomsToCreate.length,
    runOfShowRowsToCreate: runOfShow.validRowCount,
    budgetLineItemsToCreate: budget.validRowCount,
    timelineItemsToCreate: timeline.validRowCount,
    timelineDependencies: timeline.dependencyCount,
    estimatedTotalCents: budget.estimatedTotalCents,
    totalWarnings,
    totalSkippedRows,
    hasAnyValidRows:
      runOfShow.validRowCount > 0 || budget.validRowCount > 0 || timeline.validRowCount > 0,
  };
}
