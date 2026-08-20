import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MATRIX2_SESSION_DRAG_ACTIVATION_DISTANCE,
  createMatrix2SessionDragClickState,
} from "./matrix2-session-drag";

const boardSource = readFileSync("app/(shell)/matrix-2/_components/Matrix2Board.tsx", "utf8");
const pageSource = readFileSync("app/(shell)/matrix-2/page.tsx", "utf8");

test("Run of Show uses a six-pixel session drag activation threshold", () => {
  assert.equal(MATRIX2_SESSION_DRAG_ACTIVATION_DISTANCE, 6);
  assert.match(pageSource, /activationConstraint:\s*\{\s*distance: MATRIX2_SESSION_DRAG_ACTIVATION_DISTANCE/);
});

test("a dragged session click is consumed once and the next normal click is available", () => {
  const state = createMatrix2SessionDragClickState();

  assert.equal(state.consumeDraggedClick(), false, "a normal click is not suppressed");
  state.markDragStarted();
  assert.equal(state.pending, true);
  assert.equal(state.consumeDraggedClick(), true, "the trailing click from a drag is consumed");
  assert.equal(state.pending, false);
  assert.equal(state.consumeDraggedClick(), false, "the following legitimate click is preserved");
});

test("drag lifecycle closes hover UI, suppresses its trailing card click, and preserves normal clicks", () => {
  assert.match(boardSource, /const activeLauncher = useMemo\(\(\) => \{\s*if \(isDraggingSession\) return null;/);
  assert.match(boardSource, /if \(isDraggingSession\) \{\s*closeActionLauncher\(\);/);
  assert.match(boardSource, /if \(isDraggingSessionRef\.current\) return;/);
  assert.match(boardSource, /onClickCapture=\{\(event\) => \{\s*if \(!onConsumeSessionDragClick\(\)\) return;\s*event\.preventDefault\(\);\s*event\.stopPropagation\(\);/);
  assert.match(boardSource, /onToggleActions\(session\.id\);/);
  assert.match(pageSource, /sessionDragClickStateRef\.current\.markDragStarted\(\)/);
  assert.match(pageSource, /scheduleTrailingDraggedClickReset\(\);/);
  assert.match(pageSource, /\}, 250\);/);
});

test("dragging hides card-only hover affordances and conflict UI in both board orientations", () => {
  assert.match(boardSource, /summary\.total > 0 && !isDragging/);
  assert.match(boardSource, /title=\{isDragging \? undefined/);
  assert.match(boardSource, /pointer-events-none/);
  assert.match(boardSource, /isMatrix2SessionCardNestedInteractiveControl\(event\.target, event\.currentTarget\)/);
  assert.equal((boardSource.match(/onConsumeSessionDragClick=\{onConsumeSessionDragClick\}/g) ?? []).length, 2);
  assert.match(boardSource, /density="compact-time"/);
});
