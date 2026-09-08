import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isContinuousCaptureContainerKind,
  normalizeEventContainerKind
} from "../lib/events/event-container-kind";

test("normalize maps unknown values to event kind", () => {
  assert.equal(normalizeEventContainerKind(undefined), "event");
  assert.equal(normalizeEventContainerKind("bogus"), "event");
});

test("normalize preserves continuous_capture", () => {
  assert.equal(normalizeEventContainerKind("continuous_capture"), "continuous_capture");
});

test("isContinuousCaptureContainerKind", () => {
  assert.equal(isContinuousCaptureContainerKind("event"), false);
  assert.equal(isContinuousCaptureContainerKind("continuous_capture"), true);
});

test("exhibitor create action gates continuous_capture on portfolio resolution", () => {
  const src = readFileSync(new URL("../app/app/events/new/actions.ts", import.meta.url), "utf8");
  assert.match(src, /isExhibitorDirectPortfolioEventAccessResolution/);
  assert.match(src, /continuous_capture/);
});
