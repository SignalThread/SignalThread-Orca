import assert from "node:assert/strict";
import test from "node:test";

import { analyzeBanquetTableVisualQuality } from "./planner-layout-visual-quality";
import {
  findPlannerLayoutPlacementOverlaps,
  validatePlannerLayoutPlacements,
} from "./planner-layout-validator";
import type { RoomSetLayoutPlacement } from "./planner-layout-schema";

const ROOM = { widthLu: 120, depthLu: 72 };

function roundTable(xLu: number, yLu: number): RoomSetLayoutPlacement {
  return {
    componentId: "table-round-60",
    xLu,
    yLu,
    rotationDeg: 0,
  };
}

function gridTables(args: Readonly<{
  rows: number;
  cols: number;
  startX: number;
  startY: number;
  pitchX: number;
  pitchY: number;
  rowOffset?: (row: number) => number;
}>): RoomSetLayoutPlacement[] {
  const out: RoomSetLayoutPlacement[] = [];
  for (let row = 0; row < args.rows; row += 1) {
    for (let col = 0; col < args.cols; col += 1) {
      out.push(
        roundTable(
          args.startX + col * args.pitchX + (args.rowOffset?.(row) ?? 0),
          args.startY + row * args.pitchY,
        ),
      );
    }
  }
  return out;
}

function assertTechnicallyValid(
  placements: readonly RoomSetLayoutPlacement[],
  room: Readonly<{ widthLu: number; depthLu: number }> = ROOM,
): void {
  const validated = validatePlannerLayoutPlacements(placements, room.widthLu, room.depthLu);
  assert.equal(validated.ok, true);
  assert.equal(findPlannerLayoutPlacementOverlaps(placements, room.widthLu, room.depthLu).length, 0);
}

test("banquet visual metrics identify an isolated single table", () => {
  const placements = [
    ...gridTables({ rows: 3, cols: 4, startX: 18, startY: 12, pitchX: 9, pitchY: 9 }),
    roundTable(108, 62),
  ];
  assertTechnicallyValid(placements);

  const metrics = analyzeBanquetTableVisualQuality(placements, ROOM);

  assert.equal(metrics.tableCount, 13);
  assert.ok(metrics.isolatedTableCount >= 1);
  assert.ok(metrics.nearestNeighborVariance > 80);
});

test("banquet visual metrics catch excessive empty zones inside the table field", () => {
  const placements = [
    roundTable(8, 8),
    roundTable(17, 8),
    roundTable(8, 17),
    roundTable(96, 8),
    roundTable(105, 8),
    roundTable(96, 17),
    roundTable(8, 55),
    roundTable(17, 55),
    roundTable(96, 55),
    roundTable(105, 55),
  ];
  assertTechnicallyValid(placements);

  const metrics = analyzeBanquetTableVisualQuality(placements, ROOM);

  assert.ok(metrics.tableFieldFootprint);
  assert.ok(metrics.deadZoneRatio >= 0.68);
  assert.ok(metrics.fieldDensityRatio < 0.16);
  assert.ok(metrics.frontBackContinuityScore < 0.75);
});

test("banquet visual metrics catch random scatter pretending to be staggered", () => {
  const randomScatter = [
    roundTable(7, 5),
    roundTable(27, 8),
    roundTable(51, 4),
    roundTable(76, 13),
    roundTable(100, 6),
    roundTable(15, 24),
    roundTable(39, 18),
    roundTable(64, 28),
    roundTable(92, 22),
    roundTable(6, 43),
    roundTable(31, 37),
    roundTable(57, 50),
    roundTable(84, 41),
    roundTable(106, 54),
    roundTable(20, 62),
    roundTable(70, 62),
  ];
  const staggered = gridTables({
    rows: 4,
    cols: 4,
    startX: 25,
    startY: 12,
    pitchX: 10,
    pitchY: 9,
    rowOffset: (row) => (row % 2 === 0 ? 0 : 5),
  });
  assertTechnicallyValid(randomScatter);
  assertTechnicallyValid(staggered);

  const randomMetrics = analyzeBanquetTableVisualQuality(randomScatter, ROOM);
  const staggeredMetrics = analyzeBanquetTableVisualQuality(staggered, ROOM);

  assert.ok(randomMetrics.rowCoherenceScore < 0.45);
  assert.ok(randomMetrics.diagonalCoherenceScore < 0.35);
  assert.ok(staggeredMetrics.rowCoherenceScore > 0.8);
  assert.ok(staggeredMetrics.diagonalCoherenceScore > 0.65);
});

test("banquet visual metrics catch poor left/right balance", () => {
  const placements = gridTables({
    rows: 4,
    cols: 5,
    startX: 6,
    startY: 12,
    pitchX: 8.5,
    pitchY: 9,
  });
  assertTechnicallyValid(placements);

  const metrics = analyzeBanquetTableVisualQuality(placements, ROOM);

  assert.ok(metrics.leftRightBalanceScore < 0.55);
  assert.ok(metrics.rowCoherenceScore > 0.8);
});

