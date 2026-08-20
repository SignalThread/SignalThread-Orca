import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const boardSource = readFileSync("app/(shell)/matrix-2/_components/Matrix2Board.tsx", "utf8");

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing start marker: ${start}`);
  const endIndex = end ? source.indexOf(end, startIndex) : source.length;
  assert.notEqual(endIndex, -1, `Missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

const sessionCardSource = sourceBetween(boardSource, "function SessionCard({", "");

test("Run of Show board session cards preserve time-accurate timeline width", () => {
  assert.doesNotMatch(boardSource, /SESSION_CARD_MIN_READABLE_WIDTH/);
  assert.doesNotMatch(sessionCardSource, /const visualWidth = Math\.max/);
  assert.match(sessionCardSource, /style=\{\{\s*left,\s*width,\s*top,\s*height,/);
  assert.match(sessionCardSource, /data-matrix2-session-card-id=\{session\.id\}/);
  assert.match(sessionCardSource, /useDroppable/);
  assert.match(sessionCardSource, /useDraggable/);
});

test("Run of Show board session cards render adaptive readable titles", () => {
  assert.match(boardSource, /function readableSessionLabel\(session: Matrix2Session\): string/);
  for (const label of ["Keynote", "Panel", "Workshop", "Coffee", "Lunch", "Reception"]) {
    assert.ok(boardSource.includes(`return "${label}"`), `short label includes ${label}`);
  }
  assert.match(sessionCardSource, /density = "standard"/);
  assert.match(sessionCardSource, /const isTimeByRoomCard = density === "compact-time";/);
  assert.match(sessionCardSource, /const durationSize = isTimeByRoomCard \? height : width;/);
  assert.match(sessionCardSource, /TIME_BY_ROOM_SESSION_CARD_TINY_HEIGHT/);
  assert.match(sessionCardSource, /const cardTitle = isTinyDuration \? readableSessionLabel\(session\) : session\.title/);
  assert.match(sessionCardSource, /const titleClampClass = canUseTwoLineTitle \? "line-clamp-2" : "truncate";/);
  assert.match(sessionCardSource, /height >= TIME_BY_ROOM_SESSION_CARD_MEDIUM_HEIGHT/);
  assert.match(sessionCardSource, /width >= 92/);
  assert.match(sessionCardSource, /aria-label=\{`\$\{session\.title\}, \$\{formattedTimeRange\}`\}/);
  assert.match(sessionCardSource, /\{cardTitle\}/);
  assert.match(sessionCardSource, /\{timeLabel\}/);
  assert.match(sessionCardSource, /formatTimeLabel\(session\.startTime\)/);
});

test("Run of Show board dense room rows collapse stacked lanes until expanded", () => {
  assert.match(boardSource, /trackIndex: number;/);
  assert.match(boardSource, /trackIndex,/);
  assert.match(boardSource, /const \[expandedRoomIds, setExpandedRoomIds\] = useState<Set<string>>/);
  assert.match(boardSource, /const hasStackedSessions = trackCount > 1;/);
  assert.match(boardSource, /validPlacements\.filter\(\(placement\) => placement\.trackIndex === 0\)/);
  assert.match(boardSource, /const hiddenSessionCount = validPlacements\.length - placements\.length;/);
  assert.match(boardSource, /const compactLaneHeight = zoom\.cardHeight \+ LANE_TOP_PADDING \+ LANE_BOTTOM_PADDING;/);
  assert.match(boardSource, /const laneHeight = isExpanded \|\| !hasStackedSessions \? lane\.laneHeight : compactLaneHeight;/);
  assert.match(boardSource, /toggleRoomExpanded\(room\.id\);/);
  assert.match(boardSource, /aria-expanded=\{isExpanded\}/);
  assert.match(boardSource, /`\+\$\{hiddenSessionCount\} more`/);
});

test("Run of Show board conflict badges stay fixed without consuming title layout", () => {
  assert.match(sessionCardSource, /const titlePaddingClass = summary\.total > 0/);
  assert.match(sessionCardSource, /className=\{\["group\/badge absolute right-1 z-10", isTimeByRoomCard \? "top-0\.5" : "top-1"\]\.join\(" "\)\}/);
  assert.match(sessionCardSource, /AlertTriangle className="h-2\.5 w-2\.5"/);
  assert.match(sessionCardSource, /MatrixConflictTooltipList conflicts=\{conflicts\}/);
});

test("Run of Show Time by room cards use compact padding without hiding conflict badges", () => {
  assert.match(boardSource, /const TIME_BY_ROOM_SESSION_CARD_MEDIUM_HEIGHT = 64;/);
  assert.match(boardSource, /const TIME_BY_ROOM_SESSION_CARD_TINY_HEIGHT = 44;/);
  assert.match(boardSource, /const TIME_BY_ROOM_SESSION_CARD_START_TIME_HEIGHT = 36;/);
  assert.match(boardSource, /density="compact-time"/);
  assert.match(sessionCardSource, /const cardPaddingClass = isTimeByRoomCard \? "px-1\.5 py-1" : "px-2 py-1";/);
  assert.match(sessionCardSource, /const titlePaddingClass = summary\.total > 0 \? \(isSmallCard \? "pr-5" : "pr-7"\) : "";/);
  assert.match(sessionCardSource, /const timeTextClassName = isTimeByRoomCard \? "mt-0\.5 truncate text-\[9px\] leading-\[11px\]/);
  assert.match(sessionCardSource, /MatrixConflictTooltipList conflicts=\{conflicts\}/);
});
