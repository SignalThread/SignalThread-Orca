import assert from "node:assert/strict";
import test from "node:test";
import { eventOwnerEligibilityWhere } from "../src/server/services/event-assignable-users";

test("event owner eligibility requires the current event EventMember grant", () => {
  assert.deepEqual(eventOwnerEligibilityWhere("event-a"), { eventMemberships: { some: { eventId: "event-a" } } });
  assert.deepEqual(eventOwnerEligibilityWhere("event-a", "user-a"), { id: "user-a", eventMemberships: { some: { eventId: "event-a" } } });
});

test("duplicate display names remain distinguishable by email", () => {
  const label = (name: string | null, email: string) => `${name?.trim() || email} — ${email}`;
  assert.notEqual(label("Sarah", "sarah@one.test"), label("Sarah", "sarah@two.test"));
});
