import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { formatRoomSetCanvasTableLabel } from "@/lib/room-set/canvas-table-label";
import type { PlannerScene, PlannerSceneObject } from "@/lib/room-set/planner-scene";
import { parsePlannerSceneJson } from "@/lib/room-set/planner-scene-io";
import {
  buildPlannerSceneSeatingOverlayRecords,
  plannerSceneObjectWithSeatingTableLink,
  repairPlannerSceneSeatingTableLinks,
  resolvePlannerSceneSeatingObjectLinks,
  type RoomSetSeatingOverlayAssignment,
  type RoomSetSeatingOverlayTable,
} from "@/lib/room-set/seating-overlay-mapping";

const canvasSource = readFileSync(
  new URL(
    "../../app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/room-set/_components/planner-scene-prototype-canvas.tsx",
    import.meta.url,
  ),
  "utf8",
);

function sceneObject(
  id: string,
  seatingTableId: string | null,
  seated = 8,
): PlannerSceneObject {
  return {
    id,
    componentId: "table-round-60",
    objectType: "banquet_table",
    name: "60in round",
    label: id,
    capacity: { seated, staff: 0 },
    source: { kind: "generated" },
    transform: {
      xLu: 10,
      yLu: 10,
      widthLu: 8,
      depthLu: 8,
      rotationDeg: 0,
    },
    metadata: {
      componentCategory: "tables",
      visualVariant: "round",
      neutralNote: "",
      ...(seatingTableId ? { seatingTableId, seatingPlanId: "plan-1" } : {}),
    },
  };
}

const seatingTables = [
  { id: "table-a", seatingPlanId: "plan-1", name: "Alpha", capacity: 8 },
  { id: "table-b", seatingPlanId: "plan-1", name: "Beta", capacity: 8 },
  { id: "table-c", seatingPlanId: "plan-1", name: "Gamma", capacity: 8 },
] satisfies RoomSetSeatingOverlayTable[];

const assignments = [
  { tableId: "table-a", attendeeId: "attendee-a", seatIndex: 2 },
  { tableId: "table-b", attendeeId: "attendee-b", seatIndex: 5 },
] satisfies RoomSetSeatingOverlayAssignment[];

const attendees = [
  { id: "attendee-a", firstName: "Ada", lastName: "Lovelace" },
  { id: "attendee-b", firstName: "Grace", lastName: "Hopper" },
];

test("visual table overlays resolve by stable seating table id, not array index", () => {
  const objects = [
    sceneObject("visual-one", "table-b"),
    sceneObject("visual-two", "table-a"),
  ];

  const overlays = buildPlannerSceneSeatingOverlayRecords(objects, seatingTables, assignments, attendees);

  assert.equal(overlays["visual-one"].tableId, "table-b");
  assert.equal(overlays["visual-one"].tableName, "Beta");
  assert.deepEqual(overlays["visual-one"].occupiedSeatIndexes, [5]);
  assert.equal(overlays["visual-two"].tableId, "table-a");
  assert.deepEqual(overlays["visual-two"].attendeeNames, ["Ada Lovelace"]);
});

test("canvas table label renders only the compact table number", () => {
  const contextualTableName = "BALL ROOM B — WORKSHOP — 9:30 AM TABLE 2";
  const canvasLabel = formatRoomSetCanvasTableLabel({
    tableName: contextualTableName,
    tableSortOrder: 2,
  });

  assert.equal(canvasLabel, "T2");
  assert.equal(canvasLabel.includes("BALL ROOM B"), false);
  assert.equal(canvasLabel.includes("WORKSHOP"), false);
  assert.equal(canvasLabel.includes("9:30 AM"), false);
  assert.equal(canvasSource.includes("formatRoomSetCanvasTableLabel(seatingOverlay)"), true);
});

test("canvas table label falls back to seating table order without contextual text", () => {
  const canvasLabel = formatRoomSetCanvasTableLabel({
    tableName: "BALL ROOM B — WORKSHOP — 9:30 AM",
    tableSortOrder: 3,
  });

  assert.equal(canvasLabel, "T3");
  assert.equal(canvasLabel.includes("BALL ROOM B"), false);
  assert.equal(canvasLabel.includes("WORKSHOP"), false);
  assert.equal(canvasLabel.includes("9:30 AM"), false);
});

