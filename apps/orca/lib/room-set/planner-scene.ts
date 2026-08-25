import type {
  RoomSetCanvasLayoutSnapshot,
  RoomSetLayoutPlacement,
} from "@/lib/room-set/planner-layout-schema";
import type { LayoutUnit, RoomSetObjectType } from "@/lib/room-set/spatial-types";
import {
  getRoomSetComponent,
  type RoomSetComponentId,
} from "@/lib/room-set/component-library";

export type PlannerSceneObjectSourceKind = "generated" | "manual" | "imported";

export type PlannerSceneObjectType = RoomSetObjectType;

export type PlannerSceneTransform = Readonly<{
  /** Top-left X within the scene shell, in layout units. */
  xLu: LayoutUnit;
  /** Top-left Y within the scene shell, in layout units. */
  yLu: LayoutUnit;
  widthLu: LayoutUnit;
  depthLu: LayoutUnit;
  rotationDeg: LayoutUnit;
}>;

export type PlannerSceneBounds = Readonly<{
  xLu: LayoutUnit;
  yLu: LayoutUnit;
  widthLu: LayoutUnit;
  depthLu: LayoutUnit;
}>;

export type PlannerSceneObjectSource = Readonly<{
  kind: PlannerSceneObjectSourceKind;
  detail?: string | null;
}>;

export type PlannerSceneObjectCapacity = Readonly<{
  seated: number;
  staff: number;
}>;

export type PlannerSceneObject = Readonly<{
  id: string;
  componentId: RoomSetComponentId;
  objectType: PlannerSceneObjectType;
  /** Canonical catalog name. */
  name: string;
  /** Optional authored label shown to the planner. */
  label: string | null;
  capacity: PlannerSceneObjectCapacity;
  source: PlannerSceneObjectSource;
  transform: PlannerSceneTransform;
  metadata: Readonly<{
    componentCategory: string;
    visualVariant: string;
    neutralNote: string;
    seatingTableId?: string | null;
    seatingPlanId?: string | null;
  } & Record<string, unknown>>;
}>;

export type PlannerSceneRoomShell = Readonly<{
  widthLu: LayoutUnit;
  depthLu: LayoutUnit;
  bounds: PlannerSceneBounds;
}>;

export type PlannerScene = Readonly<{
  roomShell: PlannerSceneRoomShell;
  objects: readonly PlannerSceneObject[];
}>;

export type PlannerSceneFromPlacementsOptions = Readonly<{
  roomOriginXLu?: LayoutUnit;
  roomOriginYLu?: LayoutUnit;
  sourceKind?: PlannerSceneObjectSourceKind;
  sourceDetail?: string | null;
  objectIdPrefix?: string;
}>;

const DEFAULT_PLANNER_SCENE_OBJECT_PREFIX = "planner-scene-object";

