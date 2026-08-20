import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error TS project config does not enable allowImportingTsExtensions.
import { aabbOverlaps, constrainTransformToBoundary, axisAlignedBounds, rotatedCorners } from "./geometry.ts";

test("constrainTransformToBoundary keeps rotated rectangle inside room", () => {
  const roomW = 100;
  const roomD = 80;
  const placed = constrainTransformToBoundary(120, 50, 20, 10, 0, roomW, roomD);

  const bb = axisAlignedBounds(rotatedCorners(placed.cx, placed.cy, 20, 10, 0));
  assert.ok(bb.minX >= -1e-5);
  assert.ok(bb.maxX <= roomW + 1e-5);
  assert.ok(bb.minY >= -1e-5);
  assert.ok(bb.maxY <= roomD + 1e-5);
});

test("aabbOverlaps detects intersection", () => {
  const a = { minX: 0, maxX: 10, minY: 0, maxY: 10 };
  const b = { minX: 5, maxX: 15, minY: 5, maxY: 15 };
  const c = { minX: 20, maxX: 25, minY: 0, maxY: 5 };

  assert.equal(aabbOverlaps(a, b), true);
  assert.equal(aabbOverlaps(a, c), false);
});
