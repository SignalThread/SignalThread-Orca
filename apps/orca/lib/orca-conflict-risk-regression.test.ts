import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { detectMatrix2Conflicts } from "@/app/(shell)/matrix-2/_components/conflict-utils";
import type { Matrix2Session } from "@/app/(shell)/matrix-2/_components/types";

function session(overrides: Partial<Matrix2Session>): Matrix2Session {
  return {
    id: "session-1",
    rowId: "session-1",
    eventId: "event-1",
    sortOrder: 0,
    date: "2026-09-10",
    startTime: "09:00",
    endTime: "10:00",
    roomId: "room-1",
    roomName: "Main room",
    title: "Opening",
    sessionType: "General",
    status: "CONFIRMED",
    expectedAttendance: 10,
    roomCapacity: 100,
    roomSetup: "Theater",
    speakers: [],
    speakerAssignments: [],
    avRequirements: [],
    avRequirementsStructured: [],
    foodAndBeverage: [],
    foodService: null,
    staffAssigned: [],
    staffAssignments: [],
    requirementSelections: [],
    notes: "",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

test("overlapping structured staff assignments produce one explainable linked conflict", () => {
  const sharedStaff = { personId: "person-1", name: "Alex Rivera", role: "staff" as const, assignmentRole: "Stage manager", company: null, email: null };
  const result = detectMatrix2Conflicts([
    session({ staffAssignments: [sharedStaff] }),
    session({ id: "session-2", rowId: "session-2", roomId: "room-2", roomName: "Breakout", title: "Panel", startTime: "09:30", endTime: "10:30", staffAssignments: [sharedStaff] }),
  ]);
  const staffConflicts = result.conflicts.filter((conflict) => conflict.type === "STAFF_DOUBLE_BOOKED");
  assert.equal(staffConflicts.length, 1);
  assert.equal(staffConflicts[0]?.staffName, "Alex Rivera");
  assert.equal(staffConflicts[0]?.relatedSessionId, "session-2");
  assert.match(staffConflicts[0]?.message ?? "", /Opening and Panel/);
  assert.match(staffConflicts[0]?.reason ?? "", /same staff or vendor record/);
});

test("incomplete records do not create false room, speaker, or staff conflicts", () => {
  const result = detectMatrix2Conflicts([
    session({ roomId: null, roomName: "Unassigned", speakers: [], staffAssignments: [] }),
    session({ id: "session-2", rowId: "session-2", roomId: null, roomName: "Unassigned", speakers: [], staffAssignments: [] }),
  ]);
  assert.equal(result.conflicts.length, 0);
});

test("risk and conflict surfaces expose severity, reason, and navigation", () => {
  const drawer = readFileSync("app/(shell)/matrix-2/_components/Matrix2DetailsDrawer.tsx", "utf8");
  const workspace = readFileSync("app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-detail-workspace.tsx", "utf8");
  const dashboard = readFileSync("app/(shell)/timeline/_components/TimelineDashboardView.tsx", "utf8");
  const dependencies = readFileSync("app/(shell)/timeline/_components/TimelineDependencyPanel.tsx", "utf8");
  assert.match(drawer, /Reason: \{conflict\.reason\}/);
  assert.match(drawer, /View related session/);
  assert.match(workspace, /\?tab=conflicts/);
  assert.match(dashboard, /Planning alerts/);
  assert.match(dashboard, /aria-label=\{`Open \$\{b\.title\}`\}/);
  assert.doesNotMatch(dashboard, /No active blockers\. 🎉/);
  assert.match(dependencies, /onDependenciesChanged\?\.\(\)/);
});