test("banquet visual metrics catch weak row coherence for structured layouts", () => {
  const poorStructured = [
    roundTable(18, 10),
    roundTable(31, 15),
    roundTable(43, 9),
    roundTable(55, 18),
    roundTable(67, 11),
    roundTable(24, 31),
    roundTable(38, 25),
    roundTable(53, 35),
    roundTable(69, 28),
    roundTable(84, 37),
  ];
  const structured = gridTables({
    rows: 2,
    cols: 5,
    startX: 22,
    startY: 18,
    pitchX: 9,
    pitchY: 10,
  });
  assertTechnicallyValid(poorStructured);
  assertTechnicallyValid(structured);

  const poorMetrics = analyzeBanquetTableVisualQuality(poorStructured, ROOM);
  const structuredMetrics = analyzeBanquetTableVisualQuality(structured, ROOM);

  assert.ok(poorMetrics.rowCoherenceScore < 0.55);
  assert.ok(structuredMetrics.rowCoherenceScore > 0.85);
});

test("banquet visual metrics catch weak diagonal coherence for diagonal layouts", () => {
  const alignedRows = gridTables({
    rows: 4,
    cols: 4,
    startX: 25,
    startY: 12,
    pitchX: 10,
    pitchY: 9,
  });
  const staggeredRows = gridTables({
    rows: 4,
    cols: 4,
    startX: 25,
    startY: 12,
    pitchX: 10,
    pitchY: 9,
    rowOffset: (row) => (row % 2 === 0 ? 0 : 5),
  });
  assertTechnicallyValid(alignedRows);
  assertTechnicallyValid(staggeredRows);

  const alignedMetrics = analyzeBanquetTableVisualQuality(alignedRows, ROOM);
  const staggeredMetrics = analyzeBanquetTableVisualQuality(staggeredRows, ROOM);

  assert.ok(alignedMetrics.diagonalCoherenceScore < 0.2);
  assert.ok(staggeredMetrics.diagonalCoherenceScore > 0.65);
});

test("banquet visual metrics expose collision-free sparse disconnected islands in the 200 attendee room case", () => {
  const placements = [
    ...gridTables({ rows: 1, cols: 5, startX: 7, startY: 7, pitchX: 8.5, pitchY: 9 }),
    ...gridTables({ rows: 1, cols: 5, startX: 72, startY: 7, pitchX: 8.5, pitchY: 9 }),
    ...gridTables({ rows: 1, cols: 5, startX: 7, startY: 58, pitchX: 8.5, pitchY: 9 }),
    ...gridTables({ rows: 1, cols: 5, startX: 72, startY: 58, pitchX: 8.5, pitchY: 9 }),
    ...gridTables({ rows: 1, cols: 5, startX: 37, startY: 33, pitchX: 8.5, pitchY: 9 }),
  ];
  assert.equal(placements.length, 25);
  assertTechnicallyValid(placements);

  const metrics = analyzeBanquetTableVisualQuality(placements, ROOM);

  assert.equal(metrics.isolatedTableCount, 0);
  assert.ok(metrics.deadZoneRatio >= 0.5);
  assert.ok(metrics.fieldDensityRatio < 0.26);
  assert.ok(metrics.frontBackContinuityScore < 0.7);
});

test("conditional front metrics allow smaller layouts to leave stage-side space empty", () => {
  const placements = gridTables({
    rows: 2,
    cols: 5,
    startX: 35,
    startY: 28,
    pitchX: 8.5,
    pitchY: 9,
  });
  assertTechnicallyValid(placements);

  const metrics = analyzeBanquetTableVisualQuality(placements, ROOM);

  assert.equal(metrics.stageSideUtilizationScore, 1);
  assert.equal(metrics.frontBandCoverageScore, 1);
});

test("conditional front metrics fail wide high-count layouts that skip usable front-side space for back islands", () => {
  const wideRoom = { widthLu: 150, depthLu: 100 };
  const placements = [
    ...gridTables({ rows: 3, cols: 5, startX: 8, startY: 62, pitchX: 9, pitchY: 14 }),
    ...gridTables({ rows: 3, cols: 5, startX: 95, startY: 62, pitchX: 9, pitchY: 14 }),
  ];
  assert.equal(placements.length, 30);
  assertTechnicallyValid(placements, wideRoom);

  const metrics = analyzeBanquetTableVisualQuality(placements, wideRoom);

  assert.ok(metrics.stageSideUtilizationScore < 0.2);
  assert.ok(metrics.frontBandCoverageScore < 0.2);
});

test("conditional front metrics pass wide high-count layouts using front band and side areas as needed", () => {
  const wideRoom = { widthLu: 150, depthLu: 100 };
  const placements = gridTables({
    rows: 3,
    cols: 10,
    startX: 20,
    startY: 20,
    pitchX: 12,
    pitchY: 14,
  });
  assert.equal(placements.length, 30);
  assertTechnicallyValid(placements, wideRoom);

  const metrics = analyzeBanquetTableVisualQuality(placements, wideRoom);

  assert.ok(metrics.stageSideUtilizationScore > 0.85);
  assert.ok(metrics.frontBandCoverageScore > 0.85);
});

test("conditional front metrics catch the 120x72 25-round sparse-island front opportunity regression", () => {
  const placements = [
    ...gridTables({ rows: 2, cols: 5, startX: 7, startY: 40, pitchX: 9, pitchY: 15 }),
    ...gridTables({ rows: 2, cols: 5, startX: 70, startY: 40, pitchX: 9, pitchY: 15 }),
    ...gridTables({ rows: 1, cols: 5, startX: 38, startY: 63, pitchX: 9, pitchY: 9 }),
  ];
  assert.equal(placements.length, 25);
  assertTechnicallyValid(placements);

  const metrics = analyzeBanquetTableVisualQuality(placements, ROOM);

  assert.ok(metrics.stageSideUtilizationScore < 0.25);
  assert.ok(metrics.frontBandCoverageScore < 0.25);
});
