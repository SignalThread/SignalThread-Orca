import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  computeMatrix2BoardCardProjection,
  matrix2BoardAxes,
} from "./matrix2-board-layout";

const boardSource = readFileSync("app/(shell)/matrix-2/_components/Matrix2Board.tsx", "utf8");
const pageSource = readFileSync("app/(shell)/matrix-2/page.tsx", "utf8");
const topStripSource = readFileSync("app/(shell)/matrix-2/_components/Matrix2TopStrip.tsx", "utf8");

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = endMarker ? source.indexOf(endMarker, start + startMarker.length) : source.length;
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("Run of Show Board defaults to rooms-by-time and persists orientation per event", () => {
  assert.match(pageSource, /useState\("ROOMS_BY_TIME" as Matrix2BoardOrientation\)/);
  assert.match(pageSource, /const MATRIX2_BOARD_ORIENTATION_STORAGE_PREFIX = "matrix2:boardOrientation:v1"/);
  assert.match(pageSource, /matrix2BoardOrientationStorageKey\(selectedEventId\)/);
  assert.match(pageSource, /window\.localStorage\.getItem/);
  assert.match(pageSource, /window\.localStorage\.setItem/);
  assert.match(pageSource, /isMatrix2BoardOrientation\(storedOrientation\) \? storedOrientation : "ROOMS_BY_TIME"/);
  assert.match(pageSource, /boardOrientation=\{boardOrientation\}/);
  assert.match(pageSource, /onSetBoardOrientation=\{setBoardOrientation\}/);
  assert.match(pageSource, /orientation=\{boardOrientation\}/);
});

test("Run of Show Board orientation control is visible only in Board view", () => {
  assert.match(topStripSource, /const showBoardOrientation = zoomMode !== "OVERVIEW"/);
  assert.match(topStripSource, /data-matrix2-board-orientation-control/);
  assert.match(topStripSource, /Rooms by time/);
  assert.match(topStripSource, /Time by room/);
  assert.match(topStripSource, /title: "Rooms on the left, time across the top"/);
  assert.match(topStripSource, /title: "Time on the left, rooms across the top"/);
  assert.match(topStripSource, /showListFilters = zoomMode === "OVERVIEW"/);
  assert.doesNotMatch(sourceBetween(topStripSource, "data-matrix2-board-orientation-control", "aria-label={`${terminology.runOfShow} view`}"), /data-testid="matrix-filters-toggle"/);
});

test("Run of Show Board geometry helper maps axes by orientation", () => {
  assert.deepEqual(matrix2BoardAxes("ROOMS_BY_TIME"), { timeAxis: "x", roomAxis: "y" });
  assert.deepEqual(matrix2BoardAxes("TIME_BY_ROOM"), { timeAxis: "y", roomAxis: "x" });

  assert.deepEqual(
    computeMatrix2BoardCardProjection({
      orientation: "ROOMS_BY_TIME",
      timeOffset: 120,
      timeSize: 60,
      roomOffset: 24,
      roomSize: 44,
    }),
    { left: 120, top: 24, width: 60, height: 44 },
  );
  assert.deepEqual(
    computeMatrix2BoardCardProjection({
      orientation: "TIME_BY_ROOM",
      timeOffset: 120,
      timeSize: 60,
      roomOffset: 24,
      roomSize: 144,
    }),
    { left: 24, top: 120, width: 144, height: 60 },
  );
});

test("Run of Show Board renders both orientation projections from the same cards and launcher", () => {
  assert.match(boardSource, /orientation: Matrix2BoardOrientation/);
  assert.match(boardSource, /data-matrix2-board-orientation="ROOMS_BY_TIME"/);
  assert.match(boardSource, /data-matrix2-board-orientation="TIME_BY_ROOM"/);
  assert.match(boardSource, /function layoutRoomSessions/);
  assert.match(boardSource, /function layoutTimeRoomSessions/);
  assert.match(boardSource, /computeMatrix2BoardCardProjection/);
  assert.match(boardSource, /const SlotDropCell = memo/);
  assert.match(boardSource, /const FlippedSlotDropCell = memo/);
  assert.match(boardSource, /<SessionCard[\s\S]*height=\{height \?\? zoom\.cardHeight\}/);
  assert.match(boardSource, /<SessionActionLauncher/);
});

test("Run of Show flipped layout renders rooms across top and time on the left", () => {
  const flippedRender = sourceBetween(boardSource, 'if (orientation === "TIME_BY_ROOM")', 'data-matrix2-board-orientation="ROOMS_BY_TIME"');

  assert.match(flippedRender, /<span className="[^"]*">Time<\/span>/);
  assert.match(flippedRender, /flippedRoomModels\.map/);
  assert.match(flippedRender, /room\.name/);
  assert.match(flippedRender, /Cap \{room\.capacity \?\? "N\/A"\}/);
  assert.match(flippedRender, /roomSessions\.length\} sessions/);
  assert.match(flippedRender, /formatTimeLabel/);
  assert.match(flippedRender, /sticky left-0/);
  assert.match(flippedRender, /overflow-x-auto overflow-y-hidden/);
  assert.match(flippedRender, /style=\{\{ minWidth: TIME_LABEL_WIDTH \+ flippedBoardWidth \}\}/);
});

test("Run of Show flipped drag/drop emits the existing room/time target contract", () => {
  const flippedDropSource = sourceBetween(boardSource, "const FlippedSlotDropCell = memo", "function launcherTileClasses");

  assert.match(flippedDropSource, /type: "matrix2-slot-drop"/);
  assert.match(flippedDropSource, /roomId: room\.id/);
  assert.match(flippedDropSource, /roomName: room\.name/);
  assert.match(flippedDropSource, /startMinutes,/);
  assert.match(flippedDropSource, /id: `matrix2-drop-flipped:\$\{room\.id\}:\$\{startMinutes\}`/);
  assert.match(pageSource, /resolveMoveTarget/);
  assert.match(pageSource, /entry\.type === "matrix2-slot-drop"/);
  assert.match(pageSource, /entry\.type === "matrix2-session-drop"/);
  assert.match(pageSource, /handleSessionMoveDrop/);
  assert.match(pageSource, /handleTemplateDrop/);
});

test("Run of Show flipped cards preserve interaction, conflicts, and vertical duration", () => {
  const flippedRender = sourceBetween(boardSource, 'if (orientation === "TIME_BY_ROOM")', 'data-matrix2-board-orientation="ROOMS_BY_TIME"');
  const cardSource = sourceBetween(boardSource, "const SessionCard = memo", "export default memo");

  assert.match(flippedRender, /height=\{height \?\? zoom\.cardHeight\}/);
  assert.match(flippedRender, /density="compact-time"/);
  assert.match(flippedRender, /top=\{top\}/);
  assert.match(flippedRender, /width=\{width\}/);
  assert.match(flippedRender, /onShowActions=\{handleShowActions\}/);
  assert.match(flippedRender, /onToggleActions=\{handleToggleActions\}/);
  assert.match(flippedRender, /conflictsBySession\.get\(session\.id\) \?\? EMPTY_CONFLICTS/);
  assert.match(cardSource, /MatrixConflictTooltipList conflicts=\{conflicts\}/);
  assert.match(cardSource, /data-matrix2-session-card-id=\{session\.id\}/);
});
