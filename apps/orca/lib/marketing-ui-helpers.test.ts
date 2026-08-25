import assert from "node:assert/strict";
import test from "node:test";
import {
  campaignChannelLabel,
  displayMarketingTemplateText,
  emailPerformanceLines,
  emailSendApprovalBlocksSending,
  emailSendActions,
  emailSendDisplayLabel,
  recipientStatusLabel,
  readableSubject,
  suppressionReasonLabel,
  suppressionSourceLabel,
  suppressedRecipientCount,
  type MarketingAudience,
  type MarketingCampaign,
  type MarketingEmailSend,
  type MarketingSuppression,
} from "../app/(shell)/events/[eventId]/marketing/_components/marketing-shared";
import {
  formatScheduleTimeLabel,
  schedulePartsFromIso,
  schedulePartsToIso,
  scheduleTimeOptions,
} from "../app/(shell)/events/[eventId]/marketing/_components/marketing-schedule-picker";

const baseSend: MarketingEmailSend = {
  id: "send_1",
  eventId: "event_1",
  campaignId: "campaign_1",
  audienceId: "audience_1",
  ownerUserId: null,
  subject: "Registration is now open for {{eventName}}",
  previewText: null,
  bodyHtml: null,
  bodyText: "Hello",
  fromEmail: "from@example.com",
  replyTo: null,
  registrationUrl: null,
  utmUrl: null,
  status: "DRAFT",
  scheduledSendAt: null,
  actualSentAt: null,
  canceledAt: null,
  canceledByUserId: null,
  failureReason: null,
  sendAttemptCount: 0,
  lastAttemptedAt: null,
  sendgridBatchId: null,
  recipientCount: 10,
  deliveredCount: 8,
  openCount: 4,
  clickCount: 2,
  bounceCount: 1,
  unsubscribeCount: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const campaign: Pick<MarketingCampaign, "name"> = { name: "Spring Campaign" };
const audience: Pick<MarketingAudience, "name"> = { name: "VIP Guests" };
const baseSuppression: MarketingSuppression = {
  id: "suppression_1",
  eventId: "event_1",
  email: "recipient@example.com",
  normalizedEmail: "recipient@example.com",
  reason: "UNSUBSCRIBE",
  source: "MANUAL",
  createdAt: "2026-01-01T00:00:00.000Z",
};

test("email send display labels do not expose subject as the primary row title", () => {
  assert.equal(emailSendDisplayLabel(baseSend, campaign, audience), "Registration launch");
  assert.equal(
    emailSendDisplayLabel({ ...baseSend, subject: "A very custom update", campaignId: "campaign_1" }, campaign, audience),
    "Event update",
  );
  assert.equal(
    emailSendDisplayLabel({ ...baseSend, subject: "Board dinner invitation", campaignId: "campaign_1" }, campaign, audience),
    "Spring Campaign email",
  );
  assert.equal(
    emailSendDisplayLabel({ ...baseSend, subject: "   ", campaignId: "campaign_1" }, null, audience),
    "VIP Guests email",
  );
});

test("email performance text is planner-readable", () => {
  assert.deepEqual(emailPerformanceLines(baseSend), [
    "Delivered 8 · Opened 4 · Clicked 2",
    "Bounced 1 · Unsubscribed 0",
  ]);
});

test("email send actions never require a dash-only action cell", () => {
  assert.deepEqual(emailSendActions({ ...baseSend, status: "DRAFT" }, true), ["edit", "sendNow", "schedule"]);
  assert.deepEqual(emailSendActions({ ...baseSend, status: "DRAFT" }, false), ["edit"]);
  assert.deepEqual(emailSendActions({ ...baseSend, status: "SCHEDULED" }, false), ["view", "reschedule", "cancel"]);
  assert.deepEqual(emailSendActions({ ...baseSend, status: "SENDING" }, false), ["view"]);
  assert.deepEqual(emailSendActions({ ...baseSend, status: "SENT" }, false), ["view"]);
  assert.deepEqual(emailSendActions({ ...baseSend, status: "FAILED" }, false), ["view", "retry"]);
  assert.deepEqual(emailSendActions({ ...baseSend, status: "CANCELED" }, false), ["view"]);
  assert.equal(
    emailSendApprovalBlocksSending({ ...baseSend, approval: { state: "PENDING", taskId: "task", assigneeUserIds: [], requesterUserId: null, decidedByUserId: null, decidedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" } }),
    true,
  );
  assert.deepEqual(
    emailSendActions({ ...baseSend, status: "READY", approval: { state: "PENDING", taskId: "task", assigneeUserIds: [], requesterUserId: null, decidedByUserId: null, decidedAt: null, updatedAt: "2026-01-01T00:00:00.000Z" } }, true),
    ["edit"],
  );
});

test("recipient status labels are clear for delivery, suppression, and failure states", () => {
  assert.equal(recipientStatusLabel("DELIVERED"), "Delivered");
  assert.equal(recipientStatusLabel("OPENED"), "Opened");
  assert.equal(recipientStatusLabel("CLICKED"), "Clicked");
  assert.equal(recipientStatusLabel("BOUNCED"), "Bounced");
  assert.equal(recipientStatusLabel("DROPPED"), "Dropped");
  assert.equal(recipientStatusLabel("SPAM_REPORTED"), "Spam reported");
  assert.equal(recipientStatusLabel("UNSUBSCRIBED"), "Unsubscribed");
  assert.equal(recipientStatusLabel("SUPPRESSED"), "Suppressed / skipped");
  assert.equal(recipientStatusLabel("FAILED"), "Failed");
});

test("suppressed recipient count uses real frozen recipient statuses", () => {
  assert.equal(
    suppressedRecipientCount({
      ...baseSend,
      recipients: [
        {
          id: "recipient_1",
          emailSendId: "send_1",
          email: "sent@example.com",
          normalizedEmail: "sent@example.com",
          firstName: null,
          lastName: null,
          providerStatus: "SENT",
          processedAt: null,
          deliveredAt: null,
          openedAt: null,
          clickedAt: null,
          bouncedAt: null,
          unsubscribedAt: null,
        },
        {
          id: "recipient_2",
          emailSendId: "send_1",
          email: "suppressed@example.com",
          normalizedEmail: "suppressed@example.com",
          firstName: null,
          lastName: null,
          providerStatus: "SUPPRESSED",
          processedAt: null,
          deliveredAt: null,
          openedAt: null,
          clickedAt: null,
          bouncedAt: null,
          unsubscribedAt: null,
        },
      ],
    }),
    1,
  );
});

test("suppression labels are clear for public unsubscribe, webhook, and planner-created states", () => {
  assert.equal(suppressionReasonLabel(baseSuppression), "Unsubscribed");
  assert.equal(suppressionSourceLabel(baseSuppression), "Recipient unsubscribe link");
  assert.equal(
    suppressionReasonLabel({ ...baseSuppression, reason: "BOUNCE" }),
    "Bounce",
  );
  assert.equal(
    suppressionSourceLabel({ ...baseSuppression, reason: "BOUNCE", source: "SENDGRID_WEBHOOK" }),
    "SendGrid webhook",
  );
  assert.equal(
    suppressionReasonLabel({ ...baseSuppression, reason: "SPAM_REPORT" }),
    "Spam report",
  );
  assert.equal(
    suppressionSourceLabel({ ...baseSuppression, reason: "MANUAL", source: "MANUAL" }),
    "Planner/manual",
  );
});

test("readable subject keeps merge tags compact", () => {
  assert.equal(readableSubject("  Registration   for {{eventName}}  "), "Registration for {{eventName}}");
  assert.equal(readableSubject("   "), "Untitled email");
});

test("marketing template display softens merge tokens without mutating saved template text", () => {
  const rawSubject = "An update about {{eventName}} for {{firstName}}";

  assert.equal(displayMarketingTemplateText(rawSubject), "An update about [Event name] for [First name]");
  assert.equal(rawSubject, "An update about {{eventName}} for {{firstName}}");
  assert.equal(readableSubject(rawSubject), "An update about {{eventName}} for {{firstName}}");
});

test("campaign channel display stays honest for the email-only MVP", () => {
  assert.equal(campaignChannelLabel(0), "Email");
  assert.equal(campaignChannelLabel(3), "Email");
});

test("scheduled send picker combines local date and time into the submitted ISO value", () => {
  assert.equal(schedulePartsToIso("2026-07-16", "15:05"), new Date("2026-07-16T15:05:00").toISOString());
  assert.deepEqual(schedulePartsFromIso(new Date("2026-07-16T15:05:00").toISOString()), {
    date: "2026-07-16",
    time: "15:05",
  });
  assert.equal(schedulePartsToIso("", "15:05"), null);
  assert.equal(schedulePartsToIso("2026-07-16", ""), null);
});

test("scheduled send time picker keeps quarter-hour defaults and existing custom minutes", () => {
  const options = scheduleTimeOptions("15:05");

  assert.ok(options.some((option) => option.value === "15:00" && option.label === "3:00 PM"));
  assert.ok(options.some((option) => option.value === "15:15" && option.label === "3:15 PM"));
  assert.ok(options.some((option) => option.value === "15:05" && option.label === "3:05 PM"));
  assert.equal(formatScheduleTimeLabel("00:00"), "12:00 AM");
  assert.equal(formatScheduleTimeLabel("12:00"), "12:00 PM");
});
