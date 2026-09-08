import test from "node:test";
import assert from "node:assert/strict";
import {
  canMutateSignalInContext,
  isEventArchivedForSignalMutations,
  normalizeSignalScope,
  signalScopeLabel
} from "../lib/signals/signal-scope";

test("signal scope labels use finalized customer-facing names", () => {
  assert.equal(signalScopeLabel("default"), "Default");
  assert.equal(signalScopeLabel("company"), "Global");
  assert.equal(signalScopeLabel("event"), "Event");
  assert.equal(signalScopeLabel("private"), "Private");
  assert.equal(normalizeSignalScope("global", "event"), "event");
});

test("event archive/read-only state is derived from existing status and end date", () => {
  assert.equal(isEventArchivedForSignalMutations({ status: "COMPLETED" }), true);
  assert.equal(
    isEventArchivedForSignalMutations({ status: "ACTIVE", endDate: "2026-05-22" }, Date.parse("2026-05-23T12:00:00Z")),
    true
  );
  assert.equal(
    isEventArchivedForSignalMutations(
      { status: "ACTIVE", endDate: "2026-05-22", containerKind: "continuous_capture" },
      Date.parse("2026-05-23T12:00:00Z")
    ),
    false
  );
});

test("company-wide signals mutate only inside their company boundary, even when ownerful", () => {
  assert.equal(
    canMutateSignalInContext(
      { signal_scope: "company", company_id: "company-a", event_id: null, owner_user_id: "user-a" },
      { userId: "user-a", companyId: "company-a", eventId: "event-a" }
    ),
    true
  );
  assert.equal(
    canMutateSignalInContext(
      { signal_scope: "company", company_id: "company-b", event_id: null, owner_user_id: null },
      { userId: "user-a", companyId: "company-a", eventId: "event-a" }
    ),
    false
  );
});

test("event and private signals do not cross event, company, or user boundaries", () => {
  assert.equal(
    canMutateSignalInContext(
      { signal_scope: "event", company_id: "company-a", event_id: "event-a", owner_user_id: "user-b" },
      { userId: "user-a", companyId: "company-a", eventId: "event-a" }
    ),
    true
  );
  assert.equal(
    canMutateSignalInContext(
      { signal_scope: "event", company_id: "company-a", event_id: "event-b", owner_user_id: null },
      { userId: "user-a", companyId: "company-a", eventId: "event-a" }
    ),
    false
  );
  assert.equal(
    canMutateSignalInContext(
      { signal_scope: "private", company_id: "company-a", event_id: "event-a", owner_user_id: null },
      { userId: "user-a", companyId: "company-a", eventId: "event-a" }
    ),
    false
  );
  assert.equal(
    canMutateSignalInContext(
      { signal_scope: "private", company_id: "company-a", event_id: "event-a", owner_user_id: "user-a" },
      { userId: "user-a", companyId: "company-a", eventId: "event-a" }
    ),
    true
  );
  assert.equal(
    canMutateSignalInContext(
      { signal_scope: "private", company_id: "company-a", event_id: "event-a", owner_user_id: "user-b" },
      { userId: "user-a", companyId: "company-a", eventId: "event-a" }
    ),
    false
  );
});

test("default and archived event-owned signals are not directly mutable", () => {
  assert.equal(
    canMutateSignalInContext(
      { signal_scope: "default", company_id: null, event_id: null, owner_user_id: null },
      { userId: "user-a", companyId: "company-a", eventId: "event-a" }
    ),
    false
  );
  assert.equal(
    canMutateSignalInContext(
      { signal_scope: "event", company_id: "company-a", event_id: "event-a", owner_user_id: "user-a" },
      { userId: "user-a", companyId: "company-a", eventId: "event-a", eventArchived: true }
    ),
    false
  );
});
