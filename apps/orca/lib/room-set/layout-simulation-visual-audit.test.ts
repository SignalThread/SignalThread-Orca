import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import test from "node:test";

import {
  generateRoomSetVisualAuditArtifacts,
  manualRoomSetQaChecklist,
  ROOM_SET_VISUAL_AUDIT_OUTPUT_ROOT,
  type RoomSetVisualAuditCaseId,
} from "./visual-audit-script";

const REQUIRED_VISUAL_AUDIT_CASES = [
  "town-hall-speaker-qa-geometry",
  "networking-reception-cluster-distribution",
  "theater-low-capacity-graceful-fallback",
  "training-center-aisle",
  "banquet-remarks-large-room",
  "banquet-clusters-near-stage",
  "awards-dinner",
  "workshop",
  "general-session",
  "expo-lounge",
  "networking-reception",
] satisfies readonly RoomSetVisualAuditCaseId[];

test("layout visual audit generates current PNG, annotated PNG, and metrics JSON for review", () => {
  const artifacts = generateRoomSetVisualAuditArtifacts();
  const byId = new Map(artifacts.map((artifact) => [artifact.id, artifact]));

  assert.deepEqual([...byId.keys()].sort(), [...REQUIRED_VISUAL_AUDIT_CASES].sort());
  assert.equal(existsSync(ROOM_SET_VISUAL_AUDIT_OUTPUT_ROOT), true);

  for (const id of REQUIRED_VISUAL_AUDIT_CASES) {
    const artifact = byId.get(id);
    assert.ok(artifact, id);
    assert.equal(existsSync(artifact.currentLayoutPngPath), true, `${id} current PNG missing`);
    assert.equal(existsSync(artifact.annotatedPngPath), true, `${id} annotated PNG missing`);
    assert.equal(existsSync(artifact.metricsJsonPath), true, `${id} metrics JSON missing`);
    assert.equal(statSync(artifact.currentLayoutPngPath).size > 100, true, `${id} current PNG is empty`);
    assert.equal(statSync(artifact.annotatedPngPath).size > 100, true, `${id} annotated PNG is empty`);

    const metrics = JSON.parse(readFileSync(artifact.metricsJsonPath, "utf8")) as typeof artifact.metrics;
    assert.equal(metrics.id, id);
    assert.equal(metrics.roomDimensions.widthLu > 0, true);
    assert.equal(metrics.roomDimensions.depthLu > 0, true);
    assert.equal(Object.keys(metrics.objectCountsByType).length > 0 || id === "theater-low-capacity-graceful-fallback", true);
    assert.equal(Array.isArray(metrics.clusterCenterPoints), true);
    assert.equal(typeof metrics.clusterSpreadDistributionScore, "number");
    assert.equal(typeof metrics.tableChairCounts.tableCount, "number");
    assert.equal(typeof metrics.tableChairCounts.chairBlockCount, "number");
    assert.equal(typeof metrics.capacityAchieved, "number");
    assert.equal(Array.isArray(metrics.actualVsExpected), true);
  }
});

test("generated layout visual audit assertions pass before manual review", () => {
  const artifacts = generateRoomSetVisualAuditArtifacts();
  const failures = artifacts.flatMap((artifact) =>
    artifact.metrics.failedAssertion
      ? [`${artifact.id}: ${artifact.metrics.failedAssertion}`]
      : [],
  );

  assert.deepEqual(failures, []);
});

test("manual Room Set QA checklist contains the required session-scoping review steps", () => {
  const checklist = manualRoomSetQaChecklist();

  for (const expected of [
    "Open Session A -> Room Set -> Seating.",
    "Open Session B -> Room Set -> Seating.",
    "Confirm table IDs differ.",
    "Assign same attendee in both sessions.",
    "Confirm both assignments persist separately.",
    "Drag/drop onto real visual table.",
    "Reload.",
    "Confirm assignment stays on same visual table.",
    "Switch sessions while in Seating mode.",
    "Confirm mode is preserved and table state refetches.",
    "Review generated layout audit images",
  ]) {
    assert.equal(checklist.includes(expected), true, expected);
  }
});
