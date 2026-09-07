import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildConflictCoverageReport, conflictCoverageSummary } from "./conflict-coverage";

const workspace = readFileSync(
  "app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-detail-workspace.tsx",
  "utf8",
);

const EVALUATED_AT = "2026-08-13T15:00:00.000Z";

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1",
    date: "2026-01-19",
    startTime: "09:00",
    endTime: "10:00",
    roomId: "room-1",
    roomName: "Expo Hall",
    expectedAttendance: 100,
    roomCapacity: 200,
    speakers: ["Ada Lovelace"],
    ...overrides,
  };
}

function report(sessions: ReturnType<typeof session>[], conflicts: Array<{ type: string }> = []) {
  return buildConflictCoverageReport({
    sessions,
    conflicts,
    scopeLabel: `${sessions.length} sessions on Jan 19`,
    evaluatedAt: EVALUATED_AT,
  });
}

test("a clean run reports how many checks passed and over what, not a blanket all-clear", () => {
  const summary = conflictCoverageSummary(report([session(), session({ id: "s2", roomName: "Ballroom", roomId: "room-2" })]));
  assert.match(summary, /No conflicts found across 3 completed checks over 2 sessions on Jan 19\./);
  assert.match(summary, /5 checks were incomplete or unsupported\./);
});

test("unsupported rules are reported rather than omitted", () => {
  const unsupported = report([session()]).checks.filter((check) => check.status === "unsupported");
  assert.deepEqual(
    unsupported.map((check) => check.id),
    ["av-resource-collision", "room-turn", "fnb-service-timing", "dependencies-approvals"],
  );
  for (const check of unsupported) {
    assert.ok(check.exclusions[0]?.reason, `${check.id} must explain why it did not run`);
  }
});

test("structured staff assignments are evaluated instead of reported as unsupported", () => {
  const staffReport = report([
    session({ staffAssignments: [{ personId: "person-1" }] }),
    session({ id: "s2", roomId: "room-2", roomName: "Ballroom", staffAssignments: [{ personId: "person-1" }] }),
  ], [{ type: "STAFF_DOUBLE_BOOKED" }]);
  const check = staffReport.checks.find((entry) => entry.id === "staff-double-booked");
  assert.equal(check?.status, "found");
  assert.equal(check?.findingCount, 1);
});

test("a rule that evaluated nothing is limited, never passed", () => {
  const untimed = report([session({ startTime: "", endTime: "" })]);
  const roomCheck = untimed.checks.find((check) => check.id === "room-overlap");
  assert.equal(roomCheck?.evaluatedCount, 0);
  assert.equal(roomCheck?.status, "limited");
  assert.equal(untimed.hasLimitations, true);
});

test("sessions skipped for missing times or rooms are counted as exclusions, not dropped", () => {
  const mixed = report([
    session(),
    session({ id: "s2", startTime: "bad", endTime: "10:00" }),
    session({ id: "s3", roomId: null, roomName: "Unassigned" }),
  ]);
  const roomCheck = mixed.checks.find((check) => check.id === "room-overlap");

  assert.equal(roomCheck?.evaluatedCount, 1);
  assert.deepEqual(roomCheck?.exclusions, [
    { reason: "Session has no usable start or end time", count: 1 },
    { reason: "Session has no assigned room", count: 1 },
  ]);
  // Every session is accounted for: evaluated + excluded covers the full set.
  assert.equal(
    (roomCheck?.evaluatedCount ?? 0) + (roomCheck?.exclusions.reduce((n, e) => n + e.count, 0) ?? 0),
    3,
  );
});

test("capacity is not verified when attendance or capacity is unknown", () => {
  const capacityCheck = report([session({ roomCapacity: null })]).checks.find(
    (check) => check.id === "room-capacity",
  );
  assert.equal(capacityCheck?.evaluatedCount, 0);
  assert.equal(capacityCheck?.status, "limited");
  assert.match(capacityCheck?.exclusions[0]?.reason ?? "", /not recorded/);
});

test("findings are attributed to the rule that produced them", () => {
  const withFindings = report([session(), session({ id: "s2" })], [
    { type: "ROOM_OVERLAP" },
    { type: "ROOM_OVERLAP" },
    { type: "SPEAKER_DOUBLE_BOOKED" },
  ]);

  assert.equal(withFindings.checks.find((check) => check.id === "room-overlap")?.findingCount, 2);
  assert.equal(withFindings.checks.find((check) => check.id === "speaker-double-booked")?.findingCount, 1);
  assert.equal(withFindings.totalFindingCount, 3);
  assert.match(conflictCoverageSummary(withFindings), /^3 conflicts found across/);
});

test("an empty session set verifies nothing and says so", () => {
  const empty = report([]);
  assert.match(conflictCoverageSummary(empty), /Nothing has been verified\./);
  assert.equal(empty.passedCheckCount, 0);
  assert.equal(empty.hasLimitations, true);
});

test("the scope label keeps the run from reading as event-wide", () => {
  assert.match(conflictCoverageSummary(report([session()])), /over 1 sessions on Jan 19/);
  assert.match(workspace, /Sessions on other dates were not part of this run\./);
});

test("the Conflicts tab exposes View checks performed and drops the unqualified all-clear", () => {
  assert.match(workspace, /View checks performed/);
  assert.match(workspace, /conflictCoverageSummary\(conflictCoverage\)/);
  assert.doesNotMatch(workspace, /No conflicts detected from current \{terminology\.runOfShow\} data/);
  // Records evaluated and exclusions are both shown per rule.
  assert.match(workspace, /Records evaluated: \{check\.evaluatedCount\}/);
  assert.match(workspace, /Not verified for \{item\.count\}: \{item\.reason\}/);
});

test("a limited run is not styled as a green pass", () => {
  assert.match(workspace, /conflictCoverage\.hasLimitations \? "text-amber-800" : "text-emerald-700"/);
});
