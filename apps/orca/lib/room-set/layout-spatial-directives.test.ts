import assert from "node:assert/strict";
import test from "node:test";

import {
  applySpatialDirectivesToLayout,
  inferSpatialApplyDirectives,
  mapSpatialDirectivesToPlannerKeys,
} from "./layout-spatial-directives";
import { getRoomSetComponent } from "./component-library";
import { validatePlannerLayoutPlacements } from "./planner-layout-validator";

test("inferSpatialApplyDirectives extracts ordered spatial directives from update prompts", () => {
  assert.deepEqual(
    inferSpatialApplyDirectives(
      "split the audience into two banks, preserve the center aisle, move buffet to perimeter, and mirror the layout",
    ),
    [
      "preserveCenterAisle",
      "centerAudienceBlock",
      "splitAudienceIntoBanks",
      "moveBuffetToPerimeterWithoutOverlap",
      "enforceMirrorLayout",
    ],
  );
});

test("inferSpatialApplyDirectives maps focused planner prompts to directive keys", () => {
  assert.deepEqual(inferSpatialApplyDirectives("Preserve center aisle."), [
    "preserveCenterAisle",
  ]);
  assert.deepEqual(
    inferSpatialApplyDirectives("Tighten seating while preserving stage sightlines."),
    ["preserveStageSightlines", "tightenSeating"],
  );
  assert.deepEqual(
    mapSpatialDirectivesToPlannerKeys(
      inferSpatialApplyDirectives("Move buffet to perimeter."),
    ),
    ["moveBuffetToPerimeterWithoutOverlap"],
  );
});

test("applySpatialDirectivesToLayout repositions audience banks and bars without changing components", () => {
  const bar = getRoomSetComponent("fnb-portable-bar");
  assert.ok(bar);

  const result = applySpatialDirectivesToLayout({
    roomWidthLu: 120,
    roomDepthLu: 80,
    primaryAudienceComponentId: "seating-theater-row",
    directives: ["splitAudienceIntoBanks", "anchorBarsLeftRight"],
    placements: [
      { componentId: "seating-theater-row", xLu: 28, yLu: 18, rotationDeg: 0, label: "Audience row 1" },
      { componentId: "seating-theater-row", xLu: 28, yLu: 26, rotationDeg: 0, label: "Audience row 2" },
      { componentId: "seating-theater-row", xLu: 28, yLu: 34, rotationDeg: 0, label: "Audience row 3" },
      { componentId: "seating-theater-row", xLu: 28, yLu: 42, rotationDeg: 0, label: "Audience row 4" },
      { componentId: "fnb-portable-bar", xLu: 42, yLu: 52, rotationDeg: 0, label: "Bar 1" },
      { componentId: "fnb-portable-bar", xLu: 52, yLu: 52, rotationDeg: 0, label: "Bar 2" },
    ],
  });

  assert.equal(result.placements.length, 6);
  assert.equal(result.changed, true);

  const audienceXs = result.placements
    .filter((placement) => placement.componentId === "seating-theater-row")
    .map((placement) => placement.xLu);
  assert.equal(new Set(audienceXs).size >= 2, true);

  const barPlacements = result.placements.filter((placement) => placement.componentId === "fnb-portable-bar");
  assert.equal(barPlacements.length, 2);
  assert.equal(barPlacements[0]!.xLu <= 2.25, true);
  assert.equal(barPlacements[1]!.xLu >= 120 - bar!.widthLu - 2.25, true);
});

test("preserveCenterAisle splits centered audience into banks with a clear center gap", () => {
  const rows = Array.from({ length: 6 }, (_, index) => ({
    componentId: "seating-theater-row" as const,
    xLu: 52,
    yLu: 18 + index * 8,
    rotationDeg: 0,
    label: `Row ${index + 1}`,
  }));

  const result = applySpatialDirectivesToLayout({
    roomWidthLu: 120,
    roomDepthLu: 72,
    primaryAudienceComponentId: "seating-theater-row",
    directives: ["preserveCenterAisle"],
    placements: [
      { componentId: "stage-riser", xLu: 42, yLu: 4, rotationDeg: 0 },
      ...rows,
    ],
  });

  assert.equal(result.changed, true);
  const audienceXs = result.placements
    .filter((placement) => placement.componentId === "seating-theater-row")
    .map((placement) => placement.xLu);
  assert.equal(new Set(audienceXs).size >= 2, true);
});

test("moveBuffetToPerimeterWithoutOverlap avoids registration overlap on rear wall", () => {
  const buffet = getRoomSetComponent("fnb-buffet-line");
  const registration = getRoomSetComponent("registration-desk");
  assert.ok(buffet);
  assert.ok(registration);

  const result = applySpatialDirectivesToLayout({
    roomWidthLu: 120,
    roomDepthLu: 72,
    primaryAudienceComponentId: "seating-theater-row",
    directives: ["moveBuffetToPerimeterWithoutOverlap"],
    placements: [
      { componentId: "registration-desk", xLu: 54, yLu: 66, rotationDeg: 0 },
      { componentId: "fnb-buffet-line", xLu: 100, yLu: 66, rotationDeg: 0 },
    ],
  });

  assert.equal(result.changed, true);
  const validated = validatePlannerLayoutPlacements(result.placements, 120, 72);
  assert.equal(validated.ok, true);
  if (validated.ok) {
    assert.equal(
      validated.issues.some((issue: { code: string }) => issue.code === "overlap"),
      false,
    );
  }
});

test("tightenSeating compresses row spacing while preserving stage sightlines", () => {
  const placements = Array.from({ length: 4 }, (_, index) => ({
    componentId: "seating-theater-row" as const,
    xLu: 20,
    yLu: 24 + index * 10,
    rotationDeg: 0,
    label: `Row ${index + 1}`,
  }));

  const result = applySpatialDirectivesToLayout({
    roomWidthLu: 120,
    roomDepthLu: 72,
    primaryAudienceComponentId: "seating-theater-row",
    directives: ["preserveStageSightlines", "tightenSeating"],
    placements: [
      { componentId: "stage-riser", xLu: 42, yLu: 4, rotationDeg: 0 },
      ...placements,
    ],
  });

  assert.equal(result.changed, true);
  const rowYs = result.placements
    .filter((placement) => placement.componentId === "seating-theater-row")
    .map((placement) => placement.yLu)
    .sort((left, right) => left - right);
  const gaps = rowYs.slice(1).map((y, index) => y - rowYs[index]!);
  assert.equal(gaps.every((gap) => gap < 10), true);
});
