import { randomUUID } from "node:crypto";
import {
  MarketingCampaignStatus,
  EventDirectoryPersonStatus,
  EventDirectoryRoleType,
  EventDirectorySourceType,
  EventDirectoryModuleType,
  MarketingEmailEventType,
  MarketingEmailRecipientStatus,
  MarketingEmailSendStatus,
  MarketingSuppressionReason,
  MarketingSuppressionSource,
  Prisma,
  TaskStatus,
  UserRole,
  type EventActivityAction,
} from "@prisma/client";
import { assertEventAccessForUser, EventAccessError, type EventAccessType } from "@/lib/event-access";
import { getPrisma } from "@/lib/prisma";
import { recordEventActivity } from "@/src/server/services/event-activity";
import {
  getMarketingEmailProvider,
} from "@/src/server/email/sendgrid-provider";
import type { EmailProvider, MarketingBatchResult } from "@/src/server/email/provider";
import {
  assertMarketingUnsubscribeConfigured,
  buildMarketingUnsubscribeUrl,
  createMarketingUnsubscribeToken,
  MarketingUnsubscribeTokenError,
  verifyMarketingUnsubscribeToken,
} from "@/src/server/services/marketing-unsubscribe";
import { createTaskService } from "@/src/server/services/tasks";
import { createAssignmentNotifications } from "@/src/server/services/notifications";
import { buildDirectoryListWhere, expandDirectoryRoleFilter } from "@/src/server/services/event-directory";

/**
 * Email Marketing MVP service (Phase 2A backend).
 *
 * Owns only marketing-layer state (audiences, recipients, campaigns, sends, and
 * frozen send recipients). It never writes EventIntegrationMetric,
 * SpeakerEmailLog, Notification, or any other module's records. Email delivery
 * goes through the injectable EmailProvider abstraction, never SendGrid
 * directly. Scheduled dispatch is supported; webhook ingestion and KPI capture
 * are intentionally out of scope.
 */

export class MarketingServiceError extends Error {
  status: number;
  reason?: string;

  constructor(message: string, status = 400, reason?: string) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

export type MarketingServiceUser = {
  id: string;
  orgId: string | null;
  role: UserRole;
};

export type CreateAudienceInput = {
  name: unknown;
  sourceLabel?: unknown;
};

export type DirectoryAudienceSummaryFilter =
  | "all"
  | "contacts"
  | "attendees"
  | "speakers"
  | "sponsorsExhibitors"
  | "vipPress"
  | "needsReview";

export type CreateAudienceFromDirectoryInput = {
  name: unknown;
  selectionMode: unknown;
  personIds?: unknown;
  filters?: {
    search?: unknown;
    role?: unknown;
    sourceType?: unknown;
    status?: unknown;
    summaryFilter?: unknown;
  };
};

export type CreateAudienceFromDirectoryResult = {
  audience: {
    id: string;
    eventId: string;
    name: string;
    sourceLabel: string | null;
    recipientCount: number;
    createdAt: Date;
    updatedAt: Date;
  };
  selectionMode: "manual" | "filtered";
  selectedCount: number;
  imported: number;
  duplicates: number;
  skippedNoEmail: number;
  skippedRecipients: Array<{ personId: string; displayName: string; email: string | null; reason: string }>;
};

export type UpdateAudiencePatch = {
  name?: unknown;
  sourceLabel?: unknown;
};

export type AudienceRecipientImportRow = {
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  company?: unknown;
  title?: unknown;
  registrationType?: unknown;
  status?: unknown;
};

export type AudienceRecipientInput = AudienceRecipientImportRow;

export type ImportRecipientsResult = {
  audienceId: string;
  totalRows: number;
  imported: number;
  duplicates: number;
  invalid: Array<{ index: number; email: string | null; reason: string }>;
};

export type CreateCampaignInput = {
  name: unknown;
  description?: unknown;
  marketingPlanId?: unknown;
  audienceLabel?: unknown;
  ownerUserId?: unknown;
  startDate?: unknown;
  endDate?: unknown;
};

export type UpdateCampaignPatch = {
  name?: unknown;
  description?: unknown;
  status?: unknown;
  audienceLabel?: unknown;
  marketingPlanId?: unknown;
  startDate?: unknown;
  endDate?: unknown;
};

export type CreateEmailSendInput = {
  campaignId: unknown;
  audienceId?: unknown;
  subject: unknown;
  previewText?: unknown;
  bodyHtml?: unknown;
  bodyText?: unknown;
  fromEmail?: unknown;
  replyTo?: unknown;
  registrationUrl?: unknown;
  utmUrl?: unknown;
  ownerUserId?: unknown;
  scheduledSendAt?: unknown;
};

export type UpdateEmailSendPatch = {
  subject?: unknown;
  previewText?: unknown;
  bodyHtml?: unknown;
  bodyText?: unknown;
  fromEmail?: unknown;
  replyTo?: unknown;
  registrationUrl?: unknown;
  utmUrl?: unknown;
  audienceId?: unknown;
  ownerUserId?: unknown;
  scheduledSendAt?: unknown;
  // Only CANCELED is acceptable as a manual status change here.
  status?: unknown;
};

export type PreviewEmailInput = {
  audienceId?: unknown;
  recipientId?: unknown;
  subject?: unknown;
  previewText?: unknown;
  bodyHtml?: unknown;
  bodyText?: unknown;
};

export type ScheduleEmailSendInput = {
  scheduledSendAt: unknown;
};

export type RescheduleEmailSendInput = ScheduleEmailSendInput;

export type SubmitEmailSendForApprovalInput = {
  approverUserId: unknown;
};

export type EmailSendApprovalDecisionInput = {
  note?: unknown;
};

export type SendGridWebhookEventInput = {
  event?: unknown;
  email?: unknown;
  timestamp?: unknown;
  sg_event_id?: unknown;
  sg_message_id?: unknown;
  reason?: unknown;
  url?: unknown;
  eventId?: unknown;
  emailSendId?: unknown;
  emailSendRecipientId?: unknown;
};

export type SendGridWebhookIngestionResult = {
  received: number;
  processed: number;
  duplicates: number;
  ignored: number;
  unmatched: number;
};

type AccessCheck = (
  eventId: string,
  user: MarketingServiceUser,
  accessType: EventAccessType,
) => Promise<unknown>;

type MarketingPrisma = Prisma.TransactionClient;

type MarketingServiceDeps = {
  prisma: MarketingPrisma;
  assertEventAccess?: AccessCheck;
  now?: () => Date;
  provider?: EmailProvider;
  taskService?: Pick<
    ReturnType<typeof createTaskService>,
    "createManualTask" | "completeTask" | "blockTask" | "updateTask"
  >;
};

type MarketingDefaults = {
  fromEmail: string | null;
  replyTo: string | null;
  trackingConfigured: boolean;
};

type FrozenMarketingRecipient = {
  id: string;
  eventId: string;
  emailSendId: string;
  sourceAudienceRecipientId: string | null;
  email: string;
  normalizedEmail: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  title: string | null;
  registrationType: string | null;
  status?: string | null;
  providerStatus?: MarketingEmailRecipientStatus;
};

type FreezeAudienceRecipientsResult = {
  frozen: FrozenMarketingRecipient[];
  sendableCount: number;
  skippedSuppressedCount: number;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMBEDDED_EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

// Provider event statuses that mean the recipient was actually handed off.
const SENT_RECIPIENT_STATUS: MarketingEmailRecipientStatus = MarketingEmailRecipientStatus.SENT;
const FAILED_RECIPIENT_STATUS: MarketingEmailRecipientStatus = MarketingEmailRecipientStatus.FAILED;
const MARKETING_EMAIL_APPROVAL_MARKER = "marketing-email-approval:v1";
const ACTIVE_APPROVAL_TASK_STATUSES: TaskStatus[] = [TaskStatus.OPEN, TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED];

const SENDGRID_EVENT_TYPE_MAP: Record<string, MarketingEmailEventType | null> = {
  processed: MarketingEmailEventType.PROCESSED,
  delivered: MarketingEmailEventType.DELIVERED,
  open: MarketingEmailEventType.OPEN,
  click: MarketingEmailEventType.CLICK,
  bounce: MarketingEmailEventType.BOUNCE,
  dropped: MarketingEmailEventType.DROPPED,
  spamreport: MarketingEmailEventType.SPAMREPORT,
  unsubscribe: MarketingEmailEventType.UNSUBSCRIBE,
  group_unsubscribe: MarketingEmailEventType.GROUP_UNSUBSCRIBE,
  deferred: MarketingEmailEventType.DEFERRED,
  group_resubscribe: null,
};

const RECIPIENT_STATUS_RANK: Partial<Record<MarketingEmailRecipientStatus, number>> = {
  [MarketingEmailRecipientStatus.PENDING]: 0,
  [MarketingEmailRecipientStatus.SENT]: 1,
  [MarketingEmailRecipientStatus.DELIVERED]: 2,
  [MarketingEmailRecipientStatus.OPENED]: 3,
  [MarketingEmailRecipientStatus.CLICKED]: 4,
  [MarketingEmailRecipientStatus.FAILED]: 2,
  [MarketingEmailRecipientStatus.DROPPED]: 5,
  [MarketingEmailRecipientStatus.BOUNCED]: 5,
  [MarketingEmailRecipientStatus.SPAM_REPORTED]: 6,
  [MarketingEmailRecipientStatus.UNSUBSCRIBED]: 7,
  [MarketingEmailRecipientStatus.SUPPRESSED]: 7,
};

function asMarketingError(error: unknown, fallbackMessage: string): MarketingServiceError {
  if (error instanceof MarketingServiceError) return error;
  if (error instanceof MarketingUnsubscribeTokenError) {
    return new MarketingServiceError(error.message, error.status);
  }
  if (error instanceof EventAccessError) {
    return new MarketingServiceError(error.message, error.status, error.reason);
  }
  return new MarketingServiceError(fallbackMessage, 500);
}

function requireUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID_REGEX.test(value)) {
    throw new MarketingServiceError(`${field} must be a valid UUID`, 400);
  }
  return value;
}

function optionalUuid(value: unknown, field: string): string | null {
  if (typeof value === "undefined" || value === null || value === "") return null;
  return requireUuid(value, field);
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new MarketingServiceError(`${field} is required`, 400);
  }
  return value.trim();
}

function optionalText(value: unknown, field: string): string | null {
  if (typeof value === "undefined" || value === null) return null;
  if (typeof value !== "string") {
    throw new MarketingServiceError(`${field} must be a string`, 400);
  }
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function extractEmailAddress(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) return null;
  const match = normalized.match(EMBEDDED_EMAIL_REGEX);
  return match ? match[0] : null;
}

function normalizeReplyTo(value: unknown, field = "replyTo"): string | null {
  const normalized = optionalText(value, field);
  if (!normalized) return null;
  const email = extractEmailAddress(normalized);
  if (!email || !EMAIL_REGEX.test(email)) {
    throw new MarketingServiceError("Reply-to must be a valid email address.", 400);
  }
  return email;
}

function readDefaultReplyTo(): string | null {
  const configured = process.env.EMAIL_REPLY_TO;
  if (!configured?.trim()) return null;
  return normalizeReplyTo(configured, "replyTo");
}

function marketingEmailApprovalMarker(sendId: string): string {
  return `${MARKETING_EMAIL_APPROVAL_MARKER} emailSendId=${sendId}`;
}

function marketingEmailApprovalDescription(input: {
  eventId: string;
  campaignId: string;
  emailSendId: string;
  requesterUserId: string;
}): string {
  const approvalUrl = `/events/${input.eventId}/marketing?emailSendId=${input.emailSendId}`;
  return [
    marketingEmailApprovalMarker(input.emailSendId),
    `campaignId=${input.campaignId}`,
    `requesterUserId=${input.requesterUserId}`,
    `approvalUrl=${approvalUrl}`,
    "",
    "Review this marketing email, edit it if needed, then approve it before it is sent or scheduled.",
  ].join("\n");
}

function parseMarketingApprovalRequester(description: string | null): string | null {
  const match = description?.match(/requesterUserId=([0-9a-f-]{36})/i);
  return match?.[1] ?? null;
}

function optionalDate(value: unknown, field: string): Date | null {
  if (typeof value === "undefined" || value === null || value === "") return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new MarketingServiceError(`${field} must be a valid date`, 400);
  }
  return date;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isSendGridWebhookConfigured(): boolean {
  return Boolean(
    process.env.SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY?.trim() ||
      process.env.SENDGRID_WEBHOOK_PUBLIC_KEY?.trim() ||
      process.env.SENDGRID_WEBHOOK_SECRET?.trim(),
  );
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isPrismaUniqueViolation(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2002";
  }
  // Test fakes throw a plain object carrying the same code.
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

function parseSendGridOccurredAt(value: unknown, fallback: Date): Date {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value * 1000);
  }
  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    const date = Number.isFinite(numeric) ? new Date(numeric * 1000) : new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return fallback;
}

