import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

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

const loadClient = () => import("../lib/integrations/microsoft/calendar-client");

test("Microsoft getSchedule preserves schedule, range, duration resolution, and timezone", async () => {
  const { queryMicrosoftSchedule, MICROSOFT_GET_SCHEDULE_ENDPOINT } = await loadClient();
  let captured: any;
  const result = await queryMicrosoftSchedule({
    accessToken: "secret-token",
    scheduleEmail: "owner@example.test",
    timeMin: "2026-08-24T13:00:00.000Z",
    timeMax: "2026-08-24T21:00:00.000Z",
    timeZone: "America/New_York",
    fetchImpl: async (url, init) => {
      captured = {
        url: String(url),
        method: init?.method,
        headers: init?.headers,
        body: JSON.parse(String(init?.body))
      };
      return new Response(JSON.stringify({ value: [{ scheduleItems: [] }] }), { status: 200 });
    }
  });
  assert.equal(result.ok, true);
  assert.equal(captured.url, MICROSOFT_GET_SCHEDULE_ENDPOINT);
  assert.equal(captured.method, "POST");
  assert.deepEqual(captured.body, {
    schedules: ["owner@example.test"],
    startTime: {
      dateTime: "2026-08-24T13:00:00.000Z",
      timeZone: "America/New_York"
    },
    endTime: {
      dateTime: "2026-08-24T21:00:00.000Z",
      timeZone: "America/New_York"
    },
    availabilityViewInterval: 15
  });
  assert.equal(captured.headers.Prefer, 'outlook.timezone="America/New_York"');
  assert.doesNotMatch(JSON.stringify(result), /secret-token/);
});

async function createEvent(includeTeams: boolean) {
  const { createMicrosoftCalendarEvent, MICROSOFT_EVENTS_ENDPOINT } = await loadClient();
  let captured: any;
  const result = await createMicrosoftCalendarEvent({
    accessToken: "secret-token",
    attendeeEmail: "lead@example.test",
    startsAt: "2026-08-24T13:00:00.000Z",
    endsAt: "2026-08-24T13:45:00.000Z",
    timeZone: "America/New_York",
    title: "Meeting with Lead",
    includeTeams,
    fetchImpl: async (url, init) => {
      captured = {
        url: String(url),
        method: init?.method,
        body: JSON.parse(String(init?.body))
      };
      return new Response(
        JSON.stringify({
          id: "graph-event-1",
          onlineMeeting: includeTeams
            ? { joinUrl: "https://teams.microsoft.test/join" }
            : null
        }),
        { status: 201 }
      );
    }
  });
  return { captured, result, endpoint: MICROSOFT_EVENTS_ENDPOINT };
}

test("Microsoft event create maps attendee, start/end duration, and timezone", async () => {
  const { captured, result, endpoint } = await createEvent(false);
  assert.equal(captured.url, endpoint);
  assert.equal(captured.method, "POST");
  assert.equal(captured.body.subject, "Meeting with Lead");
  assert.deepEqual(captured.body.attendees, [
    { emailAddress: { address: "lead@example.test" }, type: "required" }
  ]);
  assert.deepEqual(captured.body.start, {
    dateTime: "2026-08-24T13:00:00.000Z",
    timeZone: "America/New_York"
  });
  assert.deepEqual(captured.body.end, {
    dateTime: "2026-08-24T13:45:00.000Z",
    timeZone: "America/New_York"
  });
  assert.deepEqual(result, {
    ok: true,
    eventId: "graph-event-1",
    joinUrl: null,
    status: 201
  });
});

test("Microsoft event with Teams enabled uses Graph online meeting fields", async () => {
  const { captured, result } = await createEvent(true);
  assert.equal(captured.body.isOnlineMeeting, true);
  assert.equal(captured.body.onlineMeetingProvider, "teamsForBusiness");
  assert.equal(result.ok && result.joinUrl, "https://teams.microsoft.test/join");
});

