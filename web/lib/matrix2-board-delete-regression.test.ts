import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const boardSource = readFileSync("app/(shell)/matrix-2/_components/Matrix2Board.tsx", "utf8");
const pageSource = readFileSync("app/(shell)/matrix-2/page.tsx", "utf8");

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("Board quick launcher exposes a compact archive action", () => {
  const launcherSource = sourceBetween(boardSource, "function SessionActionLauncher({", "const SessionCard = memo");

  assert.match(boardSource, /import \{ AlertTriangle, Archive, ChevronDown, ChevronRight, Pencil, Plus \} from "lucide-react"/);
  assert.match(boardSource, /onDeleteSession: \(sessionId: string\) => void;/);
  assert.match(boardSource, /onDeleteSession=\{onDeleteSession\}/);
  assert.match(launcherSource, /title="Archive session"/);
  assert.match(launcherSource, /aria-label=\{`Archive \$\{session\.title\}`\}/);
  assert.match(launcherSource, /border-rose-200 bg-white[\s\S]*text-rose-700/);
  assert.match(launcherSource, /<Archive className="h-3\.5 w-3\.5"/);
  assert.match(launcherSource, /onDeleteSession\(session\.id\);/);
});

test("Board archive confirms, uses the existing matrix-row path, and reconciles board state", () => {
  const deleteHandler = sourceBetween(
    pageSource,
    "const handleDeleteBoardSession = useCallback(async (sessionId: string): Promise<void> => {",
    "const handleAssignSpeakerAssignment = useCallback",
  );

  assert.match(deleteHandler, /window\.confirm\(\[/);
  assert.match(deleteHandler, /"Archive session\?"/);
  assert.match(deleteHandler, /`\$\{session\.title\} · \$\{matrixSessionTimeLabel\(session\)\}`/);
  assert.match(deleteHandler, /`This session will be removed from the active \$\{terminology\.runOfShow\}\.`,/);
  assert.match(deleteHandler, /if \(!confirmed\) return;/);
  assert.match(deleteHandler, /fetch\(`\/api\/events\/\$\{selectedEventId\}\/matrix-rows\/\$\{session\.rowId\}`,[\s\S]*method: "DELETE"/);
  assert.match(deleteHandler, /sessions: current\.sessions\.filter\(\(entry\) => entry\.id !== session\.id\)/);
  assert.match(deleteHandler, /await loadSnapshot\(selectedEventId\);/);
  assert.match(deleteHandler, /setFlashMessage\("Archived 1 session"\)/);
  assert.match(deleteHandler, /setFlashErrorMessage\(message\)/);
});

test("List bulk archive remains wired to its existing flow", () => {
  const bulkDeleteHandler = sourceBetween(
    pageSource,
    "const handleBulkDeleteOverviewSessions = useCallback(async (sessionIds: string[]): Promise<void> => {",
    "const handleDeleteBoardSession = useCallback",
  );

  assert.match(pageSource, /onBulkDeleteSessions=\{handleBulkDeleteOverviewSessions\}/);
  assert.match(bulkDeleteHandler, /for \(const session of selectedSessions\)/);
  assert.match(bulkDeleteHandler, /fetch\(`\/api\/events\/\$\{selectedEventId\}\/matrix-rows\/\$\{session\.rowId\}`,[\s\S]*method: "DELETE"/);
  assert.match(bulkDeleteHandler, /setFlashMessage\(`Archived \$\{selectedSessions\.length\} session/);
});

test("Board quick launcher actions still use existing action callback", () => {
  const launcherSource = sourceBetween(boardSource, "function SessionActionLauncher({", "const SessionCard = memo");

  assert.match(launcherSource, /onSessionAction\(session\.id, item\.action\);/);
  assert.match(launcherSource, /onSessionAction\(session\.id, "workspace"\);/);
  assert.match(pageSource, /onSessionAction=\{handleSessionAction\}/);
  assert.match(pageSource, /onDeleteSession=\{handleDeleteBoardSession\}/);
});
