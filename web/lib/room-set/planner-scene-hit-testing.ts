import type { PlannerSceneObject } from "./planner-scene";

export type PlannerSceneHitPoint = Readonly<{
  xLu: number;
  yLu: number;
}>;

export type PlannerSceneHitTestOptions = Readonly<{
  paddingLu?: number;
  skipObject?: (object: PlannerSceneObject) => boolean;
}>;

export type PlannerSceneHitTarget = Readonly<{
  object: PlannerSceneObject;
  index: number;
}>;

const DEFAULT_HIT_PADDING_LU = 0.35;
const MAX_HIT_PADDING_LU = 0.75;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeRotationDeg(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return ((value % 360) + 360) % 360;
}

function hitPaddingForObject(object: PlannerSceneObject, requestedPaddingLu?: number): number {
  if (requestedPaddingLu != null) {
    return clamp(requestedPaddingLu, 0, MAX_HIT_PADDING_LU);
  }
  const minDimension = Math.min(object.transform.widthLu, object.transform.depthLu);
  return clamp(Math.min(DEFAULT_HIT_PADDING_LU, minDimension * 0.12), 0, MAX_HIT_PADDING_LU);
}

function pointInRotatedObjectRect(
  object: PlannerSceneObject,
  point: PlannerSceneHitPoint,
  paddingLu: number,
): boolean {
  const { xLu, yLu, widthLu, depthLu, rotationDeg } = object.transform;
  if (!(widthLu > 0 && depthLu > 0)) return false;

  const centerX = xLu + widthLu / 2;
  const centerY = yLu + depthLu / 2;
  const angleRad = (-normalizeRotationDeg(rotationDeg) * Math.PI) / 180;
  const dx = point.xLu - centerX;
  const dy = point.yLu - centerY;
  const localX = dx * Math.cos(angleRad) - dy * Math.sin(angleRad) + widthLu / 2;
  const localY = dx * Math.sin(angleRad) + dy * Math.cos(angleRad) + depthLu / 2;

  return (
    localX >= -paddingLu &&
    localY >= -paddingLu &&
    localX <= widthLu + paddingLu &&
    localY <= depthLu + paddingLu
  );
}

export function plannerSceneObjectContainsHitPoint(
  object: PlannerSceneObject,
  point: PlannerSceneHitPoint,
  options: PlannerSceneHitTestOptions = {},
): boolean {
  if (options.skipObject?.(object)) return false;
  return pointInRotatedObjectRect(object, point, hitPaddingForObject(object, options.paddingLu));
}

export function resolvePlannerSceneHitTarget(
  objects: readonly PlannerSceneObject[],
  point: PlannerSceneHitPoint,
  options: PlannerSceneHitTestOptions = {},
): PlannerSceneHitTarget | null {
  for (let index = objects.length - 1; index >= 0; index -= 1) {
    const object = objects[index]!;
    if (plannerSceneObjectContainsHitPoint(object, point, options)) {
      return { object, index };
    }
  }
  return null;
}

export function plannerScenePointerExceededDragThreshold(
  start: Readonly<{ clientX: number; clientY: number }>,
  current: Readonly<{ clientX: number; clientY: number }>,
  thresholdPx = 4,
): boolean {
  return Math.hypot(current.clientX - start.clientX, current.clientY - start.clientY) >= thresholdPx;
}
