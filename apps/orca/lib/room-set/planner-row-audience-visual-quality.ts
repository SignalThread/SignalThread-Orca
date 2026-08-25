import { getRoomSetComponent, type RoomSetComponentId } from "@/lib/room-set/component-library";

import type { RoomSetLayoutPlacement } from "./planner-layout-schema";

const THEATER_ROW_COMPONENT_IDS = new Set<RoomSetComponentId>([
  "seating-theater-row",
  "seating-chair-row-5",
  "seating-chair-row-10",
  "seating-chair-block-20",
  "seating-chair-block-custom",
]);

export type RowAudienceFieldFootprint = Readonly<{
  xLu: number;
  yLu: number;
  widthLu: number;
  depthLu: number;
  areaLu: number;
}>;

export type RowAudienceVisualQualityMetrics = Readonly<{
  rowCount: number;
  rowFieldFootprint: RowAudienceFieldFootprint | null;
  rowCoherenceScore: number;
  diagonalCoherenceScore: number;
  leftRightBalanceScore: number;
  frontBackContinuityScore: number;
  aisleCoherenceScore: number;
  focalAlignmentScore: number;
  frontClearanceScore: number;
  deadZoneRatio: number;
}>;

export type TownHallAudienceVisualQualityMetrics = RowAudienceVisualQualityMetrics &
  Readonly<{
    qaAccessScore: number;
    frontZoneUsabilityScore: number;
  }>;

type RoomSize = Readonly<{ widthLu: number; depthLu: number }>;

type RowSample = Readonly<{
  placement: RoomSetLayoutPlacement;
  widthLu: number;
  depthLu: number;
  centerX: number;
  centerY: number;
}>;

