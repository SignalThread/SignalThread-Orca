import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const WORKSPACE_SOURCE = path.join(
  process.cwd(),
  "app/(shell)/events/[eventId]/marketing/_components/marketing-workspace.tsx",
);
const CAMPAIGN_FORM_SOURCE = path.join(
  process.cwd(),
  "app/(shell)/events/[eventId]/marketing/_components/campaign-form.tsx",
);
const MARKETING_DATE_PICKER_SOURCE = path.join(
  process.cwd(),
  "app/(shell)/events/[eventId]/marketing/_components/marketing-date-picker.tsx",
);
const EMAIL_SEND_FORM_SOURCE = path.join(
  process.cwd(),
  "app/(shell)/events/[eventId]/marketing/_components/email-send-form.tsx",
);
const SCHEDULE_PICKER_SOURCE = path.join(
  process.cwd(),
  "app/(shell)/events/[eventId]/marketing/_components/marketing-schedule-picker.tsx",
);

function readWorkspace(): string {
  return readFileSync(WORKSPACE_SOURCE, "utf8");
}

function readCampaignForm(): string {
  return readFileSync(CAMPAIGN_FORM_SOURCE, "utf8");
}

function readMarketingDatePicker(): string {
  return readFileSync(MARKETING_DATE_PICKER_SOURCE, "utf8");
}

function readEmailSendForm(): string {
  return readFileSync(EMAIL_SEND_FORM_SOURCE, "utf8");
}

function readSchedulePicker(): string {
  return readFileSync(SCHEDULE_PICKER_SOURCE, "utf8");
}