function safeUuid(value: unknown): string | null {
  return typeof value === "string" && UUID_REGEX.test(value) ? value : null;
}

function sendGridSgEventId(
  event: SendGridWebhookEventInput,
  type: MarketingEmailEventType,
  occurredAt: Date,
): string {
  const explicit = optionalString(event.sg_event_id);
  if (explicit) return explicit;
  return [
    optionalString(event.sg_message_id) ?? "no-message",
    safeUuid(event.emailSendRecipientId) ?? "no-recipient",
    type,
    occurredAt.toISOString(),
    optionalString(event.url) ?? "",
    optionalString(event.reason) ?? "",
  ].join(":");
}

function nextRecipientStatus(
  currentStatus: MarketingEmailRecipientStatus | null | undefined,
  nextStatus: MarketingEmailRecipientStatus,
): MarketingEmailRecipientStatus {
  const current = currentStatus ?? MarketingEmailRecipientStatus.PENDING;
  return (RECIPIENT_STATUS_RANK[nextStatus] ?? 0) >= (RECIPIENT_STATUS_RANK[current] ?? 0) ? nextStatus : current;
}

type EventScope = { eventId: string; orgId: string };

function marketingAssignmentNotification(input: {
  userId: string;
  eventId: string;
  orgId: string;
  actorUserId: string;
  title: string;
  body: string;
  linkUrl: string;
}) {
  return {
    ...input,
    type: "MARKETING_OWNER_ASSIGNED",
  };
}

async function getEventScope(prisma: MarketingPrisma, eventId: string): Promise<EventScope> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, orgId: true },
  });
  if (!event) {
    throw new MarketingServiceError("Event not found", 404);
  }
  return { eventId: event.id, orgId: event.orgId };
}

function normalizeRecipientInput(input: AudienceRecipientInput) {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new MarketingServiceError("recipient must be an object", 400);
  }
  const rawEmail = typeof input.email === "string" ? input.email.trim() : "";
  if (!rawEmail) {
    throw new MarketingServiceError("email is required", 400);
  }
  if (!EMAIL_REGEX.test(rawEmail)) {
    throw new MarketingServiceError("email is not a valid address", 400);
  }
  return {
    email: rawEmail,
    normalizedEmail: normalizeEmail(rawEmail),
    firstName: optionalText(input.firstName, "firstName"),
    lastName: optionalText(input.lastName, "lastName"),
    company: optionalText(input.company, "company"),
    title: optionalText(input.title, "title"),
    registrationType: optionalText(input.registrationType, "registrationType"),
    status: optionalText(input.status, "status"),
  };
}

const DIRECTORY_AUDIENCE_SOURCE_LABEL = "Event Directory";

const DIRECTORY_SUMMARY_FILTERS = new Set<DirectoryAudienceSummaryFilter>([
  "all",
  "contacts",
  "attendees",
  "speakers",
  "sponsorsExhibitors",
  "vipPress",
  "needsReview",
]);

function normalizeDirectoryAudienceSelectionMode(value: unknown): "manual" | "filtered" {
  if (value === "manual" || value === "selected") return "manual";
  if (value === "filtered" || value === "allMatching") return "filtered";
  throw new MarketingServiceError("selectionMode must be manual or filtered", 400);
}

function normalizeDirectoryAudiencePersonIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new MarketingServiceError("personIds must be an array", 400);
  }
  const seen = new Set<string>();
  for (const item of value) {
    seen.add(requireUuid(item, "personId"));
  }
  if (seen.size === 0) {
    throw new MarketingServiceError("Choose at least one directory person", 400);
  }
  return [...seen];
}

function optionalDirectoryRole(value: unknown): EventDirectoryRoleType | null {
  if (typeof value === "undefined" || value === null || value === "") return null;
  if (typeof value !== "string" || !Object.values(EventDirectoryRoleType).includes(value as EventDirectoryRoleType)) {
    throw new MarketingServiceError("role must be a valid directory role", 400);
  }
  return value as EventDirectoryRoleType;
}

function optionalDirectorySourceType(value: unknown): EventDirectorySourceType | null {
  if (typeof value === "undefined" || value === null || value === "") return null;
  if (typeof value !== "string" || !Object.values(EventDirectorySourceType).includes(value as EventDirectorySourceType)) {
    throw new MarketingServiceError("sourceType must be a valid directory source", 400);
  }
  return value as EventDirectorySourceType;
}

function optionalDirectoryStatus(value: unknown): EventDirectoryPersonStatus | null {
  if (typeof value === "undefined" || value === null || value === "") return null;
  if (typeof value !== "string" || !Object.values(EventDirectoryPersonStatus).includes(value as EventDirectoryPersonStatus)) {
    throw new MarketingServiceError("status must be a valid directory status", 400);
  }
  return value as EventDirectoryPersonStatus;
}

function optionalDirectorySummaryFilter(value: unknown): DirectoryAudienceSummaryFilter {
  if (typeof value === "undefined" || value === null || value === "") return "all";
  if (typeof value !== "string" || !DIRECTORY_SUMMARY_FILTERS.has(value as DirectoryAudienceSummaryFilter)) {
    throw new MarketingServiceError("summaryFilter must be a valid directory summary filter", 400);
  }
  return value as DirectoryAudienceSummaryFilter;
}

function buildDirectoryAudienceSummaryWhere(
  summaryFilter: DirectoryAudienceSummaryFilter,
): Prisma.EventDirectoryPersonWhereInput | null {
  switch (summaryFilter) {
    case "contacts":
      return { roles: { some: { role: { in: expandDirectoryRoleFilter("PROSPECT") } } } };
    case "attendees":
      return { roles: { some: { role: { in: expandDirectoryRoleFilter("ATTENDEE") } } } };
    case "speakers":
      return { roles: { some: { role: "SPEAKER" } } };
    case "sponsorsExhibitors":
      return { roles: { some: { role: { in: ["SPONSOR_CONTACT", "EXHIBITOR_CONTACT"] } } } };
    case "vipPress":
      return { roles: { some: { role: { in: ["VIP", "PRESS"] } } } };
    case "needsReview":
      return { status: { in: ["NEEDS_REVIEW", "DUPLICATE_REVIEW"] } };
    case "all":
    default:
      return null;
  }
}

function buildDirectoryAudienceWhere(
  eventId: string,
  filters: NonNullable<CreateAudienceFromDirectoryInput["filters"]> | undefined,
): Prisma.EventDirectoryPersonWhereInput {
  const summaryFilter = optionalDirectorySummaryFilter(filters?.summaryFilter);
  const baseWhere = buildDirectoryListWhere(eventId, {
    search: optionalText(filters?.search, "search"),
    role: optionalDirectoryRole(filters?.role),
    sourceType: optionalDirectorySourceType(filters?.sourceType),
    status: optionalDirectoryStatus(filters?.status),
  });
  const summaryWhere = buildDirectoryAudienceSummaryWhere(summaryFilter);
  const activeWhere: Prisma.EventDirectoryPersonWhereInput = { status: { notIn: ["MERGED", "REMOVED"] } };
  return summaryWhere ? { AND: [baseWhere, summaryWhere, activeWhere] } : { AND: [baseWhere, activeWhere] };
}

function directoryPersonToRecipientInput(person: {
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  title: string | null;
  status: EventDirectoryPersonStatus;
  roles: Array<{ role: EventDirectoryRoleType }>;
}) {
  const email = person.email?.trim() ?? "";
  if (!email || !EMAIL_REGEX.test(email)) return null;
  return {
    email,
    normalizedEmail: normalizeEmail(email),
    firstName: person.firstName,
    lastName: person.lastName,
    company: person.company,
    title: person.title,
    registrationType: person.roles.map((role) => role.role).join(", ") || null,
    status: person.status,
  };
}

const MERGE_TOKEN_REGEX = /\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g;

type MergeRecipient = {
  firstName: string | null;
  lastName: string | null;
  email: string;
  company: string | null;
  title: string | null;
  registrationType: string | null;
  status?: string | null;
};

type MergeEvent = {
  name: string;
  startDate: Date | string | null;
  endDate: Date | string | null;
};

function formatMergeDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function renderMergeFields(
  template: string | null | undefined,
  recipient: MergeRecipient,
  event: MergeEvent,
): string | null {
  if (template === null || typeof template === "undefined") return null;
  const values: Record<string, string | null | undefined> = {
    firstName: recipient.firstName,
    lastName: recipient.lastName,
    email: recipient.email,
    company: recipient.company,
    title: recipient.title,
    registrationType: recipient.registrationType,
    status: recipient.status,
    eventName: event.name,
    eventStartDate: formatMergeDate(event.startDate),
    eventEndDate: formatMergeDate(event.endDate),
  };
  return template.replace(MERGE_TOKEN_REGEX, (_match, key: string) => values[key] ?? "");
}