function plannerSceneObjectId(index: number, prefix = DEFAULT_PLANNER_SCENE_OBJECT_PREFIX): string {
  return `${prefix}-${index + 1}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function warnPlannerSceneCoordinateRepair(
  message: string,
  detail: Readonly<Record<string, unknown>>,
): void {
  if (process.env.NODE_ENV === "production") return;
  console.warn("[room-set/planner-scene] " + message, detail);
}

export function repairPlannerSceneCoordinates(
  input: Readonly<{
    componentId: RoomSetComponentId;
    xLu: number;
    yLu: number;
    widthLu: number;
    depthLu: number;
    roomWidthLu: number;
    roomDepthLu: number;
    context: string;
  }>,
): Readonly<{ xLu: number; yLu: number }> | null {
  if (!Number.isFinite(input.xLu) || !Number.isFinite(input.yLu)) {
    warnPlannerSceneCoordinateRepair("Skipped object with invalid coordinates.", input);
    return null;
  }
  if (!(input.widthLu > 0 && input.depthLu > 0 && input.roomWidthLu > 0 && input.roomDepthLu > 0)) {
    warnPlannerSceneCoordinateRepair("Skipped object with invalid footprint or room shell.", input);
    return null;
  }

  const maxXLu = Math.max(0, input.roomWidthLu - input.widthLu);
  const maxYLu = Math.max(0, input.roomDepthLu - input.depthLu);
  const xLu = clamp(input.xLu, 0, maxXLu);
  const yLu = clamp(input.yLu, 0, maxYLu);
  if (Math.abs(xLu - input.xLu) > 0.0001 || Math.abs(yLu - input.yLu) > 0.0001) {
    warnPlannerSceneCoordinateRepair("Repaired out-of-bounds object coordinates.", {
      ...input,
      repairedXLu: xLu,
      repairedYLu: yLu,
    });
  }
  return { xLu, yLu };
}

function repairLayoutPlacementForScene(
  placement: RoomSetLayoutPlacement,
  index: number,
  roomShell: Readonly<{ widthLu: LayoutUnit; depthLu: LayoutUnit }>,
): RoomSetLayoutPlacement | null {
  const component = getRoomSetComponent(placement.componentId);
  const widthLu = component?.widthLu ?? 0;
  const depthLu = component?.depthLu ?? 0;
  const repaired = repairPlannerSceneCoordinates({
    componentId: placement.componentId,
    xLu: placement.xLu,
    yLu: placement.yLu,
    widthLu,
    depthLu,
    roomWidthLu: roomShell.widthLu,
    roomDepthLu: roomShell.depthLu,
    context: `layout-placement-${index + 1}`,
  });
  return repaired ? { ...placement, xLu: repaired.xLu, yLu: repaired.yLu } : null;
}

function resolvePlannerSceneObject(
  placement: RoomSetLayoutPlacement,
  index: number,
  options?: PlannerSceneFromPlacementsOptions,
): PlannerSceneObject {
  const component = getRoomSetComponent(placement.componentId);
  const sourceKind = options?.sourceKind ?? "generated";
  const sourceDetail = options?.sourceDetail ?? null;
  const objectIdPrefix = options?.objectIdPrefix ?? DEFAULT_PLANNER_SCENE_OBJECT_PREFIX;

  return {
    id: plannerSceneObjectId(index, objectIdPrefix),
    componentId: placement.componentId,
    objectType: component?.domainKind ?? "aisle_zone",
    name: component?.label ?? placement.componentId,
    label: placement.label?.trim() ? placement.label.trim() : null,
    capacity: {
      seated: component?.capacitySeated ?? 0,
      staff: component?.capacityStaff ?? 0,
    },
    source: {
      kind: sourceKind,
      ...(sourceDetail != null ? { detail: sourceDetail } : {}),
    },
    transform: {
      xLu: placement.xLu,
      yLu: placement.yLu,
      widthLu: component?.widthLu ?? 0,
      depthLu: component?.depthLu ?? 0,
      rotationDeg: placement.rotationDeg,
    },
    metadata: {
      componentCategory: component?.category ?? "uncategorized",
      visualVariant: component?.visualVariant ?? "rect",
      neutralNote: component?.neutralNote ?? "",
    },
  };
}

export function plannerSceneFromLayoutPlacements(
  placements: readonly RoomSetLayoutPlacement[],
  roomShell: Readonly<{
    widthLu: LayoutUnit;
    depthLu: LayoutUnit;
    xLu?: LayoutUnit;
    yLu?: LayoutUnit;
  }>,
  options?: PlannerSceneFromPlacementsOptions,
): PlannerScene {
  const originX = roomShell.xLu ?? options?.roomOriginXLu ?? 0;
  const originY = roomShell.yLu ?? options?.roomOriginYLu ?? 0;
  const repairedPlacements = placements.flatMap((placement, index) => {
    const repaired = repairLayoutPlacementForScene(placement, index, roomShell);
    return repaired ? [repaired] : [];
  });
  return {
    roomShell: {
      widthLu: roomShell.widthLu,
      depthLu: roomShell.depthLu,
      bounds: {
        xLu: originX,
        yLu: originY,
        widthLu: roomShell.widthLu,
        depthLu: roomShell.depthLu,
      },
    },
    objects: repairedPlacements.map((placement, index) =>
      resolvePlannerSceneObject(placement, index, options),
    ),
  };
}

export function plannerSceneFromGeneratedLayoutPlacements(
  placements: readonly RoomSetLayoutPlacement[],
  roomShell: Readonly<{ widthLu: LayoutUnit; depthLu: LayoutUnit }>,
): PlannerScene {
  return plannerSceneFromLayoutPlacements(
    placements,
    roomShell,
    {
      sourceKind: "generated",
      sourceDetail: "ai-layout",
    },
  );
}

export function plannerSceneFromCanvasLayoutSnapshot(
  snapshot: RoomSetCanvasLayoutSnapshot,
  options?: PlannerSceneFromPlacementsOptions,
): PlannerScene {
  return plannerSceneFromLayoutPlacements(
    snapshot.placements,
    {
      widthLu: snapshot.roomWidthLu,
      depthLu: snapshot.roomDepthLu,
      xLu: options?.roomOriginXLu,
      yLu: options?.roomOriginYLu,
    },
    options,
  );
}

export function plannerSceneToLayoutPlacements(
  scene: PlannerScene,
): RoomSetLayoutPlacement[] {
  return scene.objects.map((object) => ({
    componentId: object.componentId,
    xLu: object.transform.xLu,
    yLu: object.transform.yLu,
    rotationDeg: object.transform.rotationDeg,
    ...(object.label?.trim() ? { label: object.label.trim() } : {}),
  }));
}

export function plannerSceneToCanvasLayoutSnapshot(
  scene: PlannerScene,
): RoomSetCanvasLayoutSnapshot {
  return {
    roomWidthLu: scene.roomShell.widthLu,
    roomDepthLu: scene.roomShell.depthLu,
    placements: plannerSceneToLayoutPlacements(scene),
  };
}
