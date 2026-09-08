import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEventSettingsUpdatePatch,
  mayUpdateEventSettings,
  updateEventSettingsWithDeps,
  type EventSettingsUpdatePatch
} from "@/lib/events/event-settings-update-core";

test("buildEventSettingsUpdatePatch normalizes safe editable event fields", () => {
  const result = buildEventSettingsUpdatePatch(
    {
      eventId: " event-1 ",
      name: "  Spring Expo  ",
      startDate: "2026-05-01",
      endDate: "2026-05-03",
      location: "  Hall A  ",
      timezone: "America/New_York"
    },
    "2026-05-23T00:00:00.000Z"
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.patch, {
    name: "Spring Expo",
    start_date: "2026-05-01",
    end_date: "2026-05-03",
    location: "Hall A",
    timezone: "America/New_York",
    updated_at: "2026-05-23T00:00:00.000Z"
  });
});

test("Event Settings updates the same canonical events.location field used at creation", () => {
  const result = buildEventSettingsUpdatePatch(
    {
      eventId: "event-created-with-location",
      name: "Spring Expo",
      startDate: "",
      endDate: "",
      location: "  Updated Hall B  ",
      timezone: "America/New_York"
    },
    "2026-05-23T00:00:00.000Z"
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.patch.location, "Updated Hall B");
});

test("buildEventSettingsUpdatePatch rejects invalid date ranges", () => {
  const result = buildEventSettingsUpdatePatch(
    {
      eventId: "event-1",
      name: "Spring Expo",
      startDate: "2026-05-04",
      endDate: "2026-05-03",
      location: "",
      timezone: "America/New_York"
    },
    "2026-05-23T00:00:00.000Z"
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "EVENT_SETTINGS_DATE_RANGE");
});

test("updateEventSettingsWithDeps authorizes against the user's accessible event before writing", async () => {
  const calls: Array<{ userId: string; eventId: string }> = [];
  const writes: Array<{ eventId: string; patch: EventSettingsUpdatePatch }> = [];

  const result = await updateEventSettingsWithDeps(
    { userId: "user-1", role: "exhibitor_admin" },
    {
      eventId: "event-1",
      name: "Updated Event",
      startDate: "2026-06-01",
      endDate: "",
      location: "",
      timezone: "America/New_York"
    },
    {
      nowIso: () => "2026-05-23T00:00:00.000Z",
      assertEventAccessible: async (userId, eventId) => {
        calls.push({ userId, eventId });
      },
      updateEvent: async (eventId, patch) => {
        writes.push({ eventId, patch });
        return { ok: true };
      }
    }
  );

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [{ userId: "user-1", eventId: "event-1" }]);
  assert.equal(writes.length, 1);
  assert.equal(writes[0]?.eventId, "event-1");
  assert.equal(writes[0]?.patch.name, "Updated Event");
  assert.equal(writes[0]?.patch.end_date, null);
  assert.equal(writes[0]?.patch.location, null);
});

test("updateEventSettingsWithDeps denies inaccessible events without writing", async () => {
  let wrote = false;

  const result = await updateEventSettingsWithDeps(
    { userId: "user-1", role: "exhibitor_admin" },
    {
      eventId: "event-2",
      name: "Updated Event",
      startDate: "",
      endDate: "",
      location: "",
      timezone: "America/New_York"
    },
    {
      nowIso: () => "2026-05-23T00:00:00.000Z",
      assertEventAccessible: async () => {
        throw new Error("denied");
      },
      updateEvent: async () => {
        wrote = true;
        return { ok: true };
      }
    }
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "EVENT_SETTINGS_ACCESS_DENIED");
  }
  assert.equal(wrote, false);
});

test("updateEventSettingsWithDeps permits platform admin after canonical company-context scope validation", async () => {
  const calls: Array<{ userId: string; eventId: string }> = [];
  let wrote = false;

  const result = await updateEventSettingsWithDeps(
    { userId: "platform-user", role: "platform_admin" },
    {
      eventId: "event-1",
      name: "Updated Event",
      startDate: "",
      endDate: "",
      location: "",
      timezone: "America/New_York"
    },
    {
      nowIso: () => "2026-05-23T00:00:00.000Z",
      assertEventAccessible: async (userId, eventId) => {
        calls.push({ userId, eventId });
      },
      updateEvent: async () => {
        wrote = true;
        return { ok: true };
      }
    }
  );

  assert.equal(result.ok, true);
  assert.deepEqual(calls, [{ userId: "platform-user", eventId: "event-1" }]);
  assert.equal(wrote, true);
});

test("updateEventSettingsWithDeps denies platform admin outside the validated company context", async () => {
  let wrote = false;
  const result = await updateEventSettingsWithDeps(
    { userId: "platform-user", role: "platform_admin" },
    { eventId: "other-company-event", name: "Updated Event", timezone: "America/New_York" },
    {
      nowIso: () => "2026-05-23T00:00:00.000Z",
      assertEventAccessible: async () => {
        throw new Error("outside selected company");
      },
      updateEvent: async () => {
        wrote = true;
        return { ok: true };
      }
    }
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "EVENT_SETTINGS_ACCESS_DENIED");
  assert.equal(wrote, false);
});

test("updateEventSettingsWithDeps preserves organizer event-scoped access", async () => {
  let wrote = false;
  const result = await updateEventSettingsWithDeps(
    { userId: "organizer-user", role: "organizer_admin" },
    { eventId: "organizer-event", name: "Updated Event", timezone: "America/New_York" },
    {
      nowIso: () => "2026-05-23T00:00:00.000Z",
      assertEventAccessible: async () => undefined,
      updateEvent: async () => {
        wrote = true;
        return { ok: true };
      }
    }
  );
  assert.equal(result.ok, true);
  assert.equal(wrote, true);
});

test("updateEventSettingsWithDeps denies organizer events outside organizer scope", async () => {
  const result = await updateEventSettingsWithDeps(
    { userId: "organizer-user", role: "organizer_admin" },
    { eventId: "other-organizer-event", name: "Updated Event", timezone: "America/New_York" },
    {
      nowIso: () => "2026-05-23T00:00:00.000Z",
      assertEventAccessible: async () => {
        throw new Error("outside organizer scope");
      },
      updateEvent: async () => ({ ok: true })
    }
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "EVENT_SETTINGS_ACCESS_DENIED");
});

test("event settings management roles exclude viewers and legacy exhibitor role", () => {
  assert.equal(mayUpdateEventSettings("exhibitor_admin"), true);
  assert.equal(mayUpdateEventSettings("platform_admin"), true);
  assert.equal(mayUpdateEventSettings("organizer_admin"), true);
  assert.equal(mayUpdateEventSettings("exhibitor_viewer"), false);
  assert.equal(mayUpdateEventSettings("viewer"), false);
  assert.equal(mayUpdateEventSettings("exhibitor"), false);
});
