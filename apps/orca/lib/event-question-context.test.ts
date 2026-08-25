import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildEventQuestionContextFromAttention,
  classifyEventQuestion,
  type SessionQuestionRow,
  type RoadmapQuestionRow,
} from "@/src/server/services/event-question-context";
import type { AttentionFinding, EventAttentionResult } from "@/src/server/services/event-attention";
import { getEventDateBoundaries } from "@/lib/event-time-boundaries";

const eventId = "event-a";
const serviceSource = readFileSync("src/server/services/event-question-context.ts", "utf8");

function finding(overrides: Partial<AttentionFinding> = {}): AttentionFinding {
  return {
    id: "speaker:session:session-a",
    eventId,
    category: "speaker",
    severity: "warning",
    title: "Session needs a speaker: Awards Gala",
    description: "This session has no assigned speaker records.",
    sourceReferences: [{ entityType: "matrix_row", entityId: "session-a", label: "Awards Gala" }],
    ...overrides,
  };
}

function attention(
  findings: AttentionFinding[],
  now = new Date("2027-01-01T15:00:00.000Z"),
  timezone = "America/New_York",
): EventAttentionResult {
  return {
    eventId,
    generatedAt: now.toISOString(),
    findings,
    summary: {
      total: findings.length,
      critical: findings.filter((entry) => entry.severity === "critical").length,
      warning: findings.filter((entry) => entry.severity === "warning").length,
      informational: findings.filter((entry) => entry.severity === "informational").length,
    },
    support: { supportedChecks: [], partialChecks: [], unsupportedChecks: [] },
    temporalContext: getEventDateBoundaries(now, timezone),
  };
}

function session(overrides: Partial<SessionQuestionRow> = {}): SessionQuestionRow {
  return {
    id: "session-a",
    eventId,
    sessionName: "Awards Gala",
    dayDate: new Date("2027-01-19T00:00:00.000Z"),
    startTime: new Date("1970-01-01T18:00:00.000Z"),
    endTime: new Date("1970-01-01T20:00:00.000Z"),
    mealPeriod: "DINNER",
    fnbNotes: null,
    avNotes: null,
    avNeeds: null,
    room: { eventId, name: "Grand Ballroom" },
    sessionFoodService: { serviceType: "Dinner", serviceStyle: "Plated", headcount: 200 },
    fnbCatalogAssignments: [{
      catalogItem: { itemName: "Winter salad", sourceMenu: { menuName: "Gala Menu" } },
    }],
    sessionAvRequirements: [{ avType: "Wireless microphone", quantity: 2 }],
    sessionSpeakerAssignments: [{ speaker: { eventId, name: "Alex Rivera" } }],
    ...overrides,
  };
}

function roadmapItem(overrides: Partial<RoadmapQuestionRow> = {}): RoadmapQuestionRow {
  return {
    id: "roadmap-a",
    eventId,
    title: "Confirm venue contract",
    department: "Operations",
    workstream: "VENUE",
    status: "IN_PROGRESS",
    priority: "HIGH",
    isCriticalPath: false,
    ownerUser: { id: "owner-a", name: "Alex Planner", email: "alex@example.com" },
    parentId: null,
    startDate: new Date("2026-12-20T00:00:00.000Z"),
    endDate: new Date("2026-12-05T00:00:00.000Z"),
    sortOrder: 1,
    predecessorDependencies: [],
    ...overrides,
  };
}

test("initial question types have explicit, deterministic support classifications", () => {
  assert.deepEqual(classifyEventQuestion("What should I focus on today?").intent, "focus_today");
  assert.equal(classifyEventQuestion("What should I focus on today?").support, "partial");
  assert.equal(classifyEventQuestion("Which sessions are at greatest risk?").support, "supported");
  assert.equal(classifyEventQuestion("What information is still missing?").support, "partial");
  assert.equal(classifyEventQuestion("What deadlines are coming up this week?").intent, "upcoming_deadlines");
  assert.equal(classifyEventQuestion("Why is this event showing warnings?").intent, "warning_explanation");
  assert.equal(classifyEventQuestion("Who should I invite?").support, "unsupported");
});

