import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test, { before, mock } from "node:test";

mock.module("server-only", { defaultExport: {} });

let manageLeadFollowUpWithDependencies: typeof import("../lib/follow-ups/lead-follow-up-service")["manageLeadFollowUpWithDependencies"];
let createGooglePrivateCalendarEvent: typeof import("../lib/integrations/google/calendar-client")["createGooglePrivateCalendarEvent"];
let updateGooglePrivateCalendarEvent: typeof import("../lib/integrations/google/calendar-client")["updateGooglePrivateCalendarEvent"];
let deleteGooglePrivateCalendarEvent: typeof import("../lib/integrations/google/calendar-client")["deleteGooglePrivateCalendarEvent"];

before(async () => {
  ({ manageLeadFollowUpWithDependencies } = await import("../lib/follow-ups/lead-follow-up-service"));
  ({
    createGooglePrivateCalendarEvent,
    updateGooglePrivateCalendarEvent,
    deleteGooglePrivateCalendarEvent
  } = await import("../lib/integrations/google/calendar-client"));
});

import type {
  FollowUpLeadRow,
  FollowUpRepository,
  FollowUpReminderGateway,
  FollowUpServiceDependencies
} from "../lib/follow-ups/lead-follow-up-service";

const root = process.cwd();
const USER_ID = "11111111-1111-4111-8111-111111111111";
const COMPANY_ID = "22222222-2222-4222-8222-222222222222";
const LEAD_ID = "33333333-3333-4333-8333-333333333333";

function key(index: number) {
  return `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, "0")}`;
}

function initialLead(): FollowUpLeadRow {
  return {
    id: LEAD_ID,
    company_id: COMPANY_ID,
    event_id: "event-1",
    full_name: "Mark Jackson",
    follow_up_at: null,
    follow_up_date: null,
    follow_up_note: null,
    follow_up_completed_at: null,
    follow_up_calendar_event_id: null,
    follow_up_calendar_provider: null,
    follow_up_calendar_owner_user_id: null,
    follow_up_last_operation_key: null,
    follow_up_last_operation_fingerprint: null,
    follow_up_last_operation_result: null,
    updated_at: "2026-08-04T10:00:00.000Z"
  };
}

function harness(options: {
  gateway?: FollowUpReminderGateway["sync"];
  authorized?: boolean;
} = {}) {
  let row = initialLead();
  let version = 0;
  const repository: FollowUpRepository = {
    async load(input) {
      return input.companyId === row.company_id && input.leadId === row.id ? { ...row } : null;
    },
    async claim(input) {
      if (input.expectedUpdatedAt !== row.updated_at) return null;
      version += 1;
      row = {
        ...row,
        ...input.patch,
        follow_up_last_operation_key: input.command.idempotencyKey,
        follow_up_last_operation_fingerprint: input.command.fingerprint,
        follow_up_last_operation_result: { status: "pending" },
        updated_at: `2026-08-04T10:00:0${version}.000Z`
      };
      return { ...row };
    },
    async finalize(input) {
      if (row.follow_up_last_operation_key !== input.idempotencyKey) return null;
      version += 1;
      row = {
        ...row,
        ...input.patch,
        follow_up_last_operation_result: input.result,
        updated_at: `2026-08-04T10:00:0${version}.000Z`
      };
      return { ...row };
    }
  };
  const calls: Array<Parameters<FollowUpReminderGateway["sync"]>[0]> = [];
  const dependencies: FollowUpServiceDependencies = {
    repository,
    reminderGateway: {
      async sync(input) {
        calls.push(input);
        return options.gateway
          ? options.gateway(input)
          : { ok: true, eventId: input.operation === "delete" ? null : input.eventId };
      }
    },
    authorize: async () => options.authorized !== false,
    now: () => new Date("2026-08-04T12:00:00.000Z")
  };
  return {
    dependencies,
    calls,
    row: () => ({ ...row })
  };
}

function execute(
  testHarness: ReturnType<typeof harness>,
  command: Parameters<typeof manageLeadFollowUpWithDependencies>[0]["command"]
) {
  return manageLeadFollowUpWithDependencies(
    {
      userId: USER_ID,
      companyId: COMPANY_ID,
      role: "exhibitor_admin",
      isBearer: true,
      leadId: LEAD_ID,
      command
    },
    testHarness.dependencies
  );
}

test("create persists canonical fields, derives local follow_up_date, and creates one private reminder", async () => {
  const h = harness();
  const result = await execute(h, {
    action: "save",
    idempotencyKey: key(1),
    followUpAt: "2026-08-04T00:30:00.000Z",
    timezone: "America/Los_Angeles",
    note: "Send the product overview.",
    reminder: { enabled: true, provider: "google_workspace" }
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.outcome, "saved");
  assert.equal(result.partialSuccess, false);
  assert.equal(result.followUp.date, "2026-08-03");
  assert.equal(result.followUp.note, "Send the product overview.");
  assert.equal(result.followUp.hasCalendarReminder, true);
  assert.equal(h.row().follow_up_date, "2026-08-03");
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0]?.operation, "create");
  assert.equal(h.calls[0]?.title, "Follow up with Mark Jackson");
  assert.match(h.calls[0]?.eventId ?? "", /^lrf[0-9a-f]{64}$/);
});

