import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { deriveSessionReadiness } from "./session-readiness";

const workspace = readFileSync(
  "app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-detail-workspace.tsx",
  "utf8",
);
const features = readFileSync("src/config/features.ts", "utf8");

/* ── Room Set & Seating stays Coming soon ──────────────────────────────────────────── */

test("Room Set and Seating are gated off by default in every runtime", () => {
  assert.match(features, /process\.env\.NEXT_PUBLIC_ROOM_SET_SEATING_PREVIEW === "true"/);
  // The production lockout still wins over the local opt-in.
  assert.match(features, /process\.env\.NEXT_PUBLIC_PW_E2E_PRODUCTION_AVAILABILITY !== "true"/);
  assert.match(features, /Coming soon/);
});

test("Room Set and Seating contribute nothing to readiness when gated off", () => {
  const input = {
    details: { title: "Session", startTime: "09:00", endTime: "10:00", roomName: "Hall", sessionType: "Session" },
    speakers: { required: false, assignedCount: 0 },
    av: { required: false, requirements: [] },
    fnb: { serviceRequired: false, assignments: [] },
    staffing: { required: false, assignedCount: 0 },
    supplies: { required: false },
    signage: { required: false },
    // Both modules would otherwise apply and block on a capacity problem.
    roomSet: { applies: true, roomRequired: true, expectedAttendance: 500, layoutExists: false, hasStarted: false },
    seating: { applies: true, seatingRequired: true, expectedAttendance: 500, hasStarted: false },
    conflicts: { conflicts: [] },
    notesActivity: { notes: "" },
  } as never;

  const gatedOff = deriveSessionReadiness(input, { includeRoomSetAndSeating: false });
  assert.equal(gatedOff.modules["room-set"].status, "not_needed");
  assert.equal(gatedOff.modules.seating.status, "not_needed");
  // Nothing about the gated modules may reach the attention queue.
  assert.equal(
    gatedOff.attentionItems.filter((entry) => entry.moduleId === "room-set" || entry.moduleId === "seating").length,
    0,
  );

  // With the gate on they do apply, proving the exclusion is the gate and not a dead code path.
  const gatedOn = deriveSessionReadiness(input, { includeRoomSetAndSeating: true });
  assert.notEqual(gatedOn.modules["room-set"].status, "not_needed");
});

test("a capacity conflict is not re-pointed at Room Set while it is gated off", () => {
  const withConflict = {
    details: { title: "S", startTime: "09:00", endTime: "10:00", roomName: "Hall", sessionType: "Session" },
    speakers: { required: false, assignedCount: 0 },
    av: { required: false, requirements: [] },
    fnb: { serviceRequired: false, assignments: [] },
    staffing: { required: false, assignedCount: 0 },
    supplies: { required: false },
    signage: { required: false },
    roomSet: { applies: true, roomRequired: true, expectedAttendance: 500, layoutExists: false, hasStarted: false },
    seating: { applies: true, seatingRequired: true, expectedAttendance: 500, hasStarted: false },
    conflicts: { conflicts: [{ id: "c1", type: "ROOM_CAPACITY_EXCEEDED", severity: "warning", message: "Over capacity" }] },
    notesActivity: { notes: "" },
  } as never;

  const result = deriveSessionReadiness(withConflict, { includeRoomSetAndSeating: false });
  const capacityItem = result.attentionItems.find((entry) => entry.id === "c1");
  assert.ok(capacityItem);
  assert.notEqual(capacityItem.targetModuleId, "room-set");
});

test("the session workspace keeps a non-interactive Coming soon entry when gated off", () => {
  assert.match(workspace, /if \(!roomSetAndSeatingAvailable\) \{/);
  assert.match(workspace, /includeRoomSetAndSeating: roomSetAndSeatingAvailable/);
});