test("roadmap questions map to deterministic intents and operations", () => {
  assert.equal(classifyEventQuestion("What milestones are coming up?").intent, "roadmap_upcoming");
  assert.equal(classifyEventQuestion("What roadmap items are overdue?").operation, "overdue");
  assert.equal(classifyEventQuestion("What is due this week?").support, "unsupported", "without roadmap/timeline wording the classifier must not guess a domain");
  assert.equal(classifyEventQuestion("What is due this week on the roadmap?").intent, "roadmap_upcoming");
  assert.equal(classifyEventQuestion("What milestones are blocked?").intent, "roadmap_blocked");
  assert.equal(classifyEventQuestion("Which roadmap items have dependencies?").intent, "roadmap_dependencies");
  assert.equal(classifyEventQuestion("What roadmap items are assigned to Alex Planner?").roadmapQuery?.owner, "alex planner");
  assert.equal(classifyEventQuestion("What is the status of Confirm venue contract on the roadmap?").intent, "roadmap_lookup");
});

test("roadmap retrieval uses event-local dates, dashboard dependency semantics, and stable evidence", () => {
  const now = new Date("2027-01-02T15:00:00.000Z");
  const rows = [
    roadmapItem(),
    roadmapItem({ id: "roadmap-b", title: "Publish agenda", status: "NOT_STARTED", endDate: new Date("2027-01-02T00:00:00.000Z"), sortOrder: 2, predecessorDependencies: [{ eventId, predecessorItemId: "roadmap-a", predecessor: { id: "roadmap-a", eventId, title: "Confirm venue contract", status: "IN_PROGRESS" } }] }),
    roadmapItem({ id: "roadmap-c", title: "Archive event", status: "COMPLETE", endDate: new Date("2026-12-01T00:00:00.000Z"), sortOrder: 3 }),
    roadmapItem({ id: "roadmap-d", title: "Open registration", status: "AT_RISK", endDate: new Date("2027-01-08T00:00:00.000Z"), sortOrder: 4 }),
    roadmapItem({ id: "other-event-item", eventId: "event-b", title: "Other event item" }),
  ];
  const base = attention([], now);
  const overdue = buildEventQuestionContextFromAttention(eventId, "What roadmap items are overdue?", base, [], rows);
  assert.deepEqual(overdue.roadmapItems.map((item) => item.itemId), ["roadmap-a"]);
  assert.equal(overdue.roadmapItems[0].overdue, true);
  assert.equal(overdue.sources.some((source) => source.entityId === "other-event-item"), false);

  const blocked = buildEventQuestionContextFromAttention(eventId, "What milestones are blocked?", base, [], rows);
  assert.deepEqual(blocked.roadmapItems.map((item) => item.itemId), ["roadmap-b"]);
  assert.deepEqual(blocked.roadmapItems[0].dependencies, [{ itemId: "roadmap-a", name: "Confirm venue contract", status: "IN_PROGRESS" }]);

  const today = buildEventQuestionContextFromAttention(eventId, "What roadmap items are due today?", base, [], rows);
  assert.deepEqual(today.roadmapItems.map((item) => item.itemId), ["roadmap-b"]);

  const complete = buildEventQuestionContextFromAttention(eventId, "What roadmap items are complete?", base, [], rows);
  assert.deepEqual(complete.roadmapItems.map((item) => item.itemId), ["roadmap-c"]);

  const lookup = buildEventQuestionContextFromAttention(eventId, "What is the status of Confirm venue contract on the roadmap?", base, [], rows);
  assert.equal(lookup.roadmapItems.length, 1);
  assert.equal(lookup.roadmapItems[0].status, "IN_PROGRESS");
  assert.equal(lookup.roadmapItems[0].route, `/events/${eventId}/timeline?focus=roadmap-a`);
});

test("session F&B wording is classified deterministically across supported variations", () => {
  for (const question of [
    "What sessions do now have food selected?",
    "Which sessions have F&B selected?",
    "Which sessions have catering selected!",
    "Which sessions have menus assigned",
    "Which sessions have a meal selected?",
    "Which sessions have refreshments selected?",
  ]) {
    assert.equal(classifyEventQuestion(question).intent, "session_fnb_selected", question);
  }
  for (const question of [
    "Which sessions do not have food selected?",
    "What sessions are missing F&B?",
    "Which sessions have no menu?",
  ]) {
    assert.equal(classifyEventQuestion(question).intent, "session_fnb_not_selected", question);
    assert.equal(classifyEventQuestion(question).sessionQuery?.filter, "fnb_not_selected", question);
  }
  assert.equal(classifyEventQuestion("Which sessions have F&B details completed?").sessionQuery?.filter, "fnb_complete");
  assert.equal(classifyEventQuestion("Which sessions have unavailable F&B information?").intent, "session_fnb_unavailable");
  assert.equal(classifyEventQuestion("Which sessions do not require food?").intent, "session_fnb_not_required");
  assert.equal(classifyEventQuestion("What is the F&B status for all sessions?").intent, "session_fnb_status");
});