test("update patches the existing reminder and an exact successful retry is idempotent", async () => {
  const h = harness();
  await execute(h, {
    action: "save",
    idempotencyKey: key(2),
    followUpAt: "2026-08-05T14:00:00.000Z",
    timezone: "America/New_York",
    reminder: { enabled: true }
  });
  const eventId = h.row().follow_up_calendar_event_id;
  const command = {
    action: "save" as const,
    idempotencyKey: key(3),
    followUpAt: "2026-08-06T15:00:00.000Z",
    timezone: "America/New_York",
    note: "Updated note"
  };
  const updated = await execute(h, command);
  const replayed = await execute(h, command);

  assert.equal(updated.ok, true);
  assert.equal(replayed.ok, true);
  if (!replayed.ok) return;
  assert.equal(replayed.outcome, "duplicate");
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1]?.operation, "update");
  assert.equal(h.calls[1]?.eventId, eventId);
  assert.equal(h.row().follow_up_calendar_event_id, eventId);
});

test("mark complete persists completion first and deletes the existing reminder", async () => {
  const h = harness();
  await execute(h, {
    action: "save",
    idempotencyKey: key(4),
    followUpAt: "2026-08-05T14:00:00.000Z",
    timezone: "America/New_York",
    reminder: { enabled: true }
  });
  const result = await execute(h, { action: "complete", idempotencyKey: key(5) });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.outcome, "completed");
  assert.equal(result.followUp.completedAt, "2026-08-04T12:00:00.000Z");
  assert.equal(result.calendar.status, "deleted");
  assert.equal(h.calls.at(-1)?.operation, "delete");
  assert.equal(h.row().follow_up_calendar_event_id, null);
});

test("clear removes canonical follow-up fields and deletes the reminder", async () => {
  const h = harness();
  await execute(h, {
    action: "save",
    idempotencyKey: key(6),
    followUpAt: "2026-08-05T14:00:00.000Z",
    timezone: "America/New_York",
    note: "Temporary",
    reminder: { enabled: true }
  });
  const result = await execute(h, { action: "clear", idempotencyKey: key(7) });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.outcome, "cleared");
  assert.deepEqual(result.followUp, {
    at: null,
    date: null,
    note: null,
    completedAt: null,
    hasCalendarReminder: false
  });
  assert.equal(result.calendar.status, "deleted");
  assert.equal(h.calls.at(-1)?.operation, "delete");
});

test("Calendar failure returns partial success while preserving the LR follow-up", async () => {
  const h = harness({
    gateway: async () => ({ ok: false, errorCategory: "provider_unavailable" })
  });
  const result = await execute(h, {
    action: "save",
    idempotencyKey: key(8),
    followUpAt: "2026-08-05T14:00:00.000Z",
    timezone: "America/New_York",
    note: "Persist this",
    reminder: { enabled: true }
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.partialSuccess, true);
  assert.equal(result.calendar.status, "failed");
  assert.equal(result.calendar.errorCategory, "provider_unavailable");
  assert.equal(h.row().follow_up_at, "2026-08-05T14:00:00.000Z");
  assert.equal(h.row().follow_up_note, "Persist this");
});

test("Calendar deletion failure keeps the reconciliation reference after completion", async () => {
  let failDelete = false;
  const h = harness({
    gateway: async (input) =>
      failDelete && input.operation === "delete"
        ? { ok: false, errorCategory: "provider_unavailable" }
        : { ok: true, eventId: input.eventId }
  });
  await execute(h, {
    action: "save",
    idempotencyKey: key(9),
    followUpAt: "2026-08-05T14:00:00.000Z",
    timezone: "America/New_York",
    reminder: { enabled: true }
  });
  failDelete = true;
  const result = await execute(h, { action: "complete", idempotencyKey: key(10) });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.partialSuccess, true);
  assert.equal(result.followUp.completedAt, "2026-08-04T12:00:00.000Z");
  assert.equal(result.followUp.hasCalendarReminder, true);
  assert.ok(h.row().follow_up_calendar_event_id);
});

test("private Google reminder payloads never contain a lead attendee or conferencing request", async () => {
  const requests: Array<{ url: string; method: string; body: unknown }> = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    requests.push({
      url: String(url),
      method: String(init?.method),
      body: init?.body ? JSON.parse(String(init.body)) : null
    });
    return new Response(
      init?.method === "POST" ? JSON.stringify({ id: "private-event" }) : null,
      { status: init?.method === "POST" ? 200 : 204, headers: { "Content-Type": "application/json" } }
    );
  };
  const common = {
    accessToken: "not-logged",
    eventId: "private-event",
    startsAt: "2026-08-05T14:00:00.000Z",
    endsAt: "2026-08-05T14:30:00.000Z",
    timeZone: "America/New_York",
    title: "Follow up with Mark Jackson",
    fetchImpl
  };
  await createGooglePrivateCalendarEvent(common);
  await updateGooglePrivateCalendarEvent(common);
  await deleteGooglePrivateCalendarEvent(common);

  assert.equal(requests.length, 3);
  for (const request of requests) {
    assert.match(request.url, /sendUpdates=none/);
    assert.doesNotMatch(JSON.stringify(request.body), /attendees|conferenceData|hangoutsMeet/);
  }
});

test("mobile route is bearer-only and delegates all commands to the canonical service", () => {
  const source = readFileSync(
    path.join(root, "app/api/mobile/leads/[leadId]/follow-up/route.ts"),
    "utf8"
  );
  assert.match(source, /\^Bearer\\s\+\\S\+/);
  assert.match(source, /resolveApiSession\(request\)/);
  assert.match(source, /manageLeadFollowUp/);
  assert.match(source, /export async function PUT/);
  assert.match(source, /export async function POST/);
  assert.match(source, /export async function DELETE/);
  assert.doesNotMatch(source, /createAdminClient|createGooglePrivateCalendarEvent/);
});
