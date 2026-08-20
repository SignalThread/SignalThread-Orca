export type PlannerSeatSurfaceShape = "round" | "rectangle";

export type PlannerSeatPosition = Readonly<{
  index: number;
  xPct: number;
  yPct: number;
  angleDeg: number;
}>;

export type PlannerChairSeatPosition = PlannerSeatPosition &
  Readonly<{
    row: number;
    column: number;
  }>;

function normalizeSeatCapacity(capacity: number): number {
  if (!Number.isFinite(capacity)) return 0;
  return Math.max(0, Math.round(capacity));
}

function spreadPercent(count: number, startPct: number, endPct: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [(startPct + endPct) / 2];

  const step = (endPct - startPct) / (count - 1);
  return Array.from({ length: count }, (_, index) => startPct + step * index);
}

export function plannerSeatPositionsForTable(args: Readonly<{
  capacity: number;
  shape: PlannerSeatSurfaceShape;
  widthLu?: number;
  depthLu?: number;
}>): PlannerSeatPosition[] {
  const capacity = normalizeSeatCapacity(args.capacity);
  if (capacity <= 0) return [];

  if (args.shape === "round") {
    const radiusPct = capacity <= 6 ? 41 : capacity <= 8 ? 42 : 43;
    return Array.from({ length: capacity }, (_, index) => {
      const theta = (index / capacity) * Math.PI * 2 - Math.PI / 2;
      return {
        index,
        xPct: 50 + Math.cos(theta) * radiusPct,
        yPct: 50 + Math.sin(theta) * radiusPct,
        angleDeg: (theta * 180) / Math.PI + 90,
      };
    });
  }

  const widthLu = Math.max(0.001, args.widthLu ?? 1);
  const depthLu = Math.max(0.001, args.depthLu ?? 1);
  const isLongTable = widthLu / depthLu >= 2.2;
  const includeEnds = !isLongTable && capacity >= 10;
  const endSeatCount = includeEnds ? 2 : 0;
  const longSideSeats = capacity - endSeatCount;
  const topCount = Math.ceil(longSideSeats / 2);
  const bottomCount = longSideSeats - topCount;
  const topX = spreadPercent(topCount, 18, 82);
  const bottomX = spreadPercent(bottomCount, 18, 82);
  const positions: PlannerSeatPosition[] = [];

  topX.forEach((xPct) => {
    positions.push({ index: positions.length, xPct, yPct: 5, angleDeg: 0 });
  });
  bottomX.forEach((xPct) => {
    positions.push({ index: positions.length, xPct, yPct: 95, angleDeg: 180 });
  });

  if (endSeatCount > 0) {
    positions.push({ index: positions.length, xPct: 5, yPct: 50, angleDeg: -90 });
    positions.push({ index: positions.length, xPct: 95, yPct: 50, angleDeg: 90 });
  }

  return positions;
}

export function plannerSeatPositionsForChairBlock(args: Readonly<{
  capacity: number;
  rows?: number;
  chairsPerRow?: number;
  widthLu?: number;
  depthLu?: number;
  chairSpacingLu?: number;
  rowSpacingLu?: number;
  splitAisle?: boolean;
}>): PlannerChairSeatPosition[] {
  const capacity = normalizeSeatCapacity(args.capacity);
  if (capacity <= 0) return [];

  const requestedRows = Number.isFinite(args.rows ?? NaN)
    ? Math.max(1, Math.round(args.rows ?? 1))
    : null;
  const requestedColumns = Number.isFinite(args.chairsPerRow ?? NaN)
    ? Math.max(1, Math.round(args.chairsPerRow ?? 1))
    : null;
  const rows = Math.min(capacity, requestedRows ?? (requestedColumns ? Math.ceil(capacity / requestedColumns) : 1));
  const chairsPerRow = Math.max(1, requestedColumns ?? Math.ceil(capacity / rows));
  const yPositions = spreadPercent(rows, rows === 1 ? 50 : 18, rows === 1 ? 50 : 82);
  const positions: PlannerChairSeatPosition[] = [];

  for (let row = 0; row < rows && positions.length < capacity; row += 1) {
    const remaining = capacity - positions.length;
    const columnsInRow = Math.min(chairsPerRow, remaining);
    const split =
      Boolean(args.splitAisle) &&
      columnsInRow >= 4 &&
      (args.widthLu ?? 0) >= Math.max(20, columnsInRow * (args.chairSpacingLu ?? 2.4));
    const xPositions = split
      ? [
          ...spreadPercent(Math.ceil(columnsInRow / 2), 8, 45),
          ...spreadPercent(Math.floor(columnsInRow / 2), 55, 92),
        ]
      : spreadPercent(columnsInRow, columnsInRow === 1 ? 50 : 8, columnsInRow === 1 ? 50 : 92);

    for (let column = 0; column < columnsInRow && positions.length < capacity; column += 1) {
      positions.push({
        index: positions.length,
        row,
        column,
        xPct: xPositions[column] ?? 50,
        yPct: yPositions[row] ?? 50,
        angleDeg: 0,
      });
    }
  }

  return positions;
}
