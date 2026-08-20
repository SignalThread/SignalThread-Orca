import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";
import {
  createAudienceFromDirectorySchema,
  createEmailSendSchema,
  updateEmailSendSchema,
} from "../app/api/events/[eventId]/marketing/_lib/route-helpers";

const MARKETING_ROUTE_ROOT = path.join(process.cwd(), "app/api/events/[eventId]/marketing");
const MARKETING_APP_ROUTE_ROOT = path.join(process.cwd(), "app/api/marketing");
const PUBLIC_MARKETING_ROUTE_ROOT = path.join(process.cwd(), "app/api/public/marketing");
const MARKETING_PAGE_ROOT = path.join(process.cwd(), "app/marketing");
const MARKETING_WORKSPACE_COMPONENT_ROOT = path.join(
  process.cwd(),
  "app/(shell)/events/[eventId]/marketing/_components",
);

function readRoute(relativePath: string): string {
  const fullPath = path.join(MARKETING_ROUTE_ROOT, relativePath);
  assert.ok(existsSync(fullPath), `${relativePath} should exist`);
  return readFileSync(fullPath, "utf8");
}

function readMarketingAppRoute(relativePath: string): string {
  const fullPath = path.join(MARKETING_APP_ROUTE_ROOT, relativePath);
  assert.ok(existsSync(fullPath), `${relativePath} should exist`);
  return readFileSync(fullPath, "utf8");
}

function readPublicMarketingRoute(relativePath: string): string {
  const fullPath = path.join(PUBLIC_MARKETING_ROUTE_ROOT, relativePath);
  assert.ok(existsSync(fullPath), `${relativePath} should exist`);
  return readFileSync(fullPath, "utf8");
}

function readMarketingPage(relativePath: string): string {
  const fullPath = path.join(MARKETING_PAGE_ROOT, relativePath);
  assert.ok(existsSync(fullPath), `${relativePath} should exist`);
  return readFileSync(fullPath, "utf8");
}

function readMarketingWorkspaceComponent(relativePath: string): string {
  const fullPath = path.join(MARKETING_WORKSPACE_COMPONENT_ROOT, relativePath);
  assert.ok(existsSync(fullPath), `${relativePath} should exist`);
  return readFileSync(fullPath, "utf8");
}

function assertIncludes(source: string, expected: string, label: string): void {
  assert.ok(source.includes(expected), `${label} should include ${expected}`);
}

function assertRouteWiring(relativePath: string): void {
  const source = readRoute(relativePath);
  assertIncludes(source, "requireRouteUser(request)", relativePath);
  assertIncludes(source, "toMarketingRouteErrorResponse", relativePath);
  assertIncludes(source, "withApiRequestLogging", relativePath);
  assertIncludes(source, '@/src/server/services/marketing', relativePath);
  assertIncludes(source, 'export const runtime = "nodejs"', relativePath);
  assertIncludes(source, 'export const dynamic = "force-dynamic"', relativePath);
}

test("marketing API routes expose the Phase 2A service-backed capabilities", () => {
  const routeExpectations = [
    ["audiences/route.ts", ["listAudiences", "createAudience"]],
    ["audiences/from-directory/route.ts", ["createAudienceFromDirectory", "createAudienceFromDirectorySchema"]],
    ["audiences/[audienceId]/route.ts", ["getAudience", "updateAudience", "deleteAudience"]],
    ["audiences/[audienceId]/recipients/route.ts", ["importRecipients", "addRecipient"]],
    ["audiences/[audienceId]/recipients/[recipientId]/route.ts", ["updateRecipient", "deleteRecipient"]],
    ["defaults/route.ts", ["getEmailDefaults"]],
    ["preview/route.ts", ["previewEmail"]],
    ["campaigns/route.ts", ["listCampaigns", "createCampaign"]],
    ["campaigns/[campaignId]/route.ts", ["getCampaign", "updateCampaign"]],
    ["sends/route.ts", ["listEmailSends", "createEmailSend"]],
    ["sends/[sendId]/route.ts", ["updateEmailSend"]],
    ["sends/[sendId]/send/route.ts", ["sendEmailNow"]],
    ["sends/[sendId]/schedule/route.ts", ["scheduleEmailSend"]],
    ["sends/[sendId]/approval/route.ts", ["submitEmailSendForApproval"]],
    ["sends/[sendId]/approval/approve/route.ts", ["approveEmailSend"]],
    ["sends/[sendId]/approval/request-changes/route.ts", ["requestEmailSendChanges"]],
    ["sends/[sendId]/approval/reject/route.ts", ["rejectEmailSend"]],
    ["sends/[sendId]/cancel/route.ts", ["cancelScheduledEmailSend"]],
    ["sends/[sendId]/reschedule/route.ts", ["rescheduleEmailSend"]],
    ["sends/[sendId]/retry/route.ts", ["retryFailedEmailSend"]],
    ["suppressions/route.ts", ["listSuppressions"]],
    ["suppressions/[suppressionId]/resubscribe/route.ts", ["resubscribeSuppression"]],
  ] as const;

  for (const [relativePath, functions] of routeExpectations) {
    const source = readRoute(relativePath);
    assertRouteWiring(relativePath);
    for (const fn of functions) {
      assertIncludes(source, fn, relativePath);
    }
  }
});

