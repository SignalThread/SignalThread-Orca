import test from "node:test";
import assert from "node:assert/strict";
import { executeCreateEventMutation } from "../lib/events/create-event-mutation-core";
import type { ExhibitorCompanyEventCreationResult } from "../lib/licenses/evaluate-exhibitor-company-event-creation";

const basePayload = {
  companyId: "co-exhibitor-1",
  name: "Summit",
  timezone: "America/New_York",
  location: null as string | null,
  city: null as string | null,
  state: null as string | null,
  startDate: "2026-01-10",
  endDate: "2026-01-12",
  status: "UPCOMING" as const
};

function entAllowed(): ExhibitorCompanyEventCreationResult {
  return {
    allowed: true,
    reason: "allowed",
    message: "ok",
    licenseId: "lic-1",
    currentEventCount: 1,
    maxEvents: null
  };
}

function entDenied(
  reason: Exclude<ExhibitorCompanyEventCreationResult["reason"], "allowed">
): ExhibitorCompanyEventCreationResult {
  return {
    allowed: false,
    reason,
    message: "denied",
    licenseId: "lic-1",
    currentEventCount: 0,
    maxEvents: null
  };
}

test("exhibitor_admin + valid entitlement + capacity => create succeeds", async () => {
  let insertCalls = 0;
  const r = await executeCreateEventMutation(
    { role: "exhibitor_admin", userId: "u1", companyId: "co-exhibitor-1" },
    basePayload,
    {
      evaluateExhibitorEntitlement: async () => entAllowed(),
      insertEvent: async () => {
        insertCalls += 1;
        return { eventId: "evt-created", errorMessage: null };
      }
    }
  );
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.eventId, "evt-created");
  }
  assert.equal(insertCalls, 1);
});

test("event creation carries the optional canonical location field", async () => {
  let insertedLocation: string | null | undefined;
  const r = await executeCreateEventMutation(
    { role: "exhibitor_admin", userId: "u1", companyId: "co-exhibitor-1" },
    { ...basePayload, location: "  Hall A, New York  " },
    {
      evaluateExhibitorEntitlement: async () => entAllowed(),
      insertEvent: async (payload) => {
        insertedLocation = payload.location;
        return { eventId: "evt-location", errorMessage: null };
      }
    }
  );
  assert.equal(r.ok, true);
  assert.equal(insertedLocation, "  Hall A, New York  ");
});

test("event creation remains valid when optional location is omitted", async () => {
  let insertedLocation: string | null | undefined = "uninitialized";
  const { location: _location, ...payloadWithoutLocation } = basePayload;
  const r = await executeCreateEventMutation(
    { role: "exhibitor_admin", userId: "u1", companyId: "co-exhibitor-1" },
    payloadWithoutLocation,
    {
      evaluateExhibitorEntitlement: async () => entAllowed(),
      insertEvent: async (payload) => {
        insertedLocation = payload.location;
        return { eventId: "evt-no-location", errorMessage: null };
      }
    }
  );
  assert.equal(r.ok, true);
  assert.equal(insertedLocation, undefined);
});

test("event creation rejects a missing or invalid IANA timezone before entitlement or insert", async () => {
  let entitlementCalls = 0;
  let insertCalls = 0;
  for (const timezone of ["", "Eastern Time", "not/a-zone"]) {
    const result = await executeCreateEventMutation(
      { role: "exhibitor_admin", userId: "u1", companyId: "co-exhibitor-1" },
      { ...basePayload, timezone },
      {
        evaluateExhibitorEntitlement: async () => {
          entitlementCalls += 1;
          return entAllowed();
        },
        insertEvent: async () => {
          insertCalls += 1;
          return { eventId: "should-not-exist", errorMessage: null };
        }
      }
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "EVENT_CREATION_INVALID_TIMEZONE");
  }
  assert.equal(entitlementCalls, 0);
  assert.equal(insertCalls, 0);
});

test("exhibitor_admin + no eligible company license => denied, no insert", async () => {
  let insertCalls = 0;
  const r = await executeCreateEventMutation(
    { role: "exhibitor_admin", userId: "u1", companyId: "co-exhibitor-1" },
    basePayload,
    {
      evaluateExhibitorEntitlement: async () => entDenied("no_license"),
      insertEvent: async () => {
        insertCalls += 1;
        return { eventId: "evt-x", errorMessage: null };
      }
    }
  );
  assert.equal(r.ok, false);
  assert.equal(insertCalls, 0);
  if (!r.ok) {
    assert.equal(r.status, 403);
    assert.equal(r.error.code, "EVENT_CREATION_NO_ELIGIBLE_LICENSE");
    assert.equal(r.error.reason, "no_license");
  }
});

test("exhibitor_admin + expired license => denied, no insert", async () => {
  let insertCalls = 0;
  const r = await executeCreateEventMutation(
    { role: "exhibitor_admin", userId: "u1", companyId: "co-exhibitor-1" },
    basePayload,
    {
      evaluateExhibitorEntitlement: async () => entDenied("license_expired"),
      insertEvent: async () => {
        insertCalls += 1;
        return { eventId: "evt-x", errorMessage: null };
      }
    }
  );
  assert.equal(r.ok, false);
  assert.equal(insertCalls, 0);
  if (!r.ok) {
    assert.equal(r.error.code, "EVENT_CREATION_LICENSE_EXPIRED");
    assert.equal(r.error.reason, "license_expired");
  }
});

