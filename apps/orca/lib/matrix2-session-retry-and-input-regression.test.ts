import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const updateRouteSource = readFileSync(
  "app/api/events/[eventId]/matrix-2/sessions/[sessionId]/route.ts",
  "utf8",
);
const matrixPageSource = readFileSync("app/(shell)/matrix-2/page.tsx", "utf8");
const sessionWorkspaceSource = readFileSync(
  "app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-detail-workspace.tsx",
  "utf8",
);
const sessionDetailLoaderSource = readFileSync("lib/session-detail-load.ts", "utf8");

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("Matrix 2 session PATCH rejects malformed, empty, and unknown updates before the mutation service", () => {
  const handler = sourceBetween(updateRouteSource, "async function updateMatrix2SessionRoute", "export const PATCH");
  const accessIndex = handler.indexOf('assertEventAccessForUser(eventId, currentUserResult.user, "write")');
  const bodyParseIndex = handler.indexOf("await nextRequest.json()");
  const mutationIndex = handler.indexOf("updateMatrix2Session(eventId, sessionId, body)");

  assert.ok(updateRouteSource.includes("ALLOWED_UPDATE_FIELDS"));
  assert.ok(handler.includes('"JSON body must be an object"'));
  assert.ok(handler.includes('"At least one session field is required"'));
  assert.ok(handler.includes("Unknown fields:"));
  assert.notEqual(accessIndex, -1);
  assert.notEqual(bodyParseIndex, -1);
  assert.notEqual(mutationIndex, -1);
  assert.ok(accessIndex < bodyParseIndex, "write access must be asserted before body validation");
  assert.ok(accessIndex < mutationIndex, "write access must be asserted before mutation");
});

test("Run of Show visibly retries a snapshot failure without rendering it as an empty event", () => {
  const loader = sourceBetween(matrixPageSource, "const loadSnapshot = useCallback", "useEffect(() => {");

  assert.ok(matrixPageSource.includes("const [snapshotLoadError, setSnapshotLoadError]"));
  assert.ok(loader.includes("setSnapshotLoadError(null)"));
  assert.ok(loader.includes("setSnapshotLoadError(error instanceof Error"));
  assert.ok(matrixPageSource.includes("onClick={() => void loadSnapshot(selectedEventId)}"));
  assert.ok(matrixPageSource.includes("disabled={!selectedEventId || isLoadingSnapshot}"));
  assert.ok(matrixPageSource.includes("snapshotLoadError ? ("));
  assert.ok(matrixPageSource.includes("!snapshot ? ("));
  assert.ok(matrixPageSource.includes("Run of Show is unavailable"));
  assert.ok(matrixPageSource.includes("counts and empty-state actions are withheld"));
  assert.ok(matrixPageSource.includes("...(!snapshot || isRunOfShowEmpty"));
});

test("session workspace ignores stale initial snapshot responses and retries only load failures", () => {
  const loader = sourceBetween(sessionWorkspaceSource, "const loadSnapshot = useCallback", "const loadFnbCatalogItems");

  assert.ok(sessionWorkspaceSource.includes("const snapshotRequestVersionRef = useRef(0)"));
  assert.ok(loader.includes("fetchSessionDetailSnapshot<Matrix2Session, Matrix2Snapshot>"));
  assert.ok(sessionDetailLoaderSource.includes("snapshot.event?.id !== eventId"));
  assert.ok(sessionDetailLoaderSource.includes('throw new SessionDetailLoadError("Session data did not match the requested event.")'));
  assert.ok(loader.includes("snapshotRequestVersionRef.current !== requestVersion"));
  assert.ok(loader.includes("setSnapshotLoadError(error instanceof Error"));
  assert.ok(loader.includes("setSnapshot(null);"));
  assert.ok(loader.includes("setSession(null);"));
  assert.ok(sessionWorkspaceSource.includes("const hasCurrentSnapshot = snapshot?.event.id === eventId;"));
  assert.ok(sessionWorkspaceSource.includes("const hasCurrentSession = session?.id === sessionId;"));
  assert.ok(sessionWorkspaceSource.includes("!hasCurrentSnapshot || !hasCurrentSession"));
  assert.ok(sessionWorkspaceSource.includes("if (snapshotLoadError)"));
  assert.ok(sessionWorkspaceSource.includes(">Session not found</h1>"));
  assert.ok(sessionWorkspaceSource.includes("onClick={() => void loadSnapshot()}"));
});
