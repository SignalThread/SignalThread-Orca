import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { classifyApprovalUrgency, hasValidNotNeededEvidence } from "./event-readiness";

test("Not Needed satisfies readiness only with complete auditable evidence", () => {
  const base = { disposition: "NOT_NEEDED", dispositionReason: "No food service", dispositionActorUserId: "actor", dispositionAt: new Date("2026-08-11T12:00:00Z") };
  assert.equal(hasValidNotNeededEvidence(base), true);
  assert.equal(hasValidNotNeededEvidence({ ...base, dispositionReason: "" }), false);
  assert.equal(hasValidNotNeededEvidence({ ...base, dispositionActorUserId: null }), false);
  assert.equal(hasValidNotNeededEvidence({ ...base, dispositionAt: null }), false);
  assert.equal(hasValidNotNeededEvidence({ ...base, disposition: "REQUIRED" }), false);
});

test("approval urgency boundaries are deterministic", () => {
  const asOf = new Date("2026-08-11T12:00:00Z");
  assert.equal(classifyApprovalUrgency({ submittedAt: new Date("2026-08-01T12:00:00Z"), dueAt: new Date("2026-08-10T12:00:00Z"), asOf }), "overdue");
  assert.equal(classifyApprovalUrgency({ submittedAt: new Date("2026-08-10T12:00:00Z"), dueAt: new Date("2026-08-13T12:00:00Z"), asOf }), "dueSoon");
  assert.equal(classifyApprovalUrgency({ submittedAt: new Date("2026-08-05T12:00:00Z"), asOf }), "risk");
  assert.equal(classifyApprovalUrgency({ submittedAt: new Date("2026-08-10T12:00:00Z"), asOf }), "pending");
});

test("Command Center widgets consume one reason-coded canonical readiness snapshot", async () => {
  const [service, readiness, renderer, speaker, matrix, schema, rootSchema] = await Promise.all([
    readFile("src/server/services/event-command-center.ts", "utf8"),
    readFile("lib/event-readiness.ts", "utf8"),
    readFile("app/(shell)/events/[eventId]/_components/event-dashboard-widget-renderer.tsx", "utf8"),
    readFile("src/server/services/speaker-readiness.ts", "utf8"),
    readFile("app/(shell)/matrix-2/page.tsx", "utf8"),
    readFile("prisma/schema.prisma", "utf8"),
    readFile("../prisma/schema.prisma", "utf8"),
  ]);
  assert.match(service, /readiness: EventReadinessSnapshot/);
  assert.match(service, /getEventReadinessSnapshot\(eventId, generatedAt\)/);
  assert.match(readiness, /where: \{ eventId, archivedAt: null \}/);
  assert.match(readiness, /sessionSpeakerAssignments: \{ include: \{ speaker:/);
  assert.doesNotMatch(readiness, /sessionSpeakers:/);
  assert.doesNotMatch(schema, /model SessionSpeaker \{/);
  assert.equal(schema, rootSchema, "the duplicated Prisma schemas must stay synchronized");
  for (const code of ["SESSION_TIME_INVALID", "SESSION_ROOM_MISSING", "SPEAKER_ASSIGNMENT_MISSING", "STAFF_ROLE_UNFILLED", "STAFF_DOUBLE_BOOKED", "FNB_SAFETY_BLOCKER", "SUPPLIES_DISPOSITION_MISSING", "SIGNAGE_DISPOSITION_MISSING", "NOT_NEEDED_EVIDENCE_INVALID"]) assert.match(readiness, new RegExp(code));
  assert.match(readiness, /reasons: readonly ReadinessReason\[\]/);
  assert.match(readiness, /href: string/);
  assert.match(renderer, /data\.event\.readiness\.speakers/);
  assert.match(renderer, /data\.event\.readiness\.staffing/);
  assert.match(renderer, /const readiness = data\.event\.readiness;/);
  assert.match(renderer, /Actionable session readiness/);
  assert.match(renderer, /Staffing gaps and conflicts/);
  assert.match(renderer, /approval\.urgency === "overdue"/);
  assert.match(renderer, /approval\.urgency === "dueSoon"/);
  assert.match(renderer, /approval\.urgency === "risk"/);
  assert.match(speaker, /computeSpeakerReadinessFlags\(speaker: ReadinessSpeakerRow, asOf = new Date\(\)\)/);
  assert.doesNotMatch(speaker, /Date\.now\(\)/);
  assert.match(matrix, /const nextStatus = canonicalSessionStatusValue\([\s\S]*draft\.status,[\s\S]*sessionStatusOptionsFromTemplate\(snapshot\.requirementTemplate\)/);
  assert.match(matrix, /status: payload\.status \?\? entry\.status/);
});
