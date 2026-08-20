import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const boardSource = readFileSync("app/(shell)/matrix-2/_components/Matrix2Board.tsx", "utf8");
const pageSource = readFileSync("app/(shell)/matrix-2/page.tsx", "utf8");
const quickModulesSource = readFileSync("app/(shell)/matrix-2/_components/matrix2-quick-modules.tsx", "utf8");

test("Matrix2Board memoizes the hot board/card/drop-cell render path", () => {
  // React.memo is imported and applied to the leaf components on the hover render path.
  assert.match(boardSource, /import \{ memo, /);
  assert.match(boardSource, /const SessionCard = memo\(function SessionCard\(/);
  assert.match(boardSource, /const SlotDropCell = memo\(function SlotDropCell\(/);
  assert.match(boardSource, /export default memo\(Matrix2Board\);/);
});

test("Matrix2Board passes a stable empty-conflicts fallback into memoized cards", () => {
  // A shared constant reference avoids handing memoized children a brand-new [] each render.
  assert.match(boardSource, /const EMPTY_CONFLICTS: Matrix2Conflict\[\] = \[\];/);
  assert.match(boardSource, /conflictsBySession\.get\(session\.id\) \?\? EMPTY_CONFLICTS/);
  assert.match(boardSource, /conflictsBySession\.get\(placement\.session\.id\) \?\? EMPTY_CONFLICTS/);
  // The conflict summary is derived inside the memoized card, not passed as an unstable prop.
  assert.doesNotMatch(boardSource, /summary=\{summary\}/);
  assert.match(boardSource, /const summary = useMemo\(\(\) => conflictSummary\(conflicts\), \[conflicts\]\);/);
});

test("Matrix2Board launcher handlers are useCallback-stabilized via a pinned ref", () => {
  assert.match(boardSource, /const actionLauncherPinnedRef = useRef\(actionLauncherPinned\);/);
  assert.match(boardSource, /const handleShowActions = useCallback\(/);
  assert.match(boardSource, /const handleToggleActions = useCallback\(/);
  assert.match(boardSource, /const scheduleActionLauncherClose = useCallback\(/);
  // The stabilized handlers must read pin state from the ref, not from a render-scoped closure.
  assert.match(boardSource, /if \(actionLauncherPinnedRef\.current\) return/);
  assert.match(boardSource, /const isPinned = actionLauncherPinnedRef\.current;/);
});

test("Matrix2Page feeds the memoized board stable props and handlers", () => {
  assert.match(pageSource, /const EMPTY_ROOMS: Matrix2Room\[\] = \[\];/);
  assert.match(pageSource, /rooms=\{snapshot\?\.rooms \?\? EMPTY_ROOMS\}/);
  assert.match(pageSource, /const handleClearBoardSelection = useCallback\(/);
  assert.match(pageSource, /const handleOpenAddRoom = useCallback\(/);
  assert.match(pageSource, /const handleOpenEditRoom = useCallback\(/);
  assert.match(pageSource, /onClearSelection=\{handleClearBoardSelection\}/);
  assert.match(pageSource, /onOpenAddRoom=\{handleOpenAddRoom\}/);
  assert.match(pageSource, /onOpenEditRoom=\{handleOpenEditRoom\}/);
});

test("Memoization preserves shared production-gated Room Set and Seating availability", () => {
  assert.match(boardSource, /MATRIX2_QUICK_MODULES\.map/);
  assert.match(boardSource, /disabled: !module\.enabled/);
  assert.match(quickModulesSource, /isSessionModuleAvailable/);
  assert.match(quickModulesSource, /action: "room-set"[\s\S]*label: "Room Set"[\s\S]*destination: "workspace"[\s\S]*enabled: MATRIX2_ROOM_SET_SEATING_QUICK_LAUNCH_ENABLED/);
  assert.match(quickModulesSource, /action: "seating"[\s\S]*label: "Seating"[\s\S]*destination: "workspace"[\s\S]*enabled: MATRIX2_ROOM_SET_SEATING_QUICK_LAUNCH_ENABLED/);
  assert.doesNotMatch(quickModulesSource, /destination: "unavailable"|unavailableLabel|Coming soon/);
});
