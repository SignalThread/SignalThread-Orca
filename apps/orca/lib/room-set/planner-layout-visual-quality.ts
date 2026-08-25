import { getRoomSetComponent, type RoomSetComponentId } from "@/lib/room-set/component-library";

import type { RoomSetLayoutPlacement } from "./planner-layout-schema";

export const BANQUET_TABLE_COMPONENT_IDS = new Set<RoomSetComponentId>([
  "table-round-60",
  "table-round-72",
  "table-banquet-6ft",
]);

export type TableFieldFootprint = Readonly<{
  xLu: number;
  yLu: number;
  widthLu: number;
  depthLu: number;
  areaLu: number;
}>;

export type BanquetTableVisualQualityMetrics = Readonly<{
  tableCount: number;
  isolatedTableCount: number;
  nearestNeighborVariance: number;
  tableFieldFootprint: TableFieldFootprint | null;
  fieldDensityRatio: number;
  deadZoneRatio: number;
  rowCoherenceScore: number;
  diagonalCoherenceScore: number;
  leftRightBalanceScore: number;
  frontBackContinuityScore: number;
  stageSideUtilizationScore: number;
  frontBandCoverageScore: number;
}>;

type TableSample = Readonly<{
  placement: RoomSetLayoutPlacement;
  widthLu: number;
  depthLu: number;
  centerX: number;
  centerY: number;
}>;

type TableRow = Readonly<{
  centerY: number;
  tables: readonly TableSample[];
}>;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function variance(values: readonly number[]): number {
  if (values.length <= 1) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
}

function standardDeviation(values: readonly number[]): number {
  return Math.sqrt(variance(values));
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle]!;
  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function tableSamples(placements: readonly RoomSetLayoutPlacement[]): TableSample[] {
  return placements.flatMap((placement) => {
    if (!BANQUET_TABLE_COMPONENT_IDS.has(placement.componentId)) return [];
    const component = getRoomSetComponent(placement.componentId);
    if (!component) return [];
    return [
      {
        placement,
        widthLu: component.widthLu,
        depthLu: component.depthLu,
        centerX: placement.xLu + component.widthLu / 2,
        centerY: placement.yLu + component.depthLu / 2,
      },
    ];
  });
}

function distance(left: TableSample, right: TableSample): number {
  return Math.hypot(left.centerX - right.centerX, left.centerY - right.centerY);
}

function nearestNeighborDistances(tables: readonly TableSample[]): number[] {
  return tables.map((table, index) => {
    let nearest = Number.POSITIVE_INFINITY;
    for (let otherIndex = 0; otherIndex < tables.length; otherIndex += 1) {
      if (index === otherIndex) continue;
      nearest = Math.min(nearest, distance(table, tables[otherIndex]!));
    }
    return Number.isFinite(nearest) ? nearest : 0;
  });
}

function tableFootprint(tables: readonly TableSample[]): TableFieldFootprint | null {
  if (tables.length === 0) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const table of tables) {
    minX = Math.min(minX, table.placement.xLu);
    minY = Math.min(minY, table.placement.yLu);
    maxX = Math.max(maxX, table.placement.xLu + table.widthLu);
    maxY = Math.max(maxY, table.placement.yLu + table.depthLu);
  }
  const widthLu = Math.max(0, maxX - minX);
  const depthLu = Math.max(0, maxY - minY);
  return {
    xLu: minX,
    yLu: minY,
    widthLu,
    depthLu,
    areaLu: widthLu * depthLu,
  };
}

function totalTableArea(tables: readonly TableSample[]): number {
  return tables.reduce((sum, table) => sum + table.widthLu * table.depthLu, 0);
}

function isolateThreshold(tables: readonly TableSample[]): number {
  const maxFootprint = Math.max(0, ...tables.map((table) => Math.max(table.widthLu, table.depthLu)));
  return Math.max(maxFootprint * 2.65, 14);
}

function occupiedGridRatio(
  tables: readonly TableSample[],
  footprint: TableFieldFootprint | null,
  columns: number,
  rows: number,
): number {
  if (!footprint || footprint.widthLu <= 0 || footprint.depthLu <= 0 || tables.length === 0) return 0;
  const occupied = new Set<number>();
  for (const table of tables) {
    const col = Math.max(
      0,
      Math.min(columns - 1, Math.floor(((table.centerX - footprint.xLu) / footprint.widthLu) * columns)),
    );
    const row = Math.max(
      0,
      Math.min(rows - 1, Math.floor(((table.centerY - footprint.yLu) / footprint.depthLu) * rows)),
    );
    occupied.add(row * columns + col);
  }
  return occupied.size / Math.max(1, columns * rows);
}