test("reordering visual tables does not move seating assignments to the wrong visual table", () => {
  const original = [
    sceneObject("visual-a", "table-a"),
    sceneObject("visual-b", "table-b"),
  ];
  const reordered = [...original].reverse();

  const overlays = buildPlannerSceneSeatingOverlayRecords(reordered, seatingTables, assignments, attendees);

  assert.equal(overlays["visual-a"].tableId, "table-a");
  assert.deepEqual(overlays["visual-a"].occupiedSeatIndexes, [2]);
  assert.equal(overlays["visual-b"].tableId, "table-b");
  assert.deepEqual(overlays["visual-b"].occupiedSeatIndexes, [5]);
});

test("deleting one visual table does not shift another table's seating state", () => {
  const remainingObjects = [
    sceneObject("visual-b", "table-b"),
  ];

  const overlays = buildPlannerSceneSeatingOverlayRecords(remainingObjects, seatingTables, assignments, attendees);

  assert.deepEqual(Object.keys(overlays), ["visual-b"]);
  assert.equal(overlays["visual-b"].tableId, "table-b");
  assert.deepEqual(overlays["visual-b"].occupiedSeatIndexes, [5]);
});

test("save and reload preserves visual table to seating table mapping", () => {
  const scene = {
    roomShell: {
      widthLu: 120,
      depthLu: 80,
      bounds: { xLu: 0, yLu: 0, widthLu: 120, depthLu: 80 },
    },
    objects: [sceneObject("visual-a", "table-a")],
  } satisfies PlannerScene;

  const parsed = parsePlannerSceneJson(JSON.stringify(scene));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const links = resolvePlannerSceneSeatingObjectLinks(
    parsed.scene.objects,
    new Map(seatingTables.map((table) => [table.id, table])),
  );
  assert.equal(links.length, 1);
  assert.equal(links[0].object.id, "visual-a");
  assert.equal(links[0].seatingTable.id, "table-a");
});

test("exact chair assignment appears on the correct visual table", () => {
  const objects = [
    sceneObject("visual-a", "table-a"),
    sceneObject("visual-b", "table-b"),
  ];

  const overlays = buildPlannerSceneSeatingOverlayRecords(objects, seatingTables, assignments, attendees);

  assert.deepEqual(overlays["visual-a"].occupiedSeatIndexes, [2]);
  assert.deepEqual(overlays["visual-b"].occupiedSeatIndexes, [5]);
});

test("missing, invalid, and duplicated seating table links fail safely", () => {
  const missing = sceneObject("missing", null);
  const invalid = sceneObject("invalid", "table-missing");
  const duplicateOne = sceneObject("duplicate-one", "table-a");
  const duplicateTwo = sceneObject("duplicate-two", "table-a");

  const overlays = buildPlannerSceneSeatingOverlayRecords(
    [missing, invalid, duplicateOne, duplicateTwo],
    seatingTables,
    assignments,
    attendees,
  );

  assert.deepEqual(overlays, {});
});

test("seating table links can be attached to visual objects without changing geometry", () => {
  const object = sceneObject("visual-a", null);
  const linked = plannerSceneObjectWithSeatingTableLink(object, seatingTables[0]);

  assert.equal(linked.metadata.seatingTableId, "table-a");
  assert.equal(linked.metadata.seatingPlanId, "plan-1");
  assert.deepEqual(linked.transform, object.transform);
});

test("existing unlinked Room Set visual tables get safe seatingTableId links without assignments", () => {
  const objects = [
    sceneObject("visual-a", null),
    sceneObject("visual-b", null),
  ];

  const repair = repairPlannerSceneSeatingTableLinks({
    objects,
    seatingTables,
    assignments: [],
    activeSeatingPlanId: "plan-1",
  });

  assert.equal(repair.changed, true);
  assert.equal(repair.linkedCount, 2);
  assert.equal(repair.skippedReason, "none");
  assert.equal(repair.objects[0].metadata.seatingTableId, "table-a");
  assert.equal(repair.objects[1].metadata.seatingTableId, "table-b");
});

test("drag/drop targets are available after safe seating link repair", () => {
  const repair = repairPlannerSceneSeatingTableLinks({
    objects: [sceneObject("visual-a", null)],
    seatingTables,
    assignments: [],
    activeSeatingPlanId: "plan-1",
  });

  const links = resolvePlannerSceneSeatingObjectLinks(
    repair.objects,
    new Map(seatingTables.map((table) => [table.id, table])),
  );

  assert.equal(links.length, 1);
  assert.equal(links[0].object.id, "visual-a");
  assert.equal(links[0].seatingTable.id, "table-a");
});

