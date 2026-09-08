import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { resolveCalendarProvider } from "../lib/integrations/calendar/provider-resolver-core";
import {
  parseCalendarProviderOverride,
  type CalendarProviderCandidate
} from "../lib/integrations/calendar/types";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
(require.cache as Record<string, NodeJS.Module | undefined>)[serverOnlyPath] = {
  id: serverOnlyPath,
  path: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  children: [],
  paths: [],
  exports: {},
  isPreloading: false,
  require,
  parent: null
} as unknown as NodeJS.Module;

const google = (overrides: Partial<CalendarProviderCandidate> = {}): CalendarProviderCandidate => ({
  id: "google-1",
  provider: "google_workspace",
  accountEmail: "google@example.test",
  accountDisplayName: "Google Sender",
  healthy: true,
  reconnectRequired: false,
  ...overrides
});
const microsoft = (
  overrides: Partial<CalendarProviderCandidate> = {}
): CalendarProviderCandidate => ({
  id: "microsoft-1",
  provider: "microsoft_365",
  accountEmail: "microsoft@example.test",
  accountDisplayName: "Microsoft Sender",
  healthy: true,
  reconnectRequired: false,
  ...overrides
});

const baseInput = {
  userId: "user-1",
  companyId: "company-1",
  role: "exhibitor_admin",
  isBearer: true,
  leadId: "lead-1",
  windowStartLocal: "2026-08-24T09:00",
  windowEndLocal: "2026-08-24T17:00",
  timezone: "America/New_York",
  durationMinutes: 30
};

async function loadService() {
  return import("../lib/integrations/calendar/service");
}

function deps(input: {
  candidates: CalendarProviderCandidate[];
  googleResult?: any;
  microsoftResult?: any;
  calls: string[];
}) {
  const success = {
    ok: true,
    timezone: "America/New_York",
    range: { start: "2026-08-24T13:00:00.000Z", end: "2026-08-24T21:00:00.000Z" },
    suggestions: []
  };
  return {
    resolveProvider: async ({ providerOverride }: { providerOverride?: "google_workspace" | "microsoft_365" }) =>
      resolveCalendarProvider({
        candidates: input.candidates,
        preferredProvider: null,
        providerOverride
      }),
    googleAvailability: async () => {
      input.calls.push("google_availability");
      return input.googleResult ?? success;
    },
    microsoftAvailability: async () => {
      input.calls.push("microsoft_availability");
      return input.microsoftResult ?? success;
    },
    googleCreate: async () => ({ ok: false, outcome: "failed" }),
    microsoftCreate: async () => ({ ok: false, outcome: "failed" }),
    googleUpdate: async () => ({ ok: false, outcome: "failed" }),
    microsoftUpdate: async () => ({ ok: false, outcome: "failed" }),
    googleCancel: async () => ({ ok: false, outcome: "failed" }),
    microsoftCancel: async () => ({ ok: false, outcome: "failed" }),
    claimProvider: async () => ({ ok: true, provider: "google_workspace" })
  } as any;
}

test("Google only healthy dispatches availability to Google", async () => {
  const { getCalendarAvailabilityWithDependencies } = await loadService();
  const calls: string[] = [];
  const result = await getCalendarAvailabilityWithDependencies(
    baseInput,
    deps({ candidates: [google()], calls })
  );
  assert.equal(result.ok && result.provider, "google_workspace");
  assert.deepEqual(calls, ["google_availability"]);
});

test("Microsoft only healthy dispatches availability to Microsoft", async () => {
  const { getCalendarAvailabilityWithDependencies } = await loadService();
  const calls: string[] = [];
  const result = await getCalendarAvailabilityWithDependencies(
    baseInput,
    deps({ candidates: [microsoft()], calls })
  );
  assert.equal(result.ok && result.provider, "microsoft_365");
  assert.deepEqual(calls, ["microsoft_availability"]);
});

test("both healthy honor explicit Google and Microsoft overrides", async () => {
  const { getCalendarAvailabilityWithDependencies } = await loadService();
  for (const providerOverride of ["google_workspace", "microsoft_365"] as const) {
    const calls: string[] = [];
    const result = await getCalendarAvailabilityWithDependencies(
      { ...baseInput, providerOverride },
      deps({ candidates: [google(), microsoft()], calls })
    );
    assert.equal(result.ok && result.provider, providerOverride);
    assert.deepEqual(calls, [
      providerOverride === "google_workspace"
        ? "google_availability"
        : "microsoft_availability"
    ]);
  }
});