function clusterRows(tables: readonly TableSample[]): TableRow[] {
  if (tables.length === 0) return [];
  const maxDepth = Math.max(...tables.map((table) => table.depthLu));
  const tolerance = Math.max(1.2, maxDepth * 0.42);
  const rows: TableSample[][] = [];
  for (const table of [...tables].sort((left, right) => left.centerY - right.centerY || left.centerX - right.centerX)) {
    const current = rows[rows.length - 1];
    if (!current) {
      rows.push([table]);
      continue;
    }
    const currentCenter = current.reduce((sum, entry) => sum + entry.centerY, 0) / current.length;
    if (Math.abs(table.centerY - currentCenter) <= tolerance) {
      current.push(table);
    } else {
      rows.push([table]);
    }
  }
  return rows.map((row) => ({
    centerY: row.reduce((sum, table) => sum + table.centerY, 0) / row.length,
    tables: row.sort((left, right) => left.centerX - right.centerX),
  }));
}

function rowSpacingRegularityScore(rows: readonly TableRow[]): number {
  const rowScores = rows.flatMap((row) => {
    if (row.tables.length < 3) return [];
    const gaps: number[] = [];
    for (let index = 1; index < row.tables.length; index += 1) {
      gaps.push(row.tables[index]!.centerX - row.tables[index - 1]!.centerX);
    }
    const meanGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
    if (!(meanGap > 0)) return [];
    return [clamp01(1 - standardDeviation(gaps) / meanGap)];
  });
  if (rowScores.length === 0) return 0;
  return rowScores.reduce((sum, score) => sum + score, 0) / rowScores.length;
}

function rowCoherenceScore(
  tables: readonly TableSample[],
  rows: readonly TableRow[],
  isolatedTableCount: number,
): number {
  if (tables.length <= 1 || rows.length === 0) return tables.length === 1 ? 0 : 1;
  const tablesInRows = rows
    .filter((row) => row.tables.length >= 2)
    .reduce((sum, row) => sum + row.tables.length, 0);
  const multiTableRowRatio = tablesInRows / tables.length;
  const rowCounts = rows.map((row) => row.tables.length);
  const meanCount = rowCounts.reduce((sum, count) => sum + count, 0) / rowCounts.length;
  const countBalance = meanCount > 0 ? clamp01(1 - standardDeviation(rowCounts) / meanCount) : 0;
  const spacingRegularity = rowSpacingRegularityScore(rows);
  const isolationContinuity = 1 - isolatedTableCount / tables.length;
  const baseScore = multiTableRowRatio * 0.45 + countBalance * 0.25 + spacingRegularity * 0.3;
  return clamp01(baseScore * (0.2 + isolationContinuity * 0.8));
}

function allRowPitch(tables: readonly TableSample[], rows: readonly TableRow[]): number {
  const gaps = rows.flatMap((row) => {
    const out: number[] = [];
    for (let index = 1; index < row.tables.length; index += 1) {
      out.push(row.tables[index]!.centerX - row.tables[index - 1]!.centerX);
    }
    return out;
  }).filter((gap) => gap > 0);
  if (gaps.length > 0) return median(gaps);
  return Math.max(1, Math.max(...tables.map((table) => table.widthLu)));
}

