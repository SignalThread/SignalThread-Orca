import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { PlannerSceneObject } from "./planner-scene";
import {
  plannerSceneObjectContainsHitPoint,
  plannerScenePointerExceededDragThreshold,
  resolvePlannerSceneHitTarget,
} from "./planner-scene-hit-testing";

function sceneObject(
  id: string,
  componentId: PlannerSceneObject["componentId"],
  xLu: number,
  yLu: number,
  widthLu: number,
  depthLu: number,
  overrides: Partial<PlannerSceneObject> = {},
): PlannerSceneObject {
  return {
    id,
    componentId,
    objectType: overrides.objectType ?? "chair_block",
    name: id,
    label: id,
    capacity: overrides.capacity ?? { seated: 1, staff: 0 },
    source: overrides.source ?? { kind: "manual" },
    transform: {
      xLu,
      yLu,
      widthLu,
      depthLu,
      rotationDeg: overrides.transform?.rotationDeg ?? 0,
    },
    metadata: {
      componentCategory: "lounge",
      visualVariant: "chair",
      neutralNote: "",
      ...overrides.metadata,
    },
  };
}

test("adjacent benches or lounge chairs are individually selectable", () => {
  const left = sceneObject("left-bench", "lounge-chair", 10, 10, 3.6, 3.6);
  const right = sceneObject("right-bench", "lounge-chair", 14, 10, 3.6, 3.6);

  assert.equal(resolvePlannerSceneHitTarget([left, right], { xLu: 11, yLu: 11 })?.object.id, "left-bench");
  assert.equal(resolvePlannerSceneHitTarget([left, right], { xLu: 15, yLu: 11 })?.object.id, "right-bench");
});

test("selected-object visual priority is ignored by hit-testing so neighbors remain clickable", () => {
  const selected = sceneObject("selected-table", "table-round-60", 20, 20, 6.1, 6.1, {
    objectType: "banquet_table",
    metadata: { componentCategory: "tables", visualVariant: "round", neutralNote: "" },
    capacity: { seated: 8, staff: 0 },
  });
  const neighbor = sceneObject("neighbor-table", "table-round-60", 26.4, 20, 6.1, 6.1, {
    objectType: "banquet_table",
    metadata: { componentCategory: "tables", visualVariant: "round", neutralNote: "" },
    capacity: { seated: 8, staff: 0 },
  });

  assert.equal(resolvePlannerSceneHitTarget([selected, neighbor], { xLu: 27.5, yLu: 22 })?.object.id, "neighbor-table");
});

test("table next to table can be selected separately", () => {
  const tableA = sceneObject("table-a", "table-banquet-6ft", 5, 5, 7.3, 2.4, {
    objectType: "classroom_table",
    metadata: { componentCategory: "tables", visualVariant: "rect", neutralNote: "" },
    capacity: { seated: 6, staff: 0 },
  });
  const tableB = sceneObject("table-b", "table-banquet-6ft", 12.7, 5, 7.3, 2.4, {
    objectType: "classroom_table",
    metadata: { componentCategory: "tables", visualVariant: "rect", neutralNote: "" },
    capacity: { seated: 6, staff: 0 },
  });

  assert.equal(resolvePlannerSceneHitTarget([tableA, tableB], { xLu: 6, yLu: 6 })?.object.id, "table-a");
  assert.equal(resolvePlannerSceneHitTarget([tableA, tableB], { xLu: 13.5, yLu: 6 })?.object.id, "table-b");
});

test("chair marker clicks still resolve to the parent table object", () => {
  const table = sceneObject("table-with-chairs", "table-round-60", 10, 10, 6.1, 6.1, {
    objectType: "banquet_table",
    metadata: { componentCategory: "tables", visualVariant: "round", neutralNote: "" },
    capacity: { seated: 8, staff: 0 },
  });

  assert.equal(resolvePlannerSceneHitTarget([table], { xLu: 13, yLu: 10.2 })?.object.id, "table-with-chairs");
});

test("drag threshold prevents accidental drag on click but preserves intentional movement", () => {
  assert.equal(
    plannerScenePointerExceededDragThreshold({ clientX: 100, clientY: 100 }, { clientX: 102, clientY: 102 }),
    false,
  );
  assert.equal(
    plannerScenePointerExceededDragThreshold({ clientX: 100, clientY: 100 }, { clientX: 108, clientY: 100 }),
    true,
  );
});

test("overlapping objects select the topmost object by deterministic scene order", () => {
  const bottom = sceneObject("bottom", "table-round-60", 10, 10, 8, 8);
  const top = sceneObject("top", "table-round-60", 12, 12, 8, 8);

  assert.equal(resolvePlannerSceneHitTarget([bottom, top], { xLu: 13, yLu: 13 })?.object.id, "top");
});

test("empty canvas hit returns no object so selection can clear", () => {
  const object = sceneObject("table", "table-round-60", 10, 10, 8, 8);

  assert.equal(resolvePlannerSceneHitTarget([object], { xLu: 30, yLu: 30 }), null);
});

test("locked or non-interactive objects can be skipped when the caller marks them as such", () => {
  const locked = sceneObject("locked-zone", "service-corridor", 0, 0, 10, 20, {
    objectType: "aisle_zone",
    metadata: { componentCategory: "service", visualVariant: "zone", neutralNote: "" },
    capacity: { seated: 0, staff: 0 },
  });
  const table = sceneObject("table", "table-round-60", 2, 2, 6, 6);

  assert.equal(
    resolvePlannerSceneHitTarget([table, locked], { xLu: 3, yLu: 3 }, {
      skipObject: (object) => object.id === "locked-zone",
    })?.object.id,
    "table",
  );
});

test("rotated objects use their rotated footprint for hit testing", () => {
  const rotated = sceneObject("rotated", "table-banquet-6ft", 10, 10, 8, 2, {
    transform: { xLu: 10, yLu: 10, widthLu: 8, depthLu: 2, rotationDeg: 90 },
  });

  assert.equal(plannerSceneObjectContainsHitPoint(rotated, { xLu: 15, yLu: 11 }), true);
  assert.equal(plannerSceneObjectContainsHitPoint(rotated, { xLu: 11, yLu: 11 }, { paddingLu: 0 }), false);
});

test("canvas source keeps drag commit and seating drop target behavior wired", () => {
  const canvasSource = readFileSync(
    "app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/room-set/_components/planner-scene-prototype-canvas.tsx",
    "utf8",
  );

  assert.equal(canvasSource.includes("resolvePlannerSceneHitTarget(visibleObjects, point)"), true);
  assert.equal(canvasSource.includes("plannerScenePointerExceededDragThreshold"), true);
  assert.equal(canvasSource.includes("commitObjectPositionNow(interaction.objectId"), true);
  assert.equal(canvasSource.includes("data-room-set-chair-drop-target"), true);
  assert.equal(canvasSource.includes("type: \"chair\""), true);
});