test("directory-sourced audience route validates selection mode and directory filters", () => {
  const route = readRoute("audiences/from-directory/route.ts");
  const helper = readRoute("_lib/route-helpers.ts");

  assertRouteWiring("audiences/from-directory/route.ts");
  assertIncludes(route, "createAudienceFromDirectorySchema.parse", "directory audience route");
  assertIncludes(route, "createAudienceFromDirectory(auth.user, eventId, body)", "directory audience route");
  assertIncludes(helper, "EventDirectoryRoleType", "marketing route helpers");
  assertIncludes(helper, "EventDirectorySourceType", "marketing route helpers");
  assertIncludes(helper, "EventDirectoryPersonStatus", "marketing route helpers");

  const parsed = createAudienceFromDirectorySchema.parse({
    name: "Filtered attendees",
    selectionMode: "filtered",
    filters: {
      search: "attendee",
      role: "ATTENDEE",
      sourceType: "CSV_IMPORT",
      status: "ACTIVE",
      summaryFilter: "attendees",
    },
  });

  assert.equal(parsed.selectionMode, "filtered");
  assert.equal(parsed.filters?.summaryFilter, "attendees");
  assert.throws(() =>
    createAudienceFromDirectorySchema.parse({
      name: "Bad",
      selectionMode: "filtered",
      filters: { summaryFilter: "unknown" },
    }),
  );
});

test("marketing approval routes are thin wrappers around the marketing service", () => {
  const submit = readRoute("sends/[sendId]/approval/route.ts");
  const approve = readRoute("sends/[sendId]/approval/approve/route.ts");
  const changes = readRoute("sends/[sendId]/approval/request-changes/route.ts");
  const reject = readRoute("sends/[sendId]/approval/reject/route.ts");
  const helper = readRoute("_lib/route-helpers.ts");

  for (const route of [
    "sends/[sendId]/approval/route.ts",
    "sends/[sendId]/approval/approve/route.ts",
    "sends/[sendId]/approval/request-changes/route.ts",
    "sends/[sendId]/approval/reject/route.ts",
  ]) {
    assertRouteWiring(route);
  }

  assertIncludes(helper, "submitEmailSendForApprovalSchema", "marketing route helpers");
  assertIncludes(helper, "emailSendApprovalDecisionSchema", "marketing route helpers");
  assertIncludes(submit, "submitEmailSendForApprovalSchema.parse", "approval submit route");
  assertIncludes(submit, "submitEmailSendForApproval(auth.user, sendId, body)", "approval submit route");
  assertIncludes(approve, "approveEmailSend(auth.user, sendId)", "approval approve route");
  assertIncludes(changes, "requestEmailSendChanges(auth.user, sendId, body)", "approval request changes route");
  assertIncludes(reject, "rejectEmailSend(auth.user, sendId, body)", "approval reject route");
  assert.equal(submit.includes("prisma.task"), false);
  assert.equal(approve.includes("prisma.task"), false);
  assert.equal(changes.includes("prisma.task"), false);
  assert.equal(reject.includes("prisma.task"), false);
});