function diagonalCoherenceScore(tables: readonly TableSample[], rows: readonly TableRow[]): number {
  if (rows.length < 2 || tables.length < 4) return 0;
  const pitch = allRowPitch(tables, rows);
  if (!(pitch > 0)) return 0;

  const pairScores: number[] = [];
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const previous = rows[rowIndex - 1]!;
    const current = rows[rowIndex]!;
    if (previous.tables.length < 2 || current.tables.length < 2) continue;
    const leftDelta = Math.abs(current.tables[0]!.centerX - previous.tables[0]!.centerX);
    const normalizedOffset = Math.min(leftDelta / pitch, 1);
    const offsetScore = clamp01(1 - Math.abs(normalizedOffset - 0.5) / 0.5);
    const targetDelta = pitch * 0.5;
    const bridgeScores = current.tables.map((table) => {
      const nearestDiagonal = Math.min(
        ...previous.tables.map((prior) =>
          Math.min(
            Math.abs(table.centerX - prior.centerX - targetDelta),
            Math.abs(table.centerX - prior.centerX + targetDelta),
          ),
        ),
      );
      return clamp01(1 - nearestDiagonal / Math.max(1, targetDelta));
    });
    const bridgeScore = bridgeScores.reduce((sum, score) => sum + score, 0) / bridgeScores.length;
    pairScores.push(offsetScore * 0.55 + bridgeScore * 0.45);
  }

  if (pairScores.length === 0) return 0;
  return clamp01(pairScores.reduce((sum, score) => sum + score, 0) / pairScores.length);
}

function leftRightBalanceScore(
  tables: readonly TableSample[],
  roomWidthLu: number,
  footprint: TableFieldFootprint | null,
): number {
  if (tables.length === 0) return 1;
  const centerX = roomWidthLu > 0 ? roomWidthLu / 2 : (footprint?.xLu ?? 0) + (footprint?.widthLu ?? 0) / 2;
  const leftCount = tables.filter((table) => table.centerX < centerX).length;
  const rightCount = tables.length - leftCount;
  const countBalance = 1 - Math.abs(leftCount - rightCount) / tables.length;
  const centroid = tables.reduce((sum, table) => sum + table.centerX, 0) / tables.length;
  const availableHalfWidth = Math.max(1, roomWidthLu > 0 ? roomWidthLu / 2 : (footprint?.widthLu ?? 1) / 2);
  const centroidBalance = 1 - Math.abs(centroid - centerX) / availableHalfWidth;
  return clamp01(countBalance * 0.55 + centroidBalance * 0.45);
}

function frontBackContinuityScore(
  tables: readonly TableSample[],
  footprint: TableFieldFootprint | null,
  fieldDensityRatio: number,
): number {
  if (!footprint || tables.length <= 1) return tables.length <= 1 ? 0 : 1;
  const rows = 4;
  const occupiedRatio = occupiedGridRatio(tables, footprint, 1, rows);
  const yCenters = [...tables.map((table) => table.centerY)].sort((left, right) => left - right);
  const gaps: number[] = [];
  for (let index = 1; index < yCenters.length; index += 1) {
    const gap = yCenters[index]! - yCenters[index - 1]!;
    if (gap > 0.25) gaps.push(gap);
  }
  if (gaps.length === 0) return occupiedRatio * 0.45;
  const typicalGap = Math.max(
    Math.max(...tables.map((table) => table.depthLu)) + 2,
    median(gaps),
  );
  const maxGap = Math.max(...gaps);
  const largeGapPenalty = clamp01((maxGap / typicalGap - 1.8) / 3);
  const continuity = (1 - largeGapPenalty) * 0.55 + occupiedRatio * 0.45;
  const densityContinuity = clamp01(fieldDensityRatio / 0.32);
  return clamp01(continuity * densityContinuity);
}

function averageTableWidth(tables: readonly TableSample[]): number {
  if (tables.length === 0) return 0;
  return tables.reduce((sum, table) => sum + table.widthLu, 0) / tables.length;
}

function visualOpportunityDemand(
  tables: readonly TableSample[],
  room: Readonly<{ widthLu: number; depthLu: number }>,
): number {
  if (tables.length === 0 || !(room.widthLu > 0 && room.depthLu > 0)) return 0;
  const tableW = Math.max(1, averageTableWidth(tables));
  const widthPressure = clamp01((room.widthLu / tableW - 14) / 8);
  const countPressure = clamp01((tables.length - 16) / 12);
  const rearSpillRatio =
    tables.filter((table) => table.centerY >= room.depthLu * 0.62).length / tables.length;
  const rearSpillPressure = clamp01((rearSpillRatio - 0.18) / 0.3);
  return Math.max(countPressure * (0.55 + widthPressure * 0.45), rearSpillPressure);
}

export function banquetTableVisualOpportunityDemand(
  placements: readonly RoomSetLayoutPlacement[],
  room: Readonly<{ widthLu: number; depthLu: number }>,
): number {
  return visualOpportunityDemand(tableSamples(placements), room);
}

