import assert from "node:assert/strict";
import test from "node:test";
import type { EventReadinessSnapshot } from "@/lib/event-readiness";
import { buildExecutiveBriefing, type ExecutiveBriefingInput } from "@/lib/executive-briefing";
import { EXECUTIVE_BRIEFING_HIGH_RISK_FIXTURES } from "@/lib/fixtures/executive-briefing-evaluations";

const EVENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function readiness(overrides: Partial<EventReadinessSnapshot> = {}): EventReadinessSnapshot {
  return {
    dataAsOf: "2026-08-11T14:00:00.000Z",
    sessions: [],
    summary: { total: 0, ready: 0, attention: 0, blocked: 0, notNeeded: 0 },
    speakers: { total: 0, complete: 0, needsAction: 0, rows: [] },
    staffing: { requiredRoles: 0, assignedRoles: 0, gaps: [], conflicts: [] },
    ...overrides,
  };
}

function input(overrides: Partial<ExecutiveBriefingInput> = {}): ExecutiveBriefingInput {
  return {
    eventId: EVENT_ID,
    eventName: "Leadership Summit",
    dataAsOf: "2026-08-11T14:00:00.000Z",
    asOf: "2026-08-11T14:05:00.000Z",
    canEdit: true,
    readiness: readiness(),
    pendingApprovals: 0,
    overdueItems: 0,
    budgetVarianceCents: 0,
    hasBudgetData: false,
    links: {
      runOfShow: `/events/${EVENT_ID}/matrix`,
      timeline: `/events/${EVENT_ID}/timeline`,
      budget: `/events/${EVENT_ID}/budget`,
      docs: `/events/${EVENT_ID}/docs`,
    },
    ...overrides,
  };
}

test("briefing separates canonical facts from evidence-bound recommendations", () => {
  const sessionHref = `/events/${EVENT_ID}/matrix/sessions/session-1?tab=details`;
  const result = buildExecutiveBriefing(input({
    pendingApprovals: 2,
    overdueItems: 1,
    readiness: readiness({
      sessions: [{ id: "session-1", title: "Opening keynote", state: "blocked", href: sessionHref, reasons: [{ code: "SESSION_ROOM_MISSING", label: "A valid event room is not assigned.", href: sessionHref }], modules: [] }],
      summary: { total: 1, ready: 0, attention: 0, blocked: 1, notNeeded: 0 },
    }),
  }));

  assert.equal(result.event.id, EVENT_ID);
  assert.equal(result.dataAsOf, "2026-08-11T14:00:00.000Z");
  assert.equal(result.freshness, "current");
  assert.equal(result.generation.mode, "deterministic_fallback");
  assert.equal(result.generation.status, "unavailable");
  assert.ok(result.facts.some((fact) => fact.evidence.href === sessionHref));
  assert.ok(result.recommendations.every((recommendation) => recommendation.evidenceIds.length > 0));
  assert.ok(result.recommendations.every((recommendation) => recommendation.actionMode === "editable"));
});

test("briefing is stale or partial without inventing unavailable-source facts", () => {
  const stale = buildExecutiveBriefing(input({ asOf: "2026-08-11T14:16:01.000Z" }));
  assert.equal(stale.freshness, "stale");
  const partial = buildExecutiveBriefing(input({ unavailableSources: ["housing integration metrics", "event activity"], asOf: "2026-08-11T14:01:00.000Z" }));
  assert.equal(partial.freshness, "partial");
  assert.equal(partial.generation.status, "partial");
  assert.deepEqual(partial.unavailableSources, ["event activity", "housing integration metrics"]);
  assert.equal(partial.facts.some((fact) => fact.title.toLowerCase().includes("housing")), false);
});

test("empty event retains a useful deterministic fact and viewer-safe recommendation", () => {
  const result = buildExecutiveBriefing(input({ canEdit: false }));
  assert.equal(result.facts[0]?.id, "no-active-readiness-issues");
  assert.equal(result.recommendations[0]?.title, "Add or import the first session");
  assert.equal(result.recommendations[0]?.actionMode, "view_only");
});

test("briefing uses event display terminology without changing evidence identifiers or routes", () => {
  const result = buildExecutiveBriefing(input({ terminology: { agenda: "Show Flow", runOfShow: "Matrix", matrix: "Agenda", showFlow: "Run of Show" } }));
  const evidence = result.facts.find((fact) => fact.id === "no-active-readiness-issues")?.evidence;
  assert.equal(evidence?.id, "run-of-show");
  assert.equal(evidence?.label, "Matrix");
  assert.equal(evidence?.href, `/events/${EVENT_ID}/matrix`);
});

test("high-risk source text cannot alter structure or create cross-event evidence", () => {
  for (const fixture of EXECUTIVE_BRIEFING_HIGH_RISK_FIXTURES) {
    const result = buildExecutiveBriefing(input({
      eventName: fixture.eventName,
      readiness: readiness({
        sessions: [{ id: fixture.id, title: fixture.sessionTitle, state: "blocked", href: fixture.foreignHref, reasons: [{ code: "TEST", label: fixture.reason, href: fixture.foreignHref }], modules: [] }],
        summary: { total: 1, ready: 0, attention: 0, blocked: 1, notNeeded: 0 },
      }),
    }));
    assert.ok(result.facts.length > 0);
    assert.ok(result.facts.every((fact) => fact.evidence.href.startsWith(`/events/${EVENT_ID}`)), fixture.id);
    assert.ok(result.recommendations.every((recommendation) => recommendation.href.startsWith(`/events/${EVENT_ID}`)), fixture.id);
    assert.equal(JSON.stringify(result).includes("attendee allergy"), fixture.sessionTitle.includes("attendee allergy"));
    assert.equal(JSON.stringify(result).includes("https://attacker.invalid"), false);
  }
});
