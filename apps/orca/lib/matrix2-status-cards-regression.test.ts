import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MATRIX2_TEMPLATES } from "../app/(shell)/matrix-2/_components/types";

const drawerSource = readFileSync("app/(shell)/matrix-2/_components/Matrix2DetailsDrawer.tsx", "utf8");
const boardSource = readFileSync("app/(shell)/matrix-2/_components/Matrix2Board.tsx", "utf8");
const readinessSource = readFileSync("app/(shell)/matrix-2/_components/matrix2-session-readiness.ts", "utf8");

test("Matrix 2 seating status labels explain the source of the count", () => {
  assert.match(readinessSource, /seatingRequired: session\.expectedAttendance !== null \? true : undefined/);
  assert.match(readinessSource, /hardProblems: conflicts\.filter\(\(conflict\) => conflict\.type === "ROOM_CAPACITY_EXCEEDED"\)/);
  assert.match(readinessSource, /moduleActionReadiness\(modules, "seating", null\)/);
  assert.match(drawerSource, /Full workspace/);
  assert.doesNotMatch(drawerSource, /plannedSeatCount/);
});

test("Matrix 2 Room Set status uses the shared readiness contract", () => {
  assert.match(readinessSource, /deriveSessionModuleReadiness/);
  assert.match(readinessSource, /includeRoomSetAndSeating: isRoomSetAndSeatingAvailable\(\)/);
  assert.match(readinessSource, /SESSION_READINESS_METADATA/);
  assert.match(readinessSource, /roomSet: \{/);
  assert.match(readinessSource, /roomRequired: true/);
  assert.match(readinessSource, /layoutExists: roomSetRequirementCount > 0/);
  assert.match(readinessSource, /hasStarted: Boolean\(session\.roomId \|\| session\.roomName\.trim\(\) \|\| session\.roomSetup\.trim\(\) \|\| roomSetRequirementCount > 0\)/);
  assert.doesNotMatch(boardSource, /Room set started/);
});

test("Matrix 2 board launcher avoids fake Room Set and Seating progress", () => {
  assert.match(boardSource, /deriveMatrix2SessionReadiness\(session, conflicts\)/);
  assert.match(readinessSource, /statusTone\(readiness\.status\)/);
  assert.match(readinessSource, /status === "needs_info" \|\| status === "not_started"\) return "attention"/);
  assert.match(readinessSource, /status === "blocked"\) return "missing"/);
  assert.doesNotMatch(boardSource, /Seating needs attention/);
  assert.doesNotMatch(boardSource, /Seating not applicable/);
  assert.doesNotMatch(boardSource, /Room set: \$\{session\.roomSetup/);
});

test("Matrix 2 session templates do not inject hardcoded seating counts", () => {
  for (const template of MATRIX2_TEMPLATES) {
    assert.equal(template.defaultAttendance, null, `${template.id} should not seed expected attendance`);
  }

  assert.doesNotMatch(drawerSource, /250 expected/);
  assert.doesNotMatch(boardSource, /250 expected/);
});