test("marketing suppression routes are event-scoped, authenticated, and service-backed", () => {
  const listSource = readRoute("suppressions/route.ts");
  const resubscribeSource = readRoute("suppressions/[suppressionId]/resubscribe/route.ts");

  assertRouteWiring("suppressions/route.ts");
  assertRouteWiring("suppressions/[suppressionId]/resubscribe/route.ts");
  assertIncludes(listSource, "listSuppressions(auth.user, eventId)", "suppressions/route.ts");
  assertIncludes(resubscribeSource, "resubscribeSuppression(auth.user, eventId, suppressionId)", "resubscribe route");
  assertIncludes(resubscribeSource, "uuidSchema.parse(rawSuppressionId)", "resubscribe route");
  assert.equal(listSource.includes("marketingSuppression"), false, "list route must not query suppressions directly");
  assert.equal(resubscribeSource.includes("marketingSuppression"), false, "resubscribe route must not mutate suppressions directly");
});

test("marketing scheduled send runner route is protected by an internal secret", () => {
  const source = readRoute("run-due-scheduled-sends/route.ts");

  assertIncludes(source, "runDueScheduledEmailSends", "run-due-scheduled-sends/route.ts");
  assertIncludes(source, "MARKETING_SEND_RUNNER_SECRET", "run-due-scheduled-sends/route.ts");
  assertIncludes(source, "x-marketing-runner-secret", "run-due-scheduled-sends/route.ts");
  assertIncludes(source, "Bearer", "run-due-scheduled-sends/route.ts");
  assertIncludes(source, "MARKETING_RUNNER_FORBIDDEN", "run-due-scheduled-sends/route.ts");
  assertIncludes(source, "withApiRequestLogging", "run-due-scheduled-sends/route.ts");
  assert.equal(source.includes("requireRouteUser(request)"), false);
});

test("marketing SendGrid webhook route is sessionless, authenticated, and service-backed", () => {
  const source = readMarketingAppRoute("sendgrid/webhook/route.ts");

  assertIncludes(source, "ingestSendGridWebhookEvents", "sendgrid/webhook/route.ts");
  assertIncludes(source, "SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY", "sendgrid/webhook/route.ts");
  assertIncludes(source, "SENDGRID_WEBHOOK_PUBLIC_KEY", "sendgrid/webhook/route.ts");
  assertIncludes(source, "SENDGRID_WEBHOOK_SECRET", "sendgrid/webhook/route.ts");
  assertIncludes(source, "x-twilio-email-event-webhook-signature", "sendgrid/webhook/route.ts");
  assertIncludes(source, "x-twilio-email-event-webhook-timestamp", "sendgrid/webhook/route.ts");
  assertIncludes(source, "x-sendgrid-webhook-secret", "sendgrid/webhook/route.ts");
  assertIncludes(source, "request.text()", "sendgrid/webhook/route.ts");
  assertIncludes(source, "withApiRequestLogging", "sendgrid/webhook/route.ts");
  assertIncludes(source, 'export const runtime = "nodejs"', "sendgrid/webhook/route.ts");
  assertIncludes(source, 'export const dynamic = "force-dynamic"', "sendgrid/webhook/route.ts");
  assert.equal(source.includes("requireRouteUser(request)"), false);
});

test("marketing public unsubscribe GET is non-mutating and POST uses the service", () => {
  const pageSource = readMarketingPage("unsubscribe/[token]/page.tsx");
  const postRouteSource = readPublicMarketingRoute("unsubscribe/[token]/route.ts");

  assertIncludes(pageSource, "verifyMarketingUnsubscribeToken", "unsubscribe/[token]/page.tsx");
  assertIncludes(pageSource, "Unsubscribe from this event", "unsubscribe/[token]/page.tsx");
  assert.equal(pageSource.includes("unsubscribeMarketingRecipient"), false, "GET page must not mutate suppression state");
  assert.equal(pageSource.includes("marketingSuppression"), false, "GET page must not write suppressions");

  assertIncludes(postRouteSource, "unsubscribeMarketingRecipient(token)", "unsubscribe/[token]/route.ts");
  assertIncludes(postRouteSource, '"unsubscribed"', "unsubscribe/[token]/route.ts");
  assertIncludes(postRouteSource, "redirectToResult", "unsubscribe/[token]/route.ts");
  assert.equal(postRouteSource.includes("requireRouteUser(request)"), false);
});