test("unsupported override is rejected at the canonical request boundary", () => {
  for (const value of ["google", "outlook", "smtp", "", null, 42]) {
    assert.deepEqual(parseCalendarProviderOverride(value), { valid: false });
  }
  assert.deepEqual(parseCalendarProviderOverride("microsoft_365"), {
    valid: true,
    provider: "microsoft_365"
  });
});

test("unhealthy selected provider fails closed", async () => {
  const { getCalendarAvailabilityWithDependencies } = await loadService();
  const calls: string[] = [];
  const result = await getCalendarAvailabilityWithDependencies(
    { ...baseInput, providerOverride: "microsoft_365" },
    deps({
      candidates: [google(), microsoft({ healthy: false, reconnectRequired: true })],
      calls
    })
  );
  assert.deepEqual(result, { ok: false, outcome: "reconnect_required" });
  assert.deepEqual(calls, []);
});

test("selected Microsoft failure never falls back to Google", async () => {
  const { getCalendarAvailabilityWithDependencies } = await loadService();
  const calls: string[] = [];
  const result = await getCalendarAvailabilityWithDependencies(
    { ...baseInput, providerOverride: "microsoft_365" },
    deps({
      candidates: [google(), microsoft()],
      calls,
      microsoftResult: {
        ok: false,
        outcome: "failed",
        errorCategory: "permission_required"
      }
    })
  );
  assert.equal(result.ok, false);
  assert.equal("provider" in result && result.provider, "microsoft_365");
  assert.deepEqual(calls, ["microsoft_availability"]);
});

test("provider-neutral Google meeting output contains no required Google-specific fields", async () => {
  const { createCalendarMeetingWithDependencies } = await loadService();
  const calls: string[] = [];
  const custom = deps({ candidates: [google()], calls });
  custom.googleCreate = async () => ({
    ok: true,
    outcome: "scheduled",
    activity: {
      id: "activity-1",
      leadId: "lead-1",
      attendeeEmail: "lead@example.test",
      googleEventId: "google-event-1",
      googleMeetUri: "https://meet.google.test/example",
      startsAt: "2026-08-24T13:00:00.000Z",
      endsAt: "2026-08-24T13:30:00.000Z",
      timezone: "America/New_York",
      status: "scheduled",
      lastOperation: "create",
      lastOperationStatus: "succeeded",
      safeErrorCategory: null,
      createdAt: "2026-08-21T00:00:00.000Z",
      calendarOwnerName: null,
      calendarOwnerEmail: null,
      actingUserName: null,
      actingUserEmail: null
    }
  });
  custom.claimProvider = async () => ({ ok: true, provider: "google_workspace" });
  const result = await createCalendarMeetingWithDependencies(
    {
      ...baseInput,
      idempotencyKey: "10000000-0000-4000-8000-000000000001",
      startsAt: "2026-08-24T13:00:00.000Z",
      endsAt: "2026-08-24T13:30:00.000Z",
      title: "Meeting with Lead",
      includeConferencing: true
    },
    custom
  );
  assert.deepEqual(result, {
    ok: true,
    outcome: "scheduled",
    meeting: {
      activityId: "activity-1",
      provider: "google_workspace",
      eventId: "google-event-1",
      joinUrl: "https://meet.google.test/example",
      start: "2026-08-24T13:00:00.000Z",
      end: "2026-08-24T13:30:00.000Z",
      timezone: "America/New_York",
      attendeeEmail: "lead@example.test"
    }
  });
  assert.doesNotMatch(JSON.stringify(result.meeting), /googleEventId|googleMeetUri/);
});

test("create provider claim prevents a retry from switching providers", async () => {
  const { createCalendarMeetingWithDependencies } = await loadService();
  const calls: string[] = [];
  const custom = deps({ candidates: [google(), microsoft()], calls });
  custom.claimProvider = async (claim: { provider: string }) => {
    calls.push(`claim:${claim.provider}`);
    return { ok: false, outcome: "conflict" };
  };
  custom.microsoftCreate = async () => {
    calls.push("microsoft_create");
    return { ok: false, outcome: "failed" };
  };
  custom.googleCreate = async () => {
    calls.push("google_create");
    return { ok: false, outcome: "failed" };
  };
  const result = await createCalendarMeetingWithDependencies(
    {
      ...baseInput,
      providerOverride: "microsoft_365",
      idempotencyKey: "10000000-0000-4000-8000-000000000002",
      startsAt: "2026-08-24T13:00:00.000Z",
      endsAt: "2026-08-24T13:30:00.000Z",
      title: "Meeting with Lead",
      includeConferencing: false
    },
    custom
  );
  assert.deepEqual(result, {
    ok: false,
    outcome: "conflict",
    provider: "microsoft_365"
  });
  assert.deepEqual(calls, ["claim:microsoft_365"]);
});