test("exhibitor_admin + inactive license => denied, no insert", async () => {
  let insertCalls = 0;
  const r = await executeCreateEventMutation(
    { role: "exhibitor_admin", userId: "u1", companyId: "co-exhibitor-1" },
    basePayload,
    {
      evaluateExhibitorEntitlement: async () => entDenied("license_inactive"),
      insertEvent: async () => {
        insertCalls += 1;
        return { eventId: "evt-x", errorMessage: null };
      }
    }
  );
  assert.equal(r.ok, false);
  assert.equal(insertCalls, 0);
  if (!r.ok) {
    assert.equal(r.error.code, "EVENT_CREATION_LICENSE_INACTIVE");
    assert.equal(r.error.reason, "license_inactive");
  }
});

test("exhibitor_admin + capability disabled => denied, no insert", async () => {
  let insertCalls = 0;
  const r = await executeCreateEventMutation(
    { role: "exhibitor_admin", userId: "u1", companyId: "co-exhibitor-1" },
    basePayload,
    {
      evaluateExhibitorEntitlement: async () => entDenied("capability_disabled"),
      insertEvent: async () => {
        insertCalls += 1;
        return { eventId: "evt-x", errorMessage: null };
      }
    }
  );
  assert.equal(r.ok, false);
  assert.equal(insertCalls, 0);
  if (!r.ok) {
    assert.equal(r.error.code, "EVENT_CREATION_CAPABILITY_DISABLED");
    assert.equal(r.error.reason, "capability_disabled");
  }
});

test("exhibitor_admin at max event limit => denied, no insert", async () => {
  let insertCalls = 0;
  const r = await executeCreateEventMutation(
    { role: "exhibitor_admin", userId: "u1", companyId: "co-exhibitor-1" },
    basePayload,
    {
      evaluateExhibitorEntitlement: async () => entDenied("event_limit_reached"),
      insertEvent: async () => {
        insertCalls += 1;
        return { eventId: "evt-x", errorMessage: null };
      }
    }
  );
  assert.equal(r.ok, false);
  assert.equal(insertCalls, 0);
  if (!r.ok) {
    assert.equal(r.error.code, "EVENT_CREATION_EVENT_LIMIT_REACHED");
    assert.equal(r.error.reason, "event_limit_reached");
  }
});

test("platform_admin does not call exhibitor entitlement helper", async () => {
  let evalCalls = 0;
  const r = await executeCreateEventMutation(
    { role: "platform_admin", userId: "u1", companyId: null },
    { ...basePayload, companyId: "co-platform-target" },
    {
      evaluateExhibitorEntitlement: async () => {
        evalCalls += 1;
        return entDenied("no_license");
      },
      insertEvent: async () => ({ eventId: "evt-p", errorMessage: null })
    }
  );
  assert.equal(evalCalls, 0);
  assert.equal(r.ok, true);
});

test("organizer_admin does not call exhibitor entitlement helper", async () => {
  let evalCalls = 0;
  const r = await executeCreateEventMutation(
    { role: "organizer_admin", userId: "u1", companyId: "co-org" },
    { ...basePayload, companyId: "co-event-owner" },
    {
      evaluateExhibitorEntitlement: async () => {
        evalCalls += 1;
        return entAllowed();
      },
      insertEvent: async () => ({ eventId: "evt-o", errorMessage: null })
    }
  );
  assert.equal(evalCalls, 0);
  assert.equal(r.ok, true);
});

test("new event creation runs event signal reconciliation after insert", async () => {
  const reconciledEventIds: string[] = [];
  const r = await executeCreateEventMutation(
    { role: "platform_admin", userId: "u-platform", companyId: null },
    { ...basePayload, companyId: "co-platform-target" },
    {
      evaluateExhibitorEntitlement: async () => entDenied("no_license"),
      insertEvent: async () => ({ eventId: "evt-with-signals", errorMessage: null }),
      reconcileEventSignals: async (eventId, actor) => {
        reconciledEventIds.push(`${eventId}:${actor.userId}`);
        return { ok: true };
      }
    }
  );

  assert.equal(r.ok, true);
  assert.deepEqual(reconciledEventIds, ["evt-with-signals:u-platform"]);
});

test("event creation reports a scoped signal copy failure", async () => {
  const r = await executeCreateEventMutation(
    { role: "platform_admin", userId: "u-platform", companyId: null },
    { ...basePayload, companyId: "co-platform-target" },
    {
      evaluateExhibitorEntitlement: async () => entDenied("no_license"),
      insertEvent: async () => ({ eventId: "evt-without-signals", errorMessage: null }),
      reconcileEventSignals: async () => ({
        ok: false,
        errorMessage: "copy failed"
      })
    }
  );

  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.status, 500);
    assert.equal(r.error.code, "EVENT_CREATION_SIGNAL_COPY_FAILED");
    assert.equal(r.error.message, "copy failed");
  }
});
