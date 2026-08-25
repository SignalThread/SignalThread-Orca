import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildTimeWindow, formatTimeLabel, toMinutes } from "../app/(shell)/matrix-2/_components/conflict-utils";
import { deriveMatrix2BoardRoomGroups } from "./matrix2-board-rooms";
import {
  MATRIX2_TIME_BY_ROOM_MINUTE_HEIGHT,
  computeMatrix2SessionBlockLayout,
  computeMatrix2TimeByRoomScale,
  computeMatrix2TimelineRangeLayout,
  computeMatrix2TimelineScale,
} from "./matrix2-board-layout";
import { resolveMatrix2ToolbarOverflow } from "./matrix2-toolbar-overflow";

const matrix2PageSource = readFileSync("app/(shell)/matrix-2/page.tsx", "utf8");
const matrix2BoardSource = readFileSync("app/(shell)/matrix-2/_components/Matrix2Board.tsx", "utf8");

const WINDOW_START = 8 * 60;
const WINDOW_END = 18 * 60;
const MINUTE_WIDTH = 2;
const DROP_SLOT_MINUTES = 30;

function layout(startTime: string, endTime: string) {
  return computeMatrix2SessionBlockLayout({
    startTime,
    endTime,
    windowStartMinutes: WINDOW_START,
    windowEndMinutes: WINDOW_END,
    minuteWidth: MINUTE_WIDTH,
  });
}

function assertApproximatelyEqual(actual: number, expected: number): void {
  assert.ok(Math.abs(actual - expected) < 0.000001, `expected ${actual} to be approximately ${expected}`);
}

test("Run of Show board maps real session duration to card width", () => {
  const halfHour = layout("09:00", "09:30");
  assert.equal(halfHour.durationMinutes, 30);
  assert.equal(halfHour.width, 30 * MINUTE_WIDTH);
  assert.equal(halfHour.left, (9 * 60 - WINDOW_START) * MINUTE_WIDTH);

  const oneHour = layout("10:30", "11:30");
  assert.equal(oneHour.durationMinutes, 60);
  assert.equal(oneHour.width, 60 * MINUTE_WIDTH);
  assert.equal(oneHour.left, (10 * 60 + 30 - WINDOW_START) * MINUTE_WIDTH);

  const ninetyMinutes = layout("09:00", "10:30");
  assert.equal(ninetyMinutes.durationMinutes, 90);
  assert.equal(ninetyMinutes.width, 90 * MINUTE_WIDTH);

  const fortyFiveMinutes = layout("14:15", "15:00");
  assert.equal(fortyFiveMinutes.durationMinutes, 45);
  assert.equal(fortyFiveMinutes.width, 45 * MINUTE_WIDTH);
});

test("Run of Show board aligns half-hour and noon starts to the shared grid scale", () => {
  const scale = computeMatrix2TimelineScale({
    containerWidth: 1228,
    roomColumnWidth: 228,
    windowStartMinutes: 9 * 60,
    windowEndMinutes: 13 * 60,
  });

  assert.equal(scale.availableTimelineWidth, 1000);
  assert.equal(scale.hourWidth, 250);

  const coffee = computeMatrix2SessionBlockLayout({
    startTime: "09:00",
    endTime: "09:30",
    windowStartMinutes: 9 * 60,
    windowEndMinutes: 13 * 60,
    minuteWidth: scale.minuteWidth,
  });
  assertApproximatelyEqual(coffee.left, 0);
  assertApproximatelyEqual(coffee.width, scale.hourWidth / 2);

  const keynote = computeMatrix2SessionBlockLayout({
    startTime: "10:30",
    endTime: "11:30",
    windowStartMinutes: 9 * 60,
    windowEndMinutes: 13 * 60,
    minuteWidth: scale.minuteWidth,
  });
  assertApproximatelyEqual(keynote.left, scale.hourWidth * 1.5);
  assertApproximatelyEqual(keynote.width, scale.hourWidth);

  const noon = computeMatrix2SessionBlockLayout({
    startTime: "12:00",
    endTime: "12:30",
    windowStartMinutes: 9 * 60,
    windowEndMinutes: 13 * 60,
    minuteWidth: scale.minuteWidth,
  });
  assertApproximatelyEqual(noon.left, scale.hourWidth * 3);
  assertApproximatelyEqual(noon.width, scale.hourWidth / 2);
});

