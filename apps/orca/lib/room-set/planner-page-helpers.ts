import { getRoomSetComponent, type RoomSetComponentDefinition } from "./component-library";
import type { RoomSetLayoutBoundary } from "./spatial-types";

export const PLANNER_PAGE_SCALE = 8;
export const PLANNER_ROOM_SHELL_SHAPE_TYPE = "planner-room-shell" as const;
export const DEFAULT_PLANNER_ROOM_PAGE_ANCHOR = { x: 120, y: 96 } as const;

export type PlannerShapeId = string;

type PlannerPageShape = {
  id: PlannerShapeId;
  type: string;
  x: number;
  y: number;
  rotation?: number;
  props?: Record<string, unknown>;
  [key: string]: unknown;
};

export type PlannerPageEditorLike = {
  createShape(shape: Record<string, unknown>): void;
  getCurrentPageShapes(): PlannerPageShape[];
  getShape(id: PlannerShapeId): PlannerPageShape | undefined;
  zoomToBounds?(bounds: Readonly<{ x: number; y: number; w: number; h: number }>, options?: unknown): void;
  zoomToFit?(options?: unknown): void;
  [key: string]: unknown;
};

export function boundaryToPlannerShellPageSize(boundary: RoomSetLayoutBoundary): {
  w: number;
  h: number;
} {
  return {
    w: boundary.widthLu * PLANNER_PAGE_SCALE,
    h: boundary.depthLu * PLANNER_PAGE_SCALE,
  };
}

function nextPlannerShapeId(): PlannerShapeId {
  return `shape:planner-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function joinSmartNotes(lines: readonly string[]): string {
  return lines.map((line) => line.trim()).filter(Boolean).join("\n");
}

function plannerSpatialPropsForComponent(component: RoomSetComponentDefinition): Record<string, unknown> {
  return {
    w: component.widthLu * PLANNER_PAGE_SCALE,
    h: component.depthLu * PLANNER_PAGE_SCALE,
    label: component.label,
    domainKind: component.domainKind,
    componentId: component.id,
    componentCategory: component.category,
    componentCode: component.iconKey,
    visualVariant: component.visualVariant,
    capacitySeated: component.capacitySeated,
    capacityStaff: component.capacityStaff,
    neutralNote: component.neutralNote,
    clearanceServiceLu: component.spacingServiceLu,
    clearanceEgressLu: component.spacingAisleLu,
    spacingServiceLu: component.spacingServiceLu,
    spacingAisleLu: component.spacingAisleLu,
    smartClearanceNotes: joinSmartNotes(component.smart.clearanceRequirements),
    smartCapacityLogic: component.smart.capacityLogic,
    smartStaffingImpact: component.smart.staffingImpact,
    smartSetupComplexity: component.smart.setupComplexity,
    smartSetupEffort: component.smart.setupEffort,
    smartStrikeEffort: component.smart.strikeEffort,
    smartDependencies: joinSmartNotes(component.smart.operationalDependencies),
    smartServiceAccess: joinSmartNotes(component.smart.serviceAccessRequirements),
    smartAdaEgress: joinSmartNotes(component.smart.adaEgressImplications),
    smartAvSightline: joinSmartNotes(component.smart.avSightlineImplications),
    smartFnbService: joinSmartNotes(component.smart.fnbQueueServiceImplications),
    smartWarnings: joinSmartNotes(component.smart.operationalWarnings),
    spatialValidationRev: 3,
  };
}

export function insertPlannerComponentAtPage(
  editor: PlannerPageEditorLike,
  componentId: string,
  pageX: number,
  pageY: number,
  options?: Readonly<{ rotationDeg?: number; label?: string; neutralNote?: string }>,
): PlannerShapeId | null {
  const component = getRoomSetComponent(componentId);
  if (!component) return null;
  const props = plannerSpatialPropsForComponent(component);
  const labelPeek = options?.label?.trim();
  props.label = labelPeek?.length ? labelPeek : component.label;
  const neutralNotePeek = options?.neutralNote?.trim();
  if (neutralNotePeek?.length) props.neutralNote = neutralNotePeek;
  const id = nextPlannerShapeId();
  editor.createShape({
    id,
    type: component.shapeType,
    x: pageX,
    y: pageY,
    rotation: ((options?.rotationDeg ?? component.defaultRotationDeg ?? 0) * Math.PI) / 180,
    props,
  });
  return id;
}

export function getPlannerRoomShellPageBounds(
  editor: PlannerPageEditorLike,
): { x: number; y: number; w: number; h: number } | null {
  const shell = editor
    .getCurrentPageShapes()
    .find((shape) => shape.type === PLANNER_ROOM_SHELL_SHAPE_TYPE);
  if (!shell?.props) return null;
  const w = Number(shell.props.w);
  const h = Number(shell.props.h);
  if (!(w > 0) || !(h > 0)) return null;
  return { x: shell.x, y: shell.y, w, h };
}

export function plannerRoomShellCameraBounds(
  bounds: Readonly<{ x: number; y: number; w: number; h: number }>,
): { x: number; y: number; w: number; h: number } {
  const pad = Math.max(
    PLANNER_PAGE_SCALE * 2,
    Math.min(PLANNER_PAGE_SCALE * 6, Math.min(bounds.w, bounds.h) * 0.08),
  );
  return {
    x: bounds.x - pad,
    y: bounds.y - pad,
    w: Math.max(PLANNER_PAGE_SCALE * 12, bounds.w + pad * 2),
    h: Math.max(PLANNER_PAGE_SCALE * 12, bounds.h + pad * 2),
  };
}

export function zoomEditorToPlannerRoomShell(editor: PlannerPageEditorLike): void {
  const bounds = getPlannerRoomShellPageBounds(editor);
  if (bounds && typeof editor.zoomToBounds === "function") {
    editor.zoomToBounds(plannerRoomShellCameraBounds(bounds), { animation: { duration: 240 } });
    return;
  }
  if (typeof editor.zoomToFit === "function") {
    editor.zoomToFit({ animation: { duration: 240 } });
  }
}