test("Microsoft event without Teams omits online meeting fields", async () => {
  const { captured, result } = await createEvent(false);
  assert.equal("isOnlineMeeting" in captured.body, false);
  assert.equal("onlineMeetingProvider" in captured.body, false);
  assert.equal(result.ok && result.joinUrl, null);
});

test("Microsoft update and delete target the selected Graph event", async () => {
  const { updateMicrosoftCalendarEvent, deleteMicrosoftCalendarEvent } = await loadClient();
  const calls: Array<{ url: string; method: string }> = [];
  const fetchImpl = async (url: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: String(url), method: String(init?.method) });
    return new Response(null, { status: init?.method === "DELETE" ? 204 : 200 });
  };
  const updated = await updateMicrosoftCalendarEvent({
    accessToken: "secret-token",
    eventId: "event/with unsafe chars",
    attendeeEmail: "lead@example.test",
    startsAt: "2026-08-24T13:00:00.000Z",
    endsAt: "2026-08-24T13:30:00.000Z",
    timeZone: "America/New_York",
    title: "Updated",
    fetchImpl
  });
  const deleted = await deleteMicrosoftCalendarEvent({
    accessToken: "secret-token",
    eventId: "event/with unsafe chars",
    fetchImpl
  });
  assert.equal(updated.ok, true);
  assert.equal(deleted.ok, true);
  assert.deepEqual(calls, [
    {
      url: "https://graph.microsoft.com/v1.0/me/events/event%2Fwith%20unsafe%20chars",
      method: "PATCH"
    },
    {
      url: "https://graph.microsoft.com/v1.0/me/events/event%2Fwith%20unsafe%20chars",
      method: "DELETE"
    }
  ]);
});

test("Microsoft calendar errors normalize 401, 403, 429, 5xx, and network failure safely", async () => {
  const { queryMicrosoftSchedule } = await loadClient();
  const expected = new Map<number, [string, string]>([
    [401, ["failed", "provider_unauthorized"]],
    [403, ["failed", "permission_required"]],
    [429, ["failed", "provider_throttled"]],
    [503, ["unknown", "provider_unavailable"]]
  ]);
  for (const [status, [outcome, category]] of expected) {
    const result = await queryMicrosoftSchedule({
      accessToken: "secret-token",
      scheduleEmail: "owner@example.test",
      timeMin: "2026-08-24T13:00:00.000Z",
      timeMax: "2026-08-24T21:00:00.000Z",
      timeZone: "America/New_York",
      fetchImpl: async () =>
        new Response(JSON.stringify({ access_token: "raw-provider-secret" }), {
          status,
          headers: status === 429 ? { "Retry-After": "12" } : undefined
        })
    });
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.outcome, outcome);
    assert.equal(!result.ok && result.category, category);
    assert.doesNotMatch(JSON.stringify(result), /raw-provider-secret|secret-token/);
  }
  const network = await queryMicrosoftSchedule({
    accessToken: "secret-token",
    scheduleEmail: "owner@example.test",
    timeMin: "2026-08-24T13:00:00.000Z",
    timeMax: "2026-08-24T21:00:00.000Z",
    timeZone: "America/New_York",
    fetchImpl: async () => {
      throw new Error("network with secret-token");
    }
  });
  assert.deepEqual(network, {
    ok: false,
    outcome: "unknown",
    category: "unknown_outcome",
    status: null
  });
});

test("Microsoft 401 and 403 become reconnect/permission outcomes at the service boundary", async () => {
  const { normalizeMicrosoftCalendarFailure } = await import(
    "../lib/integrations/microsoft/calendar-service"
  );
  assert.deepEqual(
    normalizeMicrosoftCalendarFailure({
      ok: false,
      outcome: "failed",
      category: "provider_unauthorized",
      status: 401
    }),
    {
      ok: false,
      outcome: "reconnect_required",
      errorCategory: "reconnect_required"
    }
  );
  assert.deepEqual(
    normalizeMicrosoftCalendarFailure({
      ok: false,
      outcome: "failed",
      category: "permission_required",
      status: 403
    }),
    {
      ok: false,
      outcome: "permission_required",
      errorCategory: "permission_required"
    }
  );
});