test("Run of Show board recomputes position and duration after session time edits", () => {
  const before = layout("09:00", "09:30");
  const after = layout("10:30", "12:00");

  assert.equal(before.left, 60 * MINUTE_WIDTH);
  assert.equal(before.width, 30 * MINUTE_WIDTH);
  assert.equal(after.left, 150 * MINUTE_WIDTH);
  assert.equal(after.width, 90 * MINUTE_WIDTH);
});

test("Run of Show time parsing and labels handle AM PM edge cases without date conversion", () => {
  assert.equal(toMinutes("00:00"), 0);
  assert.equal(toMinutes("09:30"), 9 * 60 + 30);
  assert.equal(toMinutes("12:00"), 12 * 60);
  assert.equal(toMinutes("23:59"), 23 * 60 + 59);
  assert.equal(formatTimeLabel("00:00"), "12:00 AM");
  assert.equal(formatTimeLabel("12:00"), "12:00 PM");
  assert.equal(formatTimeLabel("12:30"), "12:30 PM");
  assert.equal(formatTimeLabel("23:59"), "11:59 PM");
});

test("Run of Show board derives hour width from available container width", () => {
  const scale = computeMatrix2TimelineScale({
    containerWidth: 1480,
    roomColumnWidth: 228,
    windowStartMinutes: WINDOW_START,
    windowEndMinutes: WINDOW_END,
  });

  assert.equal(scale.availableTimelineWidth, 1252);
  assert.equal(scale.numberOfVisibleHours, 10);
  assertApproximatelyEqual(scale.hourWidth, 125.2);
  assert.equal(scale.minuteWidth, scale.hourWidth / 60);

  const oneHour = computeMatrix2SessionBlockLayout({
    startTime: "10:30",
    endTime: "11:30",
    windowStartMinutes: WINDOW_START,
    windowEndMinutes: WINDOW_END,
    minuteWidth: scale.minuteWidth,
  });

  assertApproximatelyEqual(oneHour.width, scale.hourWidth);
  assertApproximatelyEqual(oneHour.left, scale.hourWidth * 2.5);
});

test("Run of Show Time by room uses a compact fixed vertical scale", () => {
  const verticalScale = computeMatrix2TimeByRoomScale();

  assert.equal(MATRIX2_TIME_BY_ROOM_MINUTE_HEIGHT, 1.2);
  assert.equal(verticalScale.minuteHeight, 1.2);
  assert.equal(verticalScale.hourHeight, 72);
  assert.equal(verticalScale.labelEveryHours, 1);

  const halfHour = computeMatrix2SessionBlockLayout({
    startTime: "09:00",
    endTime: "09:30",
    windowStartMinutes: WINDOW_START,
    windowEndMinutes: WINDOW_END,
    minuteWidth: verticalScale.minuteHeight,
  });
  const oneHour = computeMatrix2SessionBlockLayout({
    startTime: "10:00",
    endTime: "11:00",
    windowStartMinutes: WINDOW_START,
    windowEndMinutes: WINDOW_END,
    minuteWidth: verticalScale.minuteHeight,
  });
  const ninetyMinutes = computeMatrix2SessionBlockLayout({
    startTime: "11:00",
    endTime: "12:30",
    windowStartMinutes: WINDOW_START,
    windowEndMinutes: WINDOW_END,
    minuteWidth: verticalScale.minuteHeight,
  });

  assert.equal(halfHour.width, 36);
  assert.equal(oneHour.width, 72);
  assert.equal(ninetyMinutes.width, 108);
  assert.equal(oneHour.width, halfHour.width * 2);
  assert.equal(ninetyMinutes.width, halfHour.width * 3);
});

test("Run of Show Rooms by time keeps the responsive horizontal scale", () => {
  const horizontalScale = computeMatrix2TimelineScale({
    containerWidth: 1480,
    roomColumnWidth: 228,
    windowStartMinutes: WINDOW_START,
    windowEndMinutes: WINDOW_END,
  });
  const verticalScale = computeMatrix2TimeByRoomScale();

  assertApproximatelyEqual(horizontalScale.minuteWidth, 125.2 / 60);
  assert.notEqual(horizontalScale.minuteWidth, verticalScale.minuteHeight);

  const horizontalOneHour = computeMatrix2SessionBlockLayout({
    startTime: "10:00",
    endTime: "11:00",
    windowStartMinutes: WINDOW_START,
    windowEndMinutes: WINDOW_END,
    minuteWidth: horizontalScale.minuteWidth,
  });

  assertApproximatelyEqual(horizontalOneHour.width, horizontalScale.hourWidth);
  assertApproximatelyEqual(horizontalOneHour.width, 125.2);
});