test("marketing send reply-to accepts mailbox strings in the API layer and normalizes them in the form payload", () => {
  const createParsed = createEmailSendSchema.parse({
    campaignId: "11111111-1111-4111-8111-111111111111",
    subject: "Subject",
    replyTo: "SignalThread <no-reply@signalthread.ai>",
  });
  const updateParsed = updateEmailSendSchema.parse({
    replyTo: "SignalThread <no-reply@signalthread.ai>",
  });
  const formSource = readMarketingWorkspaceComponent("email-send-form.tsx");

  assert.equal(createParsed.replyTo, "SignalThread <no-reply@signalthread.ai>");
  assert.equal(updateParsed.replyTo, "SignalThread <no-reply@signalthread.ai>");
  assertIncludes(formSource, "function normalizeReplyToAddress", "email-send-form.tsx");
  assertIncludes(formSource, "replyTo: normalizeReplyToAddress(replyTo)", "email-send-form.tsx");
  assert.equal(formSource.includes("replyTo: replyTo.trim() || null"), false);
});

test("marketing SendGrid webhook route rejects missing auth before processing", async () => {
  const { POST } = await import("../app/api/marketing/sendgrid/webhook/route");
  const previousSecret = process.env.SENDGRID_WEBHOOK_SECRET;
  process.env.SENDGRID_WEBHOOK_SECRET = "webhook-secret";
  try {
    const request = new NextRequest("http://localhost/api/marketing/sendgrid/webhook", {
      method: "POST",
      body: "[]",
    });
    const response = await POST(request);
    assert.equal(response.status, 403);
  } finally {
    if (previousSecret === undefined) delete process.env.SENDGRID_WEBHOOK_SECRET;
    else process.env.SENDGRID_WEBHOOK_SECRET = previousSecret;
  }
});

test("marketing SendGrid webhook route rejects invalid payloads with valid token auth", async () => {
  const { POST } = await import("../app/api/marketing/sendgrid/webhook/route");
  const previousSecret = process.env.SENDGRID_WEBHOOK_SECRET;
  process.env.SENDGRID_WEBHOOK_SECRET = "webhook-secret";
  try {
    const request = new NextRequest("http://localhost/api/marketing/sendgrid/webhook", {
      method: "POST",
      body: "{}",
      headers: { "x-sendgrid-webhook-secret": "webhook-secret" },
    });
    const response = await POST(request);
    assert.equal(response.status, 400);
  } finally {
    if (previousSecret === undefined) delete process.env.SENDGRID_WEBHOOK_SECRET;
    else process.env.SENDGRID_WEBHOOK_SECRET = previousSecret;
  }
});

test("marketing routes never reach into other modules' source-of-truth services", () => {
  const routeFiles = [
    "audiences/route.ts",
    "audiences/[audienceId]/route.ts",
    "audiences/[audienceId]/recipients/route.ts",
    "audiences/[audienceId]/recipients/[recipientId]/route.ts",
    "defaults/route.ts",
    "preview/route.ts",
    "campaigns/route.ts",
    "campaigns/[campaignId]/route.ts",
    "sends/route.ts",
    "sends/[sendId]/route.ts",
    "sends/[sendId]/send/route.ts",
    "sends/[sendId]/schedule/route.ts",
    "sends/[sendId]/cancel/route.ts",
    "sends/[sendId]/reschedule/route.ts",
    "sends/[sendId]/retry/route.ts",
    "suppressions/route.ts",
    "suppressions/[suppressionId]/resubscribe/route.ts",
    "run-due-scheduled-sends/route.ts",
  ];
  for (const relativePath of routeFiles) {
    const source = readRoute(relativePath);
    for (const forbidden of [
      "EventIntegrationMetric",
      "speaker-reminders",
      "services/notifications",
      "SpeakerEmailLog",
    ]) {
      assert.equal(
        source.includes(forbidden),
        false,
        `${relativePath} must not reference ${forbidden}`,
      );
    }
  }

  const webhookSource = readMarketingAppRoute("sendgrid/webhook/route.ts");
  for (const forbidden of [
    "EventIntegrationMetric",
    "speaker-reminders",
    "services/notifications",
    "SpeakerEmailLog",
  ]) {
    assert.equal(webhookSource.includes(forbidden), false, `sendgrid/webhook/route.ts must not reference ${forbidden}`);
  }
});