function renderEmailPreview(input: {
  subject?: string | null;
  previewText?: string | null;
  bodyHtml?: string | null;
  bodyText?: string | null;
  recipient: MergeRecipient;
  event: MergeEvent;
}) {
  const rendered = {
    subject: renderMergeFields(input.subject ?? "", input.recipient, input.event) ?? "",
    previewText: renderMergeFields(input.previewText ?? "", input.recipient, input.event) ?? "",
    bodyHtml: renderMergeFields(input.bodyHtml, input.recipient, input.event),
    bodyText: renderMergeFields(input.bodyText, input.recipient, input.event),
  };
  return {
    ...rendered,
    ...appendMarketingUnsubscribeFooter(rendered, "https://example.com/marketing/unsubscribe/preview"),
  };
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function appendMarketingUnsubscribeFooter(
  body: { bodyHtml?: string | null; bodyText?: string | null },
  unsubscribeUrl: string,
): { bodyHtml: string | null; bodyText: string | null } {
  const href = escapeHtmlAttribute(unsubscribeUrl);
  return {
    bodyHtml: body.bodyHtml
      ? [
          body.bodyHtml,
          `<p style="margin-top:24px;font-size:12px;line-height:18px;color:#64748b;">You are receiving this email because you are on this event's marketing list. <a href="${href}">Unsubscribe from this event's marketing emails</a>.</p>`,
        ].join("\n")
      : null,
    bodyText: body.bodyText
      ? [
          body.bodyText,
          "",
          "You are receiving this email because you are on this event's marketing list.",
          `Unsubscribe from this event's marketing emails: ${unsubscribeUrl}`,
        ].join("\n")
      : null,
  };
}

export function createMarketingService(deps: MarketingServiceDeps) {
  const prisma = deps.prisma;
  const checkAccess = deps.assertEventAccess ?? assertEventAccessForUser;
  const now = deps.now ?? (() => new Date());

  /**
   * Record a planner-facing Marketing lifecycle action into the canonical feed.
   * Never records recipient-level telemetry (opens/clicks/bounces/webhooks) or
   * email bodies — only the planner action and campaign/send lifecycle event.
   */
  async function recordMarketingActivity(args: {
    eventId: string;
    userId: string;
    action: EventActivityAction;
    entityType: string;
    entityId: string;
    entityLabel: string;
    message: string;
    source?: { type: string; id: string };
  }): Promise<void> {
    await recordEventActivity(prisma, {
      eventId: args.eventId,
      actor: { kind: "USER", userId: args.userId },
      module: "MARKETING",
      action: args.action,
      entityType: args.entityType,
      entityId: args.entityId,
      entityLabel: args.entityLabel,
      message: args.message,
      source: args.source,
    });
  }
  const resolveProvider = () => deps.provider ?? getMarketingEmailProvider();
  const taskService =
    deps.taskService ??
    createTaskService({
      prisma,
      assertEventAccess: checkAccess,
      now,
    });

  async function assertAccess(
    eventId: string,
    user: MarketingServiceUser,
    accessType: EventAccessType,
  ): Promise<void> {
    await checkAccess(eventId, user, accessType);
  }

  async function getSendOrThrow(sendIdInput: string) {
    const sendId = requireUuid(sendIdInput, "sendId");
    const send = await prisma.marketingEmailSend.findUnique({ where: { id: sendId } });
    if (!send) {
      throw new MarketingServiceError("Email send not found", 404);
    }
    return send;
  }

  type MarketingEmailApprovalTask = Prisma.TaskGetPayload<{
    include: { assignments: true };
  }>;

  async function listMarketingApprovalTasks(sendId: string, eventId: string): Promise<MarketingEmailApprovalTask[]> {
    const taskClient = (prisma as unknown as {
      task?: { findMany: typeof prisma.task.findMany };
    }).task;
    if (!taskClient) return [];
    return await taskClient.findMany({
      where: {
        eventId,
        description: { contains: marketingEmailApprovalMarker(sendId) },
      },
      include: { assignments: true },
      orderBy: { createdAt: "desc" },
    });
  }

  function approvalStateFromTask(task: MarketingEmailApprovalTask | null) {
    if (!task) return null;
    const state =
      task.status === TaskStatus.DONE
        ? "APPROVED"
        : task.status === TaskStatus.BLOCKED
          ? "CHANGES_REQUESTED"
          : task.status === TaskStatus.CANCELED
            ? "REJECTED"
            : "PENDING";
    return {
      state,
      taskId: task.id,
      assigneeUserIds: task.assignments.map((assignment) => assignment.userId),
      requesterUserId: parseMarketingApprovalRequester(task.description),
      decidedByUserId: task.completedByUserId ?? task.canceledByUserId ?? null,
      decidedAt: task.completedAt ?? task.canceledAt ?? null,
      updatedAt: task.updatedAt,
    };
  }

  async function getMarketingApprovalState(sendId: string, eventId: string) {
    const tasks = await listMarketingApprovalTasks(sendId, eventId);
    const active = tasks.find((task) => ACTIVE_APPROVAL_TASK_STATUSES.includes(task.status));
    return approvalStateFromTask(active ?? tasks[0] ?? null);
  }

  async function withApprovalState<T extends { id: string; eventId: string }>(send: T): Promise<T & { approval: ReturnType<typeof approvalStateFromTask> }> {
    return {
      ...send,
      approval: await getMarketingApprovalState(send.id, send.eventId),
    };
  }

  async function requireNoActiveApproval(send: { id: string; eventId: string }) {
    const approval = await getMarketingApprovalState(send.id, send.eventId);
    if (approval && (approval.state === "PENDING" || approval.state === "CHANGES_REQUESTED")) {
      throw new MarketingServiceError("Email send is pending approval and cannot be sent or scheduled yet.", 409);
    }
  }

  async function getActiveApprovalTaskOrThrow(send: { id: string; eventId: string }): Promise<MarketingEmailApprovalTask> {
    const tasks = await listMarketingApprovalTasks(send.id, send.eventId);
    const active = tasks.find((task) => ACTIVE_APPROVAL_TASK_STATUSES.includes(task.status));
    if (!active) {
      throw new MarketingServiceError("No active approval task found for this email send", 404);
    }
    return active;
  }

  function assertAssignedApprover(task: MarketingEmailApprovalTask, user: MarketingServiceUser) {
    if (!task.assignments.some((assignment) => assignment.userId === user.id)) {
      throw new MarketingServiceError("Only the assigned approver can decide this email approval.", 403);
    }
  }

  async function getFrozenRecipients(sendId: string): Promise<FrozenMarketingRecipient[]> {
    return (await prisma.marketingEmailSendRecipient.findMany({
      where: { emailSendId: sendId },
      orderBy: { createdAt: "asc" },
    })) as FrozenMarketingRecipient[];
  }

  async function freezeAudienceRecipientsForSend(
    send: Awaited<ReturnType<typeof getSendOrThrow>>,
  ): Promise<FreezeAudienceRecipientsResult> {
    if (!send.audienceId) {
      throw new MarketingServiceError("Email send has no audience selected", 400);
    }

    const audienceRecipients = await prisma.marketingAudienceRecipient.findMany({
      where: { audienceId: send.audienceId },
      orderBy: { createdAt: "asc" },
    });

    const suppressions = await prisma.marketingSuppression.findMany({
      where: { eventId: send.eventId },
      select: { normalizedEmail: true },
    });
    const suppressed = new Set(suppressions.map((row) => row.normalizedEmail));
    const eligible = audienceRecipients.filter((recipient) => !suppressed.has(recipient.normalizedEmail));
    const skippedSuppressed = audienceRecipients.filter((recipient) => suppressed.has(recipient.normalizedEmail));

    if (eligible.length === 0) {
      throw new MarketingServiceError("No eligible recipients to send to", 400);
    }

    const frozen: FrozenMarketingRecipient[] = [
      ...eligible.map((recipient) => ({
        id: randomUUID(),
        eventId: send.eventId,
        emailSendId: send.id,
        sourceAudienceRecipientId: recipient.id,
        email: recipient.email,
        normalizedEmail: recipient.normalizedEmail,
        firstName: recipient.firstName,
        lastName: recipient.lastName,
        company: recipient.company,
        title: recipient.title,
        registrationType: recipient.registrationType,
        status: recipient.status,
        providerStatus: MarketingEmailRecipientStatus.PENDING,
      })),
      ...skippedSuppressed.map((recipient) => ({
        id: randomUUID(),
        eventId: send.eventId,
        emailSendId: send.id,
        sourceAudienceRecipientId: recipient.id,
        email: recipient.email,
        normalizedEmail: recipient.normalizedEmail,
        firstName: recipient.firstName,
        lastName: recipient.lastName,
        company: recipient.company,
        title: recipient.title,
        registrationType: recipient.registrationType,
        status: recipient.status,
        providerStatus: MarketingEmailRecipientStatus.SUPPRESSED,
      })),
    ];

    await prisma.marketingEmailSendRecipient.createMany({
      data: frozen.map(({ status, providerStatus, ...row }) => {
        void status;
        return { ...row, providerStatus: providerStatus ?? MarketingEmailRecipientStatus.PENDING };
      }),
    });

    return {
      frozen,
      sendableCount: eligible.length,
      skippedSuppressedCount: skippedSuppressed.length,
    };
  }

  async function currentSuppressionSet(eventId: string): Promise<Set<string>> {
    const suppressions = await prisma.marketingSuppression.findMany({
      where: { eventId },
      select: { normalizedEmail: true },
    });
    return new Set(suppressions.map((row) => row.normalizedEmail));
  }

  async function markSuppressedFrozenRecipients(
    frozen: FrozenMarketingRecipient[],
  ): Promise<{ sendable: FrozenMarketingRecipient[]; skippedSuppressedCount: number }> {
    const suppressed = await currentSuppressionSet(frozen[0]?.eventId ?? "");
    const sendable: FrozenMarketingRecipient[] = [];
    let skippedSuppressedCount = 0;

    for (const row of frozen) {
      const isSuppressed =
        row.providerStatus === MarketingEmailRecipientStatus.SUPPRESSED ||
        suppressed.has(row.normalizedEmail);
      if (!isSuppressed) {
        sendable.push(row);
        continue;
      }
      skippedSuppressedCount += 1;
      if (row.providerStatus !== MarketingEmailRecipientStatus.SUPPRESSED) {
        await prisma.marketingEmailSendRecipient.update({
          where: { id: row.id },
          data: { providerStatus: MarketingEmailRecipientStatus.SUPPRESSED },
        });
      }
    }

    return { sendable, skippedSuppressedCount };
  }

  function unsubscribeUrlForRecipient(
    send: Awaited<ReturnType<typeof getSendOrThrow>>,
    row: FrozenMarketingRecipient,
  ): string {
    const token = createMarketingUnsubscribeToken({
      v: 1,
      eventId: send.eventId,
      emailSendId: send.id,
      emailSendRecipientId: row.id,
      email: row.email,
    });
    return buildMarketingUnsubscribeUrl(token);
  }

  function renderSendContentForRecipient(
    send: Awaited<ReturnType<typeof getSendOrThrow>>,
    row: FrozenMarketingRecipient,
    event: MergeEvent,
  ) {
    const rendered = {
      subject: renderMergeFields(send.subject, row, event) ?? "",
      bodyHtml: renderMergeFields(send.bodyHtml, row, event),
      bodyText: renderMergeFields(send.bodyText, row, event),
    };
    const unsubscribeUrl = unsubscribeUrlForRecipient(send, row);
    return {
      ...rendered,
      ...appendMarketingUnsubscribeFooter(rendered, unsubscribeUrl),
    };
  }

  function assertMarketingSendComplianceReady(send: Awaited<ReturnType<typeof getSendOrThrow>>) {
    assertMarketingUnsubscribeConfigured();
    if (!send.bodyHtml && !send.bodyText) {
      throw new MarketingServiceError("Email send content is required for unsubscribe footer enforcement.", 400);
    }
  }

  async function dispatchFrozenEmailSend(
    send: Awaited<ReturnType<typeof getSendOrThrow>>,
    frozen: FrozenMarketingRecipient[],
  ) {
    if (frozen.length === 0) {
      const updatedSend = await prisma.marketingEmailSend.update({
        where: { id: send.id },
        data: {
          status: MarketingEmailSendStatus.FAILED,
          recipientCount: 0,
          actualSentAt: null,
          failureReason: "No frozen recipients available to send.",
        },
      });
      return {
        send: updatedSend,
        summary: {
          recipientCount: 0,
          sentCount: 0,
          failedCount: 0,
          skippedSuppressedCount: 0,
          status: updatedSend.status,
        },
      };
    }

    const { sendable, skippedSuppressedCount } = await markSuppressedFrozenRecipients(frozen);

    const event = await prisma.event.findUnique({
      where: { id: send.eventId },
      select: { name: true, startDate: true, endDate: true },
    });
    if (!event) {
      throw new MarketingServiceError("Event not found", 404);
    }

    const provider = resolveProvider();
    let batchResult: MarketingBatchResult;
    if (sendable.length === 0) {
      const updatedSend = await prisma.marketingEmailSend.update({
        where: { id: send.id },
        data: {
          status: MarketingEmailSendStatus.FAILED,
          recipientCount: 0,
          actualSentAt: null,
          failureReason: "No eligible recipients to send to.",
        },
      });
      return {
        send: updatedSend,
        summary: {
          recipientCount: 0,
          sentCount: 0,
          failedCount: 0,
          skippedSuppressedCount,
          status: updatedSend.status,
        },
      };
    }

    if (typeof provider.sendMarketingBatch === "function") {
      const results: MarketingBatchResult["results"] = [];
      let sentCount = 0;
      let failedCount = 0;
      let skippedCount = 0;
      const batchIds: string[] = [];
      for (const row of sendable) {
        const content = renderSendContentForRecipient(send, row, event);
        const result = await provider.sendMarketingBatch({
          eventId: send.eventId,
          emailSendId: send.id,
          subject: content.subject,
          fromEmail: send.fromEmail,
          replyTo: normalizeReplyTo(send.replyTo),
          html: content.bodyHtml,
          text: content.bodyText,
          recipients: [{ emailSendRecipientId: row.id, to: row.email }],
        });
        if (result.batchId) batchIds.push(result.batchId);
        sentCount += result.sentCount;
        failedCount += result.failedCount;
        skippedCount += result.skippedCount;
        results.push(...result.results);
      }
      batchResult = {
        batchId: batchIds.length > 0 ? batchIds.join(",") : undefined,
        sentCount,
        failedCount,
        skippedCount,
        results,
      };
    } else {
      batchResult = {
        sentCount: 0,
        failedCount: 0,
        skippedCount: sendable.length,
        results: sendable.map((row) => ({
          emailSendRecipientId: row.id,
          status: "SKIPPED_NO_PROVIDER" as const,
          detail: "No email provider configured; send recorded but not delivered",
        })),
      };
    }

    const sentAt = now();
    let sentCount = 0;
    let firstFailureReason: string | null = null;
    for (const result of batchResult.results) {
      const delivered = result.status === "SENT";
      if (delivered) sentCount += 1;
      if (!delivered && !firstFailureReason) firstFailureReason = result.detail ?? result.status;
      await prisma.marketingEmailSendRecipient.update({
        where: { id: result.emailSendRecipientId },
        data: {
          providerStatus: delivered ? SENT_RECIPIENT_STATUS : FAILED_RECIPIENT_STATUS,
          sendgridMessageId: result.providerMessageId ?? null,
          processedAt: sentAt,
        },
      });
    }

    const status =
      sentCount === 0
        ? MarketingEmailSendStatus.FAILED
        : sentCount === sendable.length
          ? MarketingEmailSendStatus.SENT
          : MarketingEmailSendStatus.PARTIALLY_SENT;

    const updatedSend = await prisma.marketingEmailSend.update({
      where: { id: send.id },
      data: {
        status,
        recipientCount: sendable.length,
        sendgridBatchId: batchResult.batchId ?? null,
        actualSentAt: sentCount > 0 ? sentAt : null,
        failureReason: status === MarketingEmailSendStatus.FAILED ? firstFailureReason ?? "Provider did not accept any recipients." : null,
      },
    });

    return {
      send: updatedSend,
      summary: {
        recipientCount: sendable.length,
        sentCount,
        failedCount: sendable.length - sentCount,
        skippedSuppressedCount,
        status,
      },
    };
  }

  async function claimSendForDispatch(
    sendId: string,
    allowedStatuses: MarketingEmailSendStatus[],
  ) {
    const attemptedAt = now();
    const claimed = await prisma.marketingEmailSend.updateMany({
      where: { id: sendId, status: { in: allowedStatuses } },
      data: {
        status: MarketingEmailSendStatus.SENDING,
        sendAttemptCount: { increment: 1 },
        lastAttemptedAt: attemptedAt,
        failureReason: null,
      },
    });
    if (claimed.count !== 1) {
      throw new MarketingServiceError("Email send is not in a sendable state", 409);
    }
    return await getSendOrThrow(sendId);
  }

  async function findRecipientForSendGridEvent(input: SendGridWebhookEventInput) {
    const expectedEventId = safeUuid(input.eventId);
    const expectedSendId = safeUuid(input.emailSendId);
    const recipientId = safeUuid(input.emailSendRecipientId);
    const normalizedEmail = optionalString(input.email) ? normalizeEmail(String(input.email)) : null;

    const matchesScope = (recipient: {
      eventId: string;
      emailSendId: string;
      normalizedEmail: string;
    } | null) => {
      if (!recipient) return false;
      if (expectedEventId && recipient.eventId !== expectedEventId) return false;
      if (expectedSendId && recipient.emailSendId !== expectedSendId) return false;
      if (normalizedEmail && recipient.normalizedEmail !== normalizedEmail) return false;
      return true;
    };

    if (recipientId) {
      const recipient = await prisma.marketingEmailSendRecipient.findUnique({ where: { id: recipientId } });
      return matchesScope(recipient) ? recipient : null;
    }

    if (expectedSendId && normalizedEmail) {
      const recipient = await prisma.marketingEmailSendRecipient.findFirst({
        where: { emailSendId: expectedSendId, normalizedEmail },
      });
      return matchesScope(recipient) ? recipient : null;
    }

    const sgMessageId = optionalString(input.sg_message_id);
    if (sgMessageId) {
      const candidates = await prisma.marketingEmailSendRecipient.findMany({
        where: { sendgridMessageId: sgMessageId },
      });
      const scoped = candidates.filter(matchesScope);
      return scoped.length === 1 ? scoped[0] : null;
    }

    return null;
  }

  async function upsertMarketingSuppression(
    input: {
      eventId: string;
      email: string;
      normalizedEmail: string;
      reason: MarketingSuppressionReason;
      source: MarketingSuppressionSource;
    },
  ) {
    return await prisma.marketingSuppression.upsert({
      where: {
        eventId_normalizedEmail: {
          eventId: input.eventId,
          normalizedEmail: input.normalizedEmail,
        },
      },
      update: { email: input.email, reason: input.reason, source: input.source },
      create: input,
    });
  }

  async function upsertSuppressionForWebhookEvent(
    recipient: { eventId: string; normalizedEmail: string; email: string },
    reason: MarketingSuppressionReason,
  ) {
    await upsertMarketingSuppression({
      eventId: recipient.eventId,
      email: recipient.email,
      normalizedEmail: recipient.normalizedEmail,
      reason,
      source: MarketingSuppressionSource.SENDGRID_WEBHOOK,
    });
  }

  async function applySendGridEventMilestone(
    recipient: {
      id: string;
      eventId: string;
      emailSendId: string;
      email: string;
      normalizedEmail: string;
      providerStatus: MarketingEmailRecipientStatus | null;
      processedAt: Date | null;
      deliveredAt: Date | null;
      openedAt: Date | null;
      clickedAt: Date | null;
      bouncedAt: Date | null;
      unsubscribedAt: Date | null;
    },
    type: MarketingEmailEventType,
    occurredAt: Date,
  ) {
    const recipientUpdate: Prisma.MarketingEmailSendRecipientUpdateInput = {};
    const sendUpdate: Prisma.MarketingEmailSendUpdateInput = {};
    let suppressionReason: MarketingSuppressionReason | null = null;

    if (type === MarketingEmailEventType.PROCESSED && !recipient.processedAt) {
      recipientUpdate.processedAt = occurredAt;
      recipientUpdate.providerStatus = nextRecipientStatus(recipient.providerStatus, MarketingEmailRecipientStatus.SENT);
    }
    if (type === MarketingEmailEventType.DELIVERED && !recipient.deliveredAt) {
      recipientUpdate.deliveredAt = occurredAt;
      recipientUpdate.providerStatus = nextRecipientStatus(recipient.providerStatus, MarketingEmailRecipientStatus.DELIVERED);
      sendUpdate.deliveredCount = { increment: 1 };
    }
    if (type === MarketingEmailEventType.OPEN && !recipient.openedAt) {
      recipientUpdate.openedAt = occurredAt;
      recipientUpdate.providerStatus = nextRecipientStatus(recipient.providerStatus, MarketingEmailRecipientStatus.OPENED);
      sendUpdate.openCount = { increment: 1 };
    }
    if (type === MarketingEmailEventType.CLICK && !recipient.clickedAt) {
      recipientUpdate.clickedAt = occurredAt;
      recipientUpdate.providerStatus = nextRecipientStatus(recipient.providerStatus, MarketingEmailRecipientStatus.CLICKED);
      sendUpdate.clickCount = { increment: 1 };
    }
    if (type === MarketingEmailEventType.BOUNCE && !recipient.bouncedAt) {
      recipientUpdate.bouncedAt = occurredAt;
      recipientUpdate.providerStatus = nextRecipientStatus(recipient.providerStatus, MarketingEmailRecipientStatus.BOUNCED);
      sendUpdate.bounceCount = { increment: 1 };
      suppressionReason = MarketingSuppressionReason.BOUNCE;
    }
    if (type === MarketingEmailEventType.DROPPED && !recipient.bouncedAt) {
      recipientUpdate.bouncedAt = occurredAt;
      recipientUpdate.providerStatus = nextRecipientStatus(recipient.providerStatus, MarketingEmailRecipientStatus.DROPPED);
      sendUpdate.bounceCount = { increment: 1 };
      suppressionReason = MarketingSuppressionReason.DROPPED;
    }
    if (type === MarketingEmailEventType.SPAMREPORT) {
      recipientUpdate.providerStatus = nextRecipientStatus(recipient.providerStatus, MarketingEmailRecipientStatus.SPAM_REPORTED);
      suppressionReason = MarketingSuppressionReason.SPAM_REPORT;
    }
    if (
      (type === MarketingEmailEventType.UNSUBSCRIBE || type === MarketingEmailEventType.GROUP_UNSUBSCRIBE) &&
      !recipient.unsubscribedAt
    ) {
      recipientUpdate.unsubscribedAt = occurredAt;
      recipientUpdate.providerStatus = nextRecipientStatus(recipient.providerStatus, MarketingEmailRecipientStatus.UNSUBSCRIBED);
      sendUpdate.unsubscribeCount = { increment: 1 };
      suppressionReason =
        type === MarketingEmailEventType.GROUP_UNSUBSCRIBE
          ? MarketingSuppressionReason.GROUP_UNSUBSCRIBE
          : MarketingSuppressionReason.UNSUBSCRIBE;
    }

    if (Object.keys(recipientUpdate).length > 0) {
      await prisma.marketingEmailSendRecipient.update({
        where: { id: recipient.id },
        data: recipientUpdate,
      });
    }
    if (Object.keys(sendUpdate).length > 0) {
      await prisma.marketingEmailSend.update({
        where: { id: recipient.emailSendId },
        data: sendUpdate,
      });
    }
    if (suppressionReason) {
      await upsertSuppressionForWebhookEvent(recipient, suppressionReason);
    }
  }

  return {
    // ---------------------------------------------------------------- Audiences
    async listAudiences(user: MarketingServiceUser, eventIdInput: string) {
      try {
        const eventId = requireUuid(eventIdInput, "eventId");
        await assertAccess(eventId, user, "read");
        return await prisma.marketingAudience.findMany({
          where: { eventId },
          orderBy: { updatedAt: "desc" },
        });
      } catch (error) {
        throw asMarketingError(error, "Failed to list audiences");
      }
    },

    async createAudience(user: MarketingServiceUser, eventIdInput: string, input: CreateAudienceInput) {
      try {
        const eventId = requireUuid(eventIdInput, "eventId");
        await assertAccess(eventId, user, "write");
        const eventScope = await getEventScope(prisma, eventId);
        const name = requireText(input.name, "name");
        const sourceLabel = optionalText(input.sourceLabel, "sourceLabel");
        const audience = await prisma.marketingAudience.create({
          data: { eventId, name, sourceLabel, recipientCount: 0 },
        });
        await recordMarketingActivity({
          eventId,
          userId: user.id,
          action: "CREATED",
          entityType: "MarketingAudience",
          entityId: audience.id,
          entityLabel: audience.name,
          message: `Created marketing audience "${audience.name}"`,
        });
        return audience;
      } catch (error) {
        throw asMarketingError(error, "Failed to create audience");
      }
    },

    async createAudienceFromDirectory(
      user: MarketingServiceUser,
      eventIdInput: string,
      input: CreateAudienceFromDirectoryInput,
    ): Promise<CreateAudienceFromDirectoryResult> {
      try {
        const eventId = requireUuid(eventIdInput, "eventId");
        await assertAccess(eventId, user, "write");
        const eventScope = await getEventScope(prisma, eventId);

        const name = requireText(input.name, "name");
        const selectionMode = normalizeDirectoryAudienceSelectionMode(input.selectionMode);
        const personIds = selectionMode === "manual" ? normalizeDirectoryAudiencePersonIds(input.personIds) : [];

        const people = await prisma.eventDirectoryPerson.findMany({
          where:
            selectionMode === "manual"
              ? { eventId, id: { in: personIds }, status: { notIn: ["MERGED", "REMOVED"] } }
              : buildDirectoryAudienceWhere(eventId, input.filters),
          select: {
            id: true,
            displayName: true,
            email: true,
            firstName: true,
            lastName: true,
            company: true,
            title: true,
            status: true,
            roles: { select: { role: true } },
          },
          orderBy:
            selectionMode === "manual"
              ? undefined
              : [{ updatedAt: "desc" }, { id: "asc" }],
        });

        const peopleById = new Map(people.map((person) => [person.id, person]));
        const orderedPeople =
          selectionMode === "manual"
            ? personIds.map((id) => peopleById.get(id)).filter((person): person is (typeof people)[number] => Boolean(person))
            : people;
        if (orderedPeople.length === 0) {
          throw new MarketingServiceError("No matching Event Directory people were found for this audience.", 400);
        }

        const seenEmails = new Set<string>();
        const skippedRecipients: CreateAudienceFromDirectoryResult["skippedRecipients"] = [];
        const plannedRecipients: Array<{
          person: (typeof people)[number];
          recipientInput: NonNullable<ReturnType<typeof directoryPersonToRecipientInput>>;
        }> = [];
        let duplicates = 0;

        for (const person of orderedPeople) {
          const recipientInput = directoryPersonToRecipientInput(person);
          if (!recipientInput) {
            skippedRecipients.push({
              personId: person.id,
              displayName: person.displayName,
              email: person.email,
              reason: person.email?.trim() ? "invalid_email" : "missing_email",
            });
            continue;
          }
          if (seenEmails.has(recipientInput.normalizedEmail)) {
            duplicates += 1;
            continue;
          }
          seenEmails.add(recipientInput.normalizedEmail);
          plannedRecipients.push({ person, recipientInput });
        }

        if (plannedRecipients.length === 0) {
          throw new MarketingServiceError("No selected Event Directory people have a valid email address.", 400);
        }

        const audience = await prisma.marketingAudience.create({
          data: { eventId, name, sourceLabel: DIRECTORY_AUDIENCE_SOURCE_LABEL, recipientCount: 0 },
        });

        let imported = 0;

        for (const { person, recipientInput } of plannedRecipients) {
          try {
            const recipient = await prisma.marketingAudienceRecipient.create({
              data: {
                eventId,
                audienceId: audience.id,
                ...recipientInput,
              },
            });
            imported += 1;
            await prisma.eventDirectoryModuleLink.create({
              data: {
                eventId,
                personId: person.id,
                module: EventDirectoryModuleType.MARKETING_RECIPIENT,
                moduleRecordId: recipient.id,
              },
            });
          } catch (rowError) {
            if (isPrismaUniqueViolation(rowError)) {
              duplicates += 1;
              continue;
            }
            throw rowError;
          }
        }

        const updatedAudience =
          imported > 0
            ? await prisma.marketingAudience.update({
                where: { id: audience.id },
                data: { recipientCount: imported },
              })
            : audience;

        return {
          audience: updatedAudience,
          selectionMode,
          selectedCount: orderedPeople.length,
          imported,
          duplicates,
          skippedNoEmail: skippedRecipients.length,
          skippedRecipients,
        };
      } catch (error) {
        throw asMarketingError(error, "Failed to create audience from directory");
      }
    },

    async getEmailDefaults(user: MarketingServiceUser, eventIdInput: string): Promise<MarketingDefaults> {
      try {
        const eventId = requireUuid(eventIdInput, "eventId");
        await assertAccess(eventId, user, "read");
        return {
          fromEmail: process.env.EMAIL_FROM?.trim() || null,
          replyTo: readDefaultReplyTo(),
          trackingConfigured: isSendGridWebhookConfigured(),
        };
      } catch (error) {
        throw asMarketingError(error, "Failed to load email defaults");
      }
    },

    async previewEmail(user: MarketingServiceUser, eventIdInput: string, input: PreviewEmailInput) {
      try {
        const eventId = requireUuid(eventIdInput, "eventId");
        await assertAccess(eventId, user, "read");
        const event = await prisma.event.findUnique({
          where: { id: eventId },
          select: { name: true, startDate: true, endDate: true },
        });
        if (!event) {
          throw new MarketingServiceError("Event not found", 404);
        }

        const audienceId = optionalUuid(input.audienceId, "audienceId");
        if (!audienceId) {
          throw new MarketingServiceError("Choose an audience with recipients to preview personalization.", 400);
        }
        const audience = await prisma.marketingAudience.findUnique({
          where: { id: audienceId },
          select: { eventId: true },
        });
        if (!audience || audience.eventId !== eventId) {
          throw new MarketingServiceError("audienceId is outside the event scope", 400);
        }

        const recipients = await prisma.marketingAudienceRecipient.findMany({
          where: { audienceId },
          orderBy: { createdAt: "asc" },
        });
        if (recipients.length === 0) {
          throw new MarketingServiceError("Choose an audience with recipients to preview personalization.", 400);
        }

        const requestedRecipientId = optionalUuid(input.recipientId, "recipientId");
        const recipient =
          (requestedRecipientId ? recipients.find((row) => row.id === requestedRecipientId) : null) ?? recipients[0];
        if (requestedRecipientId && recipient.id !== requestedRecipientId) {
          throw new MarketingServiceError("recipientId is outside the selected audience", 400);
        }

        const subject = optionalText(input.subject, "subject") ?? "";
        const previewText = optionalText(input.previewText, "previewText") ?? "";
        const bodyHtml = optionalText(input.bodyHtml, "bodyHtml");
        const bodyText = optionalText(input.bodyText, "bodyText");

        return {
          recipient: {
            id: recipient.id,
            email: recipient.email,
            firstName: recipient.firstName,
            lastName: recipient.lastName,
          },
          rendered: renderEmailPreview({
            subject,
            previewText,
            bodyHtml,
            bodyText,
            recipient,
            event,
          }),
        };
      } catch (error) {
        throw asMarketingError(error, "Failed to preview email");
      }
    },

    async updateAudience(user: MarketingServiceUser, audienceIdInput: string, patch: UpdateAudiencePatch) {
      try {
        const audienceId = requireUuid(audienceIdInput, "audienceId");
        const audience = await prisma.marketingAudience.findUnique({ where: { id: audienceId } });
        if (!audience) {
          throw new MarketingServiceError("Audience not found", 404);
        }
        await assertAccess(audience.eventId, user, "write");

        const data: Prisma.MarketingAudienceUpdateInput = {};
        if (typeof patch.name !== "undefined") data.name = requireText(patch.name, "name");
        if (typeof patch.sourceLabel !== "undefined") {
          data.sourceLabel = optionalText(patch.sourceLabel, "sourceLabel");
        }
        if (Object.keys(data).length === 0) {
          throw new MarketingServiceError("At least one audience field is required", 400);
        }
        const updatedAudience = await prisma.marketingAudience.update({ where: { id: audienceId }, data });
        await recordMarketingActivity({
          eventId: audience.eventId,
          userId: user.id,
          action: "UPDATED",
          entityType: "MarketingAudience",
          entityId: audienceId,
          entityLabel: updatedAudience.name,
          message: `Updated marketing audience "${updatedAudience.name}"`,
        });
        return updatedAudience;
      } catch (error) {
        throw asMarketingError(error, "Failed to update audience");
      }
    },

    async deleteAudience(user: MarketingServiceUser, audienceIdInput: string) {
      try {
        const audienceId = requireUuid(audienceIdInput, "audienceId");
        const audience = await prisma.marketingAudience.findUnique({ where: { id: audienceId } });
        if (!audience) {
          throw new MarketingServiceError("Audience not found", 404);
        }
        await assertAccess(audience.eventId, user, "write");

        const linkedSendCount = await prisma.marketingEmailSend.count({ where: { audienceId } });
        if (linkedSendCount > 0) {
          throw new MarketingServiceError(
            "This audience is linked to an existing email send, so it cannot be deleted without risking frozen send history.",
            409,
            "AUDIENCE_LINKED_TO_SEND",
          );
        }

        await prisma.marketingAudience.delete({ where: { id: audienceId } });
        await recordMarketingActivity({
          eventId: audience.eventId,
          userId: user.id,
          action: "DELETED",
          entityType: "MarketingAudience",
          entityId: audienceId,
          entityLabel: audience.name,
          message: `Deleted marketing audience "${audience.name}"`,
        });
        return { deleted: true };
      } catch (error) {
        throw asMarketingError(error, "Failed to delete audience");
      }
    },

    async getAudience(user: MarketingServiceUser, audienceIdInput: string) {
      try {
        const audienceId = requireUuid(audienceIdInput, "audienceId");
        const audience = await prisma.marketingAudience.findUnique({
          where: { id: audienceId },
          include: { recipients: { orderBy: { createdAt: "asc" } } },
        });
        if (!audience) {
          throw new MarketingServiceError("Audience not found", 404);
        }
        await assertAccess(audience.eventId, user, "read");
        return audience;
      } catch (error) {
        throw asMarketingError(error, "Failed to get audience");
      }
    },

    async importRecipients(
      user: MarketingServiceUser,
      audienceIdInput: string,
      rows: unknown,
    ): Promise<ImportRecipientsResult> {
      try {
        const audienceId = requireUuid(audienceIdInput, "audienceId");
        if (!Array.isArray(rows)) {
          throw new MarketingServiceError("rows must be an array", 400);
        }
        const audience = await prisma.marketingAudience.findUnique({
          where: { id: audienceId },
          select: { id: true, eventId: true, name: true },
        });
        if (!audience) {
          throw new MarketingServiceError("Audience not found", 404);
        }
        await assertAccess(audience.eventId, user, "write");

        const invalid: ImportRecipientsResult["invalid"] = [];
        const seenInBatch = new Set<string>();
        let imported = 0;
        let duplicates = 0;

        for (let index = 0; index < rows.length; index += 1) {
          const row = rows[index] as AudienceRecipientImportRow;
          if (typeof row !== "object" || row === null || Array.isArray(row)) {
            invalid.push({ index, email: null, reason: "row must be an object" });
            continue;
          }

          const rawEmail = typeof row.email === "string" ? row.email.trim() : "";
          if (!rawEmail) {
            invalid.push({ index, email: null, reason: "email is required" });
            continue;
          }
          if (!EMAIL_REGEX.test(rawEmail)) {
            invalid.push({ index, email: rawEmail, reason: "email is not a valid address" });
            continue;
          }

          const normalizedEmail = normalizeEmail(rawEmail);
          if (seenInBatch.has(normalizedEmail)) {
            duplicates += 1;
            continue;
          }
          seenInBatch.add(normalizedEmail);

          let firstName: string | null;
          let lastName: string | null;
          let company: string | null;
          let title: string | null;
          let registrationType: string | null;
          let status: string | null;
          try {
            firstName = optionalText(row.firstName, "firstName");
            lastName = optionalText(row.lastName, "lastName");
            company = optionalText(row.company, "company");
            title = optionalText(row.title, "title");
            registrationType = optionalText(row.registrationType, "registrationType");
            status = optionalText(row.status, "status");
          } catch (rowError) {
            const reason = rowError instanceof MarketingServiceError ? rowError.message : "invalid row";
            invalid.push({ index, email: rawEmail, reason });
            continue;
          }

          try {
            await prisma.marketingAudienceRecipient.create({
              data: {
                eventId: audience.eventId,
                audienceId: audience.id,
                email: rawEmail,
                normalizedEmail,
                firstName,
                lastName,
                company,
                title,
                registrationType,
                status,
              },
            });
            imported += 1;
          } catch (rowError) {
            if (isPrismaUniqueViolation(rowError)) {
              duplicates += 1;
              continue;
            }
            invalid.push({ index, email: rawEmail, reason: "failed to persist row" });
          }
        }

        if (imported > 0) {
          await prisma.marketingAudience.update({
            where: { id: audience.id },
            data: { recipientCount: { increment: imported } },
          });
        }

        // One summary entry per import — never one row per recipient.
        await recordMarketingActivity({
          eventId: audience.eventId,
          userId: user.id,
          action: "IMPORTED",
          entityType: "MarketingAudience",
          entityId: audience.id,
          entityLabel: audience.name,
          message: `Imported ${imported} recipient${imported === 1 ? "" : "s"} into audience "${audience.name}" (${duplicates} duplicate${duplicates === 1 ? "" : "s"}, ${invalid.length} invalid)`,
        });

        return { audienceId: audience.id, totalRows: rows.length, imported, duplicates, invalid };
      } catch (error) {
        throw asMarketingError(error, "Failed to import recipients");
      }
    },

    async addRecipient(user: MarketingServiceUser, audienceIdInput: string, input: AudienceRecipientInput) {
      try {
        const audienceId = requireUuid(audienceIdInput, "audienceId");
        const audience = await prisma.marketingAudience.findUnique({
          where: { id: audienceId },
          select: { id: true, eventId: true },
        });
        if (!audience) {
          throw new MarketingServiceError("Audience not found", 404);
        }
        await assertAccess(audience.eventId, user, "write");
        const data = normalizeRecipientInput(input);
        try {
          const recipient = await prisma.marketingAudienceRecipient.create({
            data: { eventId: audience.eventId, audienceId: audience.id, ...data },
          });
          await prisma.marketingAudience.update({
            where: { id: audience.id },
            data: { recipientCount: { increment: 1 } },
          });
          return recipient;
        } catch (error) {
          if (isPrismaUniqueViolation(error)) {
            throw new MarketingServiceError("A recipient with this email already exists in the audience", 409);
          }
          throw error;
        }
      } catch (error) {
        throw asMarketingError(error, "Failed to add recipient");
      }
    },

    async updateRecipient(
      user: MarketingServiceUser,
      audienceIdInput: string,
      recipientIdInput: string,
      input: AudienceRecipientInput,
    ) {
      try {
        const audienceId = requireUuid(audienceIdInput, "audienceId");
        const recipientId = requireUuid(recipientIdInput, "recipientId");
        const recipient = await prisma.marketingAudienceRecipient.findUnique({ where: { id: recipientId } });
        if (!recipient || recipient.audienceId !== audienceId) {
          throw new MarketingServiceError("Recipient not found", 404);
        }
        await assertAccess(recipient.eventId, user, "write");
        const data = normalizeRecipientInput(input);
        try {
          return await prisma.marketingAudienceRecipient.update({ where: { id: recipientId }, data });
        } catch (error) {
          if (isPrismaUniqueViolation(error)) {
            throw new MarketingServiceError("A recipient with this email already exists in the audience", 409);
          }
          throw error;
        }
      } catch (error) {
        throw asMarketingError(error, "Failed to update recipient");
      }
    },

    async deleteRecipient(user: MarketingServiceUser, audienceIdInput: string, recipientIdInput: string) {
      try {
        const audienceId = requireUuid(audienceIdInput, "audienceId");
        const recipientId = requireUuid(recipientIdInput, "recipientId");
        const recipient = await prisma.marketingAudienceRecipient.findUnique({ where: { id: recipientId } });
        if (!recipient || recipient.audienceId !== audienceId) {
          throw new MarketingServiceError("Recipient not found", 404);
        }
        await assertAccess(recipient.eventId, user, "write");
        await prisma.marketingAudienceRecipient.delete({ where: { id: recipientId } });
        await prisma.marketingAudience.update({
          where: { id: audienceId },
          data: { recipientCount: { decrement: 1 } },
        });
        return { deleted: true };
      } catch (error) {
        throw asMarketingError(error, "Failed to delete recipient");
      }
    },

    // ---------------------------------------------------------------- Campaigns
    async listCampaigns(user: MarketingServiceUser, eventIdInput: string) {
      try {
        const eventId = requireUuid(eventIdInput, "eventId");
        await assertAccess(eventId, user, "read");
        return await prisma.marketingCampaign.findMany({
          where: { eventId },
          orderBy: { updatedAt: "desc" },
        });
      } catch (error) {
        throw asMarketingError(error, "Failed to list campaigns");
      }
    },

    async createCampaign(user: MarketingServiceUser, eventIdInput: string, input: CreateCampaignInput) {
      try {
        const eventId = requireUuid(eventIdInput, "eventId");
        await assertAccess(eventId, user, "write");
        const eventScope = await getEventScope(prisma, eventId);
        const name = requireText(input.name, "name");
        const description = optionalText(input.description, "description");
        const audienceLabel = optionalText(input.audienceLabel, "audienceLabel");
        const marketingPlanId = optionalUuid(input.marketingPlanId, "marketingPlanId");
        const selectedOwnerUserId = optionalUuid(input.ownerUserId, "ownerUserId");
        const ownerUserId = selectedOwnerUserId ?? user.id;
        const startDate = optionalDate(input.startDate, "startDate");
        const endDate = optionalDate(input.endDate, "endDate");

        if (marketingPlanId) {
          const plan = await prisma.marketingPlan.findUnique({
            where: { id: marketingPlanId },
            select: { eventId: true },
          });
          if (!plan || plan.eventId !== eventId) {
            throw new MarketingServiceError("marketingPlanId is outside the event scope", 400);
          }
        }

        const campaign = await prisma.marketingCampaign.create({
          data: {
            eventId,
            name,
            description,
            audienceLabel,
            marketingPlanId,
            ownerUserId,
            startDate,
            endDate,
            status: MarketingCampaignStatus.DRAFT,
          },
        });
        await recordMarketingActivity({
          eventId,
          userId: user.id,
          action: "CREATED",
          entityType: "MarketingCampaign",
          entityId: campaign.id,
          entityLabel: campaign.name,
          message: `Created marketing campaign "${campaign.name}"`,
        });
        if (selectedOwnerUserId) {
          await createAssignmentNotifications([
            marketingAssignmentNotification({
              userId: selectedOwnerUserId,
              eventId,
              orgId: eventScope.orgId,
              actorUserId: user.id,
              title: "Marketing campaign assigned",
              body: `You were assigned to marketing campaign “${campaign.name}”.`,
              linkUrl: `/events/${encodeURIComponent(eventId)}/marketing?campaignId=${encodeURIComponent(campaign.id)}`,
            }),
          ], prisma);
        }
        return campaign;
      } catch (error) {
        throw asMarketingError(error, "Failed to create campaign");
      }
    },

    async getCampaign(user: MarketingServiceUser, campaignIdInput: string) {
      try {
        const campaignId = requireUuid(campaignIdInput, "campaignId");
        const campaign = await prisma.marketingCampaign.findUnique({ where: { id: campaignId } });
        if (!campaign) {
          throw new MarketingServiceError("Campaign not found", 404);
        }
        await assertAccess(campaign.eventId, user, "read");
        return campaign;
      } catch (error) {
        throw asMarketingError(error, "Failed to get campaign");
      }
    },

    async updateCampaign(user: MarketingServiceUser, campaignIdInput: string, patch: UpdateCampaignPatch) {
      try {
        const campaignId = requireUuid(campaignIdInput, "campaignId");
        const campaign = await prisma.marketingCampaign.findUnique({ where: { id: campaignId } });
        if (!campaign) {
          throw new MarketingServiceError("Campaign not found", 404);
        }
        await assertAccess(campaign.eventId, user, "write");

        const data: Prisma.MarketingCampaignUpdateInput = {};
        if (typeof patch.name !== "undefined") data.name = requireText(patch.name, "name");
        if (typeof patch.description !== "undefined") data.description = optionalText(patch.description, "description");
        if (typeof patch.audienceLabel !== "undefined") {
          data.audienceLabel = optionalText(patch.audienceLabel, "audienceLabel");
        }
        if (typeof patch.status !== "undefined") {
          if (
            typeof patch.status !== "string" ||
            !Object.values(MarketingCampaignStatus).includes(patch.status as MarketingCampaignStatus)
          ) {
            throw new MarketingServiceError("status is invalid", 400);
          }
          data.status = patch.status as MarketingCampaignStatus;
        }
        if (typeof patch.startDate !== "undefined") data.startDate = optionalDate(patch.startDate, "startDate");
        if (typeof patch.endDate !== "undefined") data.endDate = optionalDate(patch.endDate, "endDate");
        if (typeof patch.marketingPlanId !== "undefined") {
          const marketingPlanId = optionalUuid(patch.marketingPlanId, "marketingPlanId");
          if (marketingPlanId) {
            const plan = await prisma.marketingPlan.findUnique({
              where: { id: marketingPlanId },
              select: { eventId: true },
            });
            if (!plan || plan.eventId !== campaign.eventId) {
              throw new MarketingServiceError("marketingPlanId is outside the event scope", 400);
            }
            data.marketingPlan = { connect: { id: marketingPlanId } };
          } else {
            data.marketingPlan = { disconnect: true };
          }
        }

        if (Object.keys(data).length === 0) {
          throw new MarketingServiceError("At least one campaign field is required", 400);
        }

        const updatedCampaign = await prisma.marketingCampaign.update({ where: { id: campaignId }, data });
        const statusChanged = typeof data.status !== "undefined" && data.status !== campaign.status;
        await recordMarketingActivity({
          eventId: campaign.eventId,
          userId: user.id,
          action: statusChanged && Object.keys(data).length === 1 ? "STATUS_CHANGED" : "UPDATED",
          entityType: "MarketingCampaign",
          entityId: campaignId,
          entityLabel: updatedCampaign.name,
          message: statusChanged
            ? `Marketing campaign "${updatedCampaign.name}" status changed to ${updatedCampaign.status}`
            : `Updated marketing campaign "${updatedCampaign.name}"`,
        });
        return updatedCampaign;
      } catch (error) {
        throw asMarketingError(error, "Failed to update campaign");
      }
    },

    // -------------------------------------------------------------- Email sends
    async listEmailSends(user: MarketingServiceUser, eventIdInput: string) {
      try {
        const eventId = requireUuid(eventIdInput, "eventId");
        await assertAccess(eventId, user, "read");
        const sends = await prisma.marketingEmailSend.findMany({
          where: { eventId },
          include: { recipients: { orderBy: { createdAt: "asc" } } },
          orderBy: { updatedAt: "desc" },
        });
        return await Promise.all(sends.map((send) => withApprovalState(send)));
      } catch (error) {
        throw asMarketingError(error, "Failed to list email sends");
      }
    },

    async createEmailSend(user: MarketingServiceUser, eventIdInput: string, input: CreateEmailSendInput) {
      try {
        const eventId = requireUuid(eventIdInput, "eventId");
        await assertAccess(eventId, user, "write");
        const eventScope = await getEventScope(prisma, eventId);

        const campaignId = requireUuid(input.campaignId, "campaignId");
        const campaign = await prisma.marketingCampaign.findUnique({
          where: { id: campaignId },
          select: { eventId: true },
        });
        if (!campaign || campaign.eventId !== eventId) {
          throw new MarketingServiceError("campaignId is outside the event scope", 400);
        }

        const audienceId = optionalUuid(input.audienceId, "audienceId");
        if (audienceId) {
          const audience = await prisma.marketingAudience.findUnique({
            where: { id: audienceId },
            select: { eventId: true },
          });
          if (!audience || audience.eventId !== eventId) {
            throw new MarketingServiceError("audienceId is outside the event scope", 400);
          }
        }

        const subject = requireText(input.subject, "subject");
        const bodyHtml = optionalText(input.bodyHtml, "bodyHtml");
        const bodyText = optionalText(input.bodyText, "bodyText");
        const previewText = optionalText(input.previewText, "previewText");
        const fromEmail = optionalText(input.fromEmail, "fromEmail") ?? process.env.EMAIL_FROM?.trim() ?? "";
        if (!fromEmail) {
          throw new MarketingServiceError("fromEmail is required (no EMAIL_FROM configured)", 400);
        }
        const replyTo = normalizeReplyTo(input.replyTo) ?? readDefaultReplyTo();
        const registrationUrl = optionalText(input.registrationUrl, "registrationUrl");
        const utmUrl = optionalText(input.utmUrl, "utmUrl");
        const selectedOwnerUserId = optionalUuid(input.ownerUserId, "ownerUserId");
        const ownerUserId = selectedOwnerUserId ?? user.id;
        const scheduledSendAt = optionalDate(input.scheduledSendAt, "scheduledSendAt");

        const created = await prisma.marketingEmailSend.create({
          data: {
            eventId,
            campaignId,
            audienceId,
            ownerUserId,
            subject,
            previewText,
            bodyHtml,
            bodyText,
            fromEmail,
            replyTo,
            registrationUrl,
            utmUrl,
            scheduledSendAt,
            status: MarketingEmailSendStatus.DRAFT,
          },
        });
        await recordMarketingActivity({
          eventId,
          userId: user.id,
          action: "CREATED",
          entityType: "MarketingEmailSend",
          entityId: created.id,
          entityLabel: created.subject,
          message: `Created marketing email draft "${created.subject}"`,
        });
        if (selectedOwnerUserId) {
          await createAssignmentNotifications([
            marketingAssignmentNotification({
              userId: selectedOwnerUserId,
              eventId,
              orgId: eventScope.orgId,
              actorUserId: user.id,
              title: "Marketing email assigned",
              body: `You were assigned to marketing email “${created.subject}”.`,
              linkUrl: `/events/${encodeURIComponent(eventId)}/marketing?emailSendId=${encodeURIComponent(created.id)}`,
            }),
          ], prisma);
        }
        return await withApprovalState(created);
      } catch (error) {
        throw asMarketingError(error, "Failed to create email send");
      }
    },

    /**
     * Edit a draft email send. Once scheduled, sent, failed, or cancelled, the
     * lifecycle-specific methods own status changes so frozen recipient
     * snapshots and audit state stay intact.
     */
    async updateEmailSend(user: MarketingServiceUser, sendIdInput: string, patch: UpdateEmailSendPatch) {
      try {
        const sendId = requireUuid(sendIdInput, "sendId");
        const send = await prisma.marketingEmailSend.findUnique({ where: { id: sendId } });
        if (!send) {
          throw new MarketingServiceError("Email send not found", 404);
        }
        await assertAccess(send.eventId, user, "write");
        const eventScope = await getEventScope(prisma, send.eventId);

        const editableStatuses: MarketingEmailSendStatus[] = [
          MarketingEmailSendStatus.DRAFT,
          MarketingEmailSendStatus.READY,
        ];
        if (!editableStatuses.includes(send.status)) {
          throw new MarketingServiceError("Email send is not editable after sending", 409);
        }

        const data: Prisma.MarketingEmailSendUpdateInput = {};
        if (typeof patch.subject !== "undefined") data.subject = requireText(patch.subject, "subject");
        if (typeof patch.previewText !== "undefined") data.previewText = optionalText(patch.previewText, "previewText");
        if (typeof patch.bodyHtml !== "undefined") data.bodyHtml = optionalText(patch.bodyHtml, "bodyHtml");
        if (typeof patch.bodyText !== "undefined") data.bodyText = optionalText(patch.bodyText, "bodyText");
        if (typeof patch.fromEmail !== "undefined") {
          const fromEmail = optionalText(patch.fromEmail, "fromEmail");
          if (!fromEmail) {
            throw new MarketingServiceError("fromEmail cannot be empty", 400);
          }
          data.fromEmail = fromEmail;
        }
        if (typeof patch.replyTo !== "undefined") data.replyTo = normalizeReplyTo(patch.replyTo);
        if (typeof patch.registrationUrl !== "undefined") {
          data.registrationUrl = optionalText(patch.registrationUrl, "registrationUrl");
        }
        if (typeof patch.utmUrl !== "undefined") data.utmUrl = optionalText(patch.utmUrl, "utmUrl");
        if (typeof patch.scheduledSendAt !== "undefined") {
          data.scheduledSendAt = optionalDate(patch.scheduledSendAt, "scheduledSendAt");
        }
        if (typeof patch.ownerUserId !== "undefined") {
          const ownerUserId = optionalUuid(patch.ownerUserId, "ownerUserId");
          if (ownerUserId) data.ownerUser = { connect: { id: ownerUserId } };
          else data.ownerUser = { disconnect: true };
        }
        if (typeof patch.audienceId !== "undefined") {
          const audienceId = optionalUuid(patch.audienceId, "audienceId");
          if (audienceId) {
            const audience = await prisma.marketingAudience.findUnique({
              where: { id: audienceId },
              select: { eventId: true },
            });
            if (!audience || audience.eventId !== send.eventId) {
              throw new MarketingServiceError("audienceId is outside the event scope", 400);
            }
            data.audience = { connect: { id: audienceId } };
          } else {
            data.audience = { disconnect: true };
          }
        }
        if (typeof patch.status !== "undefined") {
          if (patch.status !== MarketingEmailSendStatus.CANCELED) {
            throw new MarketingServiceError("Only CANCELED may be set manually on an email send", 400);
          }
          data.status = MarketingEmailSendStatus.CANCELED;
        }

        if (Object.keys(data).length === 0) {
          throw new MarketingServiceError("At least one email send field is required", 400);
        }

        const updated = await prisma.marketingEmailSend.update({ where: { id: sendId }, data });
        const nextOwnerUserId = typeof patch.ownerUserId === "undefined"
          ? send.ownerUserId
          : optionalUuid(patch.ownerUserId, "ownerUserId");
        if (nextOwnerUserId && nextOwnerUserId !== send.ownerUserId) {
          await createAssignmentNotifications([
            marketingAssignmentNotification({
              userId: nextOwnerUserId,
              eventId: send.eventId,
              orgId: eventScope.orgId,
              actorUserId: user.id,
              title: "Marketing email assigned",
              body: `You were assigned to marketing email “${updated.subject}”.`,
              linkUrl: `/events/${encodeURIComponent(send.eventId)}/marketing?emailSendId=${encodeURIComponent(updated.id)}`,
            }),
          ], prisma);
        }
        return await withApprovalState(updated);
      } catch (error) {
        throw asMarketingError(error, "Failed to update email send");
      }
    },

    async submitEmailSendForApproval(
      user: MarketingServiceUser,
      sendIdInput: string,
      input: SubmitEmailSendForApprovalInput,
    ) {
      try {
        const send = await getSendOrThrow(sendIdInput);
        await assertAccess(send.eventId, user, "write");
        if (send.status !== MarketingEmailSendStatus.DRAFT && send.status !== MarketingEmailSendStatus.READY) {
          throw new MarketingServiceError("Only draft email sends can be sent for approval", 409);
        }
        await requireNoActiveApproval(send);

        const approverUserId = requireUuid(input.approverUserId, "approverUserId");
        await taskService.createManualTask(user, {
          eventId: send.eventId,
          title: `Review marketing email: ${send.subject}`,
          description: marketingEmailApprovalDescription({
            eventId: send.eventId,
            campaignId: send.campaignId,
            emailSendId: send.id,
            requesterUserId: user.id,
          }),
          priority: "HIGH",
          assigneeUserIds: [approverUserId],
          watcherUserIds: [user.id],
          links: [{ objectType: "EVENT", objectId: send.eventId }],
          assignmentNotificationLinkUrl: `/events/${send.eventId}/marketing?emailSendId=${send.id}`,
        });

        await recordMarketingActivity({
          eventId: send.eventId,
          userId: user.id,
          action: "SUBMITTED",
          entityType: "MarketingEmailSend",
          entityId: send.id,
          entityLabel: send.subject,
          message: `Submitted marketing email "${send.subject}" for approval`,
        });

        return await withApprovalState(send);
      } catch (error) {
        throw asMarketingError(error, "Failed to submit email send for approval");
      }
    },

    async approveEmailSend(user: MarketingServiceUser, sendIdInput: string) {
      try {
        const send = await getSendOrThrow(sendIdInput);
        await assertAccess(send.eventId, user, "write");
        const task = await getActiveApprovalTaskOrThrow(send);
        assertAssignedApprover(task, user);
        await taskService.completeTask(user, task.id);
        const updated = await prisma.marketingEmailSend.update({
          where: { id: send.id },
          data: { status: MarketingEmailSendStatus.READY, failureReason: null },
        });
        await recordMarketingActivity({
          eventId: send.eventId,
          userId: user.id,
          action: "APPROVED",
          entityType: "MarketingEmailSend",
          entityId: send.id,
          entityLabel: send.subject,
          message: `Approved marketing email "${send.subject}"`,
        });
        return await withApprovalState(updated);
      } catch (error) {
        throw asMarketingError(error, "Failed to approve email send");
      }
    },

    async requestEmailSendChanges(
      user: MarketingServiceUser,
      sendIdInput: string,
      input: EmailSendApprovalDecisionInput,
    ) {
      try {
        const send = await getSendOrThrow(sendIdInput);
        await assertAccess(send.eventId, user, "write");
        const task = await getActiveApprovalTaskOrThrow(send);
        assertAssignedApprover(task, user);
        const note = optionalText(input.note, "note") ?? "Changes requested before this marketing email can be approved.";
        await taskService.blockTask(user, task.id, note);
        const updated = await prisma.marketingEmailSend.update({
          where: { id: send.id },
          data: { status: MarketingEmailSendStatus.DRAFT },
        });
        await recordMarketingActivity({
          eventId: send.eventId,
          userId: user.id,
          action: "REOPENED",
          entityType: "MarketingEmailSend",
          entityId: send.id,
          entityLabel: send.subject,
          message: `Requested changes on marketing email "${send.subject}"`,
        });
        return await withApprovalState(updated);
      } catch (error) {
        throw asMarketingError(error, "Failed to request email send changes");
      }
    },

    async rejectEmailSend(user: MarketingServiceUser, sendIdInput: string, input: EmailSendApprovalDecisionInput) {
      try {
        const send = await getSendOrThrow(sendIdInput);
        await assertAccess(send.eventId, user, "write");
        const task = await getActiveApprovalTaskOrThrow(send);
        assertAssignedApprover(task, user);
        const note = optionalText(input.note, "note") ?? "Approval rejected.";
        await taskService.updateTask(user, task.id, {
          status: TaskStatus.CANCELED,
          description: `${task.description ?? ""}\n\ndecision=rejected\nrejectionNote=${note}`.trim(),
        });
        const updated = await prisma.marketingEmailSend.update({
          where: { id: send.id },
          data: {
            status: MarketingEmailSendStatus.CANCELED,
            canceledAt: now(),
            canceledByUserId: user.id,
            failureReason: "Approval rejected.",
          },
        });
        await recordMarketingActivity({
          eventId: send.eventId,
          userId: user.id,
          action: "REJECTED",
          entityType: "MarketingEmailSend",
          entityId: send.id,
          entityLabel: send.subject,
          message: `Rejected marketing email "${send.subject}"`,
        });
        return await withApprovalState(updated);
      } catch (error) {
        throw asMarketingError(error, "Failed to reject email send");
      }
    },

    async scheduleEmailSend(user: MarketingServiceUser, sendIdInput: string, input: ScheduleEmailSendInput) {
      try {
        const send = await getSendOrThrow(sendIdInput);
        await assertAccess(send.eventId, user, "write");
        if (send.status !== MarketingEmailSendStatus.DRAFT && send.status !== MarketingEmailSendStatus.READY) {
          throw new MarketingServiceError("Only draft email sends can be scheduled", 409);
        }
        await requireNoActiveApproval(send);
        const scheduledSendAt = optionalDate(input.scheduledSendAt, "scheduledSendAt");
        if (!scheduledSendAt) {
          throw new MarketingServiceError("scheduledSendAt is required", 400);
        }
        if (scheduledSendAt.getTime() <= now().getTime()) {
          throw new MarketingServiceError("scheduledSendAt must be in the future", 400);
        }
        const existingSnapshot = await getFrozenRecipients(send.id);
        if (existingSnapshot.length > 0) {
          throw new MarketingServiceError("This email send already has a frozen recipient snapshot", 409);
        }
        const freezeResult = await freezeAudienceRecipientsForSend(send);
        const scheduled = await prisma.marketingEmailSend.update({
          where: { id: send.id },
          data: {
            status: MarketingEmailSendStatus.SCHEDULED,
            scheduledSendAt,
            recipientCount: freezeResult.sendableCount,
            canceledAt: null,
            canceledByUserId: null,
            failureReason: null,
          },
        });
        await recordMarketingActivity({
          eventId: send.eventId,
          userId: user.id,
          action: "SCHEDULED",
          entityType: "MarketingEmailSend",
          entityId: send.id,
          entityLabel: send.subject,
          message: `Scheduled marketing email "${send.subject}" for ${scheduledSendAt.toISOString()}`,
        });
        return await withApprovalState(scheduled);
      } catch (error) {
        throw asMarketingError(error, "Failed to schedule email send");
      }
    },

    async cancelScheduledEmailSend(user: MarketingServiceUser, sendIdInput: string) {
      try {
        const send = await getSendOrThrow(sendIdInput);
        await assertAccess(send.eventId, user, "write");
        if (send.status !== MarketingEmailSendStatus.SCHEDULED) {
          throw new MarketingServiceError("Only scheduled email sends can be cancelled", 409);
        }
        const canceled = await prisma.marketingEmailSend.update({
          where: { id: send.id },
          data: {
            status: MarketingEmailSendStatus.CANCELED,
            canceledAt: now(),
            canceledByUserId: user.id,
            failureReason: null,
          },
        });
        await recordMarketingActivity({
          eventId: send.eventId,
          userId: user.id,
          action: "CANCELED",
          entityType: "MarketingEmailSend",
          entityId: send.id,
          entityLabel: send.subject,
          message: `Canceled scheduled marketing email "${send.subject}"`,
        });
        return canceled;
      } catch (error) {
        throw asMarketingError(error, "Failed to cancel scheduled email send");
      }
    },

    async rescheduleEmailSend(user: MarketingServiceUser, sendIdInput: string, input: RescheduleEmailSendInput) {
      try {
        const send = await getSendOrThrow(sendIdInput);
        await assertAccess(send.eventId, user, "write");
        if (send.status !== MarketingEmailSendStatus.SCHEDULED) {
          throw new MarketingServiceError("Only scheduled email sends can be rescheduled", 409);
        }
        const scheduledSendAt = optionalDate(input.scheduledSendAt, "scheduledSendAt");
        if (!scheduledSendAt) {
          throw new MarketingServiceError("scheduledSendAt is required", 400);
        }
        if (scheduledSendAt.getTime() <= now().getTime()) {
          throw new MarketingServiceError("scheduledSendAt must be in the future", 400);
        }
        const rescheduled = await prisma.marketingEmailSend.update({
          where: { id: send.id },
          data: { scheduledSendAt, failureReason: null },
        });
        await recordMarketingActivity({
          eventId: send.eventId,
          userId: user.id,
          action: "RESCHEDULED",
          entityType: "MarketingEmailSend",
          entityId: send.id,
          entityLabel: send.subject,
          message: `Rescheduled marketing email "${send.subject}" to ${scheduledSendAt.toISOString()}`,
        });
        return rescheduled;
      } catch (error) {
        throw asMarketingError(error, "Failed to reschedule email send");
      }
    },

    /**
     * Send-now. Freezes the selected audience into MarketingEmailSendRecipient
     * rows (excluding suppressed addresses), hands the frozen batch to the
     * provider, and records per-recipient and send-level statuses.
     */
    async sendEmailNow(user: MarketingServiceUser, sendIdInput: string) {
      try {
        const send = await getSendOrThrow(sendIdInput);
        await assertAccess(send.eventId, user, "write");
        if (send.status !== MarketingEmailSendStatus.DRAFT && send.status !== MarketingEmailSendStatus.READY) {
          throw new MarketingServiceError("Email send is not in a sendable state", 409);
        }
        await requireNoActiveApproval(send);
        assertMarketingSendComplianceReady(send);
        const freezeResult = await freezeAudienceRecipientsForSend(send);
        const claimedSend = await claimSendForDispatch(send.id, [
          MarketingEmailSendStatus.DRAFT,
          MarketingEmailSendStatus.READY,
        ]);
        await prisma.marketingEmailSend.update({
          where: { id: send.id },
          data: { recipientCount: freezeResult.sendableCount },
        });
        const dispatched = await dispatchFrozenEmailSend(claimedSend, freezeResult.frozen);
        await recordMarketingActivity({
          eventId: send.eventId,
          userId: user.id,
          action: "SENT",
          entityType: "MarketingEmailSend",
          entityId: send.id,
          entityLabel: send.subject,
          message: `Sent marketing email "${send.subject}" to ${freezeResult.sendableCount} recipient${freezeResult.sendableCount === 1 ? "" : "s"}`,
        });
        return dispatched;
      } catch (error) {
        throw asMarketingError(error, "Failed to send email");
      }
    },

    async retryFailedEmailSend(user: MarketingServiceUser, sendIdInput: string) {
      try {
        const send = await getSendOrThrow(sendIdInput);
        await assertAccess(send.eventId, user, "write");
        if (send.status !== MarketingEmailSendStatus.FAILED) {
          throw new MarketingServiceError("Only failed email sends can be retried", 409);
        }
        const frozen = await getFrozenRecipients(send.id);
        if (frozen.length === 0) {
          throw new MarketingServiceError("Failed email send has no frozen recipient snapshot to retry safely", 409);
        }
        assertMarketingSendComplianceReady(send);
        const claimedSend = await claimSendForDispatch(send.id, [MarketingEmailSendStatus.FAILED]);
        const dispatched = await dispatchFrozenEmailSend(claimedSend, frozen);
        await recordMarketingActivity({
          eventId: send.eventId,
          userId: user.id,
          action: "RETRIED",
          entityType: "MarketingEmailSend",
          entityId: send.id,
          entityLabel: send.subject,
          message: `Retried marketing email "${send.subject}"`,
        });
        return dispatched;
      } catch (error) {
        throw asMarketingError(error, "Failed to retry email send");
      }
    },

    async runDueScheduledEmailSends(eventIdInput: string) {
      try {
        const eventId = requireUuid(eventIdInput, "eventId");
        await getEventScope(prisma, eventId);
        const runAt = now();
        const dueSends = await prisma.marketingEmailSend.findMany({
          where: {
            eventId,
            status: MarketingEmailSendStatus.SCHEDULED,
            scheduledSendAt: { lte: runAt },
          },
          orderBy: { scheduledSendAt: "asc" },
        });

        const results: Array<{ sendId: string; status: MarketingEmailSendStatus; sentCount: number; failedCount: number }> = [];
        let skipped = 0;

        for (const dueSend of dueSends) {
          assertMarketingSendComplianceReady(dueSend);
          const claimed = await prisma.marketingEmailSend.updateMany({
            where: { id: dueSend.id, status: MarketingEmailSendStatus.SCHEDULED },
            data: {
              status: MarketingEmailSendStatus.SENDING,
              sendAttemptCount: { increment: 1 },
              lastAttemptedAt: runAt,
              failureReason: null,
            },
          });
          if (claimed.count !== 1) {
            skipped += 1;
            continue;
          }
          const claimedSend = await getSendOrThrow(dueSend.id);
          const frozen = await getFrozenRecipients(dueSend.id);
          const result = await dispatchFrozenEmailSend(claimedSend, frozen);
          results.push({
            sendId: dueSend.id,
            status: result.send.status,
            sentCount: result.summary.sentCount,
            failedCount: result.summary.failedCount,
          });
        }

        return { checkedAt: runAt, dueCount: dueSends.length, processedCount: results.length, skipped, results };
      } catch (error) {
        throw asMarketingError(error, "Failed to run due scheduled email sends");
      }
    },

    async listSuppressions(user: MarketingServiceUser, eventIdInput: string) {
      try {
        const eventId = requireUuid(eventIdInput, "eventId");
        await assertAccess(eventId, user, "read");
        return await prisma.marketingSuppression.findMany({
          where: { eventId },
          orderBy: { createdAt: "desc" },
        });
      } catch (error) {
        throw asMarketingError(error, "Failed to list suppressions");
      }
    },

    async resubscribeSuppression(user: MarketingServiceUser, eventIdInput: string, suppressionIdInput: string) {
      try {
        const eventId = requireUuid(eventIdInput, "eventId");
        const suppressionId = requireUuid(suppressionIdInput, "suppressionId");
        await assertAccess(eventId, user, "write");
        const suppression = await prisma.marketingSuppression.findUnique({ where: { id: suppressionId } });
        if (!suppression || suppression.eventId !== eventId) {
          throw new MarketingServiceError("Suppression not found", 404);
        }
        await prisma.marketingSuppression.delete({ where: { id: suppressionId } });
        await recordMarketingActivity({
          eventId,
          userId: user.id,
          action: "DELETED",
          entityType: "MarketingSuppression",
          entityId: suppressionId,
          entityLabel: suppression.email,
          message: `Resubscribed "${suppression.email}" (removed from suppression list)`,
        });
        return { resubscribed: true, email: suppression.email, normalizedEmail: suppression.normalizedEmail };
      } catch (error) {
        throw asMarketingError(error, "Failed to resubscribe recipient");
      }
    },

    async unsubscribeMarketingRecipient(token: string) {
      try {
        const payload = verifyMarketingUnsubscribeToken(token);
        const recipient = await prisma.marketingEmailSendRecipient.findUnique({
          where: { id: payload.emailSendRecipientId },
        });
        const normalizedEmail = normalizeEmail(payload.email);
        if (
          !recipient ||
          recipient.eventId !== payload.eventId ||
          recipient.emailSendId !== payload.emailSendId ||
          recipient.normalizedEmail !== normalizedEmail
        ) {
          throw new MarketingServiceError("Invalid unsubscribe link.", 401);
        }

        const suppression = await upsertMarketingSuppression({
          eventId: recipient.eventId,
          email: recipient.email,
          normalizedEmail: recipient.normalizedEmail,
          reason: MarketingSuppressionReason.UNSUBSCRIBE,
          source: MarketingSuppressionSource.MANUAL,
        });

        if (!recipient.unsubscribedAt) {
          const unsubscribedAt = now();
          await prisma.marketingEmailSendRecipient.update({
            where: { id: recipient.id },
            data: {
              unsubscribedAt,
              providerStatus: nextRecipientStatus(recipient.providerStatus, MarketingEmailRecipientStatus.UNSUBSCRIBED),
            },
          });
          await prisma.marketingEmailSend.update({
            where: { id: recipient.emailSendId },
            data: { unsubscribeCount: { increment: 1 } },
          });
        }

        return {
          unsubscribed: true,
          eventId: recipient.eventId,
          email: recipient.email,
          normalizedEmail: recipient.normalizedEmail,
          suppression,
        };
      } catch (error) {
        throw asMarketingError(error, "Failed to unsubscribe recipient");
      }
    },

    async ingestSendGridWebhookEvents(events: SendGridWebhookEventInput[]): Promise<SendGridWebhookIngestionResult> {
      const result: SendGridWebhookIngestionResult = {
        received: events.length,
        processed: 0,
        duplicates: 0,
        ignored: 0,
        unmatched: 0,
      };

      for (const rawEvent of events) {
        try {
          const eventName = optionalString(rawEvent.event)?.toLowerCase();
          const mappedType = eventName ? SENDGRID_EVENT_TYPE_MAP[eventName] : undefined;
          if (!eventName || typeof mappedType === "undefined" || mappedType === null) {
            result.ignored += 1;
            continue;
          }

          const occurredAt = parseSendGridOccurredAt(rawEvent.timestamp, now());
          const sgEventId = sendGridSgEventId(rawEvent, mappedType, occurredAt);
          const recipient = await findRecipientForSendGridEvent(rawEvent);
          if (!recipient) {
            result.unmatched += 1;
            continue;
          }

          try {
            await prisma.marketingEmailEvent.create({
              data: {
                eventId: recipient.eventId,
                emailSendId: recipient.emailSendId,
                emailSendRecipientId: recipient.id,
                type: mappedType,
                sgEventId,
                occurredAt,
                reason: optionalString(rawEvent.reason),
                url: optionalString(rawEvent.url),
              },
            });
          } catch (error) {
            if (isPrismaUniqueViolation(error)) {
              result.duplicates += 1;
              continue;
            }
            throw error;
          }

          await applySendGridEventMilestone(
            recipient as Awaited<ReturnType<typeof findRecipientForSendGridEvent>> & {
              id: string;
              eventId: string;
              emailSendId: string;
              email: string;
              normalizedEmail: string;
              providerStatus: MarketingEmailRecipientStatus | null;
              processedAt: Date | null;
              deliveredAt: Date | null;
              openedAt: Date | null;
              clickedAt: Date | null;
              bouncedAt: Date | null;
              unsubscribedAt: Date | null;
            },
            mappedType,
            occurredAt,
          );
          result.processed += 1;
        } catch {
          result.ignored += 1;
        }
      }

      return result;
    },
  };
}

export type MarketingService = ReturnType<typeof createMarketingService>;

function defaultService(): MarketingService {
  return createMarketingService({ prisma: getPrisma() });
}

// ----------------------------------------------------------------- Public API
export async function listAudiences(user: MarketingServiceUser, eventId: string) {
  return defaultService().listAudiences(user, eventId);
}

export async function createAudience(user: MarketingServiceUser, eventId: string, input: CreateAudienceInput) {
  return defaultService().createAudience(user, eventId, input);
}

export async function createAudienceFromDirectory(
  user: MarketingServiceUser,
  eventId: string,
  input: CreateAudienceFromDirectoryInput,
) {
  return defaultService().createAudienceFromDirectory(user, eventId, input);
}

export async function getAudience(user: MarketingServiceUser, audienceId: string) {
  return defaultService().getAudience(user, audienceId);
}

export async function getEmailDefaults(user: MarketingServiceUser, eventId: string) {
  return defaultService().getEmailDefaults(user, eventId);
}

export async function previewEmail(user: MarketingServiceUser, eventId: string, input: PreviewEmailInput) {
  return defaultService().previewEmail(user, eventId, input);
}

export async function updateAudience(user: MarketingServiceUser, audienceId: string, patch: UpdateAudiencePatch) {
  return defaultService().updateAudience(user, audienceId, patch);
}

export async function deleteAudience(user: MarketingServiceUser, audienceId: string) {
  return defaultService().deleteAudience(user, audienceId);
}

export async function importRecipients(user: MarketingServiceUser, audienceId: string, rows: unknown) {
  return defaultService().importRecipients(user, audienceId, rows);
}

export async function addRecipient(user: MarketingServiceUser, audienceId: string, input: AudienceRecipientInput) {
  return defaultService().addRecipient(user, audienceId, input);
}

export async function updateRecipient(
  user: MarketingServiceUser,
  audienceId: string,
  recipientId: string,
  input: AudienceRecipientInput,
) {
  return defaultService().updateRecipient(user, audienceId, recipientId, input);
}

export async function deleteRecipient(user: MarketingServiceUser, audienceId: string, recipientId: string) {
  return defaultService().deleteRecipient(user, audienceId, recipientId);
}

export async function listCampaigns(user: MarketingServiceUser, eventId: string) {
  return defaultService().listCampaigns(user, eventId);
}

export async function createCampaign(user: MarketingServiceUser, eventId: string, input: CreateCampaignInput) {
  return defaultService().createCampaign(user, eventId, input);
}

export async function getCampaign(user: MarketingServiceUser, campaignId: string) {
  return defaultService().getCampaign(user, campaignId);
}

export async function updateCampaign(user: MarketingServiceUser, campaignId: string, patch: UpdateCampaignPatch) {
  return defaultService().updateCampaign(user, campaignId, patch);
}

export async function listEmailSends(user: MarketingServiceUser, eventId: string) {
  return defaultService().listEmailSends(user, eventId);
}

export async function createEmailSend(user: MarketingServiceUser, eventId: string, input: CreateEmailSendInput) {
  return defaultService().createEmailSend(user, eventId, input);
}

export async function updateEmailSend(user: MarketingServiceUser, sendId: string, patch: UpdateEmailSendPatch) {
  return defaultService().updateEmailSend(user, sendId, patch);
}

export async function submitEmailSendForApproval(
  user: MarketingServiceUser,
  sendId: string,
  input: SubmitEmailSendForApprovalInput,
) {
  return defaultService().submitEmailSendForApproval(user, sendId, input);
}

export async function approveEmailSend(user: MarketingServiceUser, sendId: string) {
  return defaultService().approveEmailSend(user, sendId);
}

export async function requestEmailSendChanges(
  user: MarketingServiceUser,
  sendId: string,
  input: EmailSendApprovalDecisionInput,
) {
  return defaultService().requestEmailSendChanges(user, sendId, input);
}

export async function rejectEmailSend(
  user: MarketingServiceUser,
  sendId: string,
  input: EmailSendApprovalDecisionInput,
) {
  return defaultService().rejectEmailSend(user, sendId, input);
}

export async function scheduleEmailSend(user: MarketingServiceUser, sendId: string, input: ScheduleEmailSendInput) {
  return defaultService().scheduleEmailSend(user, sendId, input);
}

export async function cancelScheduledEmailSend(user: MarketingServiceUser, sendId: string) {
  return defaultService().cancelScheduledEmailSend(user, sendId);
}

export async function rescheduleEmailSend(user: MarketingServiceUser, sendId: string, input: RescheduleEmailSendInput) {
  return defaultService().rescheduleEmailSend(user, sendId, input);
}

export async function sendEmailNow(user: MarketingServiceUser, sendId: string) {
  return defaultService().sendEmailNow(user, sendId);
}

export async function retryFailedEmailSend(user: MarketingServiceUser, sendId: string) {
  return defaultService().retryFailedEmailSend(user, sendId);
}

export async function runDueScheduledEmailSends(eventId: string) {
  return defaultService().runDueScheduledEmailSends(eventId);
}

export async function listSuppressions(user: MarketingServiceUser, eventId: string) {
  return defaultService().listSuppressions(user, eventId);
}

export async function resubscribeSuppression(user: MarketingServiceUser, eventId: string, suppressionId: string) {
  return defaultService().resubscribeSuppression(user, eventId, suppressionId);
}

export async function unsubscribeMarketingRecipient(token: string) {
  return defaultService().unsubscribeMarketingRecipient(token);
}

export async function ingestSendGridWebhookEvents(events: SendGridWebhookEventInput[]) {
  return defaultService().ingestSendGridWebhookEvents(events);
}