test("Run of Show visible time range follows actual sessions plus padding", () => {
  const window = buildTimeWindow([
    { startTime: "10:30", endTime: "11:30" },
    { startTime: "13:15", endTime: "14:00" },
  ] as never);

  assert.equal(window.startMinutes, 10 * 60);
  assert.equal(window.endMinutes, 15 * 60);
  assert.deepEqual(window.ticks, [10 * 60, 11 * 60, 12 * 60, 13 * 60, 14 * 60, 15 * 60]);
  assert.equal(window.ticks.includes(22 * 60), false);
  assert.equal(window.ticks.includes(23 * 60), false);
});

test("Run of Show scale thins labels when hour columns are below readable width", () => {
  const scale = computeMatrix2TimelineScale({
    containerWidth: 953,
    roomColumnWidth: 228,
    windowStartMinutes: 8 * 60,
    windowEndMinutes: 23 * 60,
  });

  assert.equal(scale.availableTimelineWidth, 725);
  assert.ok(scale.hourWidth < 76);
  assert.equal(scale.labelEveryHours, 2);

  const oneHour = computeMatrix2SessionBlockLayout({
    startTime: "10:30",
    endTime: "11:30",
    windowStartMinutes: 8 * 60,
    windowEndMinutes: 23 * 60,
    minuteWidth: scale.minuteWidth,
  });

  assertApproximatelyEqual(oneHour.width, scale.hourWidth);
  assertApproximatelyEqual(oneHour.left, scale.hourWidth * 2.5);
});

test("Run of Show shared range layout maps ticks, drops, and session blocks to the same scale", () => {
  const scale = computeMatrix2TimelineScale({
    containerWidth: 1228,
    roomColumnWidth: 228,
    windowStartMinutes: 9 * 60,
    windowEndMinutes: 13 * 60,
  });

  const tick = computeMatrix2TimelineRangeLayout({
    startMinutes: 10 * 60 + 30,
    endMinutes: 10 * 60 + 31,
    windowStartMinutes: 9 * 60,
    windowEndMinutes: 13 * 60,
    minuteWidth: scale.minuteWidth,
  });
  const drop = computeMatrix2TimelineRangeLayout({
    startMinutes: 10 * 60 + 30,
    endMinutes: 11 * 60,
    windowStartMinutes: 9 * 60,
    windowEndMinutes: 13 * 60,
    minuteWidth: scale.minuteWidth,
  });
  const session = computeMatrix2SessionBlockLayout({
    startTime: "10:30",
    endTime: "11:00",
    windowStartMinutes: 9 * 60,
    windowEndMinutes: 13 * 60,
    minuteWidth: scale.minuteWidth,
  });

  assertApproximatelyEqual(tick.left, scale.hourWidth * 1.5);
  assertApproximatelyEqual(drop.left, session.left);
  assertApproximatelyEqual(drop.width, session.width);
});

test("Run of Show flipped drops use the same vertical minute scale as session blocks", () => {
  const verticalScale = computeMatrix2TimeByRoomScale();
  const drop = computeMatrix2TimelineRangeLayout({
    startMinutes: 10 * 60 + 30,
    endMinutes: 11 * 60,
    windowStartMinutes: WINDOW_START,
    windowEndMinutes: WINDOW_END,
    minuteWidth: verticalScale.minuteHeight,
  });
  const session = computeMatrix2SessionBlockLayout({
    startTime: "10:30",
    endTime: "11:00",
    windowStartMinutes: WINDOW_START,
    windowEndMinutes: WINDOW_END,
    minuteWidth: verticalScale.minuteHeight,
  });

  assert.equal(drop.left, session.left);
  assert.equal(drop.width, session.width);
  assert.equal(drop.width, DROP_SLOT_MINUTES * verticalScale.minuteHeight);
});

