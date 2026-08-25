import {
  BudgetApprovalStatus,
  BudgetActivityType,
  EventMemberRole,
  BudgetLineItemApproval,
  BudgetLineItemStatus,
  BudgetSubmissionStatus,
  BudgetStatus,
  DocumentLinkType,
  Prisma,
  UserRole,
  type Budget,
  type BudgetApproval,
  type BudgetActivity,
  type BudgetLineItem,
  type BudgetSubmission,
  type BudgetSubmissionLineItem,
  type BudgetSubmissionRecipient,
  type DocumentStatus,
  type User,
} from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { recordEventActivity } from "@/src/server/services/event-activity";
import {
  budgetActor,
  buildLineItemDiff,
  formatCents,
  type BudgetAuditActor,
} from "@/src/server/services/budget-activity-audit";
import {
  budgetCategoriesMatch,
  budgetFilterValuesMatch,
  getBudgetCategoryDisplay,
  normalizeBudgetCategoryForStorage,
} from "@/lib/budget-category-filter";
import {
  buildSessionTitleIndex,
  normalizeNameKey,
  resolveImportSessionId,
} from "@/lib/budget-import-session-group";
import {
  createDocumentCategoryForEvent,
  createDocumentDraft,
  createDocumentUploadPresign,
  DocumentServiceError,
  finalizeDocumentUpload,
  getDownloadForDocument,
} from "@/src/server/services/documents";
import { createNotification } from "@/src/server/services/notifications";
import { shouldLogBudgetDebug } from "@/lib/logging/log-policy";
import { calculateBudgetAggregation, calculateBudgetTotals, calculateBudgetTotalsFromSums } from "@/lib/budget-money";
import { getEventApprovalWorkflows } from "@/lib/event-approval-workflows";

export class BudgetServiceError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

type UserMini = Pick<User, "id" | "name" | "email">;

export type BudgetWithMeta = Budget & {
  submittedByUser: UserMini | null;
  approvedByUser: UserMini | null;
  rejectedByUser: UserMini | null;
};

export type BudgetActivityWithActor = BudgetActivity & {
  actorUser: UserMini | null;
};

export type BudgetApprovalWithActor = BudgetApproval & {
  actedByUser: UserMini;
};

export type BudgetLineItemLinkedRequirement = {
  sessionId: string;
  sessionTitle: string | null;
  requirementItemId: string;
  requirementItemName: string;
  requirementSectionId: string;
  requirementSectionName: string;
  requirementQuantity: number | null;
};

export type BudgetLineItemWithDocs = BudgetLineItem & {
  documentCount: number;
  firstDocumentId: string | null;
  // Human-readable labels for the persisted session (matrixRowId) and group
  // (groupId) links. Null when unassigned or the session/group was removed.
  sessionTitle: string | null;
  groupName: string | null;
  groupColor: string | null;
  linkedSessionRequirement: BudgetLineItemLinkedRequirement | null;
};

type SubmissionRecipientWithUser = BudgetSubmissionRecipient & {
  user: UserMini;
};

type SubmissionLineItemWithItem = BudgetSubmissionLineItem & {
  budgetLineItem: BudgetLineItem;
};

export type BudgetSubmissionWithDetails = BudgetSubmission & {
  submittedByUser: UserMini;
  pulledBackByUser: UserMini | null;
  recipients: SubmissionRecipientWithUser[];
  lineItems: SubmissionLineItemWithItem[];
};

export type BudgetSnapshot = {
  budget: BudgetWithMeta;
  lineItems: BudgetLineItemWithDocs[];
  // Authoritative count over the full Budget, independent of whether the full
  // line-item array was materialized (light snapshot loads no rows but must
  // still expose the true count for empty-state/count chrome).
  lineItemCount: number;
  activity: BudgetActivityWithActor[];
  submissionRecipients: UserMini[];
  submissions: BudgetSubmissionSummary[];
  budgetFiles: BudgetFilesSnapshot;
  totals: {
    totalForecastCents: number;
    totalActualCents: number;
    varianceCents: number;
    percentUnder: number;
  };
};

type BudgetFileAction = "UPLOADED" | "REPLACED";

export type BudgetFileRecord = {
  documentId: string;
  documentTitle: string;
  documentStatus: DocumentStatus;
  versionId: string;
  versionNumber: number;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  uploadedAt: string;
  uploadedByUser: UserMini;
  linkedBudgetVersionId: string | null;
  linkedBudgetVersionNumber: number | null;
};

export type BudgetFileActivity = {
  id: string;
  action: BudgetFileAction;
  createdAt: string;
  actorUser: UserMini | null;
  note: string | null;
  documentId: string | null;
  versionId: string | null;
  originalFilename: string | null;
  linkedBudgetVersionId: string | null;
  linkedBudgetVersionNumber: number | null;
};

export type BudgetFilesSnapshot = {
  latestFile: BudgetFileRecord | null;
  history: BudgetFileRecord[];
  activity: BudgetFileActivity[];
};

export type BudgetCsvExportPayload = {
  csv: string;
  filename: string;
};

export type BudgetVarianceByCategory = {
  category: string;
  lineItemCount: number;
  totalForecastCents: number;
  totalActualCents: number;
  varianceCents: number;
  variancePercent: number | null;
};

export type BudgetVarianceLineItem = {
  id: string;
  category: string;
  subcategory: string;
  lineItem: string;
  vendor: string | null;
  status: BudgetLineItemStatus;
  approval: BudgetLineItemApproval;
  forecastCents: number;
  actualCents: number;
  varianceCents: number;
  variancePercent: number | null;
};

export type BudgetFinancialReport = {
  generatedAt: string;
  forecastVsActual: {
    totalForecastCents: number;
    totalActualCents: number;
    varianceCents: number;
    variancePercent: number | null;
    lineItemCount: number;
  };
  varianceByCategory: BudgetVarianceByCategory[];
  topOverBudgetItems: BudgetVarianceLineItem[];
  topUnderBudgetItems: BudgetVarianceLineItem[];
  versionContext: {
    eventId: string;
    budgetId: string;
    budgetStatus: BudgetStatus;
    budgetVersionId: string | null;
    budgetVersionNumber: number | null;
    lineItemCount: number;
  };
};

export type BudgetDashboardLink = {
  href: string;
  filters: Record<string, string>;
};

export type BudgetDashboardSummary = {
  totalForecastCents: number;
  totalActualCents: number;
  remainingCents: number;
  varianceCents: number;
  lineItemCount: number;
  pendingActionCount: number;
};

export type BudgetDashboardCategoryBreakdown = {
  category: string;
  forecastCents: number;
  actualCents: number;
  varianceCents: number;
  percentUsed: number;
  lineItemCount: number;
  pendingCount: number;
  link: BudgetDashboardLink;
};

export type BudgetDashboardWorkItem = {
  id: string;
  type: "APPROVAL_REVIEW" | "REVISION_NEEDED";
  sourceModule: "budget";
  sourceId: string;
  title: string;
  description: string;
  status: "pending_review" | "revision_needed";
  priority: "low" | "medium" | "high";
  assignee: UserMini | null;
  dueAt: string | null;
  createdAt: string;
  actionLabel: string;
  link: BudgetDashboardLink;
};

export type BudgetDashboardActivity = {
  id: string;
  action: BudgetActivityType;
  title: string;
  description: string;
  actor: UserMini | null;
  createdAt: string;
  sourceId: string | null;
  sourceType: "budget" | "budget_submission" | "budget_file" | null;
  dollarImpactCents: number | null;
};

export type BudgetDashboard = {
  generatedAt: string;
  budget: {
    id: string;
    eventId: string;
    status: BudgetStatus;
    currentVersionId: string | null;
  };
  permissions: {
    canWriteBudget: boolean;
  };
  summary: BudgetDashboardSummary;
  categoryBreakdown: BudgetDashboardCategoryBreakdown[];
  workQueue: BudgetDashboardWorkItem[];
  recentActivity: BudgetDashboardActivity[];
};

export type BudgetAccessUser = {
  id: string;
  orgId: string | null;
  role: UserRole;
};

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
} satisfies Prisma.UserSelect;

const BUDGET_FILE_CATEGORY_NAME = "Budget Files";
const BUDGET_FILE_CATEGORY_SLUG = "budget-files";
const BUDGET_FILE_CATEGORY_COLOR = "#0f766e";
const BUDGET_FILE_ACTIVITY_PREFIX = "[[BUDGET_FILE]]";

const BUDGET_SUBMISSION_REQUESTED_NOTIFICATION_TYPE = "BUDGET_SUBMISSION_REQUESTED";

type SubmissionDebugContext = {
  requestId: string;
  eventId: string;
};

function debugSubmissionLog(
  context: SubmissionDebugContext | undefined,
  step: string,
  details?: Record<string, unknown>,
) {
  if (!context || !shouldLogBudgetDebug()) return;
  console.info("DEBUG BUDGET SUBMIT", {
    requestId: context.requestId,
    eventId: context.eventId,
    step,
    ...(details ?? {}),
  });
}

function debugBudgetLoadLog(
  context: { requestId: string; eventId: string } | undefined,
  step: string,
  details?: Record<string, unknown>,
) {
  if (!context || !shouldLogBudgetDebug()) return;
  console.info("DEBUG BUDGET LOAD", {
    requestId: context.requestId,
    eventId: context.eventId,
    step,
    ...(details ?? {}),
  });
}

function normalizeRequiredText(value: unknown, field: string): string {
  const text = String(value ?? "").trim();
  if (!text) {
    throw new BudgetServiceError(`${field} is required`, 400);
  }
  return text;
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value === "undefined" || value === null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function normalizeInt(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new BudgetServiceError(`${field} must be an integer`, 400);
  }
  return parsed;
}

function normalizeNonNegativeInt(value: unknown, field: string): number {
  const parsed = normalizeInt(value, field);
  if (parsed < 0) {
    throw new BudgetServiceError(`${field} must be a non-negative integer`, 400);
  }
  if (!Number.isSafeInteger(parsed) || parsed > 2_147_483_647) {
    throw new BudgetServiceError(`${field} must be no greater than 2147483647`, 400);
  }
  return parsed;
}

function normalizeStatus(value: unknown): BudgetLineItemStatus {
  if (
    value === BudgetLineItemStatus.PLANNED ||
    value === BudgetLineItemStatus.COMMITTED ||
    value === BudgetLineItemStatus.PAID
  ) {
    return value;
  }
  throw new BudgetServiceError("status must be PLANNED, COMMITTED, or PAID", 400);
}

function normalizeApproval(value: unknown): BudgetLineItemApproval {
  if (value === BudgetLineItemApproval.PENDING || value === BudgetLineItemApproval.APPROVED) {
    return value;
  }
  throw new BudgetServiceError("approval must be PENDING or APPROVED", 400);
}

function asBudgetServiceError(error: unknown, fallbackMessage: string): BudgetServiceError {
  if (error instanceof BudgetServiceError) {
    return error;
  }
  if (error instanceof DocumentServiceError) {
    return new BudgetServiceError(error.message, error.status);
  }
  return new BudgetServiceError(fallbackMessage, 500);
}

function deriveBudgetFileTitle(filename: string): string {
  const trimmed = filename.trim();
  if (!trimmed) return "Budget File";
  const withoutExtension = trimmed.replace(/\.[^./\\]+$/, "").trim();
  return withoutExtension || trimmed || "Budget File";
}

function parseBudgetFileAction(value: string | null | undefined): BudgetFileAction {
  return value === "REPLACED" ? "REPLACED" : "UPLOADED";
}

// Characters that make a spreadsheet treat a cell as a formula when they lead the
// value. Exporting user-controlled text (line item names, vendors, categories, etc.)
// without neutralizing these enables CSV/formula injection in Excel/Sheets.
const CSV_FORMULA_LEAD_CHARS = new Set(["=", "+", "-", "@", "\t", "\r"]);

export function neutralizeCsvInjection(value: string): string {
  if (value.length === 0) return value;
  if (!CSV_FORMULA_LEAD_CHARS.has(value[0])) return value;
  // Preserve legitimate numeric cells such as negative dollar amounts (-50.00);
  // a bare number is not a dangerous formula, so it must not be corrupted.
  if (/^-?\d+(\.\d+)?$/.test(value)) return value;
  return `'${value}`;
}