test("session readiness and direct lookups retain separate intents", () => {
  assert.equal(classifyEventQuestion("Which sessions are incomplete?").intent, "session_readiness");
  assert.equal(classifyEventQuestion("Which sessions are missing speakers, rooms, AV, or F&B?").intent, "session_readiness");
  assert.equal(classifyEventQuestion("What is missing for Awards Gala?").intent, "session_readiness");
  for (const question of [
    "What is scheduled for Awards Gala?",
    "What room is Awards Gala in?",
    "Who is speaking at Awards Gala?",
    "What food is selected for Awards Gala?",
  ]) {
    assert.equal(classifyEventQuestion(question).intent, "session_lookup", question);
  }
});

test("this-week deadline retrieval uses event-local Monday through Sunday boundaries", () => {
  const now = new Date("2027-01-01T15:00:00.000Z");
  const context = buildEventQuestionContextFromAttention(eventId, "What deadlines are coming up this week?", attention([
    finding({
      id: "deadline:friday",
      category: "deadline",
      title: "Upcoming deadline: Friday",
      sourceReferences: [{ entityType: "deadline", entityId: "friday", label: "Friday", field: "dueAt", value: "2027-01-02T17:00:00.000Z" }],
    }),
    finding({
      id: "deadline:monday",
      category: "deadline",
      title: "Upcoming deadline: Monday",
      sourceReferences: [{ entityType: "deadline", entityId: "monday", label: "Monday", field: "dueAt", value: "2027-01-04T17:00:00.000Z" }],
    }),
    finding({
      id: "deadline:past",
      category: "deadline",
      title: "Overdue deadline: Past",
      severity: "critical",
      sourceReferences: [{ entityType: "deadline", entityId: "past", label: "Past", field: "dueAt", value: "2027-01-01T14:00:00.000Z" }],
    }),
  ], now));

  assert.deepEqual(context.attentionFindings.map((entry) => entry.id), ["deadline:friday"]);
  assert.equal(context.temporalContext.resolvedTimezone, "America/New_York");
  assert.match(context.limitations.join(" "), /Monday through Sunday/);
});

test("question context selects only relevant event-scoped attention evidence with stable sources", () => {
  const context = buildEventQuestionContextFromAttention(eventId, "Which sessions are at greatest risk?", attention([
    finding({ id: "room_set:room:session-a", category: "room_set", severity: "critical", title: "Session needs a room: Awards Gala" }),
    finding({ id: "overdue_task:task-a", category: "overdue_task", title: "Overdue task: Send invitations", sourceReferences: [{ entityType: "task", entityId: "task-a", label: "Send invitations" }] }),
  ]));

  assert.deepEqual(context.attentionFindings.map((entry) => entry.id), ["room_set:room:session-a"]);
  assert.deepEqual(context.sources, [{ entityType: "matrix_row", entityId: "session-a", label: "Awards Gala", route: "/events/event-a/matrix/sessions/session-a" }]);
  assert.deepEqual(context.facts, {
    criticalFindings: 1,
    warningFindings: 1,
    informationalFindings: 0,
    overdueTasks: 1,
    upcomingDeadlines: 0,
    pendingApprovals: 0,
    incompleteSessions: 1,
    sessionsWithFnbSelected: 0,
    sessionsWithoutFnbSelected: 0,
    sessionsWithFnbUnavailable: 0,
    sessionsNotRequiringFnb: 0,
  });
});