test("Run of Show board uses one shared timeline scale for headers, grid, drops, and cards", () => {
  assert.equal(matrix2BoardSource.includes("MIN_SESSION_CARD_WIDTH_BY_ZOOM"), false);
  assert.equal(matrix2BoardSource.includes("computeMatrix2SessionBlockLayout({"), true);
  assert.equal(matrix2BoardSource.includes("computeMatrix2TimeByRoomScale();"), true);
  assert.equal(matrix2BoardSource.includes("computeMatrix2TimelineRangeLayout({"), true);
  assert.equal(matrix2BoardSource.includes("computeMatrix2TimelineScale({"), true);
  assert.equal(matrix2BoardSource.includes("containerWidth: boardFrameWidth"), true);
  assert.equal(matrix2BoardSource.includes("roomColumnWidth: axisLabelWidth"), true);
  assert.equal(matrix2BoardSource.includes("const timelineWidth = timelineScale.availableTimelineWidth;"), true);
  assert.equal(matrix2BoardSource.includes("const minuteWidthEff = timelineScale.minuteWidth;"), true);
  assert.equal(matrix2BoardSource.includes("const timeByRoomMinuteHeight = timeByRoomScale.minuteHeight;"), true);
  assert.equal(matrix2BoardSource.includes("const labelEveryHours = timelineScale.labelEveryHours;"), true);
  assert.equal(matrix2BoardSource.includes("const timeByRoomLabelEveryHours = timeByRoomScale.labelEveryHours;"), true);
  assert.equal(matrix2BoardSource.includes("timelineSpanMinutes * zoom.minuteWidth"), false);
  assert.equal(matrix2BoardSource.includes("(tickMinutes - timeWindow.startMinutes) * minuteWidthEff"), false);
  assert.equal(matrix2BoardSource.includes("(startMinutes - timeWindow.startMinutes) * minuteWidthEff"), false);
  assert.equal(matrix2BoardSource.includes("DROP_SLOT_MINUTES * minuteWidthEff"), false);
  assert.equal(matrix2BoardSource.includes("const left = tickLayout.left;"), true);
  assert.equal(matrix2BoardSource.includes("const left = dropLayout.left;"), true);
  assert.equal(matrix2BoardSource.includes("const width = dropLayout.width;"), true);
  assert.equal(matrix2BoardSource.includes("minuteWidth: timeByRoomMinuteHeight"), true);
  assert.equal(matrix2BoardSource.includes("style={{ width: timelineWidth, minWidth: timelineWidth }}"), true);
  assert.equal(matrix2BoardSource.includes("style={{ minHeight: laneHeight, width: timelineWidth, minWidth: timelineWidth }}"), true);
  assert.equal(matrix2BoardSource.includes("data-matrix2-board-scroll"), true);
  assert.equal(matrix2BoardSource.includes("overflow-x-auto overflow-y-hidden pb-5"), true);
  assert.equal(matrix2BoardSource.includes("overflow-x-auto overflow-y-visible"), false);
  assert.equal(matrix2BoardSource.includes("overflow-x-hidden overflow-y-auto"), false);
  assert.equal(matrix2BoardSource.includes("node.clientWidth"), true);
  assert.equal(matrix2BoardSource.includes("window.requestAnimationFrame(update)"), true);
  assert.equal(matrix2BoardSource.includes("const isLastTick = tickIndex === timeWindow.ticks.length - 1;"), true);
  assert.equal(matrix2BoardSource.includes("const shouldShowLabel = tickIndex % labelEveryHours === 0;"), true);
  assert.equal(matrix2BoardSource.includes('isLastTick ? "right-2 text-right" : "left-2"'), true);
  assert.equal(matrix2BoardSource.includes("{shouldShowLabel ? ("), true);
});

test("Run of Show command center remains sticky above the board", () => {
  assert.equal(matrix2PageSource.includes("sticky top-0 z-40 shrink-0 border-b border-slate-200 bg-white/95"), true);
  assert.equal(matrix2PageSource.includes("flex min-h-0 flex-col gap-4 overflow-visible"), true);
  assert.equal(matrix2PageSource.includes("flex min-h-0 flex-col gap-3 overflow-visible"), true);
  assert.equal(matrix2PageSource.includes("flex min-h-0 flex-col gap-2 overflow-visible"), true);
  assert.equal(matrix2PageSource.includes("flex h-full min-h-0 flex-col gap-4 overflow-hidden"), false);
  assert.equal(matrix2PageSource.includes("flex min-h-0 flex-1 flex-col gap-3 overflow-hidden"), false);
  assert.equal(matrix2PageSource.includes("h-[calc(100dvh-7rem)]"), false);
  assert.equal(matrix2PageSource.includes("backdrop-blur"), true);
  assert.equal(matrix2PageSource.includes("shadow-sm"), true);
  assert.equal(matrix2PageSource.includes("<Matrix2TopStrip"), true);
});

