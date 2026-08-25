// Shared types, fetch helpers, and visual tokens for the Marketing workspace.
// Response shapes mirror the Prisma rows returned by
// src/server/services/marketing.ts (camelCase columns).

export type CampaignStatus =
  | "DRAFT"
  | "ACTIVE"
  | "PAUSED"
  | "COMPLETED"
  | "ARCHIVED";

export type EmailSendStatus =
  | "DRAFT"
  | "READY"
  | "SCHEDULED"
  | "SENDING"
  | "SENT"
  | "PARTIALLY_SENT"
  | "FAILED"
  | "CANCELED";

export type MarketingSuppressionReason =
  | "BOUNCE"
  | "DROPPED"
  | "SPAM_REPORT"
  | "UNSUBSCRIBE"
  | "GROUP_UNSUBSCRIBE"
  | "MANUAL";

export type MarketingSuppressionSource = "SENDGRID_WEBHOOK" | "MANUAL" | "IMPORT";

export type MarketingRecipientProviderStatus =
  | "PENDING"
  | "SENT"
  | "DELIVERED"
  | "OPENED"
  | "CLICKED"
  | "BOUNCED"
  | "DROPPED"
  | "SPAM_REPORTED"
  | "UNSUBSCRIBED"
  | "FAILED"
  | "SUPPRESSED";

export type MarketingCampaign = {
  id: string;
  eventId: string;
  marketingPlanId: string | null;
  name: string;
  description: string | null;
  ownerUserId: string | null;
  status: CampaignStatus;
  audienceLabel: string | null;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MarketingAudience = {
  id: string;
  eventId: string;
  name: string;
  sourceLabel: string | null;
  recipientCount: number;
  createdAt: string;
  updatedAt: string;
};

export type MarketingAudienceRecipient = {
  id: string;
  audienceId: string;
  email: string;
  normalizedEmail: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  title: string | null;
  registrationType: string | null;
  status: string | null;
  createdAt: string;
};

export type MarketingAudienceDetail = MarketingAudience & {
  recipients: MarketingAudienceRecipient[];
};

export type MarketingSuppression = {
  id: string;
  eventId: string;
  email: string;
  normalizedEmail: string;
  reason: MarketingSuppressionReason;
  source: MarketingSuppressionSource;
  createdAt: string;
};

export type MarketingEmailSend = {
  id: string;
  eventId: string;
  campaignId: string;
  audienceId: string | null;
  ownerUserId: string | null;
  subject: string;
  previewText: string | null;
  bodyHtml: string | null;
  bodyText: string | null;
  fromEmail: string;
  replyTo: string | null;
  registrationUrl: string | null;
  utmUrl: string | null;
  status: EmailSendStatus;
  scheduledSendAt: string | null;
  actualSentAt: string | null;
  canceledAt: string | null;
  canceledByUserId: string | null;
  failureReason: string | null;
  sendAttemptCount: number;
  lastAttemptedAt: string | null;
  sendgridBatchId: string | null;
  recipientCount: number;
  deliveredCount: number;
  openCount: number;
  clickCount: number;
  bounceCount: number;
  unsubscribeCount: number;
  createdAt: string;
  updatedAt: string;
  recipients?: MarketingEmailSendRecipient[];
  approval?: MarketingEmailSendApproval | null;
};

export type MarketingEmailSendApproval = {
  state: "PENDING" | "APPROVED" | "CHANGES_REQUESTED" | "REJECTED";
  taskId: string;
  assigneeUserIds: string[];
  requesterUserId: string | null;
  decidedByUserId: string | null;
  decidedAt: string | null;
  updatedAt: string;
};

export type MarketingEmailSendRecipient = {
  id: string;
  emailSendId: string;
  email: string;
  normalizedEmail: string;
  firstName: string | null;
  lastName: string | null;
  providerStatus: MarketingRecipientProviderStatus;
  processedAt: string | null;
  deliveredAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  bouncedAt: string | null;
  unsubscribedAt: string | null;
};

export type SendNowResult = {
  send: MarketingEmailSend;
  summary: {
    recipientCount: number;
    sentCount: number;
    failedCount: number;
    skippedSuppressedCount?: number;
    status: EmailSendStatus;
  };
};

export type ImportRecipientsResult = {
  audienceId: string;
  totalRows: number;
  imported: number;
  duplicates: number;
  invalid: Array<{ index: number; email: string | null; reason: string }>;
};

export type MarketingEmailDefaults = {
  fromEmail: string | null;
  replyTo: string | null;
  trackingConfigured: boolean;
};

export type MarketingEmailPreview = {
  recipient: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
  rendered: {
    subject: string;
    previewText: string;
    bodyHtml: string | null;
    bodyText: string | null;
  };
};

// ----------------------------------------------------------------- fetch utils
export function toErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "object" && payload !== null) {
    if ("error" in payload && typeof (payload as { error: unknown }).error === "string") {
      return (payload as { error: string }).error;
    }
    if ("message" in payload && typeof (payload as { message: unknown }).message === "string") {
      return (payload as { message: string }).message;
    }
  }
  return fallback;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function getJson<T>(url: string, fallback: string): Promise<T> {
  const response = await fetch(url);
  const payload = await readJson(response);
  if (!response.ok) throw new Error(toErrorMessage(payload, fallback));
  return payload as T;
}