type RowBand = Readonly<{
  centerY: number;
  rows: readonly RowSample[];
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

function rowSamples(
  placements: readonly RoomSetLayoutPlacement[],
  componentIds: ReadonlySet<RoomSetComponentId>,
): RowSample[] {
  return placements.flatMap((placement) => {
    if (!componentIds.has(placement.componentId)) return [];
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

function rowFootprint(rows: readonly RowSample[]): RowAudienceFieldFootprint | null {
  if (rows.length === 0) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    minX = Math.min(minX, row.placement.xLu);
    minY = Math.min(minY, row.placement.yLu);
    maxX = Math.max(maxX, row.placement.xLu + row.widthLu);
    maxY = Math.max(maxY, row.placement.yLu + row.depthLu);
  }
  const widthLu = Math.max(0, maxX - minX);
  const depthLu = Math.max(0, maxY - minY);
  return { xLu: minX, yLu: minY, widthLu, depthLu, areaLu: widthLu * depthLu };
}

function clusterRowBands(rows: readonly RowSample[]): RowBand[] {
  if (rows.length === 0) return [];
  const maxDepth = Math.max(...rows.map((row) => row.depthLu));
  const tolerance = Math.max(0.8, maxDepth * 0.55);
  const bands: RowSample[][] = [];
  for (const row of [...rows].sort((left, right) => left.centerY - right.centerY || left.centerX - right.centerX)) {
    const current = bands[bands.length - 1];
    if (!current) {
      bands.push([row]);
      continue;
    }
    const currentCenter = current.reduce((sum, entry) => sum + entry.centerY, 0) / current.length;
    if (Math.abs(row.centerY - currentCenter) <= tolerance) {
      current.push(row);
    } else {
      bands.push([row]);
    }
  }
  return bands.map((band) => ({
    centerY: band.reduce((sum, row) => sum + row.centerY, 0) / band.length,
    rows: band.sort((left, right) => left.centerX - right.centerX),
  }));
}

function rowCoherenceScore(rows: readonly RowSample[], bands: readonly RowBand[]): number {
  if (rows.length <= 1) return rows.length === 1 ? 0.45 : 0;
  if (bands.length === 0) return 0;
  const rowsInBands = bands.filter((band) => band.rows.length > 0).reduce((sum, band) => sum + band.rows.length, 0);
  const rowBandRatio = rowsInBands / rows.length;
  const bandCounts = bands.map((band) => band.rows.length);
  const meanCount = bandCounts.reduce((sum, count) => sum + count, 0) / bandCounts.length;
  const countBalance = meanCount > 0 ? clamp01(1 - standardDeviation(bandCounts) / meanCount) : 0;
  const yValues = bands.map((band) => band.centerY);
  const yGaps: number[] = [];
  for (let index = 1; index < yValues.length; index += 1) {
    yGaps.push(yValues[index]! - yValues[index - 1]!);
  }
  const meanGap = yGaps.length ? yGaps.reduce((sum, gap) => sum + gap, 0) / yGaps.length : 0;
  const yRegularity = meanGap > 0 ? clamp01(1 - standardDeviation(yGaps) / meanGap) : 0.75;
  return clamp01(rowBandRatio * 0.3 + countBalance * 0.25 + yRegularity * 0.45);
}

function diagonalCoherenceScore(rows: readonly RowSample[], bands: readonly RowBand[]): number {
  if (rows.length < 4 || bands.length < 3) return 0;
  const starts = bands.map((band) => band.rows[0]?.centerX).filter((value): value is number => Number.isFinite(value));
  if (starts.length < 3) return 0;
  const deltas: number[] = [];
  for (let index = 1; index < starts.length; index += 1) {
    deltas.push(starts[index]! - starts[index - 1]!);
  }
  const meaningfulDeltas = deltas.map((delta) => Math.abs(delta)).filter((delta) => delta > 0.5);
  if (meaningfulDeltas.length < Math.max(2, Math.floor(deltas.length * 0.45))) return 0;
  const typicalDelta = median(meaningfulDeltas);
  const consistency =
    typicalDelta > 0 ? clamp01(1 - standardDeviation(meaningfulDeltas) / Math.max(typicalDelta, 1)) : 0;
  const alternation = clamp01(meaningfulDeltas.length / Math.max(1, deltas.length));
  return clamp01(consistency * 0.55 + alternation * 0.45);
}

function leftRightBalanceScore(rows: readonly RowSample[], room: RoomSize): number {
  if (rows.length === 0) return 0;
  const roomCenter = room.widthLu / 2;
  let leftArea = 0;
  let rightArea = 0;
  for (const row of rows) {
    const area = row.widthLu * row.depthLu;
    if (row.centerX < roomCenter) leftArea += area;
    else rightArea += area;
  }
  const total = leftArea + rightArea;
  if (total <= 0) return 0;
  const areaBalance = 1 - Math.abs(leftArea - rightArea) / total;
  const footprint = rowFootprint(rows);
  const centerBalance = footprint
    ? 1 - Math.abs(footprint.xLu + footprint.widthLu / 2 - roomCenter) / Math.max(1, room.widthLu / 2)
    : 0;
  return clamp01(areaBalance * 0.65 + centerBalance * 0.35);
}

function frontBackContinuityScore(rows: readonly RowSample[], bands: readonly RowBand[]): number {
  if (rows.length <= 1) return rows.length === 1 ? 0.25 : 0;
  if (bands.length <= 1) return 0.3;
  const gaps: number[] = [];
  for (let index = 1; index < bands.length; index += 1) {
    gaps.push(bands[index]!.centerY - bands[index - 1]!.centerY);
  }
  const typicalGap = median(gaps.filter((gap) => gap > 0));
  if (!(typicalGap > 0)) return 0;
  const regularity = clamp01(1 - standardDeviation(gaps) / typicalGap);
  const maxGap = Math.max(...gaps);
  const gapContinuity = clamp01(1 - Math.max(0, maxGap - typicalGap * 1.9) / Math.max(typicalGap * 2, 1));
  const bandDepth = rowFootprint(rows)?.depthLu ?? 0;
  const minDepth = Math.max(...rows.map((row) => row.depthLu));
  const depthContinuity = clamp01(bandDepth / Math.max(minDepth * Math.min(rows.length, 6), 1));
  return clamp01(regularity * 0.42 + gapContinuity * 0.38 + depthContinuity * 0.2);
}

function centerAisleScore(rows: readonly RowSample[], bands: readonly RowBand[], room: RoomSize): number {
  if (rows.length === 0) return 0;
  const roomCenter = room.widthLu / 2;
  const scoredBands = bands.flatMap((band) => {
    if (band.rows.length < 2) return [];
    const left = band.rows.filter((row) => row.centerX < roomCenter).at(-1);
    const right = band.rows.find((row) => row.centerX >= roomCenter);
    if (!left || !right) return [];
    const leftEnd = left.placement.xLu + left.widthLu;
    const rightStart = right.placement.xLu;
    const gap = rightStart - leftEnd;
    const centerInsideGap = leftEnd <= roomCenter && rightStart >= roomCenter;
    return [clamp01((gap - 2) / 8) * (centerInsideGap ? 1 : 0.45)];
  });
  if (scoredBands.length === 0) {
    const footprint = rowFootprint(rows);
    if (!footprint) return 0;
    const sideSlack = Math.min(footprint.xLu, room.widthLu - (footprint.xLu + footprint.widthLu));
    return clamp01(sideSlack / 8) * 0.72;
  }
  return scoredBands.reduce((sum, score) => sum + score, 0) / scoredBands.length;
}

function focalAlignmentScore(rows: readonly RowSample[], room: RoomSize): number {
  const footprint = rowFootprint(rows);
  if (!footprint) return 0;
  const fieldCenterX = footprint.xLu + footprint.widthLu / 2;
  return clamp01(1 - Math.abs(fieldCenterX - room.widthLu / 2) / Math.max(1, room.widthLu / 2));
}

function frontClearanceScore(
  rows: readonly RowSample[],
  placements: readonly RoomSetLayoutPlacement[],
): number {
  if (rows.length === 0) return 0;
  const frontBottom = placements.reduce((max, placement) => {
    const component = getRoomSetComponent(placement.componentId);
    if (!component) return max;
    const isFront =
      placement.componentId.startsWith("stage-") ||
      placement.componentId === "av-projector-screen" ||
      placement.componentId === "av-led-wall";
    if (!isFront) return max;
    return Math.max(max, placement.yLu + component.depthLu);
  }, 0);
  if (frontBottom <= 0) return 0.78;
  const firstRowY = Math.min(...rows.map((row) => row.placement.yLu));
  return clamp01((firstRowY - frontBottom) / 6);
}

function deadZoneRatio(rows: readonly RowSample[], room: RoomSize): number {
  const footprint = rowFootprint(rows);
  if (!footprint || rows.length === 0) return 1;
  const totalRowArea = rows.reduce((sum, row) => sum + row.widthLu * row.depthLu, 0);
  const density = totalRowArea / Math.max(1, footprint.areaLu);
  const footprintUse = clamp01((footprint.widthLu * footprint.depthLu) / Math.max(1, room.widthLu * room.depthLu * 0.52));
  return clamp01(1 - density * 0.72 - footprintUse * 0.28);
}

function analyzeRowAudienceVisualQuality(
  placements: readonly RoomSetLayoutPlacement[],
  room: RoomSize,
  componentIds: ReadonlySet<RoomSetComponentId>,
): RowAudienceVisualQualityMetrics {
  const rows = rowSamples(placements, componentIds);
  const bands = clusterRowBands(rows);
  return {
    rowCount: rows.length,
    rowFieldFootprint: rowFootprint(rows),
    rowCoherenceScore: rowCoherenceScore(rows, bands),
    diagonalCoherenceScore: diagonalCoherenceScore(rows, bands),
    leftRightBalanceScore: leftRightBalanceScore(rows, room),
    frontBackContinuityScore: frontBackContinuityScore(rows, bands),
    aisleCoherenceScore: centerAisleScore(rows, bands, room),
    focalAlignmentScore: focalAlignmentScore(rows, room),
    frontClearanceScore: frontClearanceScore(rows, placements),
    deadZoneRatio: deadZoneRatio(rows, room),
  };
}

export function analyzeTheaterAudienceVisualQuality(
  placements: readonly RoomSetLayoutPlacement[],
  room: RoomSize,
): RowAudienceVisualQualityMetrics {
  return analyzeRowAudienceVisualQuality(placements, room, THEATER_ROW_COMPONENT_IDS);
}

export function analyzeTownHallAudienceVisualQuality(
  placements: readonly RoomSetLayoutPlacement[],
  room: RoomSize,
): TownHallAudienceVisualQualityMetrics {
  const metrics = analyzeRowAudienceVisualQuality(placements, room, THEATER_ROW_COMPONENT_IDS);
  const qaAccessScore = clamp01(
    metrics.aisleCoherenceScore * 0.58 +
      metrics.frontBackContinuityScore * 0.22 +
      metrics.frontClearanceScore * 0.2,
  );
  const frontZoneUsabilityScore = clamp01(
    metrics.frontClearanceScore * 0.55 +
      metrics.focalAlignmentScore * 0.25 +
      metrics.leftRightBalanceScore * 0.2,
  );
  return {
    ...metrics,
    qaAccessScore,
    frontZoneUsabilityScore,
  };
}
