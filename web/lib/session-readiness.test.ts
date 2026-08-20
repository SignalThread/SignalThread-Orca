import assert from "node:assert/strict";
import test from "node:test";

import {
  SESSION_READINESS_METADATA,
  SESSION_READINESS_STATUS_ORDER,
  deriveAvReadiness,
  deriveConflictsReadiness,
  deriveConservativeReadinessStatus,
  deriveDetailsReadiness,
  deriveFnbReadiness,
  deriveNotesActivityReadiness,
  deriveOperationalRequirementReadiness,
  deriveRoomSetReadiness,
  deriveSeatingReadiness,
  deriveSessionModuleApplicability,
  deriveSessionModuleReadiness,
  deriveSessionReadiness,
  deriveSpeakersReadiness,
  deriveStaffingReadiness,
  type SessionReadinessStatus,
} from "./session-readiness";

test("readiness metadata defines labels, priority order, descriptions, and badge classes", () => {
  assert.deepEqual(SESSION_READINESS_STATUS_ORDER, [
    "blocked",
    "needs_info",
    "not_started",
    "ready",
    "not_needed",
  ]);

  for (const status of SESSION_READINESS_STATUS_ORDER) {
    const metadata = SESSION_READINESS_METADATA[status];
    assert.equal(typeof metadata.label, "string");
    assert.equal(typeof metadata.priority, "number");
    assert.equal(typeof metadata.description, "string");
    assert.equal(typeof metadata.badgeClassName, "string");
    assert.equal(metadata.label.length > 0, true);
    assert.equal(metadata.description.length > 0, true);
    assert.equal(metadata.badgeClassName.length > 0, true);
  }

  assert.equal(SESSION_READINESS_METADATA.blocked.priority > SESSION_READINESS_METADATA.needs_info.priority, true);
  assert.equal(SESSION_READINESS_METADATA.needs_info.priority > SESSION_READINESS_METADATA.not_started.priority, true);
});

test("conservative helper can produce every canonical status", () => {
  const cases: Array<[SessionReadinessStatus, SessionReadinessStatus]> = [
    ["blocked", deriveConservativeReadinessStatus({ hasHardProblem: true, hasRequiredData: true })],
    ["needs_info", deriveConservativeReadinessStatus({ hasRequiredData: false, hasStarted: false })],
    ["not_started", deriveConservativeReadinessStatus({ hasRequiredData: true, hasStarted: false })],
    ["ready", deriveConservativeReadinessStatus({ hasRequiredData: true, hasStarted: true })],
    ["not_needed", deriveConservativeReadinessStatus({ applies: false })],
  ];

  for (const [expected, actual] of cases) {
    assert.equal(actual, expected);
  }
});

test("conservative helper keeps precedence stable", () => {
  assert.equal(
    deriveConservativeReadinessStatus({
      hasHardProblem: true,
      hasRequiredData: false,
      hasStarted: false,
    }),
    "blocked",
  );
  assert.equal(
    deriveConservativeReadinessStatus({
      hasRequiredData: false,
      hasStarted: false,
    }),
    "needs_info",
  );
  assert.equal(
    deriveConservativeReadinessStatus({
      hasStarted: true,
    }),
    "needs_info",
  );
});

test("not_needed is explicit and not a fallback", () => {
  assert.equal(deriveConservativeReadinessStatus({ applies: false }), "not_needed");
  assert.equal(deriveConservativeReadinessStatus({ hasRequiredData: false, hasStarted: false }), "needs_info");
  assert.equal(deriveAvReadiness({ required: false }).status, "not_needed");
});

const completeDetails = {
  title: "Opening Keynote",
  sessionType: "KEYNOTE",
  roomId: "ballroom-a",
  roomName: "Ballroom A",
  startTime: "09:00",
  endTime: "10:00",
};

test("details readiness is green when all core session fields are complete and valid", () => {
  assert.equal(deriveDetailsReadiness(completeDetails).status, "ready");
});

test("details readiness is yellow when the room is missing", () => {
  assert.equal(
    deriveDetailsReadiness({ ...completeDetails, roomId: null, roomName: "" }).status,
    "needs_info",
  );
  assert.equal(
    deriveDetailsReadiness({ ...completeDetails, roomId: null, roomName: "Unassigned" }).status,
    "needs_info",
  );
});

test("details readiness is yellow when the session type is missing", () => {
  assert.equal(deriveDetailsReadiness({ ...completeDetails, sessionType: null }).status, "needs_info");
});