async function sendJson<T>(url: string, method: "POST" | "PATCH", body: unknown, fallback: string): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(toErrorMessage(payload, fallback));
  return payload as T;
}

async function deleteJson<T>(url: string, fallback: string): Promise<T> {
  const response = await fetch(url, { method: "DELETE" });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(toErrorMessage(payload, fallback));
  return payload as T;
}

const base = (eventId: string) => `/api/events/${eventId}/marketing`;

export const marketingApi = {
  listCampaigns: (eventId: string) =>
    getJson<MarketingCampaign[]>(`${base(eventId)}/campaigns`, "Failed to load campaigns"),
  createCampaign: (eventId: string, body: Record<string, unknown>) =>
    sendJson<MarketingCampaign>(`${base(eventId)}/campaigns`, "POST", body, "Failed to create campaign"),
  updateCampaign: (eventId: string, campaignId: string, body: Record<string, unknown>) =>
    sendJson<MarketingCampaign>(`${base(eventId)}/campaigns/${campaignId}`, "PATCH", body, "Failed to update campaign"),
  listAudiences: (eventId: string) =>
    getJson<MarketingAudience[]>(`${base(eventId)}/audiences`, "Failed to load audiences"),
  createAudience: (eventId: string, body: Record<string, unknown>) =>
    sendJson<MarketingAudience>(`${base(eventId)}/audiences`, "POST", body, "Failed to create audience"),
  getAudience: (eventId: string, audienceId: string) =>
    getJson<MarketingAudienceDetail>(`${base(eventId)}/audiences/${audienceId}`, "Failed to load audience"),
  updateAudience: (eventId: string, audienceId: string, body: Record<string, unknown>) =>
    sendJson<MarketingAudience>(`${base(eventId)}/audiences/${audienceId}`, "PATCH", body, "Failed to update audience"),
  deleteAudience: (eventId: string, audienceId: string) =>
    deleteJson<{ deleted: boolean }>(`${base(eventId)}/audiences/${audienceId}`, "Failed to delete audience"),
  addRecipient: (eventId: string, audienceId: string, body: Record<string, unknown>) =>
    sendJson<MarketingAudienceRecipient>(
      `${base(eventId)}/audiences/${audienceId}/recipients`,
      "POST",
      body,
      "Failed to add recipient",
    ),
  updateRecipient: (eventId: string, audienceId: string, recipientId: string, body: Record<string, unknown>) =>
    sendJson<MarketingAudienceRecipient>(
      `${base(eventId)}/audiences/${audienceId}/recipients/${recipientId}`,
      "PATCH",
      body,
      "Failed to update recipient",
    ),
  deleteRecipient: (eventId: string, audienceId: string, recipientId: string) =>
    deleteJson<{ deleted: boolean }>(
      `${base(eventId)}/audiences/${audienceId}/recipients/${recipientId}`,
      "Failed to delete recipient",
    ),
  getEmailDefaults: (eventId: string) =>
    getJson<MarketingEmailDefaults>(`${base(eventId)}/defaults`, "Failed to load email defaults"),
  previewEmail: (eventId: string, body: Record<string, unknown>) =>
    sendJson<MarketingEmailPreview>(`${base(eventId)}/preview`, "POST", body, "Failed to preview email"),
  importRecipients: (eventId: string, audienceId: string, rows: unknown[]) =>
    sendJson<ImportRecipientsResult>(
      `${base(eventId)}/audiences/${audienceId}/recipients`,
      "POST",
      { rows },
      "Failed to import recipients",
    ),
  listEmailSends: (eventId: string) =>
    getJson<MarketingEmailSend[]>(`${base(eventId)}/sends`, "Failed to load email sends"),
  createEmailSend: (eventId: string, body: Record<string, unknown>) =>
    sendJson<MarketingEmailSend>(`${base(eventId)}/sends`, "POST", body, "Failed to create email send"),
  updateEmailSend: (eventId: string, sendId: string, body: Record<string, unknown>) =>
    sendJson<MarketingEmailSend>(`${base(eventId)}/sends/${sendId}`, "PATCH", body, "Failed to update email send"),
  submitEmailSendForApproval: (eventId: string, sendId: string, approverUserId: string) =>
    sendJson<MarketingEmailSend>(
      `${base(eventId)}/sends/${sendId}/approval`,
      "POST",
      { approverUserId },
      "Failed to send email for approval",
    ),
  approveEmailSend: (eventId: string, sendId: string) =>
    sendJson<MarketingEmailSend>(
      `${base(eventId)}/sends/${sendId}/approval/approve`,
      "POST",
      {},
      "Failed to approve email send",
    ),
  requestEmailSendChanges: (eventId: string, sendId: string, note: string) =>
    sendJson<MarketingEmailSend>(
      `${base(eventId)}/sends/${sendId}/approval/request-changes`,
      "POST",
      { note },
      "Failed to request email changes",
    ),
  rejectEmailSend: (eventId: string, sendId: string, note: string) =>
    sendJson<MarketingEmailSend>(
      `${base(eventId)}/sends/${sendId}/approval/reject`,
      "POST",
      { note },
      "Failed to reject email send",
    ),
  scheduleEmailSend: (eventId: string, sendId: string, scheduledSendAt: string) =>
    sendJson<MarketingEmailSend>(
      `${base(eventId)}/sends/${sendId}/schedule`,
      "POST",
      { scheduledSendAt },
      "Failed to schedule email send",
    ),
  rescheduleEmailSend: (eventId: string, sendId: string, scheduledSendAt: string) =>
    sendJson<MarketingEmailSend>(
      `${base(eventId)}/sends/${sendId}/reschedule`,
      "POST",
      { scheduledSendAt },
      "Failed to reschedule email send",
    ),
  cancelScheduledEmailSend: (eventId: string, sendId: string) =>
    sendJson<MarketingEmailSend>(
      `${base(eventId)}/sends/${sendId}/cancel`,
      "POST",
      {},
      "Failed to cancel scheduled email send",
    ),
  sendNow: (eventId: string, sendId: string) =>
    sendJson<SendNowResult>(`${base(eventId)}/sends/${sendId}/send`, "POST", {}, "Failed to send email"),
  retryFailedEmailSend: (eventId: string, sendId: string) =>
    sendJson<SendNowResult>(`${base(eventId)}/sends/${sendId}/retry`, "POST", {}, "Failed to retry email send"),
  listSuppressions: (eventId: string) =>
    getJson<MarketingSuppression[]>(`${base(eventId)}/suppressions`, "Failed to load suppressed recipients"),
  resubscribeSuppression: (eventId: string, suppressionId: string) =>
    sendJson<{ resubscribed: boolean; email: string; normalizedEmail: string }>(
      `${base(eventId)}/suppressions/${suppressionId}/resubscribe`,
      "POST",
      {},
      "Failed to resubscribe recipient",
    ),
};