function escapeCsvCell(value: string): string {
  const safe = neutralizeCsvInjection(value);
  if (safe.includes(",") || safe.includes('"') || safe.includes("\n") || safe.includes("\r")) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function buildCsv(columns: string[], rows: string[][]): string {
  const header = columns.map((column) => escapeCsvCell(column)).join(",");
  const body = rows.map((row) => row.map((value) => escapeCsvCell(value)).join(","));
  return `${[header, ...body].join("\n")}\n`;
}

function toDollarString(cents: number): string {
  return (cents / 100).toFixed(2);
}

function formatDateOnly(value: Date | null | undefined): string {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

function formatIsoTimestamp(value: Date): string {
  return value.toISOString();
}

function fileSafeSegment(value: string): string {
  const cleaned = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "budget";
}

function formatVersionLabel(versionNumber: number | null): string {
  return Number.isFinite(versionNumber) && versionNumber !== null ? `v${versionNumber}` : "unversioned";
}

function formatBudgetStatus(status: BudgetStatus): string {
  return status
    .toLowerCase()
    .split("_")
    .map((word) => `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`)
    .join(" ");
}

function computeVariancePercent(actualCents: number, forecastCents: number): number | null {
  if (forecastCents === 0) return null;
  return Number((((actualCents - forecastCents) / forecastCents) * 100).toFixed(1));
}

function encodeBudgetFileActivityNote(input: {
  action: BudgetFileAction;
  documentId: string;
  versionId: string;
  originalFilename: string;
  linkedBudgetVersionId: string | null;
  linkedBudgetVersionNumber: number | null;
}): string {
  const entries = [
    `action=${encodeURIComponent(input.action)}`,
    `documentId=${encodeURIComponent(input.documentId)}`,
    `versionId=${encodeURIComponent(input.versionId)}`,
    `filename=${encodeURIComponent(input.originalFilename)}`,
    `budgetVersionId=${encodeURIComponent(input.linkedBudgetVersionId ?? "")}`,
    `budgetVersionNumber=${encodeURIComponent(input.linkedBudgetVersionNumber?.toString() ?? "")}`,
  ];

  return `${BUDGET_FILE_ACTIVITY_PREFIX} ${entries.join(";")}`;
}

function parseBudgetFileActivityNote(note: string | null): {
  action: BudgetFileAction;
  documentId: string | null;
  versionId: string | null;
  originalFilename: string | null;
  linkedBudgetVersionId: string | null;
  linkedBudgetVersionNumber: number | null;
} | null {
  if (!note || !note.startsWith(BUDGET_FILE_ACTIVITY_PREFIX)) {
    return null;
  }

  const serialized = note.slice(BUDGET_FILE_ACTIVITY_PREFIX.length).trim();
  const fields = serialized.split(";").map((entry) => entry.trim()).filter(Boolean);
  const map = new Map<string, string>();
  for (const field of fields) {
    const separatorIndex = field.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = field.slice(0, separatorIndex).trim();
    const rawValue = field.slice(separatorIndex + 1).trim();
    try {
      map.set(key, decodeURIComponent(rawValue));
    } catch {
      map.set(key, rawValue);
    }
  }

  const rawVersionNumber = map.get("budgetVersionNumber")?.trim() ?? "";
  const parsedVersionNumber = rawVersionNumber ? Number(rawVersionNumber) : Number.NaN;

  return {
    action: parseBudgetFileAction(map.get("action")),
    documentId: map.get("documentId")?.trim() || null,
    versionId: map.get("versionId")?.trim() || null,
    originalFilename: map.get("filename")?.trim() || null,
    linkedBudgetVersionId: map.get("budgetVersionId")?.trim() || null,
    linkedBudgetVersionNumber: Number.isFinite(parsedVersionNumber) ? parsedVersionNumber : null,
  };
}

async function ensureBudgetFileCategoryId(eventId: string): Promise<string> {
  const existing = await getPrisma().documentCategory.findFirst({
    where: {
      eventId,
      slug: BUDGET_FILE_CATEGORY_SLUG,
    },
    select: { id: true },
  });

  if (existing) {
    return existing.id;
  }

  try {
    const created = await createDocumentCategoryForEvent(eventId, {
      name: BUDGET_FILE_CATEGORY_NAME,
      color: BUDGET_FILE_CATEGORY_COLOR,
    });
    return created.id;
  } catch {
    const fallback = await getPrisma().documentCategory.findFirst({
      where: {
        eventId,
        slug: BUDGET_FILE_CATEGORY_SLUG,
      },
      select: { id: true },
    });
    if (fallback) {
      return fallback.id;
    }
    throw new BudgetServiceError("Unable to initialize budget file category", 500);
  }
}

/**
 * Resolve budget read + write capability in a single membership resolution.
 * Throws (read is denied) for a missing event, out-of-org access, or a
 * non-member; otherwise returns whether the user can write. This lets read
 * paths compute canWrite without a second throw/catch access probe.
 */
async function resolveBudgetEventAccessCapability(
  eventId: string,
  user: BudgetAccessUser,
): Promise<{ canWrite: boolean }> {
  const event = await getPrisma().event.findUnique({
    where: { id: eventId },
    select: { id: true, orgId: true },
  });

  if (!event) {
    throw new BudgetServiceError("Event not found", 404);
  }

  if (user.role === UserRole.SUPER_ADMIN) {
    return { canWrite: true };
  }

  if (!user.orgId || user.orgId !== event.orgId) {
    throw new BudgetServiceError("Event is outside the active organization scope", 403);
  }

  if (user.role === UserRole.OWNER || user.role === UserRole.ADMIN) {
    return { canWrite: true };
  }

  const membership = await getPrisma().eventMember.findUnique({
    where: {
      eventId_userId: {
        eventId,
        userId: user.id,
      },
    },
    select: { eventRole: true },
  });

  if (!membership) {
    throw new BudgetServiceError("Event membership required", 403);
  }

  return { canWrite: membership.eventRole !== EventMemberRole.EVENT_VIEWER };
}

async function assertBudgetEventAccess(
  eventId: string,
  user: BudgetAccessUser,
  accessType: "read" | "write",
): Promise<void> {
  const { canWrite } = await resolveBudgetEventAccessCapability(eventId, user);
  if (accessType === "write" && !canWrite) {
    throw new BudgetServiceError("Event editor role required", 403);
  }
}

/**
 * Public single-resolution access helper for read paths that also need to know
 * write capability (e.g. the dashboard). Asserts read access and returns
 * canWrite from the same resolution — no second throw/catch capability probe.
 */
export async function resolveBudgetAccessForEvent(
  eventId: string,
  user: BudgetAccessUser,
): Promise<{ canWrite: boolean }> {
  try {
    return await resolveBudgetEventAccessCapability(eventId, user);
  } catch (error) {
    throw asBudgetServiceError(error, "Failed to authorize budget access");
  }
}

export async function assertBudgetAccessForEvent(
  eventId: string,
  user: {
    id: string;
    orgId: string | null;
    role: UserRole;
  },
  accessType: "read" | "write" = "read",
): Promise<void> {
  try {
    await assertBudgetEventAccess(eventId, user, accessType);
  } catch (error) {
    throw asBudgetServiceError(error, "Failed to authorize budget access");
  }
}

function assertBudgetEditable(budget: Budget): void {
  if (budget.status === BudgetStatus.APPROVED) {
    throw new BudgetServiceError("Budget is locked for review", 409);
  }
}

async function assertLineItemEditable(lineItemId: string): Promise<void> {
  const lockedSubmission = await getPrisma().budgetSubmissionLineItem.findFirst({
    where: {
      budgetLineItemId: lineItemId,
      submission: {
        status: {
          in: [
            BudgetSubmissionStatus.SUBMITTED,
            BudgetSubmissionStatus.APPROVED,
          ],
        },
      },
    },
    select: { submissionId: true },
  });

  if (lockedSubmission) {
    throw new BudgetServiceError("Line item is locked for review", 409);
  }
}

async function resolveActorUserId(
  actorUserId?: string | null,
  debugContext?: SubmissionDebugContext,
): Promise<string | null> {
  if (!actorUserId) return null;

  debugSubmissionLog(debugContext, "resolveActorUserId:user.findUnique:start", { actorUserId });
  const actor = await getPrisma().user.findUnique({ where: { id: actorUserId }, select: { id: true } });
  debugSubmissionLog(debugContext, "resolveActorUserId:user.findUnique:end", {
    actorUserId,
    found: Boolean(actor),
  });
  if (!actor) {
    throw new BudgetServiceError("actorUserId is invalid", 400);
  }

  return actor.id;
}

// Shared totals math so the row-reduce path and the DB-aggregate (light snapshot)
// path can never drift. Both must produce identical global totals.
export function totalsFromSums(totalForecastCents: number, totalActualCents: number): BudgetSnapshot["totals"] {
  return calculateBudgetTotalsFromSums(totalForecastCents, totalActualCents);
}

export function computeTotals(lineItems: Pick<BudgetLineItem, "forecastCents" | "actualCents">[]): BudgetSnapshot["totals"] {
  return calculateBudgetTotals(lineItems);
}

function buildDashboardLink(eventId: string, filters: Record<string, string>): BudgetDashboardLink {
  const params = new URLSearchParams({ view: "grid" });
  for (const [key, value] of Object.entries(filters)) {
    if (value.trim().length > 0) params.set(key, value);
  }

  return {
    href: `/events/${encodeURIComponent(eventId)}/budget?${params.toString()}`,
    filters,
  };
}

function submissionTimestampMs(submission: BudgetSubmissionSummary): number {
  const timestamp = new Date(submission.submittedAt).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function latestSubmissionByLineItemId(
  submissions: BudgetSubmissionSummary[],
): Map<string, BudgetSubmissionSummary> {
  const map = new Map<string, BudgetSubmissionSummary>();

  for (const submission of submissions) {
    if (submission.status === BudgetSubmissionStatus.PULLED_BACK) continue;
    for (const lineItem of submission.lineItems) {
      const existing = map.get(lineItem.id);
      if (!existing || submissionTimestampMs(submission) > submissionTimestampMs(existing)) {
        map.set(lineItem.id, submission);
      }
    }
  }

  return map;
}

function submissionActivityLabel(submission: BudgetSubmissionSummary | null): string {
  const lineItemLabel = submission?.lineItems[0]?.lineItem?.trim();
  return lineItemLabel || "Budget submission";
}

function activityTitle(
  type: BudgetActivityType,
  note: string | null,
  submission: BudgetSubmissionSummary | null = null,
): string {
  const budgetFile = parseBudgetFileActivityNote(note);
  if (budgetFile) {
    return budgetFile.action === "REPLACED" ? "Budget file replaced" : "Budget file uploaded";
  }

  const label = submissionActivityLabel(submission);
  if (type === BudgetActivityType.SUBMITTED) {
    return submission ? `${label} submitted for approval` : "Budget submitted";
  }
  if (type === BudgetActivityType.APPROVED) {
    return submission ? `${label} approved` : "Budget approved";
  }
  if (type === BudgetActivityType.REJECTED) {
    return submission ? `${label} rejected` : "Budget rejected";
  }
  return submission ? `${label} revised` : "Budget revised";
}

function describeActivity(
  type: BudgetActivityType,
  note: string | null,
  submission: BudgetSubmissionSummary | null = null,
): string {
  const budgetFile = parseBudgetFileActivityNote(note);
  if (budgetFile?.originalFilename) {
    return budgetFile.originalFilename;
  }

  if (note?.startsWith("submissionId=")) {
    if (submission) {
      if (type === BudgetActivityType.SUBMITTED) return "Submitted for reviewer action.";
      if (type === BudgetActivityType.APPROVED) return "Approved through the budget workflow.";
      if (type === BudgetActivityType.REJECTED) return "Rejected and returned for revision.";
      return "Updated through the budget workflow.";
    }
    return "Budget submission updated.";
  }

  if (note) return note;
  if (type === BudgetActivityType.SUBMITTED) return "Budget item submitted for review.";
  if (type === BudgetActivityType.APPROVED) return "Budget item approved.";
  if (type === BudgetActivityType.REJECTED) return "Budget item rejected.";
  return "Budget returned to draft or otherwise revised.";
}

function activitySource(note: string | null): {
  sourceId: string | null;
  sourceType: BudgetDashboardActivity["sourceType"];
} {
  const budgetFile = parseBudgetFileActivityNote(note);
  if (budgetFile?.documentId) {
    return {
      sourceId: budgetFile.documentId,
      sourceType: "budget_file",
    };
  }

  if (note?.startsWith("submissionId=")) {
    return {
      sourceId: note.slice("submissionId=".length).trim() || null,
      sourceType: "budget_submission",
    };
  }

  return {
    sourceId: null,
    sourceType: "budget",
  };
}

export function buildBudgetDashboardModel(input: {
  eventId: string;
  budget: BudgetWithMeta;
  lineItems: BudgetLineItemWithDocs[];
  submissions: BudgetSubmissionSummary[];
  activity: BudgetActivityWithActor[];
  generatedAt?: Date;
  canWriteBudget?: boolean;
}): BudgetDashboard {
  const totals = computeTotals(input.lineItems);
  const aggregate = calculateBudgetAggregation(input.lineItems);
  const latestSubmissionByLineItem = latestSubmissionByLineItemId(input.submissions);

  const categoryMap = new Map<string, BudgetDashboardCategoryBreakdown>();
  const categoryPendingCounts = new Map<string, number>();

  for (const item of input.lineItems) {
    const category = getBudgetCategoryDisplay(item.category) || "Contingency";
    const existing = categoryMap.get(category) ?? {
      category,
      forecastCents: 0,
      actualCents: 0,
      varianceCents: 0,
      percentUsed: 0,
      lineItemCount: 0,
      pendingCount: 0,
      link: buildDashboardLink(input.eventId, { category }),
    };

    existing.forecastCents += item.forecastCents;
    existing.actualCents += item.actualCents;
    existing.varianceCents += item.actualCents - item.forecastCents;
    existing.lineItemCount += 1;
    categoryMap.set(category, existing);

    const latestSubmission = latestSubmissionByLineItem.get(item.id);
    const isPending =
      item.approval === BudgetLineItemApproval.PENDING ||
      latestSubmission?.status === BudgetSubmissionStatus.SUBMITTED ||
      latestSubmission?.status === BudgetSubmissionStatus.REJECTED;
    if (isPending) {
      categoryPendingCounts.set(category, (categoryPendingCounts.get(category) ?? 0) + 1);
    }
  }

  const categoryBreakdown = Array.from(categoryMap.values())
    .map((category) => {
      const categoryTotals = calculateBudgetAggregation([
        { forecastCents: category.forecastCents, actualCents: category.actualCents },
      ]);
      return {
        ...category,
        pendingCount: categoryPendingCounts.get(category.category) ?? 0,
        percentUsed: categoryTotals.utilizationPercent,
      };
    })
    .sort((left, right) => {
      const forecastDiff = right.forecastCents - left.forecastCents;
      if (forecastDiff !== 0) return forecastDiff;
      return left.category.localeCompare(right.category);
    });

  const workQueue: BudgetDashboardWorkItem[] = [];
  for (const submission of input.submissions) {
    if (submission.status !== BudgetSubmissionStatus.SUBMITTED && submission.status !== BudgetSubmissionStatus.REJECTED) {
      continue;
    }

    const lineItem = submission.lineItems[0] ?? null;
    const lineItemLabel = lineItem?.lineItem?.trim() || "Budget line item";
    const isRejected = submission.status === BudgetSubmissionStatus.REJECTED;

    workQueue.push({
      id: isRejected ? `budget-revision-${submission.id}` : `budget-approval-${submission.id}`,
      type: isRejected ? "REVISION_NEEDED" : "APPROVAL_REVIEW",
      sourceModule: "budget",
      sourceId: submission.id,
      title: isRejected ? `Revise ${lineItemLabel}` : `Review ${lineItemLabel}`,
      description: isRejected
        ? "This budget submission was rejected and needs revision."
        : "This budget submission is waiting for approval.",
      status: isRejected ? "revision_needed" : "pending_review",
      priority: isRejected ? "high" : "medium",
      assignee: isRejected ? submission.submittedByUser : submission.recipients[0] ?? null,
      dueAt: null,
      createdAt: submission.submittedAt,
      actionLabel: isRejected ? "Revise item" : "Review submission",
      link: buildDashboardLink(input.eventId, {
        submissionId: submission.id,
        ...(lineItem ? { lineItemId: lineItem.id } : {}),
      }),
    });
  }

  const submissionsById = new Map(input.submissions.map((submission) => [submission.id, submission]));
  const recentActivity = input.activity.slice(0, 10).map((activity) => {
    const source = activitySource(activity.note);
    const submission = source.sourceType === "budget_submission" && source.sourceId
      ? submissionsById.get(source.sourceId) ?? null
      : null;
    return {
      id: activity.id,
      action: activity.type,
      title: activityTitle(activity.type, activity.note, submission),
      description: describeActivity(activity.type, activity.note, submission),
      actor: activity.actorUser,
      createdAt: activity.createdAt.toISOString(),
      sourceId: source.sourceId,
      sourceType: source.sourceType,
      dollarImpactCents: null,
    } satisfies BudgetDashboardActivity;
  });

  return {
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    budget: {
      id: input.budget.id,
      eventId: input.budget.eventId,
      status: input.budget.status,
      currentVersionId: input.budget.currentVersionId,
    },
    permissions: {
      canWriteBudget: input.canWriteBudget ?? true,
    },
    summary: {
      totalForecastCents: totals.totalForecastCents,
      totalActualCents: totals.totalActualCents,
      remainingCents: aggregate.remainingCents,
      varianceCents: totals.varianceCents,
      lineItemCount: input.lineItems.length,
      pendingActionCount: workQueue.length,
    },
    categoryBreakdown,
    workQueue: workQueue.sort((left, right) => {
      if (left.priority !== right.priority) return left.priority === "high" ? -1 : 1;
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    }),
    recentActivity,
  };
}

export async function getBudgetDashboard(eventId: string, user: BudgetAccessUser): Promise<BudgetDashboard> {
  try {
    // Single access resolution asserts read access and returns write capability,
    // replacing the previous read check + throw/catch write-capability probe.
    const { canWrite: canWriteBudget } = await resolveBudgetAccessForEvent(eventId, user);

    const snapshot = await getBudgetSnapshot(eventId, {
      currentUserId: user.id,
      includeActivity: true,
      includeRecipients: false,
      includeSubmissionDetails: false,
      includeBudgetFiles: false,
    });

    return buildBudgetDashboardModel({
      eventId,
      budget: snapshot.budget,
      lineItems: snapshot.lineItems,
      submissions: snapshot.submissions,
      activity: snapshot.activity,
      canWriteBudget,
    });
  } catch (error) {
    throw asBudgetServiceError(error, "Failed to build budget dashboard");
  }
}

export async function getOrCreateBudgetForEvent(
  eventId: string,
  debugContext?: SubmissionDebugContext,
): Promise<BudgetWithMeta> {
  debugSubmissionLog(debugContext, "getOrCreateBudgetForEvent:budget.upsert:start");
  try {
    const budget = await getPrisma().budget.upsert({
      where: { eventId },
      update: {},
      create: {
        eventId,
        status: BudgetStatus.DRAFT,
      },
      include: {
        submittedByUser: { select: USER_SELECT },
        approvedByUser: { select: USER_SELECT },
        rejectedByUser: { select: USER_SELECT },
      },
    });
    debugSubmissionLog(debugContext, "getOrCreateBudgetForEvent:budget.upsert:end", {
      budgetId: budget.id,
      budgetStatus: budget.status,
    });
    return budget;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      throw new BudgetServiceError("Event not found", 404);
    }
    throw error;
  }
}

/**
 * Read-only Budget accessor for GET/read paths. Unlike getOrCreateBudgetForEvent
 * this never writes (no upsert), so page loads take no row lock and do not
 * contend on the Budget row. Returns null when no Budget row exists yet; callers
 * render an empty budget instead of creating one on read.
 */
export async function getBudgetForEventReadOnly(eventId: string): Promise<BudgetWithMeta | null> {
  return getPrisma().budget.findUnique({
    where: { eventId },
    include: {
      submittedByUser: { select: USER_SELECT },
      approvedByUser: { select: USER_SELECT },
      rejectedByUser: { select: USER_SELECT },
    },
  });
}

// ---------------------------------------------------------------------------
// Server-side paged line-item reads (Budget deep performance, endpoint B)
// ---------------------------------------------------------------------------

export const DEFAULT_BUDGET_PAGE_SIZE = 10;
const MAX_BUDGET_PAGE_SIZE = 200;

export type PagedBudgetLineItemsQuery = {
  page?: number;
  pageSize?: number;
  search?: string;
  category?: string;
  subcategory?: string;
  status?: BudgetLineItemStatus | null;
  approval?: BudgetLineItemApproval | null;
  sessionId?: string | null;
  groupId?: string | null;
  sort?: string;
  dir?: "asc" | "desc";
};

export type PagedBudgetLineItems = {
  rows: BudgetLineItemWithDocs[];
  filteredCount: number;
  filteredFooterTotals: {
    forecastCents: number;
    actualCents: number;
    varianceCents: number;
  };
  page: number;
  pageSize: number;
};

// Whitelist of user-facing sort columns → real Prisma columns. Anything else
// falls back to the canonical sortOrder ordering so page boundaries stay stable.
const BUDGET_SORT_COLUMNS: Record<string, keyof Prisma.BudgetLineItemOrderByWithRelationInput> = {
  sortOrder: "sortOrder",
  category: "category",
  subcategory: "subcategory",
  lineItem: "lineItem",
  vendor: "vendor",
  status: "status",
  approval: "approval",
  forecast: "forecastCents",
  forecastCents: "forecastCents",
  actual: "actualCents",
  actualCents: "actualCents",
  createdAt: "createdAt",
  updatedAt: "updatedAt",
};

function clampBudgetPageSize(pageSize: number | undefined): number {
  if (!Number.isFinite(pageSize) || !pageSize || pageSize < 1) return DEFAULT_BUDGET_PAGE_SIZE;
  return Math.min(Math.floor(pageSize), MAX_BUDGET_PAGE_SIZE);
}

function clampBudgetPage(page: number | undefined): number {
  if (!Number.isFinite(page) || !page || page < 1) return 1;
  return Math.floor(page);
}

function buildBudgetLineItemOrderBy(
  sort: string | undefined,
  dir: "asc" | "desc" | undefined,
): Prisma.BudgetLineItemOrderByWithRelationInput[] {
  const direction: Prisma.SortOrder = dir === "desc" ? "desc" : "asc";
  const column = sort ? BUDGET_SORT_COLUMNS[sort] : undefined;
  if (!column || column === "sortOrder") {
    // Canonical ordering: honor the requested direction on sortOrder when the
    // user sorts by it explicitly, otherwise ascending. id breaks ties so pages
    // never overlap or skip a row.
    const sortOrderDir = column === "sortOrder" ? direction : "asc";
    return [{ sortOrder: sortOrderDir }, { createdAt: "asc" }, { id: "asc" }];
  }
  // Sorted column first, then the stable canonical tiebreakers.
  return [{ [column]: direction }, { sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }];
}

/**
 * Resolve the distinct stored values for a text column that match a filter using
 * the shared client matcher, so the Prisma `where` uses exact-parity `in` lists
 * instead of an approximate SQL comparison. Category and subcategory both apply
 * display/whitespace normalization the client uses, which SQL cannot replicate.
 */
async function resolveMatchingLineItemTextValues(
  budgetId: string,
  column: "category" | "subcategory",
  filterValue: string,
  matches: (stored: string, filter: string) => boolean,
): Promise<string[]> {
  const distinct = await getPrisma().budgetLineItem.findMany({
    where: { budgetId },
    select: { [column]: true } as Prisma.BudgetLineItemSelect,
    distinct: [column],
  });
  const values = distinct
    .map((row) => (row as Record<string, unknown>)[column])
    .filter((value): value is string => typeof value === "string");
  return values.filter((value) => matches(value, filterValue));
}

/**
 * Build the Prisma `where` for a paged line-item read from the grid's filter
 * state. Category/subcategory use exact-parity `in` lists (see helper above).
 * Search mirrors the client's OR over the primary line-item name plus vendor,
 * category, session, and group.
 *
 * Known approximation: the client's search also checks the *display* form of the
 * category, while this matches the stored raw category. When an alias differs
 * from its stored value a search on the alias text may not match server-side.
 */
async function buildPagedLineItemWhere(
  budgetId: string,
  query: PagedBudgetLineItemsQuery,
): Promise<Prisma.BudgetLineItemWhereInput> {
  const where: Prisma.BudgetLineItemWhereInput = { budgetId };

  if (query.status) where.status = query.status;
  if (query.approval) where.approval = query.approval;
  if (query.sessionId && query.sessionId.trim()) where.matrixRowId = query.sessionId;
  if (query.groupId && query.groupId.trim()) where.groupId = query.groupId;

  if (query.category && query.category.trim()) {
    const matching = await resolveMatchingLineItemTextValues(
      budgetId,
      "category",
      query.category,
      (stored, filter) => budgetCategoriesMatch(getBudgetCategoryDisplay(stored), filter),
    );
    // Empty list => no rows match, which is the correct filtered-empty result.
    where.category = { in: matching };
  }

  if (query.subcategory && query.subcategory.trim()) {
    const matching = await resolveMatchingLineItemTextValues(
      budgetId,
      "subcategory",
      query.subcategory,
      budgetFilterValuesMatch,
    );
    where.subcategory = { in: matching };
  }

  const search = query.search?.trim();
  if (search) {
    where.OR = [
      { lineItem: { contains: search, mode: "insensitive" } },
      { vendor: { contains: search, mode: "insensitive" } },
      { category: { contains: search, mode: "insensitive" } },
      { matrixRow: { sessionName: { contains: search, mode: "insensitive" } } },
      { group: { name: { contains: search, mode: "insensitive" } } },
    ];
  }

  return where;
}

/**
 * Read one page of Budget line items with server-side filter/search/sort and
 * filter-scoped footer totals. Global/header totals are intentionally NOT
 * derived here — callers must use the authoritative full-budget totals so a
 * filtered view can never masquerade as global truth.
 */
export async function getPagedBudgetLineItems(
  eventId: string,
  query: PagedBudgetLineItemsQuery = {},
): Promise<PagedBudgetLineItems> {
  const page = clampBudgetPage(query.page);
  const pageSize = clampBudgetPageSize(query.pageSize);

  const budget = await getBudgetForEventReadOnly(eventId);
  if (!budget) {
    return {
      rows: [],
      filteredCount: 0,
      filteredFooterTotals: { forecastCents: 0, actualCents: 0, varianceCents: 0 },
      page,
      pageSize,
    };
  }

  const where = await buildPagedLineItemWhere(budget.id, query);
  const orderBy = buildBudgetLineItemOrderBy(query.sort, query.dir);

  const [filteredCount, aggregate, lineItems] = await Promise.all([
    getPrisma().budgetLineItem.count({ where }),
    getPrisma().budgetLineItem.aggregate({
      where,
      _sum: { forecastCents: true, actualCents: true },
    }),
    getPrisma().budgetLineItem.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        matrixRow: { select: { sessionName: true } },
        group: { select: { id: true, name: true, color: true } },
        sessionRequirementSelection: {
          select: {
            sessionId: true,
            itemId: true,
            quantity: true,
            session: { select: { sessionName: true } },
            item: {
              select: {
                id: true,
                label: true,
                section: { select: { id: true, label: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  const forecastCents = aggregate._sum.forecastCents ?? 0;
  const actualCents = aggregate._sum.actualCents ?? 0;

  const rows = await mapPagedLineItemsWithDocs(eventId, lineItems);

  return {
    rows,
    filteredCount,
    filteredFooterTotals: {
      forecastCents,
      actualCents,
      varianceCents: actualCents - forecastCents,
    },
    page,
    pageSize,
  };
}

export type BudgetLineItemIds = {
  ids: string[];
  count: number;
};

/**
 * Return the IDs of every line item matching the current filter/search state,
 * across all pages. Powers "select all filtered" bulk selection without loading
 * full rows. Ordered by the same canonical/sort ordering as the paged rows so
 * selection order matches the grid. Filter params mirror getPagedBudgetLineItems.
 */
export async function getBudgetLineItemIds(
  eventId: string,
  query: PagedBudgetLineItemsQuery = {},
): Promise<BudgetLineItemIds> {
  const budget = await getBudgetForEventReadOnly(eventId);
  if (!budget) return { ids: [], count: 0 };

  const where = await buildPagedLineItemWhere(budget.id, query);
  const orderBy = buildBudgetLineItemOrderBy(query.sort, query.dir);
  const rows = await getPrisma().budgetLineItem.findMany({
    where,
    orderBy,
    select: { id: true },
  });
  const ids = rows.map((row) => row.id);
  return { ids, count: ids.length };
}

type PagedLineItemRow = BudgetLineItem & {
  matrixRow: { sessionName: string | null } | null;
  group: { id: string; name: string; color: string | null } | null;
  sessionRequirementSelection: {
    sessionId: string;
    itemId: string;
    quantity: number | null;
    session: { sessionName: string | null };
    item: { id: string; label: string; section: { id: string; label: string } };
  } | null;
};

/**
 * Attach document counts and normalized session/group/requirement labels to a
 * page of line items, mirroring the snapshot mapper so the paged row shape is
 * identical to the full-array shape the grid already renders.
 */
async function mapPagedLineItemsWithDocs(
  eventId: string,
  lineItems: PagedLineItemRow[],
): Promise<BudgetLineItemWithDocs[]> {
  const lineItemIds = lineItems.map((lineItem) => lineItem.id);
  const documentLinks = lineItemIds.length > 0
    ? await getPrisma().documentLink.findMany({
      where: {
        linkType: DocumentLinkType.BUDGET_ITEM,
        linkedId: { in: lineItemIds },
        document: { eventId },
      },
      orderBy: { createdAt: "asc" },
      select: { linkedId: true, documentId: true },
    })
    : [];

  const documentsByLineItemId = new Map<string, { documentCount: number; firstDocumentId: string | null }>();
  for (const lineItemId of lineItemIds) {
    documentsByLineItemId.set(lineItemId, { documentCount: 0, firstDocumentId: null });
  }
  for (const link of documentLinks) {
    const existing = documentsByLineItemId.get(link.linkedId) ?? { documentCount: 0, firstDocumentId: null };
    documentsByLineItemId.set(link.linkedId, {
      documentCount: existing.documentCount + 1,
      firstDocumentId: existing.firstDocumentId ?? link.documentId,
    });
  }

  return lineItems.map((lineItem) => {
    const { sessionRequirementSelection, matrixRow, group, ...budgetLineItem } = lineItem;
    const docMeta = documentsByLineItemId.get(lineItem.id) ?? { documentCount: 0, firstDocumentId: null };
    return {
      ...budgetLineItem,
      documentCount: docMeta.documentCount,
      firstDocumentId: docMeta.firstDocumentId,
      sessionTitle: matrixRow?.sessionName?.trim() || null,
      groupName: group?.name ?? null,
      groupColor: group?.color ?? null,
      linkedSessionRequirement: sessionRequirementSelection
        ? {
            sessionId: sessionRequirementSelection.sessionId,
            sessionTitle: sessionRequirementSelection.session.sessionName ?? null,
            requirementItemId: sessionRequirementSelection.itemId,
            requirementItemName: sessionRequirementSelection.item.label,
            requirementSectionId: sessionRequirementSelection.item.section.id,
            requirementSectionName: sessionRequirementSelection.item.section.label,
            requirementQuantity: sessionRequirementSelection.quantity ?? null,
          }
        : null,
    };
  });
}

/**
 * Synthetic empty Budget for read paths where no Budget row exists yet. This is a
 * display-only value: its id is empty and must never be used to query
 * budget-scoped rows (there are none). The row is created on the first write.
 */
export function makeEmptyBudgetForEvent(eventId: string): BudgetWithMeta {
  const now = new Date();
  return {
    id: "",
    eventId,
    status: BudgetStatus.DRAFT,
    currentVersionId: null,
    submittedAt: null,
    submittedByUserId: null,
    approvedAt: null,
    approvedByUserId: null,
    rejectedAt: null,
    rejectedByUserId: null,
    rejectionReason: null,
    lockedAt: null,
    createdAt: now,
    updatedAt: now,
    submittedByUser: null,
    approvedByUser: null,
    rejectedByUser: null,
  };
}

async function getBudgetWithRelationsOrThrow(
  eventId: string,
  debugContext?: SubmissionDebugContext,
): Promise<BudgetWithMeta> {
  debugSubmissionLog(debugContext, "getBudgetWithRelationsOrThrow:getOrCreateBudgetForEvent:start");
  const budget = await getOrCreateBudgetForEvent(eventId, debugContext);
  debugSubmissionLog(debugContext, "getBudgetWithRelationsOrThrow:getOrCreateBudgetForEvent:end", {
    budgetId: budget.id,
    budgetStatus: budget.status,
  });
  if (!budget) {
    throw new BudgetServiceError("Budget not found", 404);
  }
  return budget;
}

async function getBudgetFilesSnapshotForBudget(eventId: string, budgetId: string): Promise<BudgetFilesSnapshot> {
  const budgetFileCategory = await getPrisma().documentCategory.findFirst({
    where: {
      eventId,
      slug: BUDGET_FILE_CATEGORY_SLUG,
    },
    select: { id: true },
  });

  if (!budgetFileCategory) {
    return {
      latestFile: null,
      history: [],
      activity: [],
    };
  }

  const [documents, activityRows] = await getPrisma().$transaction([
    getPrisma().document.findMany({
      where: {
        eventId,
        categoryId: budgetFileCategory.id,
        versions: {
          some: {},
        },
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
          include: {
            uploadedByUser: {
              select: USER_SELECT,
            },
          },
        },
      },
      take: 100,
    }),
    getPrisma().budgetActivity.findMany({
      where: {
        budgetId,
        note: {
          contains: BUDGET_FILE_ACTIVITY_PREFIX,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        actorUser: {
          select: USER_SELECT,
        },
      },
      take: 50,
    }),
  ]);

  const parsedActivity = activityRows
    .map((entry) => {
      const parsed = parseBudgetFileActivityNote(entry.note);
      if (!parsed) return null;
      return {
        id: entry.id,
        action: parsed.action,
        createdAt: entry.createdAt.toISOString(),
        actorUser: entry.actorUser,
        note: entry.note,
        documentId: parsed.documentId,
        versionId: parsed.versionId,
        originalFilename: parsed.originalFilename,
        linkedBudgetVersionId: parsed.linkedBudgetVersionId,
        linkedBudgetVersionNumber: parsed.linkedBudgetVersionNumber,
      } satisfies BudgetFileActivity;
    })
    .filter((entry): entry is BudgetFileActivity => entry !== null);

  const metadataByDocumentId = new Map<string, BudgetFileActivity>();
  for (const entry of parsedActivity) {
    if (!entry.documentId) continue;
    if (!metadataByDocumentId.has(entry.documentId)) {
      metadataByDocumentId.set(entry.documentId, entry);
    }
  }

  const files = documents
    .map((document) => {
      const latestVersion = document.versions[0];
      if (!latestVersion) return null;
      const metadata = metadataByDocumentId.get(document.id);

      return {
        documentId: document.id,
        documentTitle: document.title,
        documentStatus: document.status,
        versionId: latestVersion.id,
        versionNumber: latestVersion.versionNumber,
        originalFilename: latestVersion.originalFilename,
        mimeType: latestVersion.mimeType,
        fileSizeBytes: latestVersion.fileSizeBytes,
        uploadedAt: latestVersion.createdAt.toISOString(),
        uploadedByUser: latestVersion.uploadedByUser,
        linkedBudgetVersionId: metadata?.linkedBudgetVersionId ?? null,
        linkedBudgetVersionNumber: metadata?.linkedBudgetVersionNumber ?? null,
      } satisfies BudgetFileRecord;
    })
    .filter((entry): entry is BudgetFileRecord => entry !== null)
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

  return {
    latestFile: files[0] ?? null,
    history: files.slice(1),
    activity: parsedActivity,
  };
}

async function loadBudgetExportBase(
  eventId: string,
  exportedByUserId: string,
  filters?: PagedBudgetLineItemsQuery,
): Promise<{
  event: {
    id: string;
    name: string;
    startDate: Date;
    endDate: Date | null;
  };
  budget: {
    id: string;
    status: BudgetStatus;
    currentVersionId: string | null;
  };
  currentVersionNumber: number | null;
  exportedBy: {
    id: string;
    name: string | null;
    email: string;
  };
  exportedAt: Date;
  lineItems: Array<{
    id: string;
    category: string;
    subcategory: string;
    sessionTitle: string | null;
    groupName: string | null;
    lineItem: string;
    vendor: string | null;
    forecastCents: number;
    actualCents: number;
    status: BudgetLineItemStatus;
    approval: BudgetLineItemApproval;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
  }>;
}> {
  // Export is a read path: resolve the budget without creating one.
  const [event, existingBudget, exportedBy] = await Promise.all([
    getPrisma().event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
      },
    }),
    getBudgetForEventReadOnly(eventId),
    getPrisma().user.findUnique({
      where: { id: exportedByUserId },
      select: {
        id: true,
        name: true,
        email: true,
      },
    }),
  ]);

  if (!event) {
    throw new BudgetServiceError("Event not found", 404);
  }

  if (!exportedBy) {
    throw new BudgetServiceError("Export user not found", 404);
  }

  const budget = existingBudget ?? makeEmptyBudgetForEvent(eventId);
  const [currentVersion, lineItems] = await Promise.all([
    budget.currentVersionId
      ? getPrisma().budgetVersion.findUnique({
        where: { id: budget.currentVersionId },
        select: { versionNumber: true },
      })
      : Promise.resolve(null),
    existingBudget
      ? getPrisma().budgetLineItem.findMany({
      // Filtered export reuses the SAME where/orderBy as the paged rows endpoint,
      // so an exported filtered view matches exactly what the grid shows. Full
      // export (no filters) keeps the canonical sortOrder ordering.
      where: filters
        ? await buildPagedLineItemWhere(existingBudget.id, filters)
        : { budgetId: existingBudget.id },
      orderBy: filters
        ? buildBudgetLineItemOrderBy(filters.sort, filters.dir)
        : [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        category: true,
        subcategory: true,
        lineItem: true,
        vendor: true,
        forecastCents: true,
        actualCents: true,
        status: true,
        approval: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
        matrixRow: { select: { sessionName: true } },
        group: { select: { name: true, color: true } },
      },
    })
      : [],
  ]);

  const flattenedLineItems = lineItems.map(({ matrixRow, group, ...lineItem }) => ({
    ...lineItem,
    sessionTitle: matrixRow?.sessionName?.trim() || null,
    groupName: group?.name ?? null,
    groupColor: group?.color ?? null,
  }));

  return {
    event,
    budget: {
      id: budget.id,
      status: budget.status,
      currentVersionId: budget.currentVersionId,
    },
    currentVersionNumber: currentVersion?.versionNumber ?? null,
    exportedBy,
    exportedAt: new Date(),
    lineItems: flattenedLineItems,
  };
}

export async function exportBudgetLineItemsCsv(
  eventId: string,
  user: BudgetAccessUser,
  options?: { filters?: PagedBudgetLineItemsQuery },
): Promise<BudgetCsvExportPayload> {
  try {
    await assertBudgetAccessForEvent(eventId, user, "read");
    const payload = await loadBudgetExportBase(eventId, user.id, options?.filters);
    const versionLabel = formatVersionLabel(payload.currentVersionNumber);
    const exportedAtIso = formatIsoTimestamp(payload.exportedAt);
    const exportedByDisplay = payload.exportedBy.name?.trim() || payload.exportedBy.email;
    const rows = payload.lineItems.map((lineItem) => {
      const varianceCents = lineItem.actualCents - lineItem.forecastCents;
      return [
        payload.event.id,
        payload.event.name,
        formatDateOnly(payload.event.startDate),
        formatDateOnly(payload.event.endDate),
        payload.budget.id,
        payload.budget.status,
        payload.budget.currentVersionId ?? "",
        payload.currentVersionNumber?.toString() ?? "",
        versionLabel,
        exportedAtIso,
        payload.exportedBy.id,
        exportedByDisplay,
        payload.exportedBy.email,
        lineItem.id,
        lineItem.sortOrder.toString(),
        lineItem.category,
        lineItem.sessionTitle ?? "",
        lineItem.groupName ?? "",
        lineItem.subcategory,
        lineItem.lineItem,
        lineItem.vendor ?? "",
        toDollarString(lineItem.forecastCents),
        toDollarString(lineItem.actualCents),
        toDollarString(varianceCents),
        lineItem.status,
        lineItem.approval,
        formatIsoTimestamp(lineItem.createdAt),
        formatIsoTimestamp(lineItem.updatedAt),
      ];
    });

    const columns = [
      "Event ID",
      "Event Name",
      "Event Start Date",
      "Event End Date",
      "Budget ID",
      "Budget Status",
      "Budget Version ID",
      "Budget Version Number",
      "Budget Version Label",
      "Exported At (UTC)",
      "Exported By User ID",
      "Exported By",
      "Exported By Email",
      "Line Item ID",
      "Sort Order",
      "Category",
      "Session",
      "Group",
      "Legacy Subcategory",
      "Line Item",
      "Vendor",
      "Forecast (USD)",
      "Actual (USD)",
      "Variance (USD)",
      "Status",
      "Approval",
      "Line Item Created At (UTC)",
      "Line Item Updated At (UTC)",
    ];

    const scope = options?.filters ? "-filtered" : "";
    return {
      csv: buildCsv(columns, rows),
      filename: `${fileSafeSegment(payload.event.name)}-budget-line-items${scope}-${formatDateOnly(payload.exportedAt)}.csv`,
    };
  } catch (error) {
    throw asBudgetServiceError(error, "Failed to export budget line items");
  }
}

export async function exportBudgetSummaryCsv(
  eventId: string,
  user: BudgetAccessUser,
): Promise<BudgetCsvExportPayload> {
  try {
    await assertBudgetAccessForEvent(eventId, user, "read");
    const payload = await loadBudgetExportBase(eventId, user.id);
    const totals = computeTotals(payload.lineItems);
    const exportedAtIso = formatIsoTimestamp(payload.exportedAt);
    const exportedByDisplay = payload.exportedBy.name?.trim() || payload.exportedBy.email;
    const versionLabel = formatVersionLabel(payload.currentVersionNumber);
    const lineItemsByStatus = payload.lineItems.reduce<Record<BudgetLineItemStatus, number>>(
      (acc, item) => {
        acc[item.status] += 1;
        return acc;
      },
      {
        PLANNED: 0,
        COMMITTED: 0,
        PAID: 0,
      },
    );

    const columns = [
      "Event Name",
      "Event Start Date",
      "Event End Date",
      "Budget Status",
      "Budget Version",
      "Total Forecast (USD)",
      "Total Actual (USD)",
      "Total Variance (USD)",
      "Percent Under Budget",
      "Total Line Items",
      "Planned Items",
      "Committed Items",
      "Paid Items",
      "Exported At (UTC)",
      "Exported By",
    ];

    const rows = [[
      payload.event.name,
      formatDateOnly(payload.event.startDate),
      formatDateOnly(payload.event.endDate),
      formatBudgetStatus(payload.budget.status),
      versionLabel,
      toDollarString(totals.totalForecastCents),
      toDollarString(totals.totalActualCents),
      toDollarString(totals.varianceCents),
      totals.percentUnder.toFixed(1),
      payload.lineItems.length.toString(),
      lineItemsByStatus.PLANNED.toString(),
      lineItemsByStatus.COMMITTED.toString(),
      lineItemsByStatus.PAID.toString(),
      exportedAtIso,
      exportedByDisplay,
    ]];

    return {
      csv: buildCsv(columns, rows),
      filename: `${fileSafeSegment(payload.event.name)}-budget-summary-${formatDateOnly(payload.exportedAt)}.csv`,
    };
  } catch (error) {
    throw asBudgetServiceError(error, "Failed to export budget summary");
  }
}

export async function getBudgetFinancialReport(
  eventId: string,
  user: BudgetAccessUser,
): Promise<BudgetFinancialReport> {
  try {
    await assertBudgetAccessForEvent(eventId, user, "read");
    const payload = await loadBudgetExportBase(eventId, user.id);
    const generatedAt = new Date();

    const varianceLineItems: BudgetVarianceLineItem[] = payload.lineItems.map((lineItem) => {
      const varianceCents = lineItem.actualCents - lineItem.forecastCents;
      return {
        id: lineItem.id,
        category: getBudgetCategoryDisplay(lineItem.category) || "Contingency",
        subcategory: lineItem.subcategory,
        lineItem: lineItem.lineItem,
        vendor: lineItem.vendor,
        status: lineItem.status,
        approval: lineItem.approval,
        forecastCents: lineItem.forecastCents,
        actualCents: lineItem.actualCents,
        varianceCents,
        variancePercent: computeVariancePercent(lineItem.actualCents, lineItem.forecastCents),
      };
    });

    const totals = computeTotals(payload.lineItems);
    const varianceByCategoryMap = new Map<string, BudgetVarianceByCategory>();
    for (const item of varianceLineItems) {
      const existing = varianceByCategoryMap.get(item.category) ?? {
        category: item.category,
        lineItemCount: 0,
        totalForecastCents: 0,
        totalActualCents: 0,
        varianceCents: 0,
        variancePercent: null,
      };
      existing.lineItemCount += 1;
      existing.totalForecastCents += item.forecastCents;
      existing.totalActualCents += item.actualCents;
      existing.varianceCents += item.varianceCents;
      varianceByCategoryMap.set(item.category, existing);
    }

    const varianceByCategory = Array.from(varianceByCategoryMap.values())
      .map((entry) => ({
        ...entry,
        variancePercent: computeVariancePercent(entry.totalActualCents, entry.totalForecastCents),
      }))
      .sort((a, b) => Math.abs(b.varianceCents) - Math.abs(a.varianceCents));

    const topOverBudgetItems = varianceLineItems
      .filter((item) => item.varianceCents > 0)
      .sort((a, b) => b.varianceCents - a.varianceCents)
      .slice(0, 5);

    const topUnderBudgetItems = varianceLineItems
      .filter((item) => item.varianceCents < 0)
      .sort((a, b) => a.varianceCents - b.varianceCents)
      .slice(0, 5);

    return {
      generatedAt: generatedAt.toISOString(),
      forecastVsActual: {
        totalForecastCents: totals.totalForecastCents,
        totalActualCents: totals.totalActualCents,
        varianceCents: totals.varianceCents,
        variancePercent: computeVariancePercent(totals.totalActualCents, totals.totalForecastCents),
        lineItemCount: payload.lineItems.length,
      },
      varianceByCategory,
      topOverBudgetItems,
      topUnderBudgetItems,
      versionContext: {
        eventId: payload.event.id,
        budgetId: payload.budget.id,
        budgetStatus: payload.budget.status,
        budgetVersionId: payload.budget.currentVersionId,
        budgetVersionNumber: payload.currentVersionNumber,
        lineItemCount: payload.lineItems.length,
      },
    };
  } catch (error) {
    throw asBudgetServiceError(error, "Failed to build budget financial report");
  }
}

export async function listBudgetFilesForEvent(eventId: string, user: BudgetAccessUser): Promise<BudgetFilesSnapshot> {
  try {
    await assertBudgetAccessForEvent(eventId, user, "read");
    // Read path: do not create a Budget row just to list files.
    const budget = await getBudgetForEventReadOnly(eventId);
    if (!budget) {
      return { latestFile: null, history: [], activity: [] };
    }
    return getBudgetFilesSnapshotForBudget(eventId, budget.id);
  } catch (error) {
    throw asBudgetServiceError(error, "Failed to load budget files");
  }
}

export async function createBudgetFileUploadPresign(
  eventId: string,
  input: {
    filename?: unknown;
    contentType?: unknown;
    fileSizeBytes?: unknown;
    title?: unknown;
  },
  user: BudgetAccessUser,
): Promise<{
  documentId: string;
  uploadUrl: string;
  method: string;
  headers: Record<string, string> | null;
  objectKey: string;
  versionNumber: number;
  maxFileSizeBytes: number;
}> {
  try {
    await assertBudgetAccessForEvent(eventId, user, "write");

    const filename = normalizeRequiredText(input.filename, "filename");
    const categoryId = await ensureBudgetFileCategoryId(eventId);
    const title = normalizeOptionalText(input.title) ?? deriveBudgetFileTitle(filename);

    const draft = await createDocumentDraft(eventId, {
      title,
      categoryId,
      visibility: "INTERNAL_ONLY",
      links: [{ linkType: "EVENT", linkedId: eventId }],
    }, { id: user.id });

    let presign;
    try {
      presign = await createDocumentUploadPresign(eventId, {
        documentId: draft.id,
        filename,
        contentType: input.contentType,
        fileSizeBytes: input.fileSizeBytes,
      });
    } catch (error) {
      // Best-effort orphan cleanup when presign fails after draft creation.
      try {
        await getPrisma().document.deleteMany({
          where: {
            id: draft.id,
            eventId,
            categoryId,
            versions: { none: {} },
          },
        });
      } catch (cleanupError) {
        console.warn("Budget file draft cleanup failed after presign error", {
          eventId,
          documentId: draft.id,
          type: cleanupError instanceof Error ? cleanupError.name : typeof cleanupError,
          message: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        });
      }
      throw error;
    }

    return {
      documentId: draft.id,
      uploadUrl: presign.uploadUrl,
      method: presign.method,
      headers: presign.headers ?? null,
      objectKey: presign.objectKey,
      versionNumber: presign.versionNumber,
      maxFileSizeBytes: presign.maxFileSizeBytes,
    };
  } catch (error) {
    throw asBudgetServiceError(error, "Failed to prepare budget file upload");
  }
}

export async function finalizeBudgetFileUpload(
  eventId: string,
  documentId: string,
  input: {
    objectKey?: unknown;
    objectEtag?: unknown;
    mimeType?: unknown;
    fileSizeBytes?: unknown;
    originalFilename?: unknown;
    title?: unknown;
  },
  user: BudgetAccessUser,
): Promise<{
  documentId: string;
  versionId: string;
  versionNumber: number;
  budgetFiles: BudgetFilesSnapshot;
}> {
  try {
    await assertBudgetAccessForEvent(eventId, user, "write");

    const categoryId = await ensureBudgetFileCategoryId(eventId);
    const document = await getPrisma().document.findFirst({
      where: {
        id: documentId,
        eventId,
        categoryId,
      },
      select: {
        id: true,
        title: true,
      },
    });

    if (!document) {
      throw new BudgetServiceError("Budget file document not found", 404);
    }

    const budget = await getOrCreateBudgetForEvent(eventId);
    const linkedBudgetVersionNumber = budget.currentVersionId
      ? (
        await getPrisma().budgetVersion.findUnique({
          where: { id: budget.currentVersionId },
          select: { versionNumber: true },
        })
      )?.versionNumber ?? null
      : null;

    const priorUploadedFilesCount = await getPrisma().document.count({
      where: {
        eventId,
        categoryId,
        id: { not: documentId },
        versions: {
          some: {},
        },
      },
    });
    const action: BudgetFileAction = priorUploadedFilesCount > 0 ? "REPLACED" : "UPLOADED";

    const finalizedVersion = await finalizeDocumentUpload(
      eventId,
      documentId,
      {
        objectKey: input.objectKey,
        objectEtag: input.objectEtag,
        mimeType: input.mimeType,
        fileSizeBytes: input.fileSizeBytes,
        originalFilename: input.originalFilename,
        title: normalizeOptionalText(input.title) ?? document.title,
        categoryId,
        visibility: "INTERNAL_ONLY",
        links: [{ linkType: "EVENT", linkedId: eventId }],
      },
      user.id,
    );

    await getPrisma().$transaction(async (tx) => {
      await tx.budgetActivity.create({
        data: {
          budgetId: budget.id,
          type: BudgetActivityType.REVISED,
          actorUserId: user.id,
          note: encodeBudgetFileActivityNote({
            action,
            documentId,
            versionId: finalizedVersion.id,
            originalFilename: finalizedVersion.originalFilename,
            linkedBudgetVersionId: budget.currentVersionId ?? null,
            linkedBudgetVersionNumber,
          }),
        },
      });
      // Canonical event feed entry. Never store the storage key / object etag.
      await recordEventActivity(tx, {
        eventId,
        actor: { kind: "USER", userId: user.id },
        module: "BUDGET",
        action: "UPLOADED",
        entityType: "BudgetFile",
        entityId: documentId,
        entityLabel: finalizedVersion.originalFilename ?? "Budget file",
        message:
          action === "REPLACED"
            ? `Replaced budget file "${finalizedVersion.originalFilename ?? "file"}"`
            : `Uploaded budget file "${finalizedVersion.originalFilename ?? "file"}"`,
      });
    });

    const budgetFiles = await getBudgetFilesSnapshotForBudget(eventId, budget.id);

    return {
      documentId,
      versionId: finalizedVersion.id,
      versionNumber: finalizedVersion.versionNumber,
      budgetFiles,
    };
  } catch (error) {
    throw asBudgetServiceError(error, "Failed to finalize budget file upload");
  }
}

export async function getBudgetFileDownload(
  eventId: string,
  documentId: string,
  user: BudgetAccessUser,
): Promise<{ url: string }> {
  try {
    await assertBudgetAccessForEvent(eventId, user, "read");

    const category = await getPrisma().documentCategory.findFirst({
      where: {
        eventId,
        slug: BUDGET_FILE_CATEGORY_SLUG,
      },
      select: { id: true },
    });

    if (!category) {
      throw new BudgetServiceError("Budget file not found", 404);
    }

    const document = await getPrisma().document.findFirst({
      where: {
        id: documentId,
        eventId,
        categoryId: category.id,
      },
      select: { id: true },
    });

    if (!document) {
      throw new BudgetServiceError("Budget file not found", 404);
    }

    const payload = await getDownloadForDocument(eventId, documentId);
    return { url: payload.url };
  } catch (error) {
    throw asBudgetServiceError(error, "Failed to download budget file");
  }
}

export async function getBudgetSnapshot(
  eventId: string,
  options?: {
    currentUserId?: string | null;
    includeActivity?: boolean;
    includeRecipients?: boolean;
    includeSubmissions?: boolean;
    includeSubmissionDetails?: boolean;
    includeBudgetFiles?: boolean;
    includeLineItemRequirementLinks?: boolean;
    includeLineItems?: boolean;
  },
): Promise<BudgetSnapshot> {
  const debugContext = {
    requestId: `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    eventId,
  };
  const startedAt = Date.now();
  const sectionDurationsMs: Record<string, number> = {};
  const includeActivity = options?.includeActivity ?? false;
  const includeRecipients = options?.includeRecipients ?? true;
  const includeSubmissions = options?.includeSubmissions ?? true;
  const includeSubmissionDetails = options?.includeSubmissionDetails ?? true;
  const includeBudgetFiles = options?.includeBudgetFiles ?? true;
  // The session-requirement link is a heavy nested join (session + item + section
  // per line item) that the budget grid never renders. Callers that don't display
  // it can opt out to lighten the first-render line-item payload; default stays on
  // so every existing caller keeps the full shape.
  const includeLineItemRequirementLinks = options?.includeLineItemRequirementLinks ?? true;
  // Light snapshot: skip materializing the full line-item array so first load can
  // render shell/metadata/totals without shipping every row. Global totals and
  // lineItemCount are still authoritative (computed via DB aggregate below).
  // Defaults on so every existing caller keeps the full line-item payload.
  const includeLineItems = options?.includeLineItems ?? true;

  async function measureSection<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const sectionStart = Date.now();
    const result = await fn();
    sectionDurationsMs[name] = Date.now() - sectionStart;
    return result;
  }

  debugBudgetLoadLog(debugContext, "getBudgetSnapshot:start", {
    currentUserId: options?.currentUserId ?? null,
    includeActivity,
    includeRecipients,
    includeSubmissions,
    includeSubmissionDetails,
    includeBudgetFiles,
  });

  // Read-only lookup: the snapshot is a read path and must not create/upsert a
  // Budget row. When none exists yet, render a synthetic empty budget; the row is
  // created on the first write. budget-scoped reads below are gated on the real
  // budget id so we never query with the synthetic empty id.
  const existingBudget = await measureSection(
    "budget.lookup",
    async () => getBudgetForEventReadOnly(eventId),
  );
  const budget = existingBudget ?? makeEmptyBudgetForEvent(eventId);
  const resolvedBudgetId = existingBudget?.id ?? null;
  debugBudgetLoadLog(debugContext, "getBudgetSnapshot:getBudgetWithRelationsOrThrow:end", {
    budgetId: budget.id,
    budgetStatus: budget.status,
  });

  debugBudgetLoadLog(debugContext, "getBudgetSnapshot:readSections:start");
  // These reads depend only on budget.id / eventId (never on each other), so they
  // run as one concurrent wave instead of stacking serial round-trip latency.
  // Only documentLinks.read depends on the loaded line item IDs, so it stays
  // ordered after this wave. Section timings still record per-read wall-clock.
  const [lineItems, activity, eventMembers, submissions, lightweightSubmissions, budgetFiles] = await Promise.all([
    resolvedBudgetId && includeLineItems
      ? measureSection(
        "lineItems.read",
        async () => getPrisma().budgetLineItem.findMany({
          where: { budgetId: resolvedBudgetId },
          include: {
            matrixRow: { select: { sessionName: true } },
            group: { select: { id: true, name: true, color: true } },
            // Heavy nested join (session + item + section per row). Omitted when the
            // caller does not render the requirement link, to lighten first render.
            ...(includeLineItemRequirementLinks
              ? {
                  sessionRequirementSelection: {
                    select: {
                      sessionId: true,
                      itemId: true,
                      quantity: true,
                      session: {
                        select: {
                          sessionName: true,
                        },
                      },
                      item: {
                        select: {
                          id: true,
                          label: true,
                          section: {
                            select: {
                              id: true,
                              label: true,
                            },
                          },
                        },
                      },
                    },
                  },
                }
              : {}),
          },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        }),
      )
      : [],
    includeActivity && resolvedBudgetId
      ? measureSection(
        "activity.read",
        async () => getPrisma().budgetActivity.findMany({
          where: { budgetId: resolvedBudgetId },
          orderBy: { createdAt: "desc" },
          include: {
            actorUser: { select: USER_SELECT },
          },
        }),
      )
      : [],
    includeRecipients
      ? measureSection(
        "recipients.read",
        async () => getPrisma().eventMember.findMany({
          where: { eventId },
          select: {
            user: { select: USER_SELECT },
          },
        }),
      )
      : [],
    includeSubmissions && includeSubmissionDetails && resolvedBudgetId
      ? measureSection(
        "submissions.read",
        async () => getPrisma().budgetSubmission.findMany({
          where: { budgetId: resolvedBudgetId },
          include: {
            submittedByUser: { select: USER_SELECT },
            pulledBackByUser: { select: USER_SELECT },
            recipients: {
              include: {
                user: { select: USER_SELECT },
              },
            },
            lineItems: {
              include: {
                budgetLineItem: true,
              },
            },
          },
          orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
        }),
      )
      : [],
    includeSubmissions && !includeSubmissionDetails && resolvedBudgetId
      ? measureSection(
        "submissionStatus.read",
        async () => getPrisma().budgetSubmission.findMany({
          where: { budgetId: resolvedBudgetId },
          select: {
            id: true,
            budgetId: true,
            budgetVersionId: true,
            status: true,
            submittedAt: true,
            submittedByUser: { select: USER_SELECT },
            pulledBackAt: true,
            pulledBackByUser: { select: USER_SELECT },
            message: true,
            lineItems: {
              select: {
                budgetLineItemId: true,
              },
            },
          },
          orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
        }),
      )
      : [],
    includeBudgetFiles && resolvedBudgetId
      ? measureSection(
        "budgetFiles.read",
        async () => {
          try {
            return await getBudgetFilesSnapshotForBudget(eventId, resolvedBudgetId);
          } catch (error) {
            console.warn("Budget snapshot budgetFiles read failed; returning fallback", {
              eventId,
              budgetId: resolvedBudgetId,
              type: error instanceof Error ? error.name : typeof error,
              message: error instanceof Error ? error.message : String(error),
            });
            return {
              latestFile: null,
              history: [],
              activity: [],
            } satisfies BudgetFilesSnapshot;
          }
        },
      )
      : {
        latestFile: null,
        history: [],
        activity: [],
      },
  ]);
  debugBudgetLoadLog(debugContext, "getBudgetSnapshot:readSections:end", {
    lineItemCount: lineItems.length,
    activityCount: activity.length,
    eventMemberCount: eventMembers.length,
    submissionCount: submissions.length,
  });
  debugBudgetLoadLog(debugContext, "getBudgetSnapshot:budgetFiles:end", {
    latestFileId: budgetFiles.latestFile?.documentId ?? null,
    historyCount: budgetFiles.history.length,
    activityCount: budgetFiles.activity.length,
  });

  // documentLinks is the only snapshot read that depends on the loaded line item
  // IDs, so it runs after the concurrent wave above.
  const lineItemIds = lineItems.map((lineItem) => lineItem.id);
  const documentLinks = lineItemIds.length > 0
    ? await measureSection(
      "documentLinks.read",
      async () => getPrisma().documentLink.findMany({
        where: {
          linkType: DocumentLinkType.BUDGET_ITEM,
          linkedId: { in: lineItemIds },
          document: { eventId },
        },
        orderBy: { createdAt: "asc" },
        select: {
          linkedId: true,
          documentId: true,
        },
      }),
    )
    : [];
  debugBudgetLoadLog(debugContext, "getBudgetSnapshot:documentLinks:end", {
    documentLinkCount: documentLinks.length,
  });

  const documentsByLineItemId = new Map<string, { documentCount: number; firstDocumentId: string | null }>();
  for (const lineItemId of lineItemIds) {
    documentsByLineItemId.set(lineItemId, { documentCount: 0, firstDocumentId: null });
  }

  for (const link of documentLinks) {
    const existing = documentsByLineItemId.get(link.linkedId) ?? { documentCount: 0, firstDocumentId: null };
    documentsByLineItemId.set(link.linkedId, {
      documentCount: existing.documentCount + 1,
      firstDocumentId: existing.firstDocumentId ?? link.documentId,
    });
  }

  type LineItemRequirementSelection = {
    sessionId: string;
    itemId: string;
    quantity: number | null;
    session: { sessionName: string | null };
    item: { id: string; label: string; section: { id: string; label: string } };
  };
  const lineItemsWithDocs: BudgetLineItemWithDocs[] = lineItems.map((lineItem) => {
    // sessionRequirementSelection is only present when the requirement-link include
    // ran; cast to an optional shape so the lean payload (no link) maps to null.
    const { sessionRequirementSelection, matrixRow, group, ...budgetLineItem } =
      lineItem as typeof lineItem & { sessionRequirementSelection?: LineItemRequirementSelection | null };
    const docMeta = documentsByLineItemId.get(lineItem.id) ?? { documentCount: 0, firstDocumentId: null };
    return {
      ...budgetLineItem,
      documentCount: docMeta.documentCount,
      firstDocumentId: docMeta.firstDocumentId,
      sessionTitle: matrixRow?.sessionName?.trim() || null,
      groupName: group?.name ?? null,
      groupColor: group?.color ?? null,
      linkedSessionRequirement: sessionRequirementSelection
        ? {
            sessionId: sessionRequirementSelection.sessionId,
            sessionTitle: sessionRequirementSelection.session.sessionName ?? null,
            requirementItemId: sessionRequirementSelection.itemId,
            requirementItemName: sessionRequirementSelection.item.label,
            requirementSectionId: sessionRequirementSelection.item.section.id,
            requirementSectionName: sessionRequirementSelection.item.section.label,
            requirementQuantity: sessionRequirementSelection.quantity ?? null,
          }
        : null,
    };
  });

  if (shouldLogBudgetDebug()) {
    console.info("DEBUG RECIPIENTS load:build:start", {
      eventId,
      currentUserId: options?.currentUserId ?? null,
      eventMemberCount: eventMembers.length,
    });
  }
  const submissionRecipients = buildSubmissionRecipients(eventMembers, options?.currentUserId);
  if (shouldLogBudgetDebug()) {
    console.info("DEBUG RECIPIENTS load:build:end", {
      eventId,
      submissionRecipientCount: submissionRecipients.length,
      submissionRecipientIds: submissionRecipients.map((recipient) => recipient.id),
    });
  }

  // Global totals + count must be authoritative over the FULL Budget, never
  // page-only. In full mode we reduce the loaded rows; in light mode (no rows
  // loaded) we read a DB aggregate over the whole budget so the header totals and
  // count stay correct without shipping every line item.
  let totals: BudgetSnapshot["totals"];
  let lineItemCount: number;
  if (includeLineItems) {
    totals = computeTotals(lineItems);
    lineItemCount = lineItems.length;
  } else if (resolvedBudgetId) {
    const aggregate = await measureSection(
      "lineItems.aggregate",
      async () => getPrisma().budgetLineItem.aggregate({
        where: { budgetId: resolvedBudgetId },
        _sum: { forecastCents: true, actualCents: true },
        _count: true,
      }),
    );
    totals = totalsFromSums(aggregate._sum.forecastCents ?? 0, aggregate._sum.actualCents ?? 0);
    lineItemCount = aggregate._count;
  } else {
    totals = totalsFromSums(0, 0);
    lineItemCount = 0;
  }
  const lineItemSummaryById = new Map(lineItemsWithDocs.map((lineItem) => [lineItem.id, lineItem]));
  const submissionSummaries = includeSubmissionDetails
    ? submissions.map((submission) => toBudgetSubmissionSummary(submission))
    : lightweightSubmissions.map((submission) => ({
      id: submission.id,
      budgetId: submission.budgetId,
      budgetVersionId: submission.budgetVersionId,
      status: submission.status,
      submittedAt: submission.submittedAt.toISOString(),
      submittedByUser: submission.submittedByUser,
      pulledBackAt: submission.pulledBackAt?.toISOString() ?? null,
      pulledBackByUser: submission.pulledBackByUser,
      message: submission.message,
      recipients: [],
      lineItems: submission.lineItems
        .map((lineItem) => lineItemSummaryById.get(lineItem.budgetLineItemId))
        .filter((lineItem): lineItem is BudgetLineItemWithDocs => Boolean(lineItem)),
      lineItemIds: submission.lineItems.map((lineItem) => lineItem.budgetLineItemId),
    } satisfies BudgetSubmissionSummary));
  const totalDurationMs = Date.now() - startedAt;
  debugBudgetLoadLog(debugContext, "getBudgetSnapshot:end", {
    durationMs: totalDurationMs,
    queryGroups: Object.keys(sectionDurationsMs).length,
    sectionDurationsMs,
    totalForecastCents: totals.totalForecastCents,
    totalActualCents: totals.totalActualCents,
    normalizedSubmissionCount: submissionSummaries.length,
  });
  return {
    budget,
    lineItems: lineItemsWithDocs,
    lineItemCount,
    activity,
    submissionRecipients,
    submissions: submissionSummaries,
    budgetFiles,
    totals,
  };
}

function userDisplayValue(user: UserMini): string {
  return (user.name?.trim() || user.email).toLowerCase();
}

/**
 * Eligible budget-submission recipients for an event: the event's own members
 * (EventMember rows), de-duplicated, with the submitter (currentUser) excluded
 * so nobody can route an approval to themselves. Sorted by display name/email.
 *
 * No synthetic recipients are ever invented here — when an event has no members
 * other than the current user, the list is legitimately empty and the UI shows
 * its "no reviewers" empty state. This is the single source of truth for the
 * Submit-for-approval recipient picker.
 */
export function buildSubmissionRecipients(
  eventMembers: Array<{ user: UserMini }>,
  currentUserId?: string | null,
): UserMini[] {
  const recipientsById = new Map<string, UserMini>();
  for (const member of eventMembers) {
    if (currentUserId && member.user.id === currentUserId) {
      continue;
    }
    recipientsById.set(member.user.id, member.user);
  }
  return Array.from(recipientsById.values()).sort((a, b) =>
    userDisplayValue(a).localeCompare(userDisplayValue(b)),
  );
}

function normalizeRecipientUserIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new BudgetServiceError("recipientUserIds must be an array", 400);
  }

  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (normalized.length === 0) {
    throw new BudgetServiceError("Select at least one recipient", 400);
  }

  return Array.from(new Set(normalized));
}

async function ensureCurrentBudgetVersion(
  tx: Prisma.TransactionClient,
  budget: BudgetWithMeta,
  createdByUserId: string,
  debugContext?: SubmissionDebugContext,
): Promise<string> {
  if (budget.currentVersionId) {
    debugSubmissionLog(debugContext, "ensureCurrentBudgetVersion:reuseExisting", {
      budgetId: budget.id,
      currentVersionId: budget.currentVersionId,
    });
    return budget.currentVersionId;
  }

  debugSubmissionLog(debugContext, "ensureCurrentBudgetVersion:budgetVersion.aggregate:start", {
    budgetId: budget.id,
  });
  const maxVersion = await tx.budgetVersion.aggregate({
    where: { budgetId: budget.id },
    _max: { versionNumber: true },
  });
  debugSubmissionLog(debugContext, "ensureCurrentBudgetVersion:budgetVersion.aggregate:end", {
    maxVersionNumber: maxVersion._max.versionNumber ?? null,
  });

  debugSubmissionLog(debugContext, "ensureCurrentBudgetVersion:budgetVersion.create:start");
  const createdVersion = await tx.budgetVersion.create({
    data: {
      budgetId: budget.id,
      versionNumber: (maxVersion._max.versionNumber ?? 0) + 1,
      createdByUserId,
    },
  });
  debugSubmissionLog(debugContext, "ensureCurrentBudgetVersion:budgetVersion.create:end", {
    budgetVersionId: createdVersion.id,
    versionNumber: createdVersion.versionNumber,
  });

  debugSubmissionLog(debugContext, "ensureCurrentBudgetVersion:budget.update:start", {
    budgetVersionId: createdVersion.id,
  });
  await tx.budget.update({
    where: { id: budget.id },
    data: { currentVersionId: createdVersion.id },
  });
  debugSubmissionLog(debugContext, "ensureCurrentBudgetVersion:budget.update:end", {
    budgetVersionId: createdVersion.id,
  });

  return createdVersion.id;
}

export async function addLineItem(
  eventId: string,
  input: {
    category?: unknown;
    subcategory?: unknown;
    lineItem?: unknown;
    vendor?: unknown;
    matrixRowId?: unknown;
    forecastCents?: unknown;
    actualCents?: unknown;
    status?: unknown;
    approval?: unknown;
  },
  actor?: BudgetAuditActor,
): Promise<BudgetLineItem> {
  const budget = await getBudgetWithRelationsOrThrow(eventId);
  assertBudgetEditable(budget);
  const matrixRowId = normalizeOptionalText(input.matrixRowId);
  if (matrixRowId) {
    const session = await getPrisma().matrixRow.findFirst({
      where: { id: matrixRowId, eventId },
      select: { id: true },
    });
    if (!session) throw new BudgetServiceError("Session is not part of this event", 400);
  }

  const maxSortOrder = await getPrisma().budgetLineItem.aggregate({
    where: { budgetId: budget.id },
    _max: { sortOrder: true },
  });

  // Business write + audit entry commit atomically in one transaction.
  return getPrisma().$transaction(async (tx) => {
    const created = await tx.budgetLineItem.create({
      data: {
        budgetId: budget.id,
        category: normalizeOptionalText(input.category) ?? "Uncategorized",
        subcategory: normalizeOptionalText(input.subcategory) ?? "General",
        // A line item is the canonical identity of a budget row. Never create
        // a silent placeholder that could be mistaken for a real planned cost.
        lineItem: normalizeRequiredText(input.lineItem, "lineItem"),
        vendor: normalizeOptionalText(input.vendor),
        matrixRowId,
        forecastCents:
          typeof input.forecastCents === "undefined" ? 0 : normalizeNonNegativeInt(input.forecastCents, "forecastCents"),
        actualCents:
          typeof input.actualCents === "undefined" ? 0 : normalizeNonNegativeInt(input.actualCents, "actualCents"),
        status: typeof input.status === "undefined" ? BudgetLineItemStatus.PLANNED : normalizeStatus(input.status),
        approval:
          typeof input.approval === "undefined" ? BudgetLineItemApproval.PENDING : normalizeApproval(input.approval),
        sortOrder: (maxSortOrder._max.sortOrder ?? 0) + 1,
      },
    });

    await recordEventActivity(tx, {
      eventId,
      actor: budgetActor(actor),
      module: "BUDGET",
      action: "CREATED",
      entityType: "BudgetLineItem",
      entityId: created.id,
      entityLabel: created.lineItem,
      message: `Added budget line item "${created.lineItem}" (${formatCents(created.forecastCents)} forecast)`,
    });

    return created;
  });
}

export type BudgetImportInputRow = {
  category: unknown;
  subcategory?: unknown;
  lineItem: unknown;
  vendor?: unknown;
  forecastCents: unknown;
  actualCents?: unknown;
  status?: unknown;
  // Optional human-readable Session title and Group name from the import sheet.
  // Resolved to matrixRowId / groupId in importLineItems (never guessed).
  session?: unknown;
  group?: unknown;
};

/**
 * Resolve each row's optional Session title to a MatrixRow id for the event.
 * Returns an id-or-null aligned to inputRows. Ambiguous titles (multiple event
 * sessions share the title) throw a row-scoped 400 rather than guessing.
 */
async function resolveImportSessionIds(
  eventId: string,
  inputRows: BudgetImportInputRow[],
): Promise<(string | null)[]> {
  const hasAnySession = inputRows.some(
    (row) => typeof row.session === "string" && row.session.trim() !== "",
  );
  if (!hasAnySession) return inputRows.map(() => null);

  const sessions = await getPrisma().matrixRow.findMany({
    where: { eventId },
    select: { id: true, sessionName: true },
  });
  const index = buildSessionTitleIndex(sessions);

  return inputRows.map((row, i) => {
    const resolution = resolveImportSessionId(row.session, index);
    if (resolution.status === "ambiguous") {
      throw new BudgetServiceError(
        `Row ${i + 1}: session "${String(row.session).trim()}" matches multiple event sessions; resolve it manually`,
        400,
      );
    }
    return resolution.matrixRowId;
  });
}

/**
 * Resolve each row's optional Group name to a BudgetGroup id, creating groups
 * that do not yet exist (normalized, duplicate-safe). Returns an id-or-null
 * aligned to inputRows.
 */
async function resolveImportGroupIds(
  budgetId: string,
  inputRows: BudgetImportInputRow[],
  actorUserId: string | null,
): Promise<(string | null)[]> {
  const namesByRow = inputRows.map((row) =>
    typeof row.group === "string" && row.group.trim() !== "" ? row.group.replace(/\s+/g, " ").trim() : null,
  );
  if (namesByRow.every((name) => name === null)) return inputRows.map(() => null);

  const idByNormalized = new Map<string, string>();
  // The two setup reads are independent, so run them concurrently.
  const [existing, maxSortOrder] = await Promise.all([
    getPrisma().budgetGroup.findMany({
      where: { budgetId },
      select: { id: true, normalizedName: true },
    }),
    getPrisma().budgetGroup.aggregate({
      where: { budgetId },
      _max: { sortOrder: true },
    }),
  ]);
  for (const group of existing) idByNormalized.set(group.normalizedName, group.id);

  // Collect the distinct new groups (first-appearance order, same sort order the
  // per-row loop assigned) and create them in one createMany instead of N inserts.
  let nextSortOrder = (maxSortOrder._max.sortOrder ?? 0) + 1;
  const seen = new Set<string>(idByNormalized.keys());
  const newGroups: Array<{ budgetId: string; name: string; normalizedName: string; sortOrder: number; createdByUserId: string | null }> = [];
  for (const name of namesByRow) {
    if (name === null) continue;
    const normalizedName = normalizeNameKey(name);
    if (seen.has(normalizedName)) continue;
    seen.add(normalizedName);
    newGroups.push({ budgetId, name, normalizedName, sortOrder: nextSortOrder, createdByUserId: actorUserId });
    nextSortOrder += 1;
  }

  if (newGroups.length > 0) {
    // skipDuplicates makes this safe against a concurrent import that created the
    // same normalized group; the re-read below resolves every id (ours + raced).
    await getPrisma().budgetGroup.createMany({ data: newGroups, skipDuplicates: true });
    const refreshed = await getPrisma().budgetGroup.findMany({
      where: { budgetId },
      select: { id: true, normalizedName: true },
    });
    for (const group of refreshed) idByNormalized.set(group.normalizedName, group.id);
  }

  return namesByRow.map((name) => (name === null ? null : idByNormalized.get(normalizeNameKey(name)) ?? null));
}

/**
 * Normalize already-validated import rows into Prisma createMany inputs.
 * Pure and synchronous: all normalization happens before any DB round-trip, so
 * a bad value throws a 400 BudgetServiceError without leaving partial state.
 * `sortOrder` is assigned contiguously from `baseSortOrder` to preserve order.
 */
export function buildBudgetImportCreateData(
  budgetId: string,
  inputRows: BudgetImportInputRow[],
  baseSortOrder: number,
): Prisma.BudgetLineItemCreateManyInput[] {
  return inputRows.map((row, index) => ({
    budgetId,
    category: normalizeBudgetCategoryForStorage(normalizeRequiredText(row.category, "category")),
    subcategory: normalizeOptionalText(row.subcategory) ?? "General",
    lineItem: normalizeRequiredText(row.lineItem, "lineItem"),
    vendor: normalizeOptionalText(row.vendor),
    forecastCents: normalizeNonNegativeInt(row.forecastCents, "forecastCents"),
    actualCents:
      typeof row.actualCents === "undefined"
        ? 0
        : normalizeNonNegativeInt(row.actualCents, "actualCents"),
    status:
      typeof row.status === "undefined" || row.status === null || row.status === ""
        ? BudgetLineItemStatus.PLANNED
        : normalizeStatus(row.status),
    approval: BudgetLineItemApproval.PENDING,
    sortOrder: baseSortOrder + index + 1,
  }));
}

const BUDGET_IMPORT_CHUNK_SIZE = 500;

export async function importLineItems(
  eventId: string,
  inputRows: BudgetImportInputRow[],
  options: { actorUserId?: string | null; user: BudgetAccessUser },
): Promise<BudgetLineItem[]> {
  await assertBudgetAccessForEvent(eventId, options.user, "write");
  if (inputRows.length === 0) {
    throw new BudgetServiceError("At least one row is required for import", 400);
  }

  const budget = await getBudgetWithRelationsOrThrow(eventId);
  assertBudgetEditable(budget);

  const maxSortOrder = await getPrisma().budgetLineItem.aggregate({
    where: { budgetId: budget.id },
    _max: { sortOrder: true },
  });

  const baseSortOrder = maxSortOrder._max.sortOrder ?? 0;
  const data = buildBudgetImportCreateData(budget.id, inputRows, baseSortOrder);

  // Resolve optional Session/Group columns onto canonical ids before insert.
  // Sessions are matched by exact (normalized) title — ambiguous titles error
  // rather than guess; missing titles leave the row session-less. Groups are
  // created-or-found by normalized name (auto-create, duplicate-safe).
  const sessionIdByRow = await resolveImportSessionIds(eventId, inputRows);
  const groupIdByRow = await resolveImportGroupIds(budget.id, inputRows, options?.actorUserId ?? null);
  const dataWithLinks = data.map((row, index) => ({
    ...row,
    matrixRowId: sessionIdByRow[index],
    groupId: groupIdByRow[index],
  }));

  // Bulk-insert with createMany (one SQL statement per chunk) instead of one
  // create() per row inside an interactive transaction, which exceeded the 5s
  // limit and failed with Prisma P2028 at ~78 rows. A single chunk is a single
  // atomic statement; larger imports run their chunks in one transaction.
  const importActor = budgetActor(options?.actorUserId ? { id: options.actorUserId } : null);
  // One summary audit entry per import (never one row per imported line item).
  const importSummary = {
    eventId,
    actor: importActor,
    module: "BUDGET" as const,
    action: "IMPORTED" as const,
    entityType: "Budget",
    entityId: budget.id,
    entityLabel: "Budget import",
    message: `Imported ${dataWithLinks.length} budget line item${dataWithLinks.length === 1 ? "" : "s"}`,
  };

  if (dataWithLinks.length <= BUDGET_IMPORT_CHUNK_SIZE) {
    await getPrisma().$transaction(async (tx) => {
      await tx.budgetLineItem.createMany({ data: dataWithLinks });
      await recordEventActivity(tx, importSummary);
    });
  } else {
    await getPrisma().$transaction(
      async (tx) => {
        for (let offset = 0; offset < dataWithLinks.length; offset += BUDGET_IMPORT_CHUNK_SIZE) {
          await tx.budgetLineItem.createMany({
            data: dataWithLinks.slice(offset, offset + BUDGET_IMPORT_CHUNK_SIZE),
          });
        }
        await recordEventActivity(tx, importSummary);
      },
      // Defense-in-depth for very large multi-chunk imports only; the createMany
      // statements above are the actual fix, not this bound.
      { timeout: 30_000 },
    );
  }

  // createMany does not return rows; read back exactly the rows we just inserted
  // (their sortOrder window) so callers keep the BudgetLineItem[] contract.
  return getPrisma().budgetLineItem.findMany({
    where: {
      budgetId: budget.id,
      sortOrder: { gt: baseSortOrder, lte: baseSortOrder + data.length },
    },
    orderBy: { sortOrder: "asc" },
  });
}

export async function updateLineItem(
  eventId: string,
  lineItemId: string,
  input: {
    category?: unknown;
    subcategory?: unknown;
    lineItem?: unknown;
    vendor?: unknown;
    forecastCents?: unknown;
    actualCents?: unknown;
    status?: unknown;
    approval?: unknown;
    sortOrder?: unknown;
  },
  actor?: BudgetAuditActor,
): Promise<BudgetLineItem> {
  const budget = await getBudgetWithRelationsOrThrow(eventId);
  assertBudgetEditable(budget);

  const existing = await getPrisma().budgetLineItem.findFirst({
    where: {
      id: lineItemId,
      budgetId: budget.id,
    },
  });

  if (!existing) {
    throw new BudgetServiceError("Line item not found", 404);
  }

  await assertLineItemEditable(existing.id);

  const data: Prisma.BudgetLineItemUpdateInput = {};

  if (typeof input.category !== "undefined") data.category = normalizeRequiredText(input.category, "category");
  if (typeof input.subcategory !== "undefined") data.subcategory = normalizeRequiredText(input.subcategory, "subcategory");
  if (typeof input.lineItem !== "undefined") data.lineItem = normalizeRequiredText(input.lineItem, "lineItem");
  if (typeof input.vendor !== "undefined") data.vendor = normalizeOptionalText(input.vendor);
  if (typeof input.forecastCents !== "undefined") data.forecastCents = normalizeNonNegativeInt(input.forecastCents, "forecastCents");
  if (typeof input.actualCents !== "undefined") data.actualCents = normalizeNonNegativeInt(input.actualCents, "actualCents");
  if (typeof input.status !== "undefined") data.status = normalizeStatus(input.status);
  if (typeof input.approval !== "undefined") data.approval = normalizeApproval(input.approval);
  if (typeof input.sortOrder !== "undefined") data.sortOrder = normalizeInt(input.sortOrder, "sortOrder");

  if (Object.keys(data).length === 0) {
    throw new BudgetServiceError("At least one updatable field is required", 400);
  }

  // Compute the meaningful diff from the authoritative before/after values.
  const changes = buildLineItemDiff(existing, {
    category: data.category as string | undefined,
    subcategory: data.subcategory as string | undefined,
    lineItem: data.lineItem as string | undefined,
    vendor: data.vendor as string | null | undefined,
    forecastCents: data.forecastCents as number | undefined,
    actualCents: data.actualCents as number | undefined,
    status: data.status as string | undefined,
    approval: data.approval as string | undefined,
  });

  return getPrisma().$transaction(async (tx) => {
    const updated = await tx.budgetLineItem.update({
      where: { id: lineItemId },
      data,
    });

    // Only record activity when a user-meaningful field actually changed
    // (a pure sortOrder reorder is not audit-worthy noise).
    if (changes.length > 0) {
      await recordEventActivity(tx, {
        eventId,
        actor: budgetActor(actor),
        module: "BUDGET",
        action: "UPDATED",
        entityType: "BudgetLineItem",
        entityId: updated.id,
        entityLabel: updated.lineItem,
        message: `Updated budget line item "${updated.lineItem}"`,
        changes,
      });
    }

    return updated;
  });
}

export async function deleteLineItem(
  eventId: string,
  lineItemId: string,
  actor?: BudgetAuditActor,
): Promise<{ id: string }> {
  const budget = await getBudgetWithRelationsOrThrow(eventId);
  assertBudgetEditable(budget);

  const existing = await getPrisma().budgetLineItem.findFirst({
    where: {
      id: lineItemId,
      budgetId: budget.id,
    },
    select: { id: true, lineItem: true },
  });

  if (!existing) {
    throw new BudgetServiceError("Line item not found", 404);
  }

  await getPrisma().$transaction(async (tx) => {
    await tx.budgetLineItem.delete({ where: { id: lineItemId } });
    await recordEventActivity(tx, {
      eventId,
      actor: budgetActor(actor),
      module: "BUDGET",
      action: "DELETED",
      entityType: "BudgetLineItem",
      entityId: existing.id,
      entityLabel: existing.lineItem,
      message: `Deleted budget line item "${existing.lineItem}"`,
    });
  });

  return { id: lineItemId };
}

export type BulkDeleteLineItemsResult = {
  /** Rows actually removed from the database (confirmed by deleteMany count). */
  deletedCount: number;
  deletedIds: string[];
  /** Requested ids that were already gone / not found in this budget. */
  skippedCount: number;
  skippedIds: string[];
};

/** Dedupe, trim, and validate a requested bulk-delete id list. */
export function normalizeBulkDeleteIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) {
    throw new BudgetServiceError("ids must be an array", 400);
  }
  const normalized = Array.from(
    new Set(
      ids
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter((id) => id.length > 0),
    ),
  );
  if (normalized.length === 0) {
    throw new BudgetServiceError("At least one line item id is required", 400);
  }
  return normalized;
}

export type BulkDeleteClassification = {
  /** Requested ids that exist and belong to this budget (deletable). */
  ownedIds: string[];
  /** Requested ids that exist but belong to a different budget (scope violation). */
  foreignIds: string[];
  /** Requested ids that do not exist anywhere (already deleted / stale). */
  staleIds: string[];
};

/**
 * Partition requested ids against the rows actually found in the DB. Pure so the
 * scope/partial-success rules are unit-tested without a database.
 */
export function classifyBulkDeleteIds(
  requestedIds: string[],
  found: Array<{ id: string; budgetId: string }>,
  budgetId: string,
): BulkDeleteClassification {
  const foundIds = new Set(found.map((row) => row.id));
  return {
    ownedIds: found.filter((row) => row.budgetId === budgetId).map((row) => row.id),
    foreignIds: found.filter((row) => row.budgetId !== budgetId).map((row) => row.id),
    staleIds: requestedIds.filter((id) => !foundIds.has(id)),
  };
}

/**
 * Build the bulk-delete result from the DB-confirmed delete count. Owned ids
 * that the database did not remove (concurrent delete) are reported as skipped
 * alongside stale ids, so a partial batch is success, not a scary failure.
 */
export function buildBulkDeleteResult(
  ownedIds: string[],
  staleIds: string[],
  deletedCount: number,
): BulkDeleteLineItemsResult {
  const notDeletedOwnedCount = Math.max(0, ownedIds.length - deletedCount);
  return {
    deletedCount,
    deletedIds: ownedIds,
    skippedCount: staleIds.length + notDeletedOwnedCount,
    skippedIds: staleIds,
  };
}

/**
 * Delete many budget line items in one scoped operation.
 *
 * Authorization/scoping rules:
 * - The caller must already hold write access (enforced at the route).
 * - The budget must be editable (not APPROVED).
 * - Every id that EXISTS but belongs to a different budget is a hard scope
 *   violation and rejects the whole request (403) — we never delete cross-scope.
 * - Ids that simply do not exist (already deleted / stale) are treated as
 *   skipped, so a partial batch still succeeds idempotently.
 *
 * The delete is a single `deleteMany` scoped by `budgetId`, and the returned
 * `deletedCount` is the database-confirmed row count (never a faked success).
 */
export async function deleteLineItems(
  eventId: string,
  lineItemIds: unknown,
  actor?: BudgetAuditActor,
): Promise<BulkDeleteLineItemsResult> {
  const requestedIds = normalizeBulkDeleteIds(lineItemIds);

  const budget = await getBudgetWithRelationsOrThrow(eventId);
  assertBudgetEditable(budget);

  // Look up every requested id (across budgets) so we can distinguish a stale
  // id (not found anywhere) from a cross-scope id (found, wrong budget).
  const found = await getPrisma().budgetLineItem.findMany({
    where: { id: { in: requestedIds } },
    select: { id: true, budgetId: true },
  });

  const { ownedIds, foreignIds, staleIds } = classifyBulkDeleteIds(requestedIds, found, budget.id);
  if (foreignIds.length > 0) {
    throw new BudgetServiceError("Some line items do not belong to this budget", 403);
  }

  let deletedCount = 0;
  if (ownedIds.length > 0) {
    // Bulk delete + one summary audit entry commit atomically.
    deletedCount = await getPrisma().$transaction(async (tx) => {
      const result = await tx.budgetLineItem.deleteMany({
        where: { id: { in: ownedIds }, budgetId: budget.id },
      });
      if (result.count > 0) {
        await recordEventActivity(tx, {
          eventId,
          actor: budgetActor(actor),
          module: "BUDGET",
          action: "DELETED",
          entityType: "BudgetLineItem",
          entityLabel: `${result.count} line item${result.count === 1 ? "" : "s"}`,
          message: `Deleted ${result.count} budget line item${result.count === 1 ? "" : "s"} in bulk`,
        });
      }
      return result.count;
    });
  }

  return buildBulkDeleteResult(ownedIds, staleIds, deletedCount);
}

export type BudgetSubmissionSummary = {
  id: string;
  budgetId: string;
  budgetVersionId: string;
  status: BudgetSubmissionStatus;
  submittedAt: string;
  submittedByUser: UserMini;
  pulledBackAt: string | null;
  pulledBackByUser: UserMini | null;
  message: string | null;
  recipients: UserMini[];
  lineItems: BudgetLineItem[];
  lineItemIds?: string[];
};

function toBudgetSubmissionSummary(submission: BudgetSubmissionWithDetails): BudgetSubmissionSummary {
  return {
    id: submission.id,
    budgetId: submission.budgetId,
    budgetVersionId: submission.budgetVersionId,
    status: submission.status,
    submittedAt: submission.submittedAt.toISOString(),
    submittedByUser: submission.submittedByUser,
    pulledBackAt: submission.pulledBackAt ? submission.pulledBackAt.toISOString() : null,
    pulledBackByUser: submission.pulledBackByUser,
    message: submission.message,
    recipients: submission.recipients.map((recipient) => recipient.user),
    lineItems: submission.lineItems.map((lineItem) => lineItem.budgetLineItem),
    lineItemIds: submission.lineItems.map((lineItem) => lineItem.budgetLineItemId),
  };
}

async function dispatchBudgetSubmissionNotifications(input: {
  eventId: string;
  lineItemLabel: string;
  recipientUserIds: string[];
  actorUserId: string;
}) {
  const linkUrl = `/events/${encodeURIComponent(input.eventId)}/budget`;
  const body = `${input.lineItemLabel} was submitted for your approval.`;

  await Promise.all(
    input.recipientUserIds.map((userId) =>
      createNotification({
        userId,
        type: BUDGET_SUBMISSION_REQUESTED_NOTIFICATION_TYPE,
        title: "Budget item submitted for approval",
        body,
        linkUrl,
        actorUserId: input.actorUserId,
        eventId: input.eventId,
      }),
    ),
  );
}

export async function listBudgetSubmissions(eventId: string): Promise<BudgetSubmissionSummary[]> {
  const budget = await getBudgetWithRelationsOrThrow(eventId);

  const submissions = await getPrisma().budgetSubmission.findMany({
    where: { budgetId: budget.id },
    include: {
      submittedByUser: { select: USER_SELECT },
      pulledBackByUser: { select: USER_SELECT },
      recipients: {
        include: {
          user: { select: USER_SELECT },
        },
      },
      lineItems: {
        include: {
          budgetLineItem: true,
        },
      },
    },
    orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
  });

  return submissions.map((submission) => toBudgetSubmissionSummary(submission));
}

export async function createBudgetSubmission(
  eventId: string,
  input: {
    budgetLineItemId?: unknown;
    recipientUserIds?: unknown;
    message?: unknown;
    actorUserId?: unknown;
    debugRequestId?: unknown;
  },
): Promise<BudgetSubmissionSummary> {
  const workflows = await getEventApprovalWorkflows(eventId);
  if (workflows && !workflows.budgetApprovalsEnabled) {
    throw new BudgetServiceError("Budget approvals are disabled for this event", 409);
  }
  const debugContext: SubmissionDebugContext = {
    requestId:
      typeof input.debugRequestId === "string" && input.debugRequestId.trim().length > 0
        ? input.debugRequestId.trim()
        : `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    eventId,
  };

  debugSubmissionLog(debugContext, "createBudgetSubmission:start");
  debugSubmissionLog(debugContext, "createBudgetSubmission:getBudgetWithRelationsOrThrow:start");
  const budget = await getBudgetWithRelationsOrThrow(eventId, debugContext);
  debugSubmissionLog(debugContext, "createBudgetSubmission:getBudgetWithRelationsOrThrow:end", {
    budgetId: budget.id,
    budgetStatus: budget.status,
  });
  if (budget.status === BudgetStatus.APPROVED) {
    throw new BudgetServiceError("Approved budgets cannot be submitted again", 409);
  }

  debugSubmissionLog(debugContext, "createBudgetSubmission:resolveActorUserId:start");
  const actorUserId = await resolveActorUserId(
    typeof input.actorUserId === "string" ? input.actorUserId : null,
    debugContext,
  );
  debugSubmissionLog(debugContext, "createBudgetSubmission:resolveActorUserId:end", {
    actorUserId,
  });
  if (!actorUserId) {
    throw new BudgetServiceError("actorUserId is required", 400);
  }

  const budgetLineItemId = normalizeRequiredText(input.budgetLineItemId, "budgetLineItemId");
  const recipientUserIds = normalizeRecipientUserIds(input.recipientUserIds);
  const message = normalizeOptionalText(input.message);
  debugSubmissionLog(debugContext, "createBudgetSubmission:normalizedInput", {
    actorUserId,
    budgetLineItemId,
    recipientCount: recipientUserIds.length,
    hasMessage: Boolean(message),
  });

  // These three pre-transaction reads are independent (each depends only on
  // budgetLineItemId / budget.id / eventId), so run them concurrently. Validation
  // still happens below in the same order, so the first user-visible error is
  // unchanged.
  debugSubmissionLog(debugContext, "createBudgetSubmission:preReads:start", {
    budgetLineItemId,
    budgetId: budget.id,
  });
  const [budgetLineItem, activeSubmissionLineItem, eventMembers] = await Promise.all([
    getPrisma().budgetLineItem.findFirst({
      where: {
        id: budgetLineItemId,
        budgetId: budget.id,
      },
    }),
    getPrisma().budgetSubmissionLineItem.findFirst({
      where: {
        budgetLineItemId,
        submission: {
          status: {
            in: [
              BudgetSubmissionStatus.SUBMITTED,
              BudgetSubmissionStatus.APPROVED,
            ],
          },
        },
      },
      select: { submissionId: true },
    }),
    getPrisma().eventMember.findMany({
      where: { eventId },
      select: { userId: true },
    }),
  ]);
  debugSubmissionLog(debugContext, "createBudgetSubmission:preReads:end", {
    budgetLineItemFound: Boolean(budgetLineItem),
    activeSubmissionFound: Boolean(activeSubmissionLineItem),
    activeSubmissionId: activeSubmissionLineItem?.submissionId ?? null,
    eventMemberCount: eventMembers.length,
  });

  if (!budgetLineItem) {
    throw new BudgetServiceError("budgetLineItemId does not belong to this budget", 404);
  }
  if (budgetLineItem.approval === BudgetLineItemApproval.APPROVED) {
    throw new BudgetServiceError("Line item already submitted", 409);
  }
  if (activeSubmissionLineItem) {
    throw new BudgetServiceError("Line item already submitted", 409);
  }

  const allowedRecipientIds = new Set<string>(eventMembers.map((member) => member.userId));
  allowedRecipientIds.delete(actorUserId);
  if (shouldLogBudgetDebug()) {
    console.info("DEBUG RECIPIENTS submit:eligible", {
      eventId,
      actorUserId,
      allowedRecipientIds: Array.from(allowedRecipientIds.values()),
      requestedRecipientIds: recipientUserIds,
    });
  }
  const invalidRecipients = recipientUserIds.filter((recipientUserId) => !allowedRecipientIds.has(recipientUserId));
  if (invalidRecipients.length > 0) {
    debugSubmissionLog(debugContext, "createBudgetSubmission:recipientValidation:invalid", {
      invalidRecipients,
    });
    if (shouldLogBudgetDebug()) {
      console.warn("DEBUG RECIPIENTS submit:invalid", {
        eventId,
        actorUserId,
        invalidRecipients,
      });
    }
    throw new BudgetServiceError("One or more recipients are not valid for this event", 400);
  }
  debugSubmissionLog(debugContext, "createBudgetSubmission:recipientValidation:ok", {
    recipientCount: recipientUserIds.length,
  });

  debugSubmissionLog(debugContext, "createBudgetSubmission:notifications:queued", {
    recipientCount: recipientUserIds.length,
  });

  const now = new Date();
  debugSubmissionLog(debugContext, "createBudgetSubmission:transaction:start");
  const created = await getPrisma().$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1::int AS acquired FROM pg_advisory_xact_lock(hashtext(${`budget-line-submission:${budgetLineItemId}`}))`;
    const existingActiveSubmission = await tx.budgetSubmissionLineItem.findFirst({
      where: {
        budgetLineItemId,
        submission: { status: { in: [BudgetSubmissionStatus.SUBMITTED, BudgetSubmissionStatus.APPROVED] } },
      },
      select: { submissionId: true },
    });
    if (existingActiveSubmission) {
      throw new BudgetServiceError("Line item already submitted", 409);
    }
    debugSubmissionLog(debugContext, "createBudgetSubmission:tx.ensureCurrentBudgetVersion:start");
    const budgetVersionId = await ensureCurrentBudgetVersion(tx, budget, actorUserId, debugContext);
    debugSubmissionLog(debugContext, "createBudgetSubmission:tx.ensureCurrentBudgetVersion:end", {
      budgetVersionId,
    });

    debugSubmissionLog(debugContext, "createBudgetSubmission:tx.budgetSubmission.create:start");
    const submission = await tx.budgetSubmission.create({
      data: {
        budgetId: budget.id,
        budgetVersionId,
        submittedByUserId: actorUserId,
        status: BudgetSubmissionStatus.SUBMITTED,
        message,
        submittedAt: now,
      },
    });
    debugSubmissionLog(debugContext, "createBudgetSubmission:tx.budgetSubmission.create:end", {
      submissionId: submission.id,
    });

    debugSubmissionLog(debugContext, "createBudgetSubmission:tx.budgetSubmissionLineItem.create:start");
    await tx.budgetSubmissionLineItem.create({
      data: {
        submissionId: submission.id,
        budgetLineItemId,
      },
    });
    debugSubmissionLog(debugContext, "createBudgetSubmission:tx.budgetSubmissionLineItem.create:end");

    debugSubmissionLog(debugContext, "createBudgetSubmission:tx.budgetSubmissionRecipient.createMany:start", {
      recipientCount: recipientUserIds.length,
    });
    await tx.budgetSubmissionRecipient.createMany({
      data: recipientUserIds.map((recipientUserId) => ({
        submissionId: submission.id,
        userId: recipientUserId,
      })),
      skipDuplicates: true,
    });
    debugSubmissionLog(debugContext, "createBudgetSubmission:tx.budgetSubmissionRecipient.createMany:end");

    debugSubmissionLog(debugContext, "createBudgetSubmission:tx.budget.update:start");
    await tx.budget.update({
      where: { id: budget.id },
      data: {
        status: BudgetStatus.SUBMITTED,
        submittedAt: now,
        submittedByUserId: actorUserId,
        lockedAt: now,
      },
    });
    debugSubmissionLog(debugContext, "createBudgetSubmission:tx.budget.update:end");

    debugSubmissionLog(debugContext, "createBudgetSubmission:tx.budgetActivity.create:start");
    await tx.budgetActivity.create({
      data: {
        budgetId: budget.id,
        type: BudgetActivityType.SUBMITTED,
        actorUserId,
        note: `submissionId=${submission.id}`,
      },
    });
    await recordEventActivity(tx, {
      eventId,
      actor: { kind: "USER", userId: actorUserId },
      module: "BUDGET",
      action: "SUBMITTED",
      entityType: "BudgetSubmission",
      entityId: submission.id,
      entityLabel: "Budget submission",
      message: "Submitted budget for approval",
      // Action-specific source key so submit/pullback/decision on the same
      // submission stay distinct idempotent entries (they share the submission id).
      source: { type: "BudgetSubmission:submitted", id: submission.id },
    });
    debugSubmissionLog(debugContext, "createBudgetSubmission:tx.budgetActivity.create:end");

    debugSubmissionLog(debugContext, "createBudgetSubmission:tx.budgetSubmission.findUniqueOrThrow:start");
    const createdSubmission = await tx.budgetSubmission.findUniqueOrThrow({
      where: { id: submission.id },
      include: {
        submittedByUser: { select: USER_SELECT },
        pulledBackByUser: { select: USER_SELECT },
        recipients: {
          include: {
            user: { select: USER_SELECT },
          },
        },
        lineItems: {
          include: {
            budgetLineItem: true,
          },
        },
      },
    });
    debugSubmissionLog(debugContext, "createBudgetSubmission:tx.budgetSubmission.findUniqueOrThrow:end", {
      submissionId: createdSubmission.id,
    });
    return createdSubmission;
  });
  debugSubmissionLog(debugContext, "createBudgetSubmission:transaction:end", {
    submissionId: created.id,
  });

  debugSubmissionLog(debugContext, "createBudgetSubmission:end", {
    submissionId: created.id,
  });
  void dispatchBudgetSubmissionNotifications({
    eventId,
    lineItemLabel: budgetLineItem.lineItem,
    recipientUserIds,
    actorUserId,
  }).catch((error) => {
    console.warn("budget.submission.notifications.failed", {
      eventId,
      submissionId: created.id,
      recipientCount: recipientUserIds.length,
      message: error instanceof Error ? error.message : String(error),
    });
  });

  return toBudgetSubmissionSummary(created);
}

export async function pullBackBudgetSubmission(
  eventId: string,
  submissionId: string,
  actorUserIdInput?: string | null,
): Promise<BudgetSubmissionSummary> {
  const [budget, actorUserId] = await Promise.all([
    getBudgetWithRelationsOrThrow(eventId),
    resolveActorUserId(actorUserIdInput ?? null),
  ]);

  if (!actorUserId) {
    throw new BudgetServiceError("actorUserId is required", 400);
  }

  const submission = await getPrisma().budgetSubmission.findFirst({
    where: {
      id: submissionId,
      budgetId: budget.id,
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (!submission) {
    throw new BudgetServiceError("Submission not found", 404);
  }
  if (submission.status !== BudgetSubmissionStatus.SUBMITTED) {
    throw new BudgetServiceError("Only submitted submissions can be pulled back", 409);
  }

  const now = new Date();
  const updated = await getPrisma().$transaction(async (tx) => {
    const transitioned = await tx.budgetSubmission.updateMany({
      where: { id: submissionId, status: BudgetSubmissionStatus.SUBMITTED },
      data: {
        status: BudgetSubmissionStatus.PULLED_BACK,
        pulledBackAt: now,
        pulledBackByUserId: actorUserId,
      },
    });
    if (transitioned.count !== 1) {
      throw new BudgetServiceError("Only submitted submissions can be pulled back", 409);
    }

    await tx.budget.update({
      where: { id: budget.id },
      data: {
        status: BudgetStatus.DRAFT,
        lockedAt: null,
        submittedAt: null,
        submittedByUserId: null,
      },
    });

    await tx.budgetActivity.create({
      data: {
        budgetId: budget.id,
        type: BudgetActivityType.REVISED,
        actorUserId,
        note: `submissionId=${submissionId}`,
      },
    });
    await recordEventActivity(tx, {
      eventId,
      actor: { kind: "USER", userId: actorUserId },
      module: "BUDGET",
      action: "CANCELED",
      entityType: "BudgetSubmission",
      entityId: submissionId,
      entityLabel: "Budget submission",
      message: "Pulled back budget submission",
      source: { type: "BudgetSubmission:pullback", id: submissionId },
    });

    return tx.budgetSubmission.findUniqueOrThrow({
      where: { id: submissionId },
      include: {
        submittedByUser: { select: USER_SELECT },
        pulledBackByUser: { select: USER_SELECT },
        recipients: {
          include: {
            user: { select: USER_SELECT },
          },
        },
        lineItems: {
          include: {
            budgetLineItem: true,
          },
        },
      },
    });
  });

  return toBudgetSubmissionSummary(updated);
}

export async function decideBudgetSubmission(
  eventId: string,
  submissionId: string,
  status: "APPROVED" | "REJECTED",
  actorUserIdInput?: string | null,
): Promise<BudgetSubmissionSummary> {
  const [budget, actorUserId] = await Promise.all([
    getBudgetWithRelationsOrThrow(eventId),
    resolveActorUserId(actorUserIdInput ?? null),
  ]);

  if (!actorUserId) {
    throw new BudgetServiceError("actorUserId is required", 400);
  }

  const submission = await getPrisma().budgetSubmission.findFirst({
    where: {
      id: submissionId,
      budgetId: budget.id,
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (!submission) {
    throw new BudgetServiceError("Submission not found", 404);
  }
  if (submission.status !== BudgetSubmissionStatus.SUBMITTED) {
    throw new BudgetServiceError("Only submitted submissions can be updated", 409);
  }

  const now = new Date();
  const updated = await getPrisma().$transaction(async (tx) => {
    const transitioned = await tx.budgetSubmission.updateMany({
      where: { id: submissionId, status: BudgetSubmissionStatus.SUBMITTED },
      data: {
        status,
      },
    });
    if (transitioned.count !== 1) {
      throw new BudgetServiceError("Only submitted submissions can be updated", 409);
    }

    const submissionLineItems = await tx.budgetSubmissionLineItem.findMany({
      where: { submissionId },
      select: { budgetLineItemId: true },
    });
    await tx.budgetLineItem.updateMany({
      where: { id: { in: submissionLineItems.map((lineItem) => lineItem.budgetLineItemId) } },
      data: {
        approval: status === BudgetSubmissionStatus.APPROVED
          ? BudgetLineItemApproval.APPROVED
          : BudgetLineItemApproval.PENDING,
      },
    });

    await tx.budget.update({
      where: { id: budget.id },
      data: {
        status: status === BudgetSubmissionStatus.APPROVED ? BudgetStatus.APPROVED : BudgetStatus.REJECTED,
        approvedAt: status === BudgetSubmissionStatus.APPROVED ? now : null,
        approvedByUserId: status === BudgetSubmissionStatus.APPROVED ? actorUserId : null,
        rejectedAt: status === BudgetSubmissionStatus.REJECTED ? now : null,
        rejectedByUserId: status === BudgetSubmissionStatus.REJECTED ? actorUserId : null,
        lockedAt: now,
      },
    });

    await tx.budgetActivity.create({
      data: {
        budgetId: budget.id,
        type: status === BudgetSubmissionStatus.APPROVED ? BudgetActivityType.APPROVED : BudgetActivityType.REJECTED,
        actorUserId,
        note: `submissionId=${submissionId}`,
      },
    });
    await recordEventActivity(tx, {
      eventId,
      actor: { kind: "USER", userId: actorUserId },
      module: "BUDGET",
      action: status === BudgetSubmissionStatus.APPROVED ? "APPROVED" : "REJECTED",
      entityType: "BudgetSubmission",
      entityId: submissionId,
      entityLabel: "Budget submission",
      message: status === BudgetSubmissionStatus.APPROVED ? "Approved budget submission" : "Rejected budget submission",
      source: { type: "BudgetSubmission:decision", id: submissionId },
    });

    return tx.budgetSubmission.findUniqueOrThrow({
      where: { id: submissionId },
      include: {
        submittedByUser: { select: USER_SELECT },
        pulledBackByUser: { select: USER_SELECT },
        recipients: {
          include: {
            user: { select: USER_SELECT },
          },
        },
        lineItems: {
          include: {
            budgetLineItem: true,
          },
        },
      },
    });
  });

  return toBudgetSubmissionSummary(updated);
}

async function transitionBudget(
  eventId: string,
  options: {
    from: BudgetStatus[];
    to: BudgetStatus;
    actorUserId?: string | null;
    note?: string | null;
    reason?: string | null;
    activityType: BudgetActivityType;
  },
): Promise<BudgetWithMeta> {
  const budget = await getBudgetWithRelationsOrThrow(eventId);

  if (!options.from.includes(budget.status)) {
    throw new BudgetServiceError(`Invalid transition from ${budget.status} to ${options.to}`, 409);
  }

  const actorUserId = await resolveActorUserId(options.actorUserId);
  const now = new Date();

  const data: Prisma.BudgetUpdateInput = {
    status: options.to,
    updatedAt: now,
  };

  if (options.to === BudgetStatus.SUBMITTED) {
    data.submittedAt = now;
    data.submittedByUser = actorUserId ? { connect: { id: actorUserId } } : { disconnect: true };
    data.lockedAt = now;
    data.approvedAt = null;
    data.approvedByUser = { disconnect: true };
    data.rejectedAt = null;
    data.rejectedByUser = { disconnect: true };
    data.rejectionReason = null;
  }

  if (options.to === BudgetStatus.APPROVED) {
    data.approvedAt = now;
    data.approvedByUser = actorUserId ? { connect: { id: actorUserId } } : { disconnect: true };
    data.lockedAt = budget.lockedAt ?? now;
  }

  if (options.to === BudgetStatus.REJECTED) {
    data.rejectedAt = now;
    data.rejectedByUser = actorUserId ? { connect: { id: actorUserId } } : { disconnect: true };
    data.rejectionReason = options.reason ?? null;
    data.lockedAt = budget.lockedAt ?? now;
  }

  if (options.to === BudgetStatus.DRAFT) {
    data.lockedAt = null;
    data.submittedAt = null;
    data.submittedByUser = { disconnect: true };
    data.approvedAt = null;
    data.approvedByUser = { disconnect: true };
    data.rejectedAt = null;
    data.rejectedByUser = { disconnect: true };
    data.rejectionReason = null;
  }

  const nextBudget = await getPrisma().$transaction(async (tx) => {
    const updated = await tx.budget.update({
      where: { id: budget.id },
      data,
      include: {
        submittedByUser: { select: USER_SELECT },
        approvedByUser: { select: USER_SELECT },
        rejectedByUser: { select: USER_SELECT },
      },
    });

    await tx.budgetActivity.create({
      data: {
        budgetId: budget.id,
        type: options.activityType,
        actorUserId,
        note: options.note ?? options.reason ?? null,
      },
    });

    const approvalStatus =
      options.to === BudgetStatus.SUBMITTED
        ? BudgetApprovalStatus.SUBMITTED
        : options.to === BudgetStatus.APPROVED
          ? BudgetApprovalStatus.APPROVED
          : options.to === BudgetStatus.REJECTED
            ? BudgetApprovalStatus.REJECTED
            : null;

    if (approvalStatus && updated.currentVersionId && actorUserId) {
      await tx.budgetApproval.create({
        data: {
          budgetVersionId: updated.currentVersionId,
          status: approvalStatus,
          actedByUserId: actorUserId,
          actedAt: now,
          comment: options.note ?? options.reason ?? null,
        },
      });
    }

    return updated;
  });

  return nextBudget;
}

export async function submitBudget(
  eventId: string,
  input: {
    actorUserId?: unknown;
    selectedLineItemId?: unknown;
    recipientUserIds?: unknown;
    message?: unknown;
  },
): Promise<BudgetWithMeta> {
  await createBudgetSubmission(eventId, {
    budgetLineItemId: input.selectedLineItemId,
    recipientUserIds: input.recipientUserIds,
    message: input.message,
    actorUserId: input.actorUserId,
  });
  return getBudgetWithRelationsOrThrow(eventId);
}

export async function approveBudget(eventId: string, actorUserId?: string | null): Promise<BudgetWithMeta> {
  return transitionBudget(eventId, {
    from: [BudgetStatus.SUBMITTED],
    to: BudgetStatus.APPROVED,
    actorUserId,
    activityType: BudgetActivityType.APPROVED,
    note: "Budget approved",
  });
}

export async function rejectBudget(
  eventId: string,
  reason: unknown,
  actorUserId?: string | null,
): Promise<BudgetWithMeta> {
  const normalizedReason = normalizeRequiredText(reason, "reason");

  return transitionBudget(eventId, {
    from: [BudgetStatus.SUBMITTED],
    to: BudgetStatus.REJECTED,
    actorUserId,
    reason: normalizedReason,
    activityType: BudgetActivityType.REJECTED,
    note: normalizedReason,
  });
}

export async function reviseBudget(eventId: string, actorUserId?: string | null): Promise<BudgetWithMeta> {
  return transitionBudget(eventId, {
    from: [BudgetStatus.SUBMITTED, BudgetStatus.REJECTED],
    to: BudgetStatus.DRAFT,
    actorUserId,
    activityType: BudgetActivityType.REVISED,
    note: "Budget returned to draft for edits",
  });
}
