import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ROOM_SET_COMPONENT_CATEGORIES,
  ROOM_SET_COMPONENT_CATEGORY_IDS,
  ROOM_SET_COMPONENTS,
  getRoomSetComponent,
  groupRoomSetComponentsByCategory,
  type RoomSetComponentDefinition,
  type RoomSetComponentId,
} from "./component-library";
import {
  plannerSceneFromGeneratedLayoutPlacements,
  plannerSceneFromLayoutPlacements,
  plannerSceneToCanvasLayoutSnapshot,
  plannerSceneToLayoutPlacements,
  type PlannerScene,
  type PlannerSceneObject,
} from "./planner-scene";
import {
  normalizeCanvasSnapshotFromUnknown,
  type RoomSetLayoutPlacement,
} from "./planner-layout-schema";
import {
  parsePlannerSceneJson,
  serializePlannerSceneJson,
} from "./planner-scene-io";
import { composeLayoutSpec } from "./layout-spec-compose";
import type { LayoutSpec } from "./layout-spec";
import {
  chairRowCountForObject,
  isPrototypeMovableObject,
} from "../../app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/room-set/_components/planner-scene-prototype-canvas";

const ROOM_SHELL = { widthLu: 180, depthLu: 120 } as const;

function initialScene(): PlannerScene {
  return plannerSceneFromLayoutPlacements([], ROOM_SHELL);
}

function addManualComponent(
  scene: PlannerScene,
  componentId: RoomSetComponentId,
  index: number,
): PlannerScene {
  const component = getRoomSetComponent(componentId);
  assert.ok(component, `missing component ${componentId}`);
  const xLu = Math.min(
    Math.max(0, scene.roomShell.widthLu - component.widthLu),
    8 + (index % 8) * 9,
  );
  const yLu = Math.min(
    Math.max(0, scene.roomShell.depthLu - component.depthLu),
    10 + (index % 6) * 7,
  );
  const added = plannerSceneFromLayoutPlacements(
    [{ componentId, xLu, yLu, rotationDeg: component.defaultRotationDeg ?? 0 }],
    {
      widthLu: scene.roomShell.widthLu,
      depthLu: scene.roomShell.depthLu,
    },
    {
      sourceKind: "manual",
      sourceDetail: "component-adder",
      objectIdPrefix: `manual-regression-${componentId}-${index}`,
    },
  );
  const object = added.objects[0];
  assert.ok(object, `component ${componentId} did not create a scene object`);
  return { ...scene, objects: [...scene.objects, object] };
}

function moveObject(scene: PlannerScene, objectId: string, dxLu = 3, dyLu = 4): PlannerScene {
  const nextObjects = scene.objects.map((object) => {
    if (object.id !== objectId) return object;
    return {
      ...object,
      transform: {
        ...object.transform,
        xLu: Math.min(
          scene.roomShell.widthLu - object.transform.widthLu,
          object.transform.xLu + dxLu,
        ),
        yLu: Math.min(
          scene.roomShell.depthLu - object.transform.depthLu,
          object.transform.yLu + dyLu,
        ),
      },
    };
  });
  return { ...scene, objects: nextObjects };
}

function deleteObject(scene: PlannerScene, objectId: string): PlannerScene {
  return { ...scene, objects: scene.objects.filter((object) => object.id !== objectId) };
}

function assertComponentDefinitionValid(component: RoomSetComponentDefinition): void {
  assert.equal(component.id.trim().length > 0, true, `${component.id} missing id`);
  assert.equal(component.label.trim().length > 0, true, `${component.id} missing label`);
  assert.equal(
    ROOM_SET_COMPONENT_CATEGORY_IDS.includes(component.category),
    true,
    `${component.id} has invalid category ${component.category}`,
  );
  assert.equal(component.shapeType.trim().length > 0, true, `${component.id} missing shape type`);
  assert.equal(component.domainKind.trim().length > 0, true, `${component.id} missing domain kind`);
  assert.equal(component.widthLu > 0, true, `${component.id} width must be positive`);
  assert.equal(component.depthLu > 0, true, `${component.id} depth must be positive`);
  assert.equal(component.capacitySeated >= 0, true, `${component.id} seated capacity must be non-negative`);
  assert.equal(component.capacityStaff >= 0, true, `${component.id} staff capacity must be non-negative`);
  assert.equal(component.visualVariant.trim().length > 0, true, `${component.id} missing visual variant`);
}