function countOccurrences(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex);
  assert.notEqual(endIndex, -1, `Missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("Marketing header renders the primary command bar actions", () => {
  const source = readWorkspace();
  const header = sourceBetween(source, "<header className=", "</header>");

  assert.ok(header.includes("<Upload className=\"h-4 w-4\" /> Import audience"));
  assert.ok(header.includes("<Mail className=\"h-4 w-4\" /> New email"));
  assert.ok(header.includes("<Plus className=\"h-4 w-4\" /> New campaign"));
  assert.ok(header.indexOf("<Mail className=\"h-4 w-4\" /> New email") < header.indexOf("<Plus className=\"h-4 w-4\" /> New campaign"));
  assert.ok(header.indexOf("<Upload className=\"h-4 w-4\" /> Import audience") < header.indexOf("<Plus className=\"h-4 w-4\" /> New campaign"));
  assert.ok(header.includes("setShowSendForm(true)"));
  assert.equal(countOccurrences(source, "<Upload className=\"h-4 w-4\" /> Import audience"), 1);
  assert.equal(countOccurrences(source, "<Mail className=\"h-4 w-4\" /> New email"), 1);
  assert.equal(countOccurrences(source, "<Plus className=\"h-4 w-4\" /> New campaign"), 1);
  assert.equal(source.includes("New email send"), false);
  assert.equal(source.includes("Campaign work area"), false);
  assert.equal(source.includes("Open work area"), false);
});

test("marketing workspace header stays compact instead of rendering a hero card", () => {
  const source = readWorkspace();

  assert.equal(source.includes("Email workspace"), false);
  assert.equal(source.includes("Build campaign initiatives"), false);
  assert.equal(source.includes("rounded-3xl"), false);
  assert.ok(source.includes("countLabel(campaigns.length, \"campaign\")"));
  assert.ok(source.includes("countLabel(audiences.length, \"audience\")"));
  assert.ok(source.includes("countLabel(sends.length, \"email send\")"));
});

test("overview panels use one equal-height two-column card grid", () => {
  const source = readWorkspace();
  const overviewTab = sourceBetween(source, "function OverviewTab", "function CampaignsTab");

  assert.ok(source.includes("function MarketingOverviewCard"));
  assert.ok(source.includes("function OperationalKpiCard"));
  assert.ok(overviewTab.includes("Campaign activity"));
  assert.ok(overviewTab.includes("Email pipeline"));
  assert.ok(overviewTab.includes("Send outcomes"));
  assert.equal(overviewTab.includes("Audience readiness"), false);
  assert.ok(source.includes("function SendOutcomeFunnel"));
  assert.ok(overviewTab.includes("Pending approval"));
  assert.equal(overviewTab.includes("sent / failed / partial"), false);
  assert.ok(overviewTab.includes("grid grid-cols-1 gap-4 xl:grid-cols-3"));
  assert.ok(source.includes("grid items-stretch gap-4 lg:grid-cols-2"));
  assert.ok(source.includes("min-h-[360px]"));
  assert.ok(source.includes("lg:h-[360px]"));
  assert.ok(source.includes("upcomingItems.slice(0, 3)"));
  assert.ok(source.includes("campaigns.slice(0, 3)"));
  assert.ok(source.includes("sends.slice(0, 3)"));
});

test("campaigns tab renders one full-width campaign surface without the rejected details panel", () => {
  const source = readWorkspace();

  assert.equal(source.includes("title=\"Campaign details\""), false);
  assert.equal(source.includes("Select a campaign"), false);
  assert.equal(source.includes("CampaignWorkPanel"), false);
  assert.equal(source.includes("AudienceLibraryPanel"), false);
  assert.equal(source.includes("aria-selected={isSelected}"), false);
  assert.ok(
    source.includes(
      "<CampaignsTable",
    ),
  );
  assert.ok(source.includes("onAddEmail={onAddEmail}"));
  assert.ok(source.includes("onViewSends={onViewCampaignSends}"));
  assert.ok(source.includes("table className=\"w-full min-w-[1120px]"));
  assert.ok(source.includes("onClick={() => onEdit(campaign)}"));
});

test("campaign rows expose add email and view sends actions", () => {
  const source = readWorkspace();
  const campaignsTab = sourceBetween(source, "function CampaignsTab", "function CalendarTab");
  const campaignsTable = sourceBetween(source, "function CampaignsTable", "function SendsTable");
  const performanceTab = sourceBetween(source, "function PerformanceTab", "function PerformanceMetricCard");

  assert.ok(campaignsTab.includes("onAddEmail"));
  assert.ok(campaignsTab.includes("onViewCampaignSends"));
  assert.ok(source.includes("setDefaultSendCampaignId(campaign.id)"));
  assert.ok(source.includes("setShowSendForm(true)"));
  assert.ok(source.includes('setTab("performance")'));
  assert.ok(campaignsTable.includes('aria-label="Add email to campaign"'));
  assert.ok(campaignsTable.includes('title="Add email to campaign"'));
  assert.ok(campaignsTable.includes('aria-label="View campaign"'));
  assert.ok(campaignsTable.includes('title="View campaign"'));
  assert.ok(campaignsTable.includes('aria-label="Edit campaign"'));
  assert.ok(campaignsTable.includes('title="Edit campaign"'));
  assert.ok(campaignsTable.includes("aria-label={`View sends for ${campaign.name}`}"));
  assert.ok(campaignsTable.includes("w-[148px]"));
  assert.ok(campaignsTable.includes("min-w-[112px]"));
  assert.equal(campaignsTable.includes("> Add email"), false);
  assert.equal(campaignsTable.includes(">Add email<"), false);
  assert.ok(campaignsTable.includes("onViewSends(campaign)"));
  assert.ok(campaignsTable.includes("event.stopPropagation()"));
  assert.ok(performanceTab.includes("campaignFilterId"));
  assert.ok(performanceTab.includes("campaignScopedSends"));
  assert.ok(performanceTab.includes("Showing sends for"));
  assert.ok(performanceTab.includes("Show all sends"));
  assert.ok(performanceTab.includes("No email sends for this campaign yet."));
});

test("campaign form shows Email as active and future channels as disabled planned options", () => {
  const source = readCampaignForm();
  const channelSection = sourceBetween(source, '<h3 className="text-[13px] font-semibold text-slate-900">Channel</h3>', "</section>");

  assert.ok(source.includes("type CampaignChannelOption"));
  assert.ok(source.includes('id: "email"'));
  assert.ok(source.includes('id: "sms"'));
  assert.ok(source.includes('id: "push"'));
  assert.ok(source.includes('id: "social"'));
  assert.ok(source.includes('id: "whatsapp"'));
  assert.ok(source.includes('const ACTIVE_CAMPAIGN_CHANNEL = CAMPAIGN_CHANNEL_OPTIONS.find((channel) => channel.id === "email")!'));
  assert.ok(source.includes('const PLANNED_CAMPAIGN_CHANNELS = CAMPAIGN_CHANNEL_OPTIONS.filter((channel) => channel.status === "comingLater")'));
  assert.ok(source.includes("Active channel"));
  assert.ok(source.includes("Coming later"));
  assert.ok(source.includes("cursor-not-allowed"));
  assert.ok(source.includes('aria-disabled="true"'));
  assert.ok(source.includes("ACTIVE_CAMPAIGN_CHANNEL.label"));
  assert.equal(channelSection.includes("<select"), false);
  assert.equal(channelSection.includes("Channel type"), false);
  assert.equal(channelSection.includes("SMS sending"), false);
});

test("Marketing workspace supports Directory audience deep-links for view and campaign creation", () => {
  const workspace = readWorkspace();
  const campaignForm = readCampaignForm();

  assert.ok(workspace.includes('searchParams.get("audienceId")'));
  assert.ok(workspace.includes('setTab("campaigns")'));
  assert.ok(workspace.includes('searchParams.get("createCampaignFromAudience")'));
  assert.ok(workspace.includes("setDefaultCampaignAudienceLabel(audience.name)"));
  assert.ok(workspace.includes("setShowCampaignForm(true)"));
  assert.ok(workspace.includes("initialAudienceLabel={defaultCampaignAudienceLabel}"));
  assert.ok(campaignForm.includes("initialAudienceLabel?: string | null"));
  assert.ok(campaignForm.includes("campaign?.audienceLabel ?? initialAudienceLabel ?? \"\""));
});

test("upcoming campaign dates treat active in-window campaigns as in progress instead of overdue", () => {
  const source = readWorkspace();

  assert.ok(source.includes("function isCampaignInProgress"));
  assert.ok(source.includes('if (campaign.status !== "ACTIVE" || !campaign.startDate) return false;'));
  assert.ok(source.includes('if (campaign.status === "DRAFT" && compareMarketingDateToDay(campaign.startDate, today) < 0) return "overdue";'));
  assert.ok(source.includes('return campaignStartItemState(campaign, today) === "inProgress" ? "Campaign started" : "Campaign starts";'));
  assert.ok(source.includes('item.state === "overdue" ? "Overdue · " : item.state === "inProgress" ? "In progress · " : ""'));
  assert.ok(source.includes('item.state === "overdue" || item.state === "inProgress"'));
  assert.equal(source.includes('overdue: new Date(campaign.startDate) < now && campaign.status !== "COMPLETED" && campaign.status !== "ARCHIVED"'), false);
});

test("marketing date picker portals above the modal and repositions within the viewport", () => {
  const source = readMarketingDatePicker();

  assert.ok(source.includes("createPortal"));
  assert.ok(source.includes("document.body"));
  assert.ok(source.includes('className="fixed z-[70] w-[294px]'));
  assert.ok(source.includes("VIEWPORT_PADDING = 16"));
  assert.ok(source.includes("POPOVER_OFFSET = 8"));
  assert.ok(source.includes("window.addEventListener(\"resize\", updatePopoverPosition)"));
  assert.ok(source.includes("window.addEventListener(\"scroll\", updatePopoverPosition, true)"));
  assert.ok(source.includes("const showAbove = availableBelow < POPOVER_HEIGHT && availableAbove > availableBelow;"));
  assert.ok(source.includes("Math.min(Math.max(unclampedLeft, VIEWPORT_PADDING), maxLeft)"));
  assert.ok(source.includes("document.addEventListener(\"mousedown\", handlePointerDown)"));
  assert.equal(source.includes('className="absolute z-20 mt-2 w-[294px]'), false);
});

test("performance tab is a single flow without the tracking status side panel", () => {
  const source = readWorkspace();
  const performanceTab = sourceBetween(source, "function PerformanceTab", "function PerformanceMetricCard");

  assert.equal(performanceTab.includes("Tracking status"), false);
  assert.equal(performanceTab.includes("xl:grid-cols-[1fr_300px]"), false);
  assert.equal(performanceTab.includes("Metrics available today"), false);
  assert.equal(performanceTab.includes("manual KPI"), false);
  assert.equal(performanceTab.includes("manual tracking"), false);
  assert.equal(performanceTab.includes("fake rates"), false);
  assert.equal(performanceTab.includes("New email"), false);
  assert.equal(performanceTab.includes("onNewSend"), false);
  assert.ok(performanceTab.includes("grid gap-3 md:grid-cols-2 xl:grid-cols-5"));
  assert.ok(performanceTab.includes("useState<PerformanceFilterKey | null>(null)"));
  assert.ok(performanceTab.includes("function toggleFilter(filter: PerformanceFilterKey)"));
  assert.ok(performanceTab.includes("if (current === filter) return null"));
  assert.ok(performanceTab.includes("filterPerformanceSends(campaignScopedSends, activeFilter, outcomeFilter)"));
  assert.ok(performanceTab.includes("Active filter:"));
  assert.ok(performanceTab.includes("Clear filter"));
  assert.ok(performanceTab.includes('aria-pressed={outcomeFilter === option}'));
  assert.ok(performanceTab.includes('active={activeFilter === "sent-outcomes"}'));
  assert.ok(performanceTab.includes('active={activeFilter === "recipients"}'));
  assert.ok(performanceTab.includes('active={activeFilter === "delivery"}'));
  assert.ok(performanceTab.includes('active={activeFilter === "activity"}'));
  assert.ok(performanceTab.includes('active={activeFilter === "unsubscribed"}'));
  assert.ok(performanceTab.includes("sends={filteredSends}"));
  assert.equal(performanceTab.includes("Webhook tracking is not connected yet"), false);
  assert.equal(
    performanceTab.includes("Delivery and engagement metrics populate after SendGrid posts webhook events for sent emails."),
    false,
  );
  assert.ok(performanceTab.includes("<PerformanceSendHistoryTable"));
});

test("performance card filters use real send fields and honest empty states", () => {
  const source = readWorkspace();
  const filterHelper = sourceBetween(source, "function filterPerformanceSends", "function PerformanceTab");

  assert.ok(filterHelper.includes('activeFilter === "sent-outcomes"'));
  assert.ok(filterHelper.includes('"SENT", "FAILED", "PARTIALLY_SENT"'));
  assert.ok(filterHelper.includes("send.recipientCount > 0"));
  assert.ok(filterHelper.includes("b.recipientCount - a.recipientCount"));
  assert.ok(filterHelper.includes("send.deliveredCount > 0 || send.openCount > 0"));
  assert.ok(filterHelper.includes("send.clickCount > 0 || send.bounceCount > 0"));
  assert.ok(filterHelper.includes("send.unsubscribeCount > 0"));
  assert.ok(filterHelper.includes("No webhook delivery/open data is available yet."));
  assert.ok(filterHelper.includes("No click or bounce activity recorded yet."));
  assert.ok(filterHelper.includes("No unsubscribe activity recorded yet."));
  assert.equal(filterHelper.includes("rate"), false);
  assert.equal(filterHelper.includes("trend"), false);
  assert.equal(filterHelper.includes("benchmark"), false);
});

test("performance send history table uses a grouped funnel strip and compact issue summary", () => {
  const source = readWorkspace();
  const table = sourceBetween(source, "function PerformanceSendHistoryTable", "function MiniMetric");

  assert.ok(source.includes("function EmailSendPerformanceStrip"));
  assert.ok(source.includes("function EmailSendIconAction"));
  assert.ok(table.includes("table className=\"w-full min-w-[920px]"));
  assert.ok(table.includes("message={emptyMessage}"));
  assert.equal(table.includes("rounded-xl border border-slate-100 bg-slate-50/70"), false);
  assert.ok(table.includes("<th className=\"w-[30%] px-4 py-3\">Email send</th>"));
  assert.ok(table.includes("<th className=\"px-4 py-3\">Performance</th>"));
  assert.equal(table.includes("<th className=\"px-4 py-3\">Recipients</th>"), false);
  assert.equal(table.includes("Subject template:"), false);
  assert.equal(table.includes("<div>{performance[0]}</div>"), false);
  assert.equal(table.includes("<div className=\"text-slate-500\">{performance[1]}</div>"), false);
  assert.ok(source.includes("const funnelMetrics"));
  assert.ok(source.includes('{ label: "Delivered", value: send.deliveredCount'));
  assert.ok(source.includes('{ label: "Opened", value: send.openCount'));
  assert.ok(source.includes('{ label: "Clicked", value: send.clickCount'));
  assert.ok(source.includes("const issueMetrics"));
  assert.ok(source.includes('{ label: "Bounced", value: send.bounceCount'));
  assert.ok(source.includes('{ label: "Unsubscribed", value: send.unsubscribeCount'));
  assert.ok(source.includes('{ label: "Suppressed", value: suppressedCount'));
  assert.ok(source.includes("issueCount > 0 ? \"Issues\" : \"No issues\""));
  assert.ok(table.includes("<EmailSendPerformanceStrip send={send} />"));
  assert.equal(source.includes("function EmailSendMetricPills"), false);
  assert.ok(source.includes("aria-label={meta.label}"));
  assert.ok(source.includes("title={meta.label}"));
  assert.ok(source.includes("label: \"View send\""));
  assert.ok(source.includes("label: \"Reschedule send\""));
  assert.ok(source.includes("label: \"Cancel send\""));
  assert.ok(table.includes("reschedule: () => onReschedule(send)"));
  assert.ok(table.includes("cancel: () => onCancel(send)"));
  assert.ok(table.includes("retry: () => onRetry(send)"));
  assert.equal(table.includes("actionLabel=\"New email"), false);
  assert.equal(table.includes("onAction="), false);
  assert.equal(table.includes("<td className=\"px-4 py-3 text-slate-400\">—</td>"), false);
  assert.equal(table.includes("Duplicate"), false);
});

test("compliance tab renders real suppressions with resubscribe action and honest empty state", () => {
  const source = readWorkspace();
  const complianceTab = sourceBetween(source, "function ComplianceTab", "function filterPerformanceSends");

  assert.ok(source.includes('type TabKey = "overview" | "campaigns" | "calendar" | "performance" | "compliance"'));
  assert.ok(source.includes('{ key: "compliance", label: "Compliance", icon: ShieldCheck }'));
  assert.ok(source.includes("marketingApi.listSuppressions(eventId)"));
  assert.ok(source.includes("marketingApi.resubscribeSuppression(eventId, suppression.id)"));
  assert.ok(source.includes("Resubscribe"));
  assert.ok(source.includes("future marketing emails for this event only"));
  assert.ok(
    complianceTab.includes(
      "Recipients who unsubscribe, bounce, or report spam will appear here for this event.",
    ),
  );
  assert.ok(complianceTab.includes("suppressions.map((suppression)"));
  assert.ok(complianceTab.includes("suppressionReasonLabel(suppression)"));
  assert.ok(complianceTab.includes("suppressionSourceLabel(suppression)"));
  assert.ok(complianceTab.includes("formatDateTime(suppression.createdAt)"));
  assert.equal(complianceTab.includes("Preference"), false);
  assert.equal(complianceTab.includes("Global"), false);
  assert.equal(complianceTab.includes("fake"), false);
});

test("performance metric cards are accessible interactive controls", () => {
  const source = readWorkspace();
  const card = sourceBetween(source, "function PerformanceMetricCard", "function PerformanceSendHistoryTable");

  assert.ok(card.includes("<button"));
  assert.ok(card.includes("type=\"button\""));
  assert.ok(card.includes("onClick={onClick}"));
  assert.ok(card.includes("aria-pressed={active}"));
  assert.ok(card.includes("hover:-translate-y-0.5"));
  assert.ok(card.includes("focus:ring-2"));
  assert.ok(card.includes("active ?"));
  assert.equal(card.includes("<article"), false);
});

test("email send composer uses app-styled schedule date and time controls", () => {
  const source = readEmailSendForm();
  const picker = readSchedulePicker();

  assert.equal(source.includes('type="datetime-local"'), false);
  assert.equal(picker.includes('type="datetime-local"'), false);
  assert.ok(source.includes("<MarketingSchedulePicker"));
  assert.ok(picker.includes("MarketingDatePicker"));
  assert.ok(picker.includes("<select"));
  assert.ok(picker.includes("scheduleTimeOptions(time)"));
  assert.ok(source.includes("const timezoneLabel = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone"));
  assert.ok(source.includes("async function handleSchedule()"));
  assert.ok(source.includes("schedulePartsToIso(plannedSendDate, plannedSendTime)"));
  assert.ok(source.includes("new Date(scheduledAt).getTime() <= Date.now()"));
  assert.ok(source.includes("marketingApi.scheduleEmailSend(eventId, saved.id, scheduledAt)"));
  assert.ok(source.includes("Schedule send"));
  assert.equal(source.includes("Planning reference only"), false);
  assert.equal(source.includes("Orca does not send automatically"), false);
});

test("email send composer supports task-backed approval before send or schedule", () => {
  const source = readEmailSendForm();
  const workspace = readWorkspace();

  assert.ok(source.includes('import { listTaskAssignees, type TaskAssignableUser } from "@/components/tasks/task-api";'));
  assert.ok(source.includes("marketingApi.submitEmailSendForApproval(eventId, saved.id, approverUserId)"));
  assert.ok(source.includes("marketingApi.sendNow(eventId, saved.id)"));
  assert.ok(source.includes("marketingApi.approveEmailSend(eventId, saved.id)"));
  assert.ok(source.includes("marketingApi.requestEmailSendChanges(eventId, saved.id, note.trim())"));
  assert.ok(source.includes("marketingApi.rejectEmailSend(eventId, saved.id, note.trim())"));
  assert.ok(source.includes("Pending approval from"));
  assert.ok(source.includes("Approved by"));
  assert.ok(source.includes("Changes requested."));
  assert.ok(source.includes("Choose an approver before sending this email for approval."));
  assert.ok(source.includes("Send for approval"));
  assert.ok(source.indexOf("onClick={handleSubmitForApproval}") < source.indexOf("onClick={handleSave}"));
  assert.ok(source.includes("approvalBlocksSending"));
  assert.ok(workspace.includes('const searchParams = useSearchParams();'));
  assert.ok(workspace.includes('searchParams.get("emailSendId")'));
  assert.ok(workspace.includes('setShowSendForm(true);'));
  assert.ok(workspace.includes('label: "Pending approval"'));
  assert.ok(workspace.includes('label: "Approved"'));
  assert.ok(workspace.includes('label: "Changes requested"'));
  assert.ok(workspace.includes('emailSendApprovalBlocksSending(send)'));
});

test("personalize popover portals near the trigger and keeps merge-field content visible", () => {
  const source = readEmailSendForm();
  const picker = sourceBetween(source, "function PersonalizePicker", "function EmailPreviewPanel");

  assert.ok(source.includes("PERSONALIZE_POPOVER_WIDTH = 320"));
  assert.ok(source.includes("PERSONALIZE_POPOVER_MAX_HEIGHT = 360"));
  assert.ok(picker.includes("createPortal"));
  assert.ok(picker.includes("document.body"));
  assert.ok(picker.includes('className="fixed z-[70] w-[320px]'));
  assert.ok(picker.includes("window.addEventListener(\"resize\", updatePopoverPosition)"));
  assert.ok(picker.includes("window.addEventListener(\"scroll\", updatePopoverPosition, true)"));
  assert.ok(picker.includes("max-h-[300px] space-y-3 overflow-y-auto"));
  assert.ok(picker.includes("Choose a friendly field to insert into the active editor."));
  assert.ok(picker.includes("MERGE_FIELD_GROUPS.map((group) => ("));
  assert.ok(picker.includes("onClick={() => onSelect(field.token)}"));
  assert.equal(picker.includes('className="absolute right-0 z-30 mt-2 w-[320px]'), false);
});

test("schedule and reschedule table actions use the app-styled picker modal", () => {
  const source = readWorkspace();
  const dialog = sourceBetween(source, "function ScheduleSendDialog", "function CampaignsTable");

  assert.equal(source.includes("window.prompt"), false);
  assert.ok(source.includes("setScheduleDialog({ send, mode: \"schedule\" })"));
  assert.ok(source.includes("setScheduleDialog({ send, mode: \"reschedule\" })"));
  assert.ok(dialog.includes("<MarketingSchedulePicker"));
  assert.ok(dialog.includes("schedulePartsToIso(date, time)"));
  assert.ok(dialog.includes("new Date(scheduledAt).getTime() <= Date.now()"));
  assert.ok(dialog.includes("mode === \"schedule\" ? \"Schedule send\" : \"Reschedule send\""));
  assert.ok(source.includes("marketingApi.rescheduleEmailSend(eventId, send.id, scheduledAt)"));
});

test("email send detail modal shows stored recipient delivery statuses when available", () => {
  const source = readWorkspace();
  const modal = sourceBetween(source, "function EmailSendDetailsModal", "function DetailItem");

  assert.ok(modal.includes("Recipient delivery"));
  assert.ok(modal.includes("send.recipients && send.recipients.length > 0"));
  assert.ok(modal.includes("recipientStatusLabel(recipient.providerStatus)"));
  assert.ok(modal.includes("suppressedRecipientCount(send)"));
  assert.ok(modal.includes("Skipped suppressed"));
  assert.equal(modal.includes("recipient.providerStatus.replaceAll"), false);
  assert.ok(modal.includes("recipient.clickedAt"));
  assert.ok(modal.includes("recipient.openedAt"));
  assert.ok(modal.includes("recipient.deliveredAt"));
  assert.ok(modal.includes("recipient.bouncedAt"));
  assert.ok(modal.includes("recipient.unsubscribedAt"));
});

test("marketing workspace avoids fake compliance panels and stale compliance banners", () => {
  const source = readWorkspace();
  for (const forbidden of [
    "fake compliance",
    "Compliance score",
    "Preference center",
    "Global suppression",
    "Compliance settings",
    "Coming soon",
  ]) {
    assert.equal(source.includes(forbidden), false);
  }
});

test("calendar tab defaults to a real month grid view", () => {
  const source = readWorkspace();
  const calendarTab = sourceBetween(source, "function CalendarTab", "function CalendarLegendSwatch");

  assert.ok(source.includes("type CalendarView = \"month\" | \"agenda\""));
  assert.ok(source.includes("const WEEKDAY_LABELS = [\"Sun\", \"Mon\", \"Tue\", \"Wed\", \"Thu\", \"Fri\", \"Sat\"]"));
  assert.ok(source.includes("function buildMonthGrid"));
  assert.ok(calendarTab.includes("useState<CalendarView>(\"month\")"));
  assert.ok(calendarTab.includes("calendarView === \"month\" ?"));
  assert.equal(calendarTab.includes("New email"), false);
  assert.equal(calendarTab.includes("onNewSend"), false);
  assert.ok(calendarTab.includes("grid grid-cols-7"));
  assert.ok(source.includes("calendarKind: \"campaign-start\""));
  assert.ok(source.includes("calendarKind: \"campaign-end\""));
  assert.ok(source.includes("calendarKind: \"send-target\""));
  assert.ok(source.includes("calendarKind: \"send-sent\""));
  assert.ok(source.includes("No campaign or email dates this month."));
  assert.ok(source.includes("Campaign range"));
  assert.ok(source.includes("Sent email"));
  assert.ok(source.includes("onClick={range.onClick}"));
  assert.ok(source.includes("onClick={item.onClick}"));
});

test("calendar view toggle switches between Month and Agenda without dead controls", () => {
  const source = readWorkspace();
  const calendarTab = sourceBetween(source, "function CalendarTab", "function CalendarLegendSwatch");

  assert.ok(calendarTab.includes('aria-label="Calendar view"'));
  assert.ok(calendarTab.includes("([\"month\", \"agenda\"] as const).map((view) => ("));
  assert.ok(calendarTab.includes("onClick={() => setCalendarView(view)}"));
  assert.ok(calendarTab.includes("aria-pressed={calendarView === view}"));
  assert.ok(calendarTab.includes('{view === "month" ? "Month" : "Agenda"}'));
  assert.equal(calendarTab.includes("<select"), false);
  assert.equal(calendarTab.includes("<option"), false);
  assert.equal(calendarTab.includes("value={calendarView}"), false);
});

test("calendar Month view renders the grid and not the agenda list", () => {
  const source = readWorkspace();
  const calendarTab = sourceBetween(source, "function CalendarTab", "function CalendarLegendSwatch");
  const monthBranch = sourceBetween(calendarTab, '{calendarView === "month" ? (', ") : (");

  assert.ok(monthBranch.includes("grid grid-cols-7"));
  assert.ok(monthBranch.includes("WEEKDAY_LABELS.map"));
  assert.ok(monthBranch.includes("CalendarItemPill"));
  assert.ok(monthBranch.includes('.filter((item) => item.kind === "send")'));
  assert.ok(monthBranch.includes("No campaign or email dates this month."));
  assert.equal(monthBranch.includes("<h3 className=\"text-[13px] font-semibold text-slate-950\">Agenda</h3>"), false);
  assert.equal(monthBranch.includes("No agenda items for this month."), false);
  assert.equal(calendarTab.includes("Upcoming from this month"), false);
});

test("calendar Month campaign windows render connected labelled ribbons separate from send chips", () => {
  const source = readWorkspace();
  const rangeModel = sourceBetween(source, "type CalendarRangeSegment = {", "type PerformanceTotals = {");
  const rangeHelper = sourceBetween(source, "function getRangeSegmentStyles", "function StatusBadge");
  const rangeBuilder = sourceBetween(source, "const rangeSegmentsByDate = useMemo(() => {", "const visibleMonthItems = useMemo");
  const calendarTab = sourceBetween(source, "function CalendarTab", "function CalendarLegendSwatch");
  const monthBranch = sourceBetween(calendarTab, '{calendarView === "month" ? (', ") : (");

  assert.ok(rangeModel.includes('kind: "campaign-window";'));
  assert.ok(rangeModel.includes("lane: number;"));
  assert.ok(source.includes("const CAMPAIGN_RANGE_TONES"));
  assert.ok(source.includes("function campaignRangeTone"));
  assert.ok(rangeHelper.includes("-mr-2 border-r-0"));
  assert.ok(rangeHelper.includes("-mx-2 border-x-0"));
  assert.ok(rangeHelper.includes("-ml-2 border-l-0"));
  assert.ok(rangeBuilder.includes("campaignWindows"));
  assert.ok(rangeBuilder.includes("label: campaign.name || \"Untitled campaign\""));
  assert.ok(rangeBuilder.includes("starts: isSameDate(day.date, rangeStart) || day.date.getDay() === 0"));
  assert.ok(rangeBuilder.includes("ends: isSameDate(day.date, rangeEnd) || day.date.getDay() === 6"));
  assert.ok(rangeBuilder.includes(".sort((a, b) => a.lane - b.lane)"));
  assert.ok(monthBranch.includes("{range.label}"));
  assert.equal(monthBranch.includes('{"\\u00A0"}'), false);
  assert.equal(monthBranch.includes('range.starts || day.date.getDay() === 0 ? range.label : "\\u00A0"'), false);
});

test("calendar Agenda view renders grouped list rows and hides the month grid", () => {
  const source = readWorkspace();
  const calendarTab = sourceBetween(source, "function CalendarTab", "function CalendarLegendSwatch");
  const agendaBranch = sourceBetween(calendarTab, ") : (", "</div>\n        )}");

  assert.ok(calendarTab.includes("const agendaGroups = useMemo(() => {"));
  assert.ok(calendarTab.includes("groups.set(key, [...(groups.get(key) ?? []), item]);"));
  assert.ok(agendaBranch.includes("<h3 className=\"text-[13px] font-semibold text-slate-950\">Agenda</h3>"));
  assert.ok(agendaBranch.includes("agendaGroups.map((group) => ("));
  assert.ok(agendaBranch.includes("formatDate(group.isoDate)"));
  assert.ok(agendaBranch.includes("group.items.map((item) => ("));
  assert.ok(agendaBranch.includes("No agenda items for this month."));
  assert.equal(agendaBranch.includes("grid grid-cols-7"), false);
  assert.equal(agendaBranch.includes("WEEKDAY_LABELS.map"), false);
});