function occupiedRoomXBuckets(
  tables: readonly TableSample[],
  roomWidthLu: number,
  bucketCount: number,
): number {
  if (tables.length === 0 || !(roomWidthLu > 0)) return 0;
  const occupied = new Set<number>();
  for (const table of tables) {
    const bucket = Math.max(
      0,
      Math.min(bucketCount - 1, Math.floor((table.centerX / roomWidthLu) * bucketCount)),
    );
    occupied.add(bucket);
  }
  return occupied.size;
}

function stageSideUtilizationScore(
  tables: readonly TableSample[],
  room: Readonly<{ widthLu: number; depthLu: number }>,
): number {
  const demand = visualOpportunityDemand(tables, room);
  if (demand < 0.25) return 1;

  const frontLimitY = room.depthLu * 0.46;
  const leftLimitX = room.widthLu * 0.34;
  const rightLimitX = room.widthLu * 0.66;
  const sideFrontTables = tables.filter(
    (table) =>
      table.centerY <= frontLimitY &&
      (table.centerX <= leftLimitX || table.centerX >= rightLimitX),
  );
  const expectedSideUse = Math.max(2, Math.min(6, Math.round(tables.length * 0.22)));
  const utilization = clamp01(sideFrontTables.length / expectedSideUse);

  return clamp01(utilization + (1 - demand) * 0.18);
}

function frontBandCoverageScore(
  tables: readonly TableSample[],
  room: Readonly<{ widthLu: number; depthLu: number }>,
): number {
  const demand = visualOpportunityDemand(tables, room);
  if (demand < 0.25) return 1;

  const frontLimitY = room.depthLu * 0.54;
  const frontTables = tables.filter((table) => table.centerY <= frontLimitY);
  if (frontTables.length === 0) return clamp01((1 - demand) * 0.2);

  const expectedFrontUse = Math.max(4, Math.min(tables.length, Math.round(tables.length * 0.45)));
  const countScore = clamp01(frontTables.length / expectedFrontUse);
  const rows = clusterRows(frontTables);
  const frontRowScore = rowCoherenceScore(frontTables, rows, 0);
  const xBucketTarget = Math.min(4, Math.max(2, Math.ceil(expectedFrontUse / 4)));
  const xCoverageScore = clamp01(occupiedRoomXBuckets(frontTables, room.widthLu, 4) / xBucketTarget);
  const rawScore = countScore * 0.46 + frontRowScore * 0.34 + xCoverageScore * 0.2;

  return clamp01(rawScore * (0.82 + demand * 0.18) + (1 - demand) * 0.12);
}

export function analyzeBanquetTableVisualQuality(
  placements: readonly RoomSetLayoutPlacement[],
  room: Readonly<{ widthLu: number; depthLu: number }>,
): BanquetTableVisualQualityMetrics {
  const tables = tableSamples(placements);
  const footprint = tableFootprint(tables);
  const nearestDistances = nearestNeighborDistances(tables);
  const rows = clusterRows(tables);
  const tableArea = totalTableArea(tables);
  const fieldDensityRatio = footprint && footprint.areaLu > 0 ? tableArea / footprint.areaLu : 0;
  const isolationDistance = isolateThreshold(tables);
  const isolatedTableCount = nearestDistances.filter((nearest) => nearest > isolationDistance).length;
  const geometricDeadZoneRatio = footprint ? 1 - occupiedGridRatio(tables, footprint, 4, 4) : 0;
  const densityDeadZoneRatio = clamp01(1 - fieldDensityRatio / 0.35);

  return {
    tableCount: tables.length,
    isolatedTableCount,
    nearestNeighborVariance: variance(nearestDistances),
    tableFieldFootprint: footprint,
    fieldDensityRatio,
    deadZoneRatio: Math.max(geometricDeadZoneRatio, densityDeadZoneRatio),
    rowCoherenceScore: rowCoherenceScore(tables, rows, isolatedTableCount),
    diagonalCoherenceScore: diagonalCoherenceScore(tables, rows),
    leftRightBalanceScore: leftRightBalanceScore(tables, room.widthLu, footprint),
    frontBackContinuityScore: frontBackContinuityScore(tables, footprint, fieldDensityRatio),
    stageSideUtilizationScore: stageSideUtilizationScore(tables, room),
    frontBandCoverageScore: frontBandCoverageScore(tables, room),
  };
}