test("details readiness is red when the end time is not after the start time", () => {
  assert.equal(deriveDetailsReadiness({ ...completeDetails, endTime: "09:00" }).status, "blocked");
  assert.equal(deriveDetailsReadiness({ ...completeDetails, endTime: "08:45" }).status, "blocked");
});

test("details readiness never returns a gray status for an active session", () => {
  const activeSessionCases = [
    completeDetails,
    { ...completeDetails, roomId: null, roomName: "" },
    { ...completeDetails, sessionType: "" },
    { ...completeDetails, endTime: "08:45" },
  ];

  for (const details of activeSessionCases) {
    assert.equal(["ready", "needs_info", "blocked"].includes(deriveDetailsReadiness(details).status), true);
  }
});

test("speakers readiness requires complete speaker data and respects hard blockers", () => {
  assert.equal(deriveSpeakersReadiness({ required: true, speakers: [] }).status, "needs_info");
  assert.equal(
    deriveSpeakersReadiness({
      required: true,
      speakers: [{ speakerId: "speaker-1", name: "Leroy Jenkins", status: "CONFIRMED" }],
    }).status,
    "ready",
  );
  assert.equal(
    deriveSpeakersReadiness({
      required: true,
      speakers: [{ speakerId: "speaker-1", name: "Leroy Jenkins", status: "NEEDS_INFO" }],
      hardProblems: ["double-booked"],
    }).status,
    "blocked",
  );
});

test("AV readiness distinguishes not-started work from missing required details", () => {
  assert.equal(deriveAvReadiness({ hasStarted: false }).status, "not_started");
  assert.equal(deriveAvReadiness({ required: true, requirements: [] }).status, "needs_info");
  assert.equal(deriveAvReadiness({ required: true, requirements: [{ id: "projector", label: "Projector" }] }).status, "ready");
});

test("F&B readiness requires headcount and coverage when food service applies", () => {
  assert.equal(deriveFnbReadiness({ expectedAttendance: 200, catalogAssignments: [] }).status, "needs_info");
  assert.equal(
    deriveFnbReadiness({
      serviceRequired: true,
      expectedAttendance: 200,
      catalogAssignments: ["breakfast"],
    }).status,
    "ready",
  );
  assert.equal(deriveFnbReadiness({ serviceRequired: false }).status, "not_needed");
});

test("staffing readiness requires enough complete assignments", () => {
  assert.equal(deriveStaffingReadiness({ required: true, assignments: [] }).status, "needs_info");
  assert.equal(
    deriveStaffingReadiness({
      required: true,
      assignments: [{ personId: "person-1", name: "Stage Manager", assignmentRole: "Stage manager" }],
    }).status,
    "ready",
  );
});

test("supplies and signage readiness validates selected quantities", () => {
  assert.equal(deriveOperationalRequirementReadiness("supplies", { required: false }).status, "not_needed");
  assert.equal(deriveOperationalRequirementReadiness("signage", {
    required: true,
    requirements: [{ id: "directional", label: "Directional signage", quantity: 2 }],
  }).status, "ready");
  assert.equal(deriveOperationalRequirementReadiness("supplies", {
    required: true,
    requirements: [{ id: "pens", label: "Pens", quantity: 0 }],
  }).status, "needs_info");
});

test("room set readiness blocks on capacity and otherwise needs room plus setup", () => {
  assert.equal(
    deriveRoomSetReadiness({
      roomRequired: true,
      roomName: "AI room",
      roomSetup: "Reception",
      roomCapacity: 150,
      expectedAttendance: 200,
    }).status,
    "blocked",
  );
  assert.equal(deriveRoomSetReadiness({ roomRequired: true, roomName: "AI room" }).status, "needs_info");
  assert.equal(deriveRoomSetReadiness({ roomRequired: true, roomName: "AI room", roomSetup: "Reception" }).status, "ready");
});

test("seating readiness is explicit about not-needed, not-started, and complete seating", () => {
  assert.equal(deriveSeatingReadiness({ seatingRequired: false }).status, "not_needed");
  assert.equal(deriveSeatingReadiness({ seatingRequired: true, hasStarted: false }).status, "needs_info");
  assert.equal(deriveSeatingReadiness({ hasStarted: false }).status, "not_started");
  assert.equal(
    deriveSeatingReadiness({
      seatingRequired: true,
      expectedAttendance: 2,
      seatingPlanExists: true,
      assignedSeatCount: 2,
      unassignedAttendeeCount: 0,
    }).status,
    "ready",
  );
});

