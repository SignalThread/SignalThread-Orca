export const LAYOUT_UNIT_FEET = 1;
export const PLANNER_SCENE_LU_TO_PX = 12;

export type PlannerLuRect = Readonly<{
  xLu: number;
  yLu: number;
  widthLu: number;
  depthLu: number;
}>;

export type PlannerPxRect = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

function formatNumber(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function layoutLuToFeet(valueLu: number): number {
  return valueLu * LAYOUT_UNIT_FEET;
}

export function formatFeet(valueLu: number): string {
  return `${formatNumber(layoutLuToFeet(valueLu))} ft`;
}

export function formatFeetDimensions(widthLu: number, depthLu: number): string {
  return `${formatFeet(widthLu)} × ${formatFeet(depthLu)}`;
}

export function formatRoomShellDimensions(widthLu: number, depthLu: number): string {
  return formatFeetDimensions(widthLu, depthLu);
}

export function formatComponentFootprintDimensions(
  component: Readonly<{
    id?: string;
    label?: string;
    widthLu: number;
    depthLu: number;
    visualVariant?: string;
  }>,
): string {
  const roundDiameter =
    component.id?.match(/table-round-(\d+)/i)?.[1] ??
    component.label?.match(/(\d+)\s*in\b/i)?.[1] ??
    null;
  if (roundDiameter && component.visualVariant === "round") {
    return `${roundDiameter} in round`;
  }

  if (
    component.visualVariant === "zone" &&
    Math.max(component.widthLu, component.depthLu) >= Math.min(component.widthLu, component.depthLu) * 2.5
  ) {
    return `${formatFeet(Math.min(component.widthLu, component.depthLu))} wide`;
  }

  return formatFeetDimensions(component.widthLu, component.depthLu);
}

export function layoutLuToPx(valueLu: number): number {
  return valueLu * PLANNER_SCENE_LU_TO_PX;
}

export function layoutPxToLu(valuePx: number): number {
  return valuePx / PLANNER_SCENE_LU_TO_PX;
}

export function plannerLuRectToPxRect(rect: PlannerLuRect): PlannerPxRect {
  return {
    x: layoutLuToPx(rect.xLu),
    y: layoutLuToPx(rect.yLu),
    width: layoutLuToPx(rect.widthLu),
    height: layoutLuToPx(rect.depthLu),
  };
}
