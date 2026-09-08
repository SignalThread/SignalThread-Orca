import test from "node:test";
import assert from "node:assert/strict";
import {
  eventCreationNoAssigneeCompanyError,
  eventCreationValidationError
} from "../lib/events/create-event-mutation-core";

test("eventCreationValidationError uses stable code and omits reason", () => {
  const e = eventCreationValidationError("Please complete all required fields.");
  assert.equal(e.code, "EVENT_CREATION_VALIDATION");
  assert.equal(e.message, "Please complete all required fields.");
  assert.equal(e.reason, undefined);
});

test("eventCreationNoAssigneeCompanyError matches mutation-layer missing-company code", () => {
  const e = eventCreationNoAssigneeCompanyError();
  assert.equal(e.code, "EVENT_CREATION_MISSING_COMPANY");
  assert.ok(e.message.length > 0);
  assert.equal(e.reason, undefined);
});