test("conflicts readiness maps blocking and reviewable conflicts conservatively", () => {
  assert.equal(deriveConflictsReadiness({ checked: false }).status, "not_started");
  assert.equal(deriveConflictsReadiness({ conflicts: [{ severity: "warning" }] }).status, "needs_info");
  assert.equal(deriveConflictsReadiness({ conflicts: [{ severity: "error" }] }).status, "blocked");
  assert.equal(deriveConflictsReadiness({ conflicts: [] }).status, "ready");
});

test("notes/activity readiness can be not needed, not started, needs info, or ready", () => {
  assert.equal(deriveNotesActivityReadiness({ required: false }).status, "not_needed");
  assert.equal(deriveNotesActivityReadiness({}).status, "not_started");
  assert.equal(deriveNotesActivityReadiness({ required: true }).status, "needs_info");
  assert.equal(deriveNotesActivityReadiness({ required: true, notes: "Check with onsite lead." }).status, "ready");
});

test("session module readiness aggregator returns every module by canonical id", () => {
  const readiness = deriveSessionModuleReadiness({
    details: completeDetails,
    speakers: { required: true, speakers: [{ speakerId: "speaker-1", name: "Speaker", status: "CONFIRMED" }] },
    av: { hasStarted: false },
    fnb: { serviceRequired: false },
    staffing: { required: true, assignments: [{ personId: "person-1", name: "Lead", assignmentRole: "Lead" }] },
    roomSet: { roomRequired: true, roomName: "AI room", roomSetup: "Reception" },
    seating: { seatingRequired: false },
    conflicts: { conflicts: [] },
    notesActivity: { required: false },
  });

  assert.equal(readiness.speakers.status, "ready");
  assert.equal(readiness.details.status, "ready");
  assert.equal(readiness.av.status, "not_started");
  assert.equal(readiness.fnb.status, "not_needed");
  assert.equal(readiness.staffing.status, "ready");
  assert.equal(readiness.supplies.status, "not_needed");
  assert.equal(readiness.signage.status, "not_needed");
  assert.equal(readiness["room-set"].status, "ready");
  assert.equal(readiness.seating.status, "not_needed");
  assert.equal(readiness.conflicts.status, "ready");
  assert.equal(readiness["notes-activity"].status, "not_needed");
});

test("F&B readiness incorporates privacy-safe safety alert severity", () => {
  const complete = {
    serviceRequired: true,
    expectedAttendance: 25,
    catalogAssignments: [{ id: "assignment-1" }],
  };

  const blocked = deriveFnbReadiness({
    ...complete,
    safetyAlert: { severity: "BLOCKING", reasonCodes: ["CONTAINS_ALLERGEN"] },
  });
  assert.equal(blocked.status, "blocked");
  assert.match(blocked.reasons.join(" "), /safety has a blocking issue/i);

  const review = deriveFnbReadiness({
    ...complete,
    safetyAlert: { severity: "ATTENTION", reasonCodes: ["ITEM_VERIFICATION_STALE"] },
  });
  assert.equal(review.status, "needs_info");
  assert.match(review.reasons.join(" "), /safety needs review/i);

  assert.equal(deriveFnbReadiness({
    ...complete,
    safetyAlert: { severity: "CLEAR", reasonCodes: [] },
  }).status, "ready");
});

test("production availability excludes Room Set and Seating from readiness without changing other modules", () => {
  const readiness = deriveSessionModuleReadiness({
    details: completeDetails,
    speakers: { required: true, speakers: [] },
    av: { hasStarted: false },
    fnb: { serviceRequired: false },
    staffing: { required: true, assignments: [] },
    roomSet: { roomRequired: true, roomName: "Ballroom", roomCapacity: 10, expectedAttendance: 50 },
    seating: { seatingRequired: true, expectedAttendance: 50 },
    conflicts: { conflicts: [] },
    notesActivity: { required: false },
  }, { includeRoomSetAndSeating: false });

  assert.equal(readiness["room-set"].status, "not_needed");
  assert.equal(readiness.seating.status, "not_needed");
  assert.equal(readiness.details.status, "ready");
  assert.equal(readiness.speakers.status, "needs_info");
  assert.equal(readiness.staffing.status, "needs_info");
});