// ----------------------------------------------------------------- visual tokens
// Reuse the OrcaOS readiness palette: amber = needs work, blue/purple = staged,
// green = active, slate = settled, rose/red = failed/at-risk.
export const CAMPAIGN_STATUS_META: Record<CampaignStatus, { label: string; className: string; dot?: boolean }> = {
  DRAFT: { label: "Draft", className: "border-slate-200 bg-slate-50 text-slate-600" },
  ACTIVE: { label: "Active", className: "border-emerald-200 bg-emerald-50 text-emerald-700", dot: true },
  PAUSED: { label: "Paused", className: "border-amber-200 bg-amber-50 text-amber-800" },
  COMPLETED: { label: "Complete", className: "border-slate-300 bg-slate-100 text-slate-700" },
  ARCHIVED: { label: "Archived", className: "border-slate-200 bg-slate-50 text-slate-500" },
};

export const SEND_STATUS_META: Record<EmailSendStatus, { label: string; className: string; dot?: boolean }> = {
  DRAFT: { label: "Draft", className: "border-slate-200 bg-slate-50 text-slate-600" },
  READY: { label: "Ready", className: "border-blue-200 bg-blue-50 text-blue-700" },
  SCHEDULED: { label: "Scheduled", className: "border-violet-200 bg-violet-50 text-violet-700" },
  SENDING: { label: "Sending", className: "border-blue-200 bg-blue-50 text-blue-700", dot: true },
  SENT: { label: "Sent", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  PARTIALLY_SENT: { label: "Partially sent", className: "border-amber-200 bg-amber-50 text-amber-800" },
  FAILED: { label: "Failed", className: "border-rose-200 bg-rose-50 text-rose-700" },
  CANCELED: { label: "Cancelled", className: "border-slate-200 bg-slate-50 text-slate-500" },
};

export const CAMPAIGN_STATUS_OPTIONS: CampaignStatus[] = ["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"];

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Convert a native <input type="date"> value (YYYY-MM-DD) to an ISO datetime
// string the API schema accepts, or null when empty.
export function dateInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function dateTimeInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

// Convert a stored ISO datetime to a <input type="date"> value for prefilling.
export function isoToDateInput(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function isoToDateTimeInput(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

// Escapes the five HTML-significant characters so planner-written copy can be
// safely wrapped in markup without injecting tags.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Turns plain planner copy into a simple, safe HTML body: blank lines become
// separate paragraphs and single newlines become line breaks. Used so planners
// can write in "Write copy" mode without touching HTML.
export function copyToHtml(copy: string): string {
  const trimmed = copy.trim();
  if (!trimmed) return "";
  return trimmed
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block.trim()).replace(/\n/g, "<br />")}</p>`)
    .join("\n");
}

export type ReadinessCheck = { label: string; ok: boolean; hint?: string };

export type SendReadiness = { checks: ReadinessCheck[]; ready: boolean; blockingReason: string | null };

// Single source of truth for "can this send go out". The form evaluates it from
// in-progress field state; the table evaluates it from a saved send so Send now
// is only offered when the server would accept it.
export function evaluateSendReadiness(input: {
  hasAudience: boolean;
  recipientCount: number;
  hasSubject: boolean;
  hasContent: boolean;
  fromEmailProvided: boolean;
}): SendReadiness {
  const checks: ReadinessCheck[] = [
    { label: "Audience selected", ok: input.hasAudience },
    {
      label: "Recipients available",
      ok: input.hasAudience && input.recipientCount > 0,
      hint: input.hasAudience ? `${input.recipientCount} in audience` : "Select an audience first",
    },
    { label: "Subject written", ok: input.hasSubject },
    { label: "Content added", ok: input.hasContent },
    {
      label: "Sender ready",
      ok: true,
      hint: input.fromEmailProvided ? undefined : "Using workspace default",
    },
  ];
  const firstBlock = checks.find((check) => !check.ok);
  return { checks, ready: !firstBlock, blockingReason: firstBlock?.label ?? null };
}

export function recipientName(recipient: MarketingAudienceRecipient): string {
  const name = [recipient.firstName, recipient.lastName].filter(Boolean).join(" ").trim();
  return name || "—";
}

// Returns a trimmed label only when it carries real meaning. Placeholder values
// (empty, whitespace, lone punctuation, or filler like "n/a"/"tbd") are dropped
// so we never surface question-marked or unclear copy.
export function meaningfulLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/[a-z0-9]/i.test(trimmed)) return null; // only punctuation, e.g. "?" or "—"
  if (["n/a", "na", "tbd", "tba", "unknown", "none"].includes(trimmed.toLowerCase())) return null;
  return trimmed;
}

// Derived secondary line for a campaign row: send-count phrasing plus an
// optional, meaningful audience label. Campaign = initiative; sends live inside.
export function campaignSummary(campaign: MarketingCampaign, sendCount: number): string {
  const sends =
    sendCount === 0 ? "No email sends yet" : sendCount === 1 ? "1 email send" : `${sendCount} email sends`;
  const audience = meaningfulLabel(campaign.audienceLabel);
  return audience ? `${sends} · Audience: ${audience}` : sends;
}

export function campaignChannelLabel(sendCount: number): "Email" {
  void sendCount;
  return "Email";
}

export function readableSubject(subject: string): string {
  return subject.trim().replace(/\s+/g, " ") || "Untitled email";
}

const MERGE_TOKEN_DISPLAY_LABELS: Record<string, string> = {
  eventName: "Event name",
  firstName: "First name",
  lastName: "Last name",
  company: "Company",
  title: "Title",
  registrationType: "Registration type",
  status: "Status",
  eventStartDate: "Event start date",
  eventEndDate: "Event end date",
};

function fallbackMergeTokenLabel(token: string): string {
  const spaced = token
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase() : "Merge field";
}

export function displayMarketingTemplateText(value: string | null | undefined, fallback = "Untitled email"): string {
  const readable = readableSubject(value ?? "");
  if (readable === "Untitled email") return fallback;
  return readable.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (_match, token: string) => {
    const label = MERGE_TOKEN_DISPLAY_LABELS[token] ?? fallbackMergeTokenLabel(token);
    return `[${label}]`;
  });
}

function subjectMatches(subject: string, pattern: RegExp): boolean {
  return pattern.test(subject.replace(/\{\{[^}]+\}\}/g, "").toLowerCase());
}

export function emailSendDisplayLabel(
  send: MarketingEmailSend,
  campaign?: Pick<MarketingCampaign, "name"> | null,
  audience?: Pick<MarketingAudience, "name"> | null,
): string {
  const subject = readableSubject(send.subject);
  if (subjectMatches(subject, /registration.*open|open.*registration/)) return "Registration launch";
  if (subjectMatches(subject, /early.?bird/)) return "Early bird reminder";
  if (subjectMatches(subject, /speaker|lineup|announced/)) return "Speaker announcement";
  if (subjectMatches(subject, /last chance|final reminder|closes soon/)) return "Last chance reminder";
  if (subjectMatches(subject, /update|latest|logistics/)) return "Event update";
  if (subjectMatches(subject, /welcome/)) return "Welcome email";
  if (subjectMatches(subject, /reminder/)) return "Reminder email";

  const campaignName = meaningfulLabel(campaign?.name);
  if (campaignName) return `${campaignName} email`;

  const audienceName = meaningfulLabel(audience?.name);
  if (audienceName) return `${audienceName} email`;

  return "Email send";
}

export function emailPerformanceLines(send: Pick<
  MarketingEmailSend,
  "deliveredCount" | "openCount" | "clickCount" | "bounceCount" | "unsubscribeCount"
>): [string, string] {
  return [
    `Delivered ${send.deliveredCount} · Opened ${send.openCount} · Clicked ${send.clickCount}`,
    `Bounced ${send.bounceCount} · Unsubscribed ${send.unsubscribeCount}`,
  ];
}

export function suppressedRecipientCount(
  send: Pick<MarketingEmailSend, "recipients">,
): number {
  return send.recipients?.filter((recipient) => recipient.providerStatus === "SUPPRESSED").length ?? 0;
}

export function recipientStatusLabel(status: MarketingRecipientProviderStatus): string {
  const labels: Record<MarketingRecipientProviderStatus, string> = {
    PENDING: "Pending",
    SENT: "Sent",
    DELIVERED: "Delivered",
    OPENED: "Opened",
    CLICKED: "Clicked",
    BOUNCED: "Bounced",
    DROPPED: "Dropped",
    SPAM_REPORTED: "Spam reported",
    UNSUBSCRIBED: "Unsubscribed",
    FAILED: "Failed",
    SUPPRESSED: "Suppressed / skipped",
  };
  return labels[status] ?? "Unknown";
}

const SUPPRESSION_REASON_LABELS: Record<MarketingSuppressionReason, string> = {
  BOUNCE: "Bounce",
  DROPPED: "Dropped",
  SPAM_REPORT: "Spam report",
  UNSUBSCRIBE: "Unsubscribed",
  GROUP_UNSUBSCRIBE: "Group unsubscribe",
  MANUAL: "Manual",
};

const SUPPRESSION_SOURCE_LABELS: Record<MarketingSuppressionSource, string> = {
  SENDGRID_WEBHOOK: "SendGrid webhook",
  MANUAL: "Planner/manual",
  IMPORT: "Import",
};

export function suppressionReasonLabel(suppression: Pick<MarketingSuppression, "reason">): string {
  return SUPPRESSION_REASON_LABELS[suppression.reason];
}

export function suppressionSourceLabel(
  suppression: Pick<MarketingSuppression, "reason" | "source">,
): string {
  if (suppression.reason === "UNSUBSCRIBE" && suppression.source === "MANUAL") {
    return "Recipient unsubscribe link";
  }
  return SUPPRESSION_SOURCE_LABELS[suppression.source];
}

export type EmailSendAction = "view" | "edit" | "sendNow" | "schedule" | "reschedule" | "cancel" | "retry";

export function emailSendApprovalBlocksSending(send: Pick<MarketingEmailSend, "approval">): boolean {
  return send.approval?.state === "PENDING" || send.approval?.state === "CHANGES_REQUESTED";
}

export function emailSendActions(send: MarketingEmailSend, readyToSend: boolean): EmailSendAction[] {
  if (emailSendApprovalBlocksSending(send)) return send.status === "DRAFT" || send.status === "READY" ? ["edit"] : ["view"];
  if (send.status === "DRAFT") return readyToSend ? ["edit", "sendNow", "schedule"] : ["edit"];
  if (send.status === "READY") return readyToSend ? ["edit", "sendNow", "schedule"] : ["edit"];
  if (send.status === "SCHEDULED") return ["view", "reschedule", "cancel"];
  if (send.status === "SENDING") return ["view"];
  if (send.status === "FAILED") return ["view", "retry"];
  return ["view"];
}

// "Feb 6 – Mar 1" when both dates exist; a single date when only one is set;
// "No date range" when neither is set.
export function formatDateRange(startDate: string | null, endDate: string | null): string {
  const hasStart = Boolean(startDate);
  const hasEnd = Boolean(endDate);
  if (hasStart && hasEnd) return `${formatDate(startDate)} – ${formatDate(endDate)}`;
  if (hasStart) return formatDate(startDate);
  if (hasEnd) return formatDate(endDate);
  return "No date range";
}
