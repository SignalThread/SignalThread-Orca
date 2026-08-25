import assert from "node:assert/strict";
import test from "node:test";

import { toSessionEditPayload } from "./copilot/actions";
import type { Matrix2SessionRecord } from "./matrix2";

// updateMatrix2Session is a full-replace: any field the copilot's read-modify-write
// base payload omits is persisted as its empty/default value. Regression: the base
// payload previously omitted `status` (wiped to "") and `foodAndBeverage` (wiped to
// []), so any copilot mutation of one slice clobbered them.

function buildSessionRecord(overrides: Partial<Matrix2SessionRecord> = {}): Matrix2SessionRecord {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    rowId: "22222222-2222-2222-2222-222222222222",
    eventId: "33333333-3333-3333-3333-333333333333",
    sortOrder: 0,
    date: "2026-07-02",
    startTime: "09:00",
    endTime: "10:00",
    roomId: null,
    roomName: "Unassigned",
    title: "Keynote",
    sessionType: "Session",
    status: "Confirmed",
    expectedAttendance: 120,
    roomSetup: "Theater",
    roomCapacity: null,
    speakers: [],
    speakerAssignments: [],
    avRequirements: [],
    avRequirementsStructured: [],
    foodAndBeverage: ["Plated Lunch", "PM Snack"],
    foodService: null,
    staffAssigned: [],
    staffAssignments: [],
    requirementSelections: [],
    notes: "Existing operator notes",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

test("copilot session base payload preserves status and foodAndBeverage (no clobber)", () => {
  const session = buildSessionRecord();
  const payload = toSessionEditPayload(session);

  // The two fields that were previously omitted -> silently wiped by full-replace.
  assert.equal(payload.status, "Confirmed");
  assert.deepEqual(payload.foodAndBeverage, ["Plated Lunch", "PM Snack"]);

  // Other existing state is carried through the read side too.
  assert.equal(payload.title, "Keynote");
  assert.equal(payload.sessionType, "Session");
  assert.equal(payload.notes, "Existing operator notes");
});

test("mutating one slice of the copilot payload leaves status/foodAndBeverage intact", () => {
  const session = buildSessionRecord({ status: "Tentative" });
  const payload = toSessionEditPayload(session);

  // Mirror applySessionStructuredUpdate: mutate only one slice (add a speaker).
  const speakers = Array.isArray(payload.speakers)
    ? (payload.speakers as Array<{ name: string }>)
    : [];
  speakers.push({ name: "Jane Doe" });
  payload.speakers = speakers;

  assert.equal(payload.status, "Tentative");
  assert.deepEqual(payload.foodAndBeverage, ["Plated Lunch", "PM Snack"]);
  assert.deepEqual(payload.speakers, [{ name: "Jane Doe" }]);
});
