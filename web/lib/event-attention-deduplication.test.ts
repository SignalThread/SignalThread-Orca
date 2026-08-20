import assert from "node:assert/strict";
import test from "node:test";
import {
  attentionFindingDeduplicationKey,
  deduplicateAttentionFindings,
  summarizeAttentionFindings,
  type AttentionFinding,
} from "@/src/server/services/event-attention";

const eventId = "event-a";

function finding(overrides: Partial<AttentionFinding> = {}): AttentionFinding {
  return {
    id: "speaker:session:session-a",
    eventId,
    category: "speaker",
    severity: "warning",
    title: "Session needs a speaker: Awards Gala (2027-01-19)",
    description: "This session has no assigned speaker records.",
    sourceReferences: [{ entityType: "matrix_row", entityId: "session-a", label: "Awards Gala (2027-01-19)" }],
    ...overrides,
  };
}

test("identical source findings are deduplicated with a stable identity", () => {
  const first = finding();
  const duplicate = finding({ description: "A duplicate query row described the same issue." });

  assert.equal(attentionFindingDeduplicationKey(first), attentionFindingDeduplicationKey(duplicate));
  const deduplicated = deduplicateAttentionFindings([duplicate, first]);
  assert.equal(deduplicated.length, 1);
  assert.equal(deduplicated[0].id, "speaker:session:session-a");
});
test("stable finding IDs remain stable while distinct sessions remain visible", () => {
  const first = finding();
  const secondSession = finding({
    id: "speaker:session:session-b",
    sourceReferences: [{ entityType: "matrix_row", entityId: "session-b", label: "Awards Gala (2027-01-19)" }],
  });

  const deduplicated = deduplicateAttentionFindings([first, secondSession]);
  assert.deepEqual(deduplicated.map((entry) => entry.id), ["speaker:session:session-a", "speaker:session:session-b"]);
});

test("finding identities remain isolated to their requested event", () => {
  const first = finding();
  const otherEvent = finding({ id: "speaker:session:session-a:event-b", eventId: "event-b" });

  assert.notEqual(attentionFindingDeduplicationKey(first), attentionFindingDeduplicationKey(otherEvent));
  assert.equal(deduplicateAttentionFindings([first, otherEvent]).length, 2);
});

test("summary counts are calculated from deduplicated findings", () => {
  const warning = finding();
  const duplicate = finding();
  const critical = finding({
    id: "room_set:room:session-c",
    category: "room_set",
    severity: "critical",
    title: "Session needs a room: Awards Gala (2027-01-19)",
    sourceReferences: [{ entityType: "matrix_row", entityId: "session-c", label: "Awards Gala (2027-01-19)", field: "roomId" }],
  });

  const summary = summarizeAttentionFindings(deduplicateAttentionFindings([warning, duplicate, critical]));
  assert.deepEqual(summary, { total: 2, critical: 1, warning: 1, informational: 0 });
});