test("F&B retrieval distinguishes selected, required-missing, unavailable, and explicitly not needed", () => {
  const rows = [
    session(),
    session({
      id: "session-b",
      sessionName: "Lunch Workshop",
      sessionFoodService: null,
      fnbCatalogAssignments: [],
    }),
    session({
      id: "session-c",
      sessionName: "Open Networking",
      mealPeriod: null,
      sessionFoodService: null,
      fnbCatalogAssignments: [],
    }),
    session({
      id: "session-d",
      sessionName: "Registration",
      mealPeriod: "NONE",
      sessionFoodService: null,
      fnbCatalogAssignments: [],
    }),
  ];
  const selected = buildEventQuestionContextFromAttention(
    eventId,
    "What sessions do now have food selected?",
    attention([]),
    rows,
  );
  assert.equal(selected.intent, "session_fnb_selected");
  assert.equal(selected.support, "supported");
  assert.equal(selected.resultSummary, "1 session has verified food selections.");
  assert.deepEqual(selected.sessions.map((entry) => entry.sessionId), ["session-a"]);
  assert.deepEqual(selected.sessions[0].fnbSelections, ["Dinner", "Plated", "Winter salad — Gala Menu"].sort());
  assert.deepEqual({
    selected: selected.facts.sessionsWithFnbSelected,
    missing: selected.facts.sessionsWithoutFnbSelected,
    unavailable: selected.facts.sessionsWithFnbUnavailable,
    notRequired: selected.facts.sessionsNotRequiringFnb,
  }, { selected: 1, missing: 1, unavailable: 1, notRequired: 1 });

  const missing = buildEventQuestionContextFromAttention(
    eventId,
    "Which sessions do not have food selected?",
    attention([]),
    rows,
  );
  assert.deepEqual(missing.sessions.map((entry) => entry.sessionId), ["session-b"]);
  assert.equal(missing.sessions[0].fnbStatus, "not_selected");
  assert.equal(missing.limitations.some((entry) => entry.includes("no F&B record")), true);

  const unavailable = buildEventQuestionContextFromAttention(
    eventId,
    "Which sessions have unavailable F&B information?",
    attention([]),
    rows,
  );
  assert.equal(unavailable.intent, "session_fnb_unavailable");
  assert.deepEqual(unavailable.sessions.map((entry) => entry.sessionId), ["session-c"]);

  const notRequired = buildEventQuestionContextFromAttention(
    eventId,
    "Which sessions do not require food?",
    attention([]),
    rows,
  );
  assert.equal(notRequired.intent, "session_fnb_not_required");
  assert.deepEqual(notRequired.sessions.map((entry) => entry.sessionId), ["session-d"]);
});

test("the screenshot-shaped result returns nine selected sessions and excludes other F&B states", () => {
  const selectedSessions = Array.from({ length: 9 }, (_, index) => session({
    id: `selected-${index + 1}`,
    sessionName: `Selected Session ${index + 1}`,
  }));
  const rows = [
    ...selectedSessions,
    session({ id: "missing", sessionName: "Missing F&B", sessionFoodService: null, fnbCatalogAssignments: [] }),
    session({ id: "unknown", sessionName: "Unknown F&B", mealPeriod: null, sessionFoodService: null, fnbCatalogAssignments: [] }),
    session({ id: "not-required", sessionName: "No Meal", mealPeriod: "NONE", sessionFoodService: null, fnbCatalogAssignments: [] }),
  ];
  const context = buildEventQuestionContextFromAttention(
    eventId,
    "What sessions do now have food selected?",
    attention([]),
    rows,
  );
  assert.equal(context.intent, "session_fnb_selected");
  assert.equal(context.sessions.length, 9);
  assert.equal(context.resultSummary, "9 sessions have verified food selections.");
  assert.deepEqual(context.sessions.map((entry) => entry.sessionId), selectedSessions.map((entry) => entry.id));
  assert.equal(context.sessions.some((entry) => entry.fnbStatus !== "selected"), false);
  assert.equal(context.sources.every((source) => source.route === `/events/${eventId}/matrix/sessions/${source.entityId}`), true);
});

test("menu and completed-F&B retrieval require verified assignment and headcount data", () => {
  const rows = [
    session(),
    session({
      id: "session-b",
      sessionName: "Reception",
      sessionFoodService: { serviceType: "Reception", serviceStyle: null, headcount: null },
      fnbCatalogAssignments: [],
    }),
  ];
  const menus = buildEventQuestionContextFromAttention(eventId, "Which sessions have menus assigned?", attention([]), rows);
  assert.deepEqual(menus.sessions.map((entry) => entry.sessionId), ["session-a"]);
  const complete = buildEventQuestionContextFromAttention(eventId, "Which sessions have F&B details completed?", attention([]), rows);
  assert.deepEqual(complete.sessions.map((entry) => entry.sessionId), ["session-a"]);
});