test("save and reload preserves repaired seatingTableId metadata", () => {
  const repair = repairPlannerSceneSeatingTableLinks({
    objects: [sceneObject("visual-a", null)],
    seatingTables,
    assignments: [],
    activeSeatingPlanId: "plan-1",
  });
  const scene = {
    roomShell: {
      widthLu: 120,
      depthLu: 80,
      bounds: { xLu: 0, yLu: 0, widthLu: 120, depthLu: 80 },
    },
    objects: repair.objects,
  } satisfies PlannerScene;

  const parsed = parsePlannerSceneJson(JSON.stringify(scene));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  assert.equal(parsed.scene.objects[0].metadata.seatingTableId, "table-a");
  assert.equal(parsed.scene.objects[0].metadata.seatingPlanId, "plan-1");
});

test("existing valid seatingTableId links are preserved during repair", () => {
  const linked = sceneObject("visual-a", "table-b");
  const repair = repairPlannerSceneSeatingTableLinks({
    objects: [linked],
    seatingTables,
    assignments: [],
    activeSeatingPlanId: "plan-1",
  });

  assert.equal(repair.changed, false);
  assert.equal(repair.objects[0], linked);
  assert.equal(repair.objects[0].metadata.seatingTableId, "table-b");
});

test("stale and duplicate seatingTableId links do not become drop targets after repair", () => {
  const objects = [
    sceneObject("stale", "missing-table"),
    sceneObject("duplicate-a", "table-a"),
    sceneObject("duplicate-b", "table-a"),
  ];

  const repair = repairPlannerSceneSeatingTableLinks({
    objects,
    seatingTables,
    assignments,
    activeSeatingPlanId: "plan-1",
  });
  const overlays = buildPlannerSceneSeatingOverlayRecords(
    repair.objects,
    seatingTables,
    assignments,
    attendees,
  );

  assert.equal(repair.changed, true);
  assert.equal(repair.linkedCount, 0);
  assert.equal(repair.clearedCount, 3);
  assert.equal(repair.skippedReason, "assignments_present");
  assert.deepEqual(overlays, {});
});

test("repair does not guess when assignments exist and unlinked mapping is ambiguous", () => {
  const repair = repairPlannerSceneSeatingTableLinks({
    objects: [sceneObject("visual-a", null), sceneObject("visual-b", null)],
    seatingTables,
    assignments,
    activeSeatingPlanId: "plan-1",
  });

  assert.equal(repair.changed, false);
  assert.equal(repair.linkedCount, 0);
  assert.equal(repair.skippedReason, "assignments_present");
  assert.equal(repair.objects[0].metadata.seatingTableId, undefined);
  assert.equal(repair.objects[1].metadata.seatingTableId, undefined);
});

test("stable overlay mapping still ignores array order after repair", () => {
  const repair = repairPlannerSceneSeatingTableLinks({
    objects: [sceneObject("visual-a", null), sceneObject("visual-b", null)],
    seatingTables: [seatingTables[1], seatingTables[0]],
    assignments: [],
    activeSeatingPlanId: "plan-1",
  });
  const overlays = buildPlannerSceneSeatingOverlayRecords(
    [...repair.objects].reverse(),
    seatingTables,
    assignments,
    attendees,
  );

  assert.equal(overlays["visual-a"].tableId, "table-a");
  assert.equal(overlays["visual-b"].tableId, "table-b");
});

test("exact chair assignment still resolves after safe repair", () => {
  const repair = repairPlannerSceneSeatingTableLinks({
    objects: [sceneObject("visual-a", null)],
    seatingTables,
    assignments: [],
    activeSeatingPlanId: "plan-1",
  });
  const exactChairAssignments = [
    { tableId: "table-a", attendeeId: "attendee-a", seatIndex: 3 },
  ] satisfies RoomSetSeatingOverlayAssignment[];

  const overlays = buildPlannerSceneSeatingOverlayRecords(
    repair.objects,
    seatingTables,
    exactChairAssignments,
    attendees,
  );

  assert.deepEqual(overlays["visual-a"].occupiedSeatIndexes, [3]);
  assert.deepEqual(overlays["visual-a"].attendeeNames, ["Ada Lovelace"]);
});