test("Run of Show toolbar uses Add session instead of a session type rail", () => {
  const topStripSource = readFileSync("app/(shell)/matrix-2/_components/Matrix2TopStrip.tsx", "utf8");

  assert.equal(topStripSource.includes("data-matrix2-toolbar"), true);
  assert.equal(topStripSource.includes("data-matrix2-add-session-action"), true);
  assert.equal(topStripSource.includes("Add session"), true);
  assert.equal(topStripSource.includes("data-matrix2-session-type-row"), false);
  assert.equal(topStripSource.includes("TemplateChip"), false);
  assert.equal(topStripSource.includes("TABLE_CONTROL_ROW_CLASS"), true);
  assert.equal(topStripSource.includes("showListFilters"), true);
  assert.equal(topStripSource.includes("data-matrix2-module-filters"), false);
  assert.equal(topStripSource.includes("data-matrix2-session-more-trigger"), false);
  assert.equal(topStripSource.includes("data-matrix2-session-more-menu"), false);
  assert.equal(topStripSource.includes("data-matrix2-manage-session-types-action"), false);
  assert.equal(topStripSource.includes("resolveMatrix2ToolbarOverflow({"), false);
  assert.equal(topStripSource.includes("+ Type"), false);
  assert.equal(topStripSource.includes("Create new type..."), false);
  assert.equal(topStripSource.includes("overflow-x-auto"), false);
  assert.equal(matrix2PageSource.includes("handleCreateAddSession"), true);
  assert.equal(matrix2PageSource.includes("ADD_SESSION_MAX_QUANTITY"), false);
  assert.equal(matrix2PageSource.includes("{SESSION_TYPE_OPTIONS.map((option) => ("), true);
  assert.equal(matrix2PageSource.includes("Choose a type and schedule the session."), true);

  assert.equal(matrix2BoardSource.includes("overflow-x-auto overflow-y-hidden pb-5"), true);
  assert.equal(matrix2BoardSource.includes("overflow-x-hidden overflow-y-auto"), false);
  assert.equal(matrix2PageSource.includes("overflow-x-auto overflow-y-visible"), false);
});

test("Run of Show toolbar hides More and shows the manage action when everything fits", () => {
  const result = resolveMatrix2ToolbarOverflow({
    availableWidth: 900,
    templateIds: ["keynote", "panel", "workshop", "coffee-break", "lunch", "reception"],
    itemWidths: {
      keynote: 110,
      panel: 100,
      workshop: 120,
      "coffee-break": 150,
      lunch: 100,
      reception: 130,
    },
    manageWidth: 82,
    moreWidth: 82,
    gap: 8,
    hasManageAction: true,
  });

  assert.deepEqual(result.visibleTemplateIds, ["keynote", "panel", "workshop", "coffee-break", "lunch", "reception"]);
  assert.deepEqual(result.overflowTemplateIds, []);
  assert.equal(result.isMoreVisible, false);
  assert.equal(result.isManageVisible, true);
  assert.equal(result.isManageInMore, false);
});

test("Run of Show toolbar does not show More solely for the manage action", () => {
  const result = resolveMatrix2ToolbarOverflow({
    availableWidth: 242,
    templateIds: ["keynote", "panel"],
    itemWidths: {
      keynote: 110,
      panel: 100,
    },
    manageWidth: 82,
    moreWidth: 82,
    gap: 8,
    hasManageAction: true,
  });

  assert.deepEqual(result.visibleTemplateIds, ["keynote", "panel"]);
  assert.deepEqual(result.overflowTemplateIds, []);
  assert.equal(result.isMoreVisible, false);
  assert.equal(result.isManageVisible, false);
  assert.equal(result.isManageInMore, false);
});

test("Run of Show toolbar overflow keeps priority chips visible and puts hidden items in More", () => {
  const result = resolveMatrix2ToolbarOverflow({
    availableWidth: 380,
    templateIds: ["keynote", "panel", "workshop", "coffee-break", "lunch", "reception"],
    itemWidths: {
      keynote: 110,
      panel: 100,
      workshop: 120,
      "coffee-break": 150,
      lunch: 100,
      reception: 130,
    },
    manageWidth: 44,
    moreWidth: 82,
    gap: 8,
    hasManageAction: true,
  });

  assert.deepEqual(result.visibleTemplateIds, ["keynote", "panel"]);
  assert.deepEqual(result.overflowTemplateIds, ["workshop", "coffee-break", "lunch", "reception"]);
  assert.equal(result.isMoreVisible, true);
  assert.equal(result.isManageVisible, true);
  assert.equal(result.isManageInMore, false);
});

