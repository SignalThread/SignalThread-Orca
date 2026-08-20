import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  fetchSessionDetailSnapshot,
  SessionDetailLoadError,
} from "./session-detail-load";
import {
  parseSessionRequirementQuantity,
  SESSION_REQUIREMENT_QUANTITY_MAX,
  SessionRequirementQuantityError,
} from "./session-requirement-quantity";

const snapshotRoute = readFileSync(
  "app/api/events/[eventId]/matrix-2/route.ts",
  "utf8",
);
const matrixPage = readFileSync("app/(shell)/matrix-2/page.tsx", "utf8");
const sessionWorkspace = readFileSync(
  "app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-detail-workspace.tsx",
  "utf8",
);
const detailsDrawer = readFileSync(
  "app/(shell)/matrix-2/_components/Matrix2DetailsDrawer.tsx",
  "utf8",
);
const sessionService = readFileSync("lib/matrix2-session.ts", "utf8");
const requirementsService = readFileSync("lib/session-requirements.ts", "utf8");
const sessionDetailLoader = readFileSync("lib/session-detail-load.ts", "utf8");

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing ${end}`);
  return source.slice(startIndex, endIndex);
}

test("stalled Matrix coalescing is bounded and evicted so a retry can begin a new load", () => {
  assert.match(snapshotRoute, /const SNAPSHOT_LOAD_TIMEOUT_MS = 15_000/);
  assert.match(snapshotRoute, /function boundSnapshotLoad/);
  assert.match(
    snapshotRoute,
    /Run of Show is taking too long to load\. Please retry\./,
  );
  assert.match(
    snapshotRoute,
    /inflightSnapshotRequests\.delete\(inflightKey\)/,
  );
  assert.match(
    snapshotRoute,
    /inflightSnapshotRequests\.get\(inflightKey\) === createdSnapshotPromise/,
  );
});

test("session-detail snapshot loading resolves valid and mismatched event-session pairs without leakage", async () => {
  const snapshot = {
    event: { id: "event-b" },
    sessions: [{ id: "session-b", title: "Event B session" }],
  };
  const fetcher = async () => new Response(JSON.stringify(snapshot), { status: 200 });

  const valid = await fetchSessionDetailSnapshot<{ id: string; title: string }, typeof snapshot>({
    eventId: "event-b",
    sessionId: "session-b",
    fetcher,
  });
  assert.equal(valid.kind, "success");
  assert.equal(valid.kind === "success" ? valid.session.title : null, "Event B session");

  const mismatched = await fetchSessionDetailSnapshot({
    eventId: "event-b",
    sessionId: "session-a",
    fetcher,
  });
  assert.equal(mismatched.kind, "not-found");
  assert.deepEqual(mismatched.snapshot.sessions.map((session) => session.id), ["session-b"]);
});

test("session-detail snapshot loading terminalizes 404, 403, 500, rejection, abort, and retry", async () => {
  for (const status of [404, 403, 500]) {
    await assert.rejects(
      fetchSessionDetailSnapshot({
        eventId: "event-b",
        sessionId: "session-b",
        fetcher: async () => new Response(JSON.stringify({ error: `HTTP ${status}` }), { status }),
      }),
      (error: unknown) => error instanceof SessionDetailLoadError && error.status === status,
    );
  }

  await assert.rejects(
    fetchSessionDetailSnapshot({
      eventId: "event-b",
      sessionId: "session-b",
      fetcher: async () => { throw new Error("network failed"); },
    }),
    /network failed/,
  );

  await assert.rejects(
    fetchSessionDetailSnapshot({
      eventId: "event-b",
      sessionId: "session-b",
      fetcher: async () => new Response("not-json", { status: 200 }),
    }),
    /Session response was invalid/,
  );

  const controller = new AbortController();
  const aborted = fetchSessionDetailSnapshot({
    eventId: "event-b",
    sessionId: "session-b",
    signal: controller.signal,
    fetcher: async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }),
  });
  controller.abort();
  await assert.rejects(aborted, (error: unknown) => error instanceof DOMException && error.name === "AbortError");

  let attempts = 0;
  const retryFetcher = async () => {
    attempts += 1;
    return attempts === 1
      ? new Response(JSON.stringify({ error: "temporary failure" }), { status: 500 })
      : new Response(JSON.stringify({ event: { id: "event-b" }, sessions: [{ id: "session-b" }] }), { status: 200 });
  };
  await assert.rejects(fetchSessionDetailSnapshot({ eventId: "event-b", sessionId: "session-b", fetcher: retryFetcher }));
  const retried = await fetchSessionDetailSnapshot({ eventId: "event-b", sessionId: "session-b", fetcher: retryFetcher });
  assert.equal(retried.kind, "success");
  assert.equal(attempts, 2);
});

test("Matrix and session detail abort superseded snapshots without allowing stale state to win", () => {
  const matrixLoader = sourceBetween(
    matrixPage,
    "const loadSnapshot = useCallback",
    "useEffect(() => {",
  );
  const sessionLoader = sourceBetween(
    sessionWorkspace,
    "const loadSnapshot = useCallback",
    "const loadFnbCatalogItems",
  );

  assert.match(matrixLoader, /signal: options\.signal/);
  assert.match(sessionLoader, /fetchSessionDetailSnapshot<Matrix2Session, Matrix2Snapshot>/);
  assert.match(matrixPage, /const controller = new AbortController\(\)/);
  assert.match(
    matrixPage,
    /snapshotRequestVersionRef\.current \+= 1;[\s\S]*controller\.abort\(\)/,
  );
  assert.match(sessionWorkspace, /const controller = new AbortController\(\)/);
  assert.match(
    sessionWorkspace,
    /snapshotRequestVersionRef\.current \+= 1;[\s\S]*controller\.abort\(\)/,
  );
  assert.match(matrixLoader, /isCurrentMatrix2SnapshotRequest/);
  assert.match(sessionDetailLoader, /snapshot\.event\?\.id !== eventId/);
});

test("Matrix snapshot failures reach a visible terminal retry state instead of a false empty schedule", () => {
  const matrixLoader = sourceBetween(matrixPage, "const loadSnapshot = useCallback", "useEffect(() => {");

  assert.match(matrixLoader, /if \(!response\.ok\)/);
  assert.match(matrixLoader, /HTTP \$\{response\.status\}/);
  assert.match(matrixPage, /setSnapshotLoadError\(error instanceof Error/);
  assert.match(matrixPage, /setSnapshot\(null\)/);
  assert.match(matrixPage, /Run of Show is unavailable/);
  assert.match(
    matrixPage,
    /onClick=\{\(\) => void loadSnapshot\(selectedEventId\)\}/,
  );
  assert.match(sessionWorkspace, /if \(snapshotLoadError\)/);
  assert.doesNotMatch(sessionWorkspace, /isLoading \|\| \(snapshot !== null/);
  assert.match(sessionWorkspace, /<h1[^>]*>Session not found<\/h1>/);
  assert.match(sessionWorkspace, /onClick=\{\(\) => void loadSnapshot\(\)\}/);
});

const readinessStatusBar = readFileSync(
  "app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-readiness-status-bar.tsx",
  "utf8",
);

test("session header action cluster is constrained on phones and remains compact from tablet widths", () => {
  assert.match(
    sessionWorkspace,
    /flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:shrink-0/,
  );
  // The readiness cluster moved into SessionReadinessStatusBar; the phone contract did not
  // change: full width and wrapping below sm, compact and inline from sm up.
  assert.match(readinessStatusBar, /min-h-9 w-full flex-wrap items-center/);
  assert.match(readinessStatusBar, /sm:h-9 sm:w-auto sm:flex-nowrap/);
  assert.match(sessionWorkspace, /min-w-0 flex-1 sm:min-w-\[18rem\]/);
});

test("quantity contract accepts blank, positive, and maximum values and rejects every invalid edge", () => {
  assert.equal(parseSessionRequirementQuantity(""), null);
  assert.equal(parseSessionRequirementQuantity("   "), null);
  assert.equal(parseSessionRequirementQuantity("1"), 1);
  assert.equal(parseSessionRequirementQuantity(String(SESSION_REQUIREMENT_QUANTITY_MAX)), SESSION_REQUIREMENT_QUANTITY_MAX);

  for (const value of [
    "0",
    "-1",
    "1.5",
    "abc",
    "1e3",
    String(SESSION_REQUIREMENT_QUANTITY_MAX + 1),
    "999999999999999999999999999999999999",
  ]) {
    assert.throws(
      () => parseSessionRequirementQuantity(value),
      (error: unknown) => error instanceof SessionRequirementQuantityError,
      value,
    );
  }
});

test("the full AV workspace rejects invalid quantity text before PATCH or success", () => {
  assert.match(sessionWorkspace, /parseSessionRequirementQuantity/);
  assert.match(sessionWorkspace, /item\.hasQuantity \? \(/);
  assert.match(sessionWorkspace, /type="number"/);
  assert.doesNotMatch(sessionWorkspace, /maxLength=\{?6\}?/);
  const workspaceSave = sourceBetween(
    sessionWorkspace,
    "async function handleSave()",
    "function handleWorkspaceSave",
  );
  assert.ok(
    workspaceSave.indexOf("const selections = requirementSelections()") <
      workspaceSave.indexOf("await fetch("),
  );
  assert.ok(
    workspaceSave.indexOf('setNotice("Session saved.")') >
      workspaceSave.indexOf("if (!response.ok)"),
  );
});

test("the Matrix quick AV editor selects requirements and delegates quantity entry to the full workspace", () => {
  const avQuickPanel = sourceBetween(
    detailsDrawer,
    'if (activeQuickPanel === "av")',
    'if (activeQuickPanel === "fnb")',
  );
  assert.match(avQuickPanel, /actionLabel="Add"/);
  assert.match(avQuickPanel, /actionLabel="Remove"/);
  assert.match(avQuickPanel, /Quantity can be set in the full workspace/);
  assert.doesNotMatch(avQuickPanel, /type="number"/);
  assert.doesNotMatch(avQuickPanel, /onQuantityChange/);
});

test("server-side AV and structured requirement writes enforce the same persisted maximum", () => {
  for (const source of [sessionService, requirementsService]) {
    assert.match(source, /parseSessionRequirementQuantity/);
    assert.match(source, /SessionRequirementQuantityError/);
  }
});
