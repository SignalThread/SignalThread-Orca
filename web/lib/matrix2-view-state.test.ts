import assert from "node:assert/strict";
import test from "node:test";
import {
  earliestMatrix2SessionDate,
  isCurrentMatrix2SnapshotRequest,
  isMatrix2SnapshotForEvent,
  matrix2SessionsForEventDate,
  resolveMatrix2SelectedDate,
} from "./matrix2-view-state";

const EVENT_ID = "ae4325f3-6a76-469e-ab50-78d0dcd4a4aa";
const OTHER_EVENT_ID = "11111111-1111-4111-8111-111111111111";

const snapshot = {
  event: { id: EVENT_ID, startDate: "2026-10-12" },
  sessions: [
    ...Array.from({ length: 4 }, (_, index) => ({ id: `oct-12-${index}`, eventId: EVENT_ID, date: "2026-10-12" })),
    ...Array.from({ length: 15 }, (_, index) => ({ id: `oct-13-${index}`, eventId: EVENT_ID, date: "2026-10-13" })),
    ...Array.from({ length: 8 }, (_, index) => ({ id: `oct-14-${index}`, eventId: EVENT_ID, date: "2026-10-14" })),
    { id: "oct-15-0", eventId: EVENT_ID, date: "2026-10-15" },
  ],
};

test("event-scoped Matrix snapshots reject a persisted event from another event", () => {
  assert.equal(isMatrix2SnapshotForEvent(snapshot, EVENT_ID), true);
  assert.equal(isMatrix2SnapshotForEvent(snapshot, OTHER_EVENT_ID), false);
  assert.equal(isMatrix2SnapshotForEvent(null, EVENT_ID), false);
  assert.equal(matrix2SessionsForEventDate({ snapshot, eventId: OTHER_EVENT_ID, date: "2026-10-12" }).length, 0);
});

test("a response superseded by another event request is never applied", () => {
  assert.equal(isCurrentMatrix2SnapshotRequest(4, 5), false);
  assert.equal(isCurrentMatrix2SnapshotRequest(5, 5), true);
});

test("Matrix defaults a new event to its earliest populated session date", () => {
  assert.equal(earliestMatrix2SessionDate(snapshot), "2026-10-12");
  assert.equal(resolveMatrix2SelectedDate({ snapshot, currentDate: "2026-10-13", preserveCurrentDate: false }), "2026-10-12");
  assert.equal(resolveMatrix2SelectedDate({ snapshot, currentDate: "2026-10-13", preserveCurrentDate: true }), "2026-10-13");
});

test("Matrix Board and List begin with the same four October 12 sessions and retain date counts", () => {
  const initialDate = resolveMatrix2SelectedDate({ snapshot, currentDate: "", preserveCurrentDate: false });
  const boardSessions = matrix2SessionsForEventDate({ snapshot, eventId: EVENT_ID, date: initialDate });
  const listSessions = matrix2SessionsForEventDate({ snapshot, eventId: EVENT_ID, date: initialDate });

  assert.equal(snapshot.sessions.length, 28);
  assert.equal(initialDate, "2026-10-12");
  assert.equal(boardSessions.length, 4);
  assert.deepEqual(listSessions.map((session) => session.id), boardSessions.map((session) => session.id));
  assert.equal(matrix2SessionsForEventDate({ snapshot, eventId: EVENT_ID, date: "2026-10-13" }).length, 15);
  assert.equal(matrix2SessionsForEventDate({ snapshot, eventId: EVENT_ID, date: "2026-10-14" }).length, 8);
  assert.equal(matrix2SessionsForEventDate({ snapshot, eventId: EVENT_ID, date: "2026-10-15" }).length, 1);
});
