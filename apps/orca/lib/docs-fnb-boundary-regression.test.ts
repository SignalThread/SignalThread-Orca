import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repoFile = (path: string) => new URL(`../${path}`, import.meta.url);

test("Docs detail and supporting data expose explicit retryable terminal states", async () => {
  const source = await readFile(
    repoFile("app/(shell)/events/[eventId]/docs/_components/event-docs-page.tsx"),
    "utf8",
  );

  assert.match(source, /detailsLoadState === "error" \|\| !selectedDocument/);
  assert.match(source, /detailsLoadError \?\? "Unable to load the document\. Please try again\."/);
  assert.match(source, /onClick=\{\(\) => void loadSelectedDocument\(\)\}/);
  assert.match(source, /documentsLoadState === "error"/);
  assert.match(source, /onClick=\{\(\) => void loadDocuments\(\)\}/);
  assert.match(source, /linkOptionsError/);
  assert.match(source, /uploadCategoriesError/);
  assert.doesNotMatch(source, /errorText = `\$\{errorText\}: \$\{responseText\}`/);
});

test("Docs write routes authorize before parsing invalid JSON", async () => {
  const paths = [
    "app/api/events/[eventId]/documents/route.ts",
    "app/api/events/[eventId]/documents/presign/route.ts",
    "app/api/events/[eventId]/documents/[documentId]/route.ts",
    "app/api/events/[eventId]/documents/[documentId]/approve/route.ts",
    "app/api/events/[eventId]/documents/[documentId]/reject/route.ts",
    "app/api/events/[eventId]/documents/[documentId]/reopen/route.ts",
    "app/api/events/[eventId]/documents/[documentId]/finalize-upload/route.ts",
    "app/api/events/[eventId]/documents/[documentId]/review/submit/route.ts",
    "app/api/events/[eventId]/documents/[documentId]/review/pull-back/route.ts",
  ];

  for (const path of paths) {
    const source = await readFile(repoFile(path), "utf8");
    const accessIndex = source.indexOf("assertEventAccessForUser");
    const bodyIndex = source.indexOf("request.json()", accessIndex);
    assert.ok(accessIndex >= 0, `${path} has an event authorization check`);
    assert.ok(bodyIndex > accessIndex, `${path} authorizes before parsing JSON`);
  }
});

test("F&B read failures preserve last-good state, support retry, and hide provider details", async () => {
  const workspace = await readFile(
    repoFile("app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-detail-workspace.tsx"),
    "utf8",
  );
  const parseRoute = await readFile(
    repoFile("app/api/events/[eventId]/fnb-catalog/parse-menu/route.ts"),
    "utf8",
  );

  assert.match(workspace, /fnbCatalogRequestVersionRef/);
  assert.match(workspace, /fnbAssignmentsRequestVersionRef/);
  assert.match(workspace, /fnbPlanRequestVersionRef/);
  assert.match(workspace, /loadFnbCatalogItems\("retry"\)/);
  assert.match(workspace, /onClick=\{\(\) => void loadFnbAssignments\(\)\}/);
  assert.doesNotMatch(workspace, /menu\.status === "FAILED" && menu\.lastError \? menu\.lastError/);
  assert.match(parseRoute, /lastError: safeError/);
  assert.match(parseRoute, /Menu parsing service is temporarily unavailable\. Please try again\./);
  assert.doesNotMatch(parseRoute, /return NextResponse\.json\(\{ error: error\.message \}, \{ status: 502 \}\)/);
});