test("component registry maps every drawer component to a valid renderable movable scene object", () => {
  const ids = new Set<string>();
  const grouped = groupRoomSetComponentsByCategory(ROOM_SET_COMPONENTS);
  assert.equal(grouped.size, ROOM_SET_COMPONENT_CATEGORY_IDS.length);
  for (const category of ROOM_SET_COMPONENT_CATEGORIES) {
    assert.ok(grouped.get(category.id), `missing group for ${category.id}`);
  }

  ROOM_SET_COMPONENTS.forEach((component, index) => {
    assert.equal(ids.has(component.id), false, `duplicate component id ${component.id}`);
    ids.add(component.id);
    assertComponentDefinitionValid(component);
    assert.equal(getRoomSetComponent(component.id), component);

    const scene = plannerSceneFromLayoutPlacements(
      [{ componentId: component.id as RoomSetComponentId, xLu: 4 + index, yLu: 5 + index, rotationDeg: 0 }],
      { widthLu: 260, depthLu: 220 },
      { sourceKind: "manual", sourceDetail: "component-adder", objectIdPrefix: `registry-${component.id}` },
    );
    const object = scene.objects[0];
    assert.ok(object, `${component.id} did not resolve to a scene object`);
    assert.equal(object.componentId, component.id);
    assert.equal(object.objectType, component.domainKind);
    assert.equal(object.metadata.componentCategory, component.category);
    assert.equal(object.metadata.visualVariant, component.visualVariant);
    assert.equal(object.transform.widthLu, component.widthLu);
    assert.equal(object.transform.depthLu, component.depthLu);
    assert.equal(isPrototypeMovableObject(object), true, `${component.id} should be movable when added manually`);
  });
});

test("every exposed component can be added, selected, moved, and deleted in scene state", () => {
  ROOM_SET_COMPONENTS.forEach((component, index) => {
    const sceneWithObject = addManualComponent(initialScene(), component.id as RoomSetComponentId, index);
    const object = sceneWithObject.objects.at(-1);
    assert.ok(object, `missing added object for ${component.id}`);

    const selectedObject = sceneWithObject.objects.find((candidate) => candidate.id === object.id);
    assert.ok(selectedObject, `${component.id} could not be selected by id`);
    assert.equal(isPrototypeMovableObject(selectedObject), true, `${component.id} should allow drag/move`);

    const movedScene = moveObject(sceneWithObject, selectedObject.id);
    const movedObject = movedScene.objects.find((candidate) => candidate.id === selectedObject.id);
    assert.ok(movedObject, `${component.id} missing after move`);
    assert.notDeepEqual(
      { xLu: movedObject.transform.xLu, yLu: movedObject.transform.yLu },
      { xLu: selectedObject.transform.xLu, yLu: selectedObject.transform.yLu },
      `${component.id} did not move`,
    );

    const deletedScene = deleteObject(movedScene, movedObject.id);
    assert.equal(
      deletedScene.objects.some((candidate) => candidate.id === movedObject.id),
      false,
      `${component.id} was not deleted`,
    );
  });
});

