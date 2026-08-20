import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const drawerSource = readFileSync("app/(shell)/matrix-2/_components/Matrix2DetailsDrawer.tsx", "utf8");
const workspaceSource = readFileSync("app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-detail-workspace.tsx", "utf8");

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("all Session Details surfaces render a select backed by the shared option resolver", () => {
  assert.match(drawerSource, /sessionTypeOptionsForSavedValue/);

  const detailsField = sourceBetween(drawerSource, ">Session Type<", ">Room<");
  assert.match(detailsField, /<select/);
  assert.doesNotMatch(detailsField, /<input/);
  assert.match(detailsField, /value=\{sessionType\}/);
  assert.match(detailsField, /setSessionType\(event\.target\.value\)/);
  assert.match(detailsField, /sessionTypeOptions\.map\(\(option\) =>/);
  assert.match(detailsField, /aria-label="Session type"/);

  const fullDetailsField = sourceBetween(
    workspaceSource,
    '<section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Session info">',
    "</section>\n\n          <section>",
  );
  assert.match(fullDetailsField, /<select/);
  assert.doesNotMatch(fullDetailsField, /<input/);
  assert.match(fullDetailsField, /sessionTypeOptionsForSavedValue\(sessionType\)/);
});

test("saving session details includes the selected session type without coercing it", () => {
  const saveHandler = sourceBetween(drawerSource, "async function handleSave(): Promise<void>", "  return (\n    <aside");

  assert.match(saveHandler, /sessionType: sessionType \|\| DEFAULT_SESSION_TYPE/);
  assert.doesNotMatch(saveHandler, /sessionType\.trim/);
  assert.match(saveHandler, /await onSaveEdit\(session\.id/);
});