test("Run of Show toolbar overflow helper keeps manage action reachable when a rail is tight", () => {
  const result = resolveMatrix2ToolbarOverflow({
    availableWidth: 250,
    templateIds: ["keynote", "panel", "workshop", "coffee-break", "lunch", "reception"],
    itemWidths: {
      keynote: 110,
      panel: 100,
      workshop: 120,
      "coffee-break": 150,
      lunch: 100,
      reception: 130,
    },
    manageWidth: 44,
    moreWidth: 82,
    gap: 8,
    hasManageAction: true,
  });

  assert.deepEqual(result.visibleTemplateIds, ["keynote"]);
  assert.deepEqual(result.overflowTemplateIds, ["panel", "workshop", "coffee-break", "lunch", "reception"]);
  assert.equal(result.isMoreVisible, true);
  assert.equal(result.isManageVisible, false);
  assert.equal(result.isManageInMore, true);
});

test("Run of Show toolbar overflow does not skip higher-priority chips to show shorter later chips", () => {
  const result = resolveMatrix2ToolbarOverflow({
    availableWidth: 205,
    templateIds: ["keynote", "panel", "workshop"],
    itemWidths: {
      keynote: 122,
      panel: 105,
      workshop: 136,
    },
    manageWidth: 38,
    moreWidth: 77,
    gap: 8,
    hasManageAction: true,
  });

  assert.deepEqual(result.visibleTemplateIds, []);
  assert.deepEqual(result.overflowTemplateIds, ["keynote", "panel", "workshop"]);
  assert.equal(result.isMoreVisible, true);
  assert.equal(result.isManageVisible, true);
});

test("Run of Show list view preserves horizontal table scrolling without trapping page scroll", () => {
  const overviewSource = matrix2PageSource.slice(
    matrix2PageSource.indexOf("function MatrixOverviewTable"),
    matrix2PageSource.indexOf("export default function Matrix2Page"),
  );

  assert.equal(
    overviewSource.includes('className="flex flex-col overflow-visible rounded-2xl border border-slate-200/80 bg-white shadow-sm ring-1 ring-white"'),
    true,
  );
  assert.equal(overviewSource.includes('className="overflow-x-auto overflow-y-hidden pb-5"'), true);
  assert.equal(overviewSource.includes('className="min-h-0 flex-1 overflow-auto"'), false);
  assert.equal(matrix2PageSource.includes('<div className="overflow-visible">'), true);
  assert.equal(matrix2PageSource.includes('<div className="min-h-0 flex-1 overflow-hidden">'), false);
});

test("Run of Show board derives virtual room lanes from imported roomName text", () => {
  const groups = deriveMatrix2BoardRoomGroups(
    [{ id: "room-1", name: "Canonical Ballroom", capacity: 400 }],
    [
      { roomId: null, roomName: "AI Theater", roomCapacity: null },
      { roomId: null, roomName: "AI Theater", roomCapacity: null },
      { roomId: "room-1", roomName: "Uploaded Ballroom", roomCapacity: 250 },
      { roomId: null, roomName: "", roomCapacity: null },
    ],
  );

  assert.deepEqual(
    groups.map((group) => ({
      id: group.id,
      name: group.name,
      isVirtual: group.isVirtual === true,
      virtualRoomKey: group.virtualRoomKey ?? null,
    })),
    [
      { id: "room-1", name: "Canonical Ballroom", isVirtual: false, virtualRoomKey: null },
      { id: "virtual-room:ai-theater", name: "AI Theater", isVirtual: true, virtualRoomKey: "ai-theater" },
      { id: "virtual-room:unassigned", name: "Unassigned", isVirtual: true, virtualRoomKey: "unassigned" },
    ],
  );
});

test("Run of Show board renders imported roomName lanes instead of the empty room state", () => {
  assert.equal(matrix2BoardSource.includes("deriveMatrix2BoardRoomGroups(rooms, sessions)"), true);
  assert.equal(matrix2BoardSource.includes("boardRooms.length === 0 && sessions.length === 0"), true);
  assert.equal(matrix2BoardSource.includes("virtualRoomGroupsByKey"), true);
  assert.equal(matrix2BoardSource.includes("Imported"), true);
  assert.equal(matrix2BoardSource.includes("disabled={isVirtualRoom}"), true);
  assert.equal(matrix2PageSource.includes("deriveMatrix2BoardRoomGroups(snapshot.rooms, sessionsInScope)"), true);
  assert.equal(matrix2PageSource.includes("roomsActive: roomGroups.length"), true);
});
