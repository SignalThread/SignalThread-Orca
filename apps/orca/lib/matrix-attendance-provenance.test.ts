import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { buildMatrixImportCreateData } from "@/lib/matrix";

const workspaceRoot = resolve(import.meta.dirname, "../../..");
const schema = readFileSync(resolve(workspaceRoot, "apps/orca/prisma/schema.prisma"), "utf8");
const migration = readFileSync(
  resolve(workspaceRoot, "apps/orca/test-fixtures/legacy-orca-migrations/20260818190000_add_expected_attendance_provenance/migration.sql"),
  "utf8",
);
const sessionService = readFileSync(resolve(import.meta.dirname, "matrix2-session.ts"), "utf8");
const sessionRoute = readFileSync(
  resolve(workspaceRoot, "apps/orca/app/api/events/[eventId]/matrix-2/sessions/[sessionId]/route.ts"),
  "utf8",
);
const workspace = readFileSync(
  resolve(workspaceRoot, "apps/orca/app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-detail-workspace.tsx"),
  "utf8",
);

test("attendance provenance is additive and leaves legacy attendance source unknown", () => {
  assert.match(schema, /attendanceSource\s+ExpectedAttendanceSource\?/);
  assert.match(migration, /ADD COLUMN "attendanceSource" "ExpectedAttendanceSource"/);
  assert.doesNotMatch(migration, /UPDATE "MatrixRow"/);
});

test("Run of Show imports identify supplied attendance as imported", () => {
  const [withAttendance, withoutAttendance] = buildMatrixImportCreateData("event-id", [
    {
      sessionName: "Welcome",
      dayDateIso: "2026-08-18",
      startTime: "09:00",
      endTime: "10:00",
      roomName: null,
      setupType: null,
      avNeeds: null,
      attendance: 240,
      notes: "",
    },
    {
      sessionName: "Break",
      dayDateIso: "2026-08-18",
      startTime: "10:00",
      endTime: "10:30",
      roomName: null,
      setupType: null,
      avNeeds: null,
      attendance: null,
      notes: "",
    },
  ], 0);

  assert.equal(withAttendance?.attendanceSource, "IMPORTED");
  assert.equal(withoutAttendance?.attendanceSource, null);
});

test("session updates allow only canonical provenance and the workspace does not invent RSVP data", () => {
  assert.match(sessionRoute, /"expectedAttendanceSource"/);
  assert.match(sessionService, /expectedAttendanceSource is invalid/);
  assert.match(sessionService, /ExpectedAttendanceSource\.PLANNER_ESTIMATE/);
  assert.match(workspace, /Expected attendance is a planning value/);
  assert.match(workspace, /otherwise it remains unknown/);
  assert.match(workspace, /Registration RSVP/);
});