function attentionInput(overrides: Partial<Parameters<typeof deriveSessionReadiness>[0]> = {}): Parameters<typeof deriveSessionReadiness>[0] {
  return {
    details: completeDetails,
    speakers: { required: false, speakers: [] },
    av: { required: false, requirements: [] },
    fnb: { serviceRequired: false },
    staffing: { required: false },
    roomSet: { roomRequired: true, roomName: "Ballroom", roomSetup: "Rounds" },
    seating: { seatingRequired: false },
    conflicts: { conflicts: [] },
    notesActivity: { required: false },
    ...overrides,
  };
}

test("session-type applicability separates required modules from optional yellow gaps", () => {
  assert.deepEqual(deriveSessionModuleApplicability({ sessionType: "Breakfast" }), {
    speakersRequired: false,
    avRequired: false,
    fnbRequired: true,
  });
  assert.deepEqual(deriveSessionModuleApplicability({ sessionType: "Opening Keynote" }), {
    speakersRequired: true,
    avRequired: true,
    fnbRequired: false,
  });
  assert.equal(deriveSessionModuleApplicability({ sessionType: "Session", hasAvRequirements: true }).avRequired, true);
});

test("an optional yellow module does not automatically require planner attention", () => {
  const readiness = deriveSessionReadiness(attentionInput({
    av: { hasStarted: true, requirements: [{ id: null, label: null }] },
  }), { includeRoomSetAndSeating: false });

  assert.equal(readiness.modules.av.status, "needs_info");
  assert.equal(readiness.attentionItems.some((item) => item.moduleId === "av"), false);
});

test("meal sessions require actionable F&B headcount without flagging optional speakers or AV", () => {
  const applicability = deriveSessionModuleApplicability({ sessionType: "Lunch" });
  const readiness = deriveSessionReadiness(attentionInput({
    speakers: { required: applicability.speakersRequired, speakers: [] },
    av: { required: applicability.avRequired, requirements: [] },
    fnb: { serviceRequired: applicability.fnbRequired, catalogAssignments: ["buffet"] },
  }), { includeRoomSetAndSeating: false });

  assert.equal(readiness.modules.speakers.status, "not_needed");
  assert.equal(readiness.modules.av.status, "not_needed");
  assert.equal(readiness.modules.fnb.status, "needs_info");
  assert.deepEqual(readiness.attentionItems.map((item) => [item.moduleId, item.title, item.actionLabel]), [
    ["fnb", "F&B headcount is required", "Add headcount"],
  ]);
});

test("presented sessions surface genuinely required speakers and AV", () => {
  const applicability = deriveSessionModuleApplicability({ sessionType: "Keynote" });
  const readiness = deriveSessionReadiness(attentionInput({
    speakers: { required: applicability.speakersRequired, speakers: [] },
    av: { required: applicability.avRequired, requirements: [] },
  }), { includeRoomSetAndSeating: false });

  assert.deepEqual(readiness.attentionItems.map((item) => item.moduleId), ["speakers", "av"]);
  assert.deepEqual(readiness.attentionItems.map((item) => item.actionLabel), ["Assign", "Confirm AV"]);
});

test("blocked modules and active conflicts sort ahead of required missing information", () => {
  const readiness = deriveSessionReadiness(attentionInput({
    details: { ...completeDetails, endTime: "08:00" },
    fnb: { serviceRequired: true, catalogAssignments: ["breakfast"] },
    conflicts: {
      conflicts: [{ id: "speaker-warning", type: "SPEAKER_DOUBLE_BOOKED", severity: "warning", message: "Speaker overlaps another session." }],
    },
  }), { includeRoomSetAndSeating: false });

  assert.deepEqual(readiness.attentionItems.map((item) => item.priority), ["blocked", "conflict", "required_missing"]);
  assert.deepEqual(readiness.attentionItems.map((item) => item.moduleId), ["details", "conflicts", "fnb"]);
});

test("canonical attention list is complete and never arbitrarily truncated to two", () => {
  const readiness = deriveSessionReadiness(attentionInput({
    speakers: { required: true, speakers: [] },
    av: { required: true, requirements: [] },
    fnb: { serviceRequired: true },
    conflicts: {
      conflicts: [
        { id: "conflict-1", severity: "warning", message: "First conflict" },
        { id: "conflict-2", severity: "warning", message: "Second conflict" },
        { id: "conflict-3", severity: "warning", message: "Third conflict" },
      ],
    },
  }), { includeRoomSetAndSeating: false });

  assert.equal(readiness.attentionItems.length, 6);
  assert.equal(new Set(readiness.attentionItems.map((item) => item.id)).size, readiness.attentionItems.length);
});
