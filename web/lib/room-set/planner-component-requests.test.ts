import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error TS project config does not enable allowImportingTsExtensions.
import { resolveApplyEditPlan } from "./planner-apply-edit-plan.ts";
import {
  inferAddByEachAnchorComponentRequestFromPrompt,
  inferCapacityTargetFromPrompt,
  inferPlannerComponentRequestsFromPrompt,
} from "./planner-component-requests";
import { supplementLayoutPatchFromPrompt } from "./layout-patch-prompt-supplement";
import type { RoomSetOperationalBrief } from "./planner-intent-shared";
import type { LayoutPatch, LayoutSpec } from "./layout-spec";

function makeBrief(attendeeCount: number): RoomSetOperationalBrief {
  return {
    archetype: "general_session",
    eventIntent: "general_session",
    requestedAttendees: attendeeCount,
    attendeeCount,
    productionScale: "moderate",
    densityPreference: "balanced",
    servicePriorities: ["seating_capacity", "egress"],
    accessibilityPriority: false,
    requiredZones: [],
    optionalZones: [],
    capacityStrategy: {
      requestedSeats: attendeeCount,
      seatingStyle: "theater",
      capacityIsHardRequirement: true,
      primaryComponentId: "seating-theater-row",
      primaryComponentCapacity: 14,
      requiredPrimaryComponents: Math.max(1, Math.ceil(attendeeCount / 14)),
      plannedPrimaryComponents: Math.max(1, Math.ceil(attendeeCount / 14)),
      overflowPolicy: "recommend_larger_room",
    },
    layoutTradeoffs: [],
    operationalRisks: [],
    assumptions: [],
    generationInstructions: [],
    presentationScale: "moderate",
    stageScale: "moderate",
    avScale: "moderate",
    seatingPriority: 0.8,
    networkingPriority: 0.2,
    fnbPriority: 0.2,
    notes: [],
    componentRequests: [],
  };
}

function baseSpecWithBars(barCount: number): LayoutSpec {
  return {
    version: 1,
    source: "ai-generate",
    eventIntent: "general_session",
    layoutType: "banquet",
    attendeeTarget: 120,
    densityPreference: "balanced",
    audienceStyle: "loose",
    front: {
      screen: { componentId: "av-projector-screen", count: 1, zoneRole: "front" },
      stage: { componentId: "stage-keynote", count: 1, zoneRole: "front" },
      av: [],
    },
    audience: {
      primaryComponentId: "table-round-60",
      primaryComponentCapacity: 8,
      requiredPrimaryComponents: 15,
    },
    secondary: [{ componentId: "fnb-portable-bar", count: barCount, zoneRole: "rear" }],
  };
}

test("inferCapacityTargetFromPrompt only responds to attendee or capacity language", () => {
  assert.equal(inferCapacityTargetFromPrompt("create a general session for 240 attendees"), 240);
  assert.equal(inferCapacityTargetFromPrompt("increase capacity to 180 seats"), 180);
  assert.equal(inferCapacityTargetFromPrompt("add a 3rd beverage bar"), null);
  assert.equal(inferCapacityTargetFromPrompt("add 2 more bars near the rear wall"), null);
  assert.equal(inferCapacityTargetFromPrompt("third bar by registration"), null);
});

test("add object by each anchor prompts add the requested object, not the anchor", () => {
  const baseSpec = baseSpecWithBars(3);
  const prompt = "add 2 lounge chairs by each bar";

  const anchored = inferAddByEachAnchorComponentRequestFromPrompt(prompt, {
    baseLayoutSpec: baseSpec,
  });
  assert.ok(anchored);
  assert.equal(anchored.catalogComponentId, "lounge-chair");
  assert.equal(anchored.anchorComponentId, "fnb-portable-bar");
  assert.equal(anchored.quantityPerAnchor, 2);
  assert.equal(anchored.anchorCount, 3);
  assert.equal(anchored.count, 6);

  const requests = inferPlannerComponentRequestsFromPrompt(prompt, 120, {
    baseLayoutSpec: baseSpec,
  });
  assert.deepEqual(
    requests.map((request) => ({
      componentId: request.catalogComponentId,
      count: request.count,
    })),
    [{ componentId: "lounge-chair", count: 6 }],
  );
});

test("add object by each anchor supplement corrects anchor components emitted by AI", () => {
  const baseSpec = baseSpecWithBars(2);
  const aiPatch: LayoutPatch = {
    version: 1,
    ops: [{ op: "addItems", items: [{ componentId: "fnb-portable-bar", count: 4 }] }],
  };

  const patch = supplementLayoutPatchFromPrompt(
    aiPatch,
    "add 4 lounge chairs by each bar",
    baseSpec.attendeeTarget,
    { baseLayoutSpec: baseSpec },
  );

  assert.deepEqual(patch.ops, [
    { op: "addItems", items: [{ componentId: "lounge-chair", count: 8 }] },
  ]);
});

test("resolveApplyEditPlan preserves attendee count for component-count edit prompts", () => {
  const priorBrief = makeBrief(200);
  const aiBrief = makeBrief(3);

  const plan = resolveApplyEditPlan({
    prompt: "add a 3rd beverage bar",
    operationKinds: ["addComponent"],
    sidebar: {
      intentId: "general_session",
      attendeeCount: 200,
      densityPreference: "balanced",
      accessibilityPriority: false,
    },
    canvas: {
      seatedCapacity: 196,
      dominantPrimarySeatingComponentId: "seating-theater-row",
      tableCount: 0,
      chairRowCount: 14,
    },
    aiBrief,
    priorBrief,
    interpretFailureReason: null,
  });

  assert.equal(plan.userIntent.promptCapacityTarget, null);
  assert.equal(plan.finalContext.attendeeCount, 200);
});