test("direct session lookup is event-isolated and handles exact, ambiguous, and absent names", () => {
  const rows = [
    session(),
    session({ id: "session-b", sessionName: "Awards Gala Rehearsal" }),
    session({ id: "session-c", eventId: "event-b", sessionName: "Awards Gala" }),
  ];
  const exact = buildEventQuestionContextFromAttention(eventId, "Who is speaking at Awards Gala?", attention([]), rows);
  assert.deepEqual(exact.sessions.map((entry) => entry.sessionId), ["session-a"]);
  assert.deepEqual(exact.sessions[0].speakers, ["Alex Rivera"]);
  assert.equal(exact.sources.some((source) => source.entityId === "session-c"), false);

  const ambiguous = buildEventQuestionContextFromAttention(eventId, "What is scheduled for Awards?", attention([]), rows);
  assert.equal(ambiguous.insufficientData, true);
  assert.deepEqual(ambiguous.sessions.map((entry) => entry.sessionId), ["session-a", "session-b"]);
  assert.match(ambiguous.limitations.join(" "), /Multiple sessions match/);

  const absent = buildEventQuestionContextFromAttention(eventId, "What room is Missing Session in?", attention([]), rows);
  assert.equal(absent.insufficientData, true);
  assert.deepEqual(absent.sessions, []);
  assert.match(absent.limitations.join(" "), /No session in this event/);
});

test("nested room, speaker, and roadmap dependency evidence remains event-isolated", () => {
  const crossLinkedSession = session({
    room: { eventId: "event-b", name: "Foreign room" },
    sessionSpeakerAssignments: [{ speaker: { eventId: "event-b", name: "Foreign speaker" } }],
  });
  const sessionContext = buildEventQuestionContextFromAttention(
    eventId,
    "Who is speaking at Awards Gala?",
    attention([]),
    [crossLinkedSession],
  );
  assert.equal(sessionContext.sessions[0].room, null);
  assert.deepEqual(sessionContext.sessions[0].speakers, []);
  assert.equal(sessionContext.sessions[0].missingFields.includes("room"), true);

  const crossLinkedRoadmap = roadmapItem({
    predecessorDependencies: [{
      eventId: "event-b",
      predecessorItemId: "foreign-roadmap",
      predecessor: { id: "foreign-roadmap", eventId: "event-b", title: "Foreign item", status: "IN_PROGRESS" },
    }],
  });
  const roadmapContext = buildEventQuestionContextFromAttention(
    eventId,
    "Which roadmap items have dependencies?",
    attention([]),
    [],
    [crossLinkedRoadmap],
  );
  assert.deepEqual(roadmapContext.roadmapItems, []);
  assert.equal(JSON.stringify(roadmapContext).includes("Foreign item"), false);
});

test("session evidence ordering remains stable and unsupported readiness is limited", () => {
  const rows = [
    session({ id: "session-b", sessionName: "Second", dayDate: new Date("2027-01-20T00:00:00.000Z"), sessionFoodService: null, fnbCatalogAssignments: [] }),
    session({ id: "session-a", sessionName: "First", dayDate: new Date("2027-01-19T00:00:00.000Z"), sessionFoodService: null, fnbCatalogAssignments: [] }),
  ];
  const context = buildEventQuestionContextFromAttention(eventId, "Which sessions are incomplete?", attention([
    finding({ id: "speaker:session:session-a", sourceReferences: [{ entityType: "matrix_row", entityId: "session-a", label: "First" }] }),
    finding({ id: "speaker:session:session-b", sourceReferences: [{ entityType: "matrix_row", entityId: "session-b", label: "Second" }] }),
  ]), rows);
  assert.deepEqual(context.sessions.map((entry) => entry.sessionId), ["session-a", "session-b"]);
  assert.equal(context.support, "partial");
  assert.match(context.limitations.join(" "), /ownership.*unrecorded AV/i);
});

test("question context never mixes another event's attention result", () => {
  const otherEvent = { ...attention([finding()]), eventId: "event-b" };
  assert.throws(
    () => buildEventQuestionContextFromAttention(eventId, "Why is this event showing warnings?", otherEvent),
    /requested event/,
  );
});

test("unsupported questions return no speculative evidence", () => {
  const context = buildEventQuestionContextFromAttention(eventId, "Who should I invite?", attention([finding()]));
  assert.equal(context.intent, "unsupported");
  assert.equal(context.insufficientData, true);
  assert.deepEqual(context.attentionFindings, []);
  assert.deepEqual(context.sources, []);
});

test("question retrieval reuses attention and remains read-only", () => {
  assert.equal(serviceSource.includes("getEventAttention(eventId, user, options)"), true);
  for (const unsafeOperation of [".create(", ".update(", ".delete(", ".upsert(", "fetch(", "openai"]) {
    assert.equal(serviceSource.toLowerCase().includes(unsafeOperation), false, `question context must not contain ${unsafeOperation}`);
  }
});