test("component drawer cards do not expose layout-unit dimensions", () => {
  const workspaceSource = readFileSync(
    new URL(
      "../../app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/room-set/_components/room-set-workspace.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const componentAdderSource = workspaceSource.slice(
    workspaceSource.indexOf("const renderComponentAdderLedger"),
    workspaceSource.indexOf("const renderGeneratePanelLedger"),
  );

  assert.equal(componentAdderSource.includes(" LU"), false);
  assert.equal(componentAdderSource.includes("widthLu.toFixed"), false);
  assert.equal(componentAdderSource.includes("depthLu.toFixed"), false);
  assert.equal(componentAdderSource.includes("componentDrawerCardDetail"), true);
});

test("seating component labels match chair row and block rendering behavior", () => {
  const seatingExpectations = [
    { id: "seating-chair-single", label: "Single chair", rows: 1, seats: 1 },
    { id: "seating-chair-row-5", label: "5-chair row", rows: 1, seats: 5 },
    { id: "seating-chair-row-10", label: "10-chair row", rows: 1, seats: 10 },
    { id: "seating-chair-block-20", label: "20-chair block", rows: 2, seats: 20 },
    { id: "seating-theater-row", label: "14-chair row", rows: 1, seats: 14 },
  ] as const;

  for (const expectation of seatingExpectations) {
    const component = getRoomSetComponent(expectation.id);
    assert.ok(component, `missing seating component ${expectation.id}`);
    assert.equal(component.label, expectation.label);
    assert.equal(component.capacitySeated, expectation.seats);

    const scene = addManualComponent(initialScene(), expectation.id, 1);
    const object = scene.objects[0];
    assert.ok(object);
    assert.equal(chairRowCountForObject(object), expectation.rows, `${expectation.id} row count`);
  }
});

test("decor and queue lane manual components remain selectable and movable", () => {
  for (const componentId of ["decor-plant-cluster", "registration-queue-lane"] as const) {
    const scene = addManualComponent(initialScene(), componentId, 1);
    const object = scene.objects[0];
    assert.ok(object);
    assert.equal(object.objectType, "aisle_zone");
    assert.equal(isPrototypeMovableObject(object), true);

    const movedScene = moveObject(scene, object.id, 6, 9);
    const movedObject = movedScene.objects[0];
    assert.ok(movedObject);
    assert.equal(movedObject.transform.xLu, object.transform.xLu + 6);
    assert.equal(movedObject.transform.yLu, object.transform.yLu + 9);
  }
});

test("representative moved components persist through Save Draft scene and snapshot serialization", () => {
  const representativeIds = [
    "table-round-72",
    "seating-theater-row",
    "registration-queue-lane",
    "decor-plant-cluster",
    "stage-small",
    "av-foh-control",
  ] as const;
  let scene = initialScene();
  representativeIds.forEach((componentId, index) => {
    scene = addManualComponent(scene, componentId, index);
  });

  const movedScene = representativeIds.reduce((draft, componentId, index) => {
    const object = draft.objects.find((candidate) => candidate.componentId === componentId);
    assert.ok(object, `missing representative ${componentId}`);
    return moveObject(draft, object.id, 2 + index, 3 + index);
  }, scene);

  const sceneJson = serializePlannerSceneJson(movedScene);
  const parsedScene = parsePlannerSceneJson(sceneJson);
  assert.equal(parsedScene.ok, true);
  if (!parsedScene.ok) return;

  const snapshot = plannerSceneToCanvasLayoutSnapshot(parsedScene.scene);
  const normalizedSnapshot = normalizeCanvasSnapshotFromUnknown(JSON.parse(JSON.stringify(snapshot)));
  assert.ok(normalizedSnapshot);
  const reloadedScene = plannerSceneFromLayoutPlacements(normalizedSnapshot.placements, {
    widthLu: normalizedSnapshot.roomWidthLu,
    depthLu: normalizedSnapshot.roomDepthLu,
  });

  for (const componentId of representativeIds) {
    const before = plannerSceneToLayoutPlacements(movedScene).find((placement) => placement.componentId === componentId);
    const after = plannerSceneToLayoutPlacements(reloadedScene).find((placement) => placement.componentId === componentId);
    assert.ok(before, `missing saved placement ${componentId}`);
    assert.ok(after, `missing reloaded placement ${componentId}`);
    assert.equal(after.xLu, before.xLu, `${componentId} x position did not persist`);
    assert.equal(after.yLu, before.yLu, `${componentId} y position did not persist`);
  }
});

test("Generate and Apply regression path produces a Layout Check-compatible scene and save snapshot", () => {
  const generatedSpec: LayoutSpec = {
    version: 1,
    source: "ai-generate",
    eventIntent: "banquet_remarks",
    layoutType: "banquet",
    attendeeTarget: 80,
    densityPreference: "balanced",
    audienceStyle: "grid",
    front: {
      screen: { componentId: "av-projector-screen", count: 1, zoneRole: "front" },
      stage: { componentId: "stage-small", count: 1, zoneRole: "front" },
      av: [{ componentId: "av-speaker-stack", count: 2, zoneRole: "front" }],
    },
    audience: {
      primaryComponentId: "table-round-60",
      primaryComponentCapacity: 8,
      requiredPrimaryComponents: 10,
    },
    secondary: [
      { componentId: "registration-desk", count: 1, zoneRole: "rear" },
      { componentId: "fnb-buffet-line", count: 1, zoneRole: "perimeter" },
    ],
  };

  const result = composeLayoutSpec({ spec: generatedSpec, roomWidthLu: 120, roomDepthLu: 80 });
  assert.equal(result.ok, true);
  assert.equal(result.placements.length > 0, true);

  const generatedScene = plannerSceneFromGeneratedLayoutPlacements(result.placements, {
    widthLu: 120,
    depthLu: 80,
  });
  assert.equal(generatedScene.objects.length, result.placements.length);
  assert.equal(generatedScene.objects.some((object) => object.componentId === "table-round-60"), true);

  const appliedPlacements: RoomSetLayoutPlacement[] = [
    ...plannerSceneToLayoutPlacements(generatedScene),
    { componentId: "decor-plant-cluster", xLu: 8, yLu: 68, rotationDeg: 0 },
  ];
  const appliedScene = plannerSceneFromLayoutPlacements(appliedPlacements, {
    widthLu: 120,
    depthLu: 80,
  });
  assert.equal(appliedScene.objects.length, generatedScene.objects.length + 1);
  assert.equal(appliedScene.objects.some((object) => object.componentId === "decor-plant-cluster"), true);

  const snapshot = plannerSceneToCanvasLayoutSnapshot(appliedScene);
  const normalized = normalizeCanvasSnapshotFromUnknown(snapshot);
  assert.ok(normalized);
  assert.equal(normalized.placements.length, appliedScene.objects.length);
});

test("standalone Room Set shell source preserves drawer toggles, mode switching, Generate, Apply, and Save Draft hooks", () => {
  const workspaceSource = readFileSync(
    new URL(
      "../../app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/room-set/_components/room-set-workspace.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.equal(workspaceSource.includes('type RoomSetModeId = "layout"'), true);
  assert.match(workspaceSource, /function normalizeRoomSetMode\(value: string \| null\): RoomSetModeId/);
  assert.equal(workspaceSource.includes('value === "seating"'), true);
  assert.equal(workspaceSource.includes('return "layout";'), true);
  assert.equal(workspaceSource.includes('nextSearchLedger.set("mode", "layout");'), true);
  assert.equal(workspaceSource.includes('nextSearchLedger.set("mode", normalizedModeLedger);'), true);
  assert.equal(workspaceSource.includes('reviseActiveWorkspaceTabLedger("select");'), true);
  assert.equal(workspaceSource.includes("const panelAlreadyOpenLedger"), true);
  assert.equal(workspaceSource.includes('panelAlreadyOpenLedger ? "select" : tabIdLedger'), true);
  assert.equal(workspaceSource.includes("reviseControlsExpandedLedger(false);"), true);
  assert.equal(workspaceSource.includes('if (activeWorkspaceTabLedger === "select") return null;'), true);
  assert.equal(workspaceSource.includes('activeWorkspaceTabLedger === "component-adder"'), true);
  assert.equal(workspaceSource.includes('activeWorkspaceTabLedger === "ai-generate"'), true);
  assert.equal(workspaceSource.includes('label: "Room Stats"'), false);
  assert.equal(workspaceSource.includes('label: "Select"'), false);
  assert.equal(workspaceSource.includes("Generate New Layout"), true);
  assert.equal(workspaceSource.includes("Apply to Current Layout"), true);
  assert.equal(workspaceSource.includes("Layout Check"), true);
  assert.equal(workspaceSource.includes("Save draft"), true);
  assert.equal(workspaceSource.includes('activeRoomSetModeLedger === "seating"'), true);
  assert.equal(workspaceSource.includes("const ROOM_SET_SEATING_PANELS = ["), true);
  assert.equal(workspaceSource.includes("activeSeatingPanelLedger"), true);
  assert.equal(workspaceSource.includes("ROOM_SET_SEATING_PANELS.find"), true);
});
