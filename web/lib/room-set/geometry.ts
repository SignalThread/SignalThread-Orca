import type { LayoutUnit } from "./spatial-types";

export type Vec2 = { x: LayoutUnit; y: LayoutUnit };

const DEG_TO_RAD = Math.PI / 180;

export function rotatedCorners(cx: LayoutUnit, cy: LayoutUnit, widthLu: LayoutUnit, heightLu: LayoutUnit, rotationDeg: LayoutUnit): Vec2[] {
  const rad = rotationDeg * DEG_TO_RAD;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const hw = widthLu / 2;
  const hh = heightLu / 2;

  const local: Vec2[] = [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ];

  return local.map((corner) => ({
    x: cx + corner.x * cos - corner.y * sin,
    y: cy + corner.x * sin + corner.y * cos,
  }));
}

export function axisAlignedBounds(corners: Vec2[]): { minX: number; maxX: number; minY: number; maxY: number } {
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

/** True if two axis-aligned boxes intersect with positive area (edges touching counts as overlap). */
export function aabbOverlaps(
  a: { minX: number; maxX: number; minY: number; maxY: number },
  b: { minX: number; maxX: number; minY: number; maxY: number },
): boolean {
  return !(a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY);
}

export function constrainTransformToBoundary(
  cx: LayoutUnit,
  cy: LayoutUnit,
  widthLu: LayoutUnit,
  heightLu: LayoutUnit,
  rotationDeg: LayoutUnit,
  roomWidth: LayoutUnit,
  roomDepth: LayoutUnit,
): { cx: LayoutUnit; cy: LayoutUnit } {
  let nextCx = cx;
  let nextCy = cy;

  for (let pass = 0; pass < 6; pass += 1) {
    const bounds = axisAlignedBounds(rotatedCorners(nextCx, nextCy, widthLu, heightLu, rotationDeg));

    let deltaX = 0;
    let deltaY = 0;

    if (bounds.minX < 0) deltaX += -bounds.minX;
    if (bounds.maxX > roomWidth) deltaX -= bounds.maxX - roomWidth;

    if (bounds.minY < 0) deltaY += -bounds.minY;
    if (bounds.maxY > roomDepth) deltaY -= bounds.maxY - roomDepth;

    if (Math.abs(deltaX) < 1e-6 && Math.abs(deltaY) < 1e-6) {
      break;
    }

    nextCx += deltaX;
    nextCy += deltaY;
  }

  return { cx: nextCx, cy: nextCy };
}

export function snapToGrid(value: LayoutUnit, gridLu: LayoutUnit): LayoutUnit {
  if (gridLu <= 0) return value;

  return Math.round(value / gridLu) * gridLu;
}

export type GuideSegment = {
  axis: "x" | "y";
  /** fixed coordinate along secondary axis spanning room */
  value: LayoutUnit;
  start: LayoutUnit;
  end: LayoutUnit;
};

type AxisBBox = {
  minX: number;
  maxX: number;
  midX: number;
  minY: number;
  maxY: number;
  midY: number;
};

function axisMetrics(corners: Vec2[]): AxisBBox {
  const { minX, maxX, minY, maxY } = axisAlignedBounds(corners);
  return { minX, maxX, midX: (minX + maxX) / 2, minY, maxY, midY: (minY + maxY) / 2 };
}

/**
 * Applies grid snap plus weak magnetic snapping between axis-aligned footprints.
 * Translating the center shifts the object's AABB uniformly (correct for rotated rectangles around center).
 */
export function alignmentSnap(params: {
  cx: LayoutUnit;
  cy: LayoutUnit;
  widthLu: LayoutUnit;
  heightLu: LayoutUnit;
  rotationDeg: LayoutUnit;
  roomWidthLu: LayoutUnit;
  roomDepthLu: LayoutUnit;
  gridLu: LayoutUnit;
  skipId: string | null;
  peers: Array<{
    id: string;
    cx: LayoutUnit;
    cy: LayoutUnit;
    widthLu: LayoutUnit;
    heightLu: LayoutUnit;
    rotationDeg: LayoutUnit;
  }>;
  thresholdLu: LayoutUnit;
}): { cx: LayoutUnit; cy: LayoutUnit; guides: GuideSegment[] } {
  let snapX = snapToGrid(params.cx, params.gridLu);
  let snapY = snapToGrid(params.cy, params.gridLu);

  const guides: GuideSegment[] = [];

  const movingBBox = (): AxisBBox => axisMetrics(rotatedCorners(snapX, snapY, params.widthLu, params.heightLu, params.rotationDeg));

  const collectX = (moving: AxisBBox, target: AxisBBox): Array<{ delta: LayoutUnit; line: LayoutUnit }> => [
    { delta: target.minX - moving.minX, line: target.minX },
    { delta: target.maxX - moving.maxX, line: target.maxX },
    { delta: target.midX - moving.midX, line: target.midX },
  ];

  const collectY = (moving: AxisBBox, target: AxisBBox): Array<{ delta: LayoutUnit; line: LayoutUnit }> => [
    { delta: target.minY - moving.minY, line: target.minY },
    { delta: target.maxY - moving.maxY, line: target.maxY },
    { delta: target.midY - moving.midY, line: target.midY },
  ];

  type SnapAxisResult = {
    delta: LayoutUnit;
    line: LayoutUnit | null;
  };

  const pickAxisSnap = (axis: "x" | "y", movingSlice: AxisBBox): SnapAxisResult => {
    let bestDelta = 0;
    let bestScore = Infinity;
    let bestLine: LayoutUnit | null = null;

    const anchors: AxisBBox[] = [
      axisMetrics([
        { x: 0, y: 0 },
        { x: params.roomWidthLu, y: 0 },
        { x: params.roomWidthLu, y: params.roomDepthLu },
        { x: 0, y: params.roomDepthLu },
      ]),
    ];

    for (const peer of params.peers) {
      if (params.skipId !== null && peer.id === params.skipId) continue;

      anchors.push(
        axisMetrics(rotatedCorners(peer.cx, peer.cy, peer.widthLu, peer.heightLu, peer.rotationDeg)),
      );
    }

    for (const target of anchors) {
      const candidates = axis === "x" ? collectX(movingSlice, target) : collectY(movingSlice, target);
      for (const candidate of candidates) {
        const score = Math.abs(candidate.delta);

        if (score <= params.thresholdLu + 1e-6 && score < bestScore - 1e-6 && score >= 1e-6) {
          bestDelta = candidate.delta;
          bestScore = score;
          bestLine = candidate.line;
        }
      }
    }

    if (bestScore === Infinity) {
      return { delta: 0, line: null };
    }

    return { delta: bestDelta, line: bestLine };
  };

  const movingAfterGrid = movingBBox();
  const xSnap = pickAxisSnap("x", movingAfterGrid);
  snapX += xSnap.delta;
  const ySnap = pickAxisSnap("y", movingBBox());
  snapY += ySnap.delta;

  if (xSnap.line !== null) {
    guides.push({ axis: "x", value: xSnap.line, start: 0, end: params.roomDepthLu });
  }

  if (ySnap.line !== null) {
    guides.push({ axis: "y", value: ySnap.line, start: 0, end: params.roomWidthLu });
  }

  return {
    cx: snapX,
    cy: snapY,
    guides,
  };
}