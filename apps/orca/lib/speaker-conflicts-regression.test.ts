import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { computeSpeakerSessionConflicts, type SpeakerSessionSlot } from "./speaker-conflicts";

const conflictServiceSource = readFileSync("src/server/services/speaker-conflicts.ts", "utf8");
const conflictRouteSource = readFileSync("app/api/events/[eventId]/speaker-conflicts/route.ts", "utf8");

function slot(overrides: Partial<SpeakerSessionSlot>): SpeakerSessionSlot {
  return {
    speakerId: "speaker-1",
    speakerName: "Ada Lovelace",
    sessionId: "session-1",
    sessionName: "Keynote",
    roomName: "Main Hall",
    dayDate: "2026-06-10",
    startTime: "09:00",
    endTime: "10:00",
    ...overrides,
  };
}

test("overlapping same-speaker sessions are flagged", () => {
  const conflicts = computeSpeakerSessionConflicts([
    slot({ sessionId: "a", startTime: "09:00", endTime: "10:00" }),
    slot({ sessionId: "b", sessionName: "Workshop", startTime: "09:30", endTime: "10:30" }),
  ]);

  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].type, "session_overlap");
  assert.deepEqual(conflicts[0].sessionIds, ["a", "b"]);
  assert.equal(conflicts[0].speakerId, "speaker-1");
});

test("non-overlapping assignments are not flagged", () => {
  const conflicts = computeSpeakerSessionConflicts([
    slot({ sessionId: "a", startTime: "09:00", endTime: "10:00" }),
    slot({ sessionId: "b", startTime: "10:30", endTime: "11:30" }),
  ]);

  assert.equal(conflicts.length, 0);
});

test("different speakers in overlapping sessions do not conflict", () => {
  const conflicts = computeSpeakerSessionConflicts([
    slot({ sessionId: "a", speakerId: "speaker-1" }),
    slot({ sessionId: "b", speakerId: "speaker-2", speakerName: "Grace Hopper" }),
  ]);

  assert.equal(conflicts.length, 0);
});

test("overlaps on different days do not conflict", () => {
  const conflicts = computeSpeakerSessionConflicts([
    slot({ sessionId: "a", dayDate: "2026-06-10" }),
    slot({ sessionId: "b", dayDate: "2026-06-11" }),
  ]);

  assert.equal(conflicts.length, 0);
});

test("zero-gap transitions across different rooms are flagged as tight transitions", () => {
  const conflicts = computeSpeakerSessionConflicts([
    slot({ sessionId: "a", startTime: "09:00", endTime: "10:00", roomName: "Main Hall" }),
    slot({ sessionId: "b", startTime: "10:00", endTime: "11:00", roomName: "Breakout 2" }),
  ]);

  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].type, "tight_room_transition");
});

test("zero-gap transitions within the same room are fine", () => {
  const conflicts = computeSpeakerSessionConflicts([
    slot({ sessionId: "a", startTime: "09:00", endTime: "10:00", roomName: "Main Hall" }),
    slot({ sessionId: "b", startTime: "10:00", endTime: "11:00", roomName: "Main Hall" }),
  ]);

  assert.equal(conflicts.length, 0);
});

test("missing or partial session times fail soft", () => {
  const conflicts = computeSpeakerSessionConflicts([
    slot({ sessionId: "a", startTime: null, endTime: null }),
    slot({ sessionId: "b", startTime: "09:00", endTime: null }),
    slot({ sessionId: "c", startTime: "not-a-time", endTime: "10:00" }),
    slot({ sessionId: "d", startTime: "09:00", endTime: "10:00" }),
  ]);

  assert.equal(conflicts.length, 0);
});

test("duplicate slot rows for the same session do not self-conflict", () => {
  const conflicts = computeSpeakerSessionConflicts([
    slot({ sessionId: "a" }),
    slot({ sessionId: "a" }),
  ]);

  assert.equal(conflicts.length, 0);
});

test("conflict service is event-scoped on both session and speaker", () => {
  assert.equal(conflictServiceSource.includes('await assertEventAccessForUser(eventId, user, "read")'), true);
  assert.equal(conflictServiceSource.includes("session: { eventId }"), true);
  assert.equal(conflictServiceSource.includes("speaker: { eventId }"), true);
  assert.equal(conflictServiceSource.includes("computeSpeakerSessionConflicts(slots)"), true);
  // Read-only: no writes from conflict detection
  assert.equal(conflictServiceSource.includes(".create"), false);
  assert.equal(conflictServiceSource.includes(".update"), false);
  assert.equal(conflictServiceSource.includes(".delete"), false);
});

test("conflict inputs are derived from Matrix sessions in the same event only", () => {
  const serviceSource = conflictServiceSource.slice(
    conflictServiceSource.indexOf("export async function getSpeakerConflicts"),
  );
  assert.equal(serviceSource.includes("sessionSpeakerAssignment.findMany"), true);
  assert.equal(serviceSource.includes("session: { eventId }"), true);
  assert.equal(serviceSource.includes("speaker: { eventId }"), true);
  assert.equal(serviceSource.includes("sessionName: true"), true);
  assert.equal(serviceSource.includes("roomName: true"), true);
  assert.equal(serviceSource.includes("dayDate: true"), true);
});

test("conflict route is authenticated", () => {
  assert.equal(conflictRouteSource.includes("resolveRequestUser(request)"), true);
  assert.equal(conflictRouteSource.includes("getSpeakerConflicts(eventId, authResult.user)"), true);
});
