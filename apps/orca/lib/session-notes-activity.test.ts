import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const service = readFileSync("lib/session-activity.ts", "utf8");
const component = readFileSync(
  "app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-notes-activity.tsx",
  "utf8",
);
const workspace = readFileSync(
  "app/(shell)/events/[eventId]/matrix/sessions/[sessionId]/_components/session-detail-workspace.tsx",
  "utf8",
);
const route = readFileSync(
  "app/api/events/[eventId]/matrix-2/sessions/[sessionId]/activity/route.ts",
  "utf8",
);

test("the Phase 1 placeholder and bare textarea are gone", () => {
  assert.doesNotMatch(workspace, /Session-scoped activity is not expanded in Phase 1/);
  assert.match(workspace, /<SessionNotesActivity/);
});

test("notes are a labelled field with a placeholder, not an unexplained box", () => {
  assert.match(component, /<label htmlFor=\{notesFieldId\}[\s\S]{0,120}Session Notes/);
  assert.match(component, /placeholder="Add planning notes for this session/);
  assert.match(component, /aria-describedby=\{notesHintId\}/);
});

test("save state, unsaved changes, failure, and retry are all visible", () => {
  assert.match(component, /const hasUnsavedChanges = notes !== persistedNotes/);
  assert.match(component, /Unsaved changes/);
  assert.match(component, /All changes saved/);
  assert.match(component, /Saving…/);
  assert.match(component, /role="alert"/);
  assert.match(component, /Retry save/);
  // Unsaved notes survive an accidental reload.
  assert.match(component, /beforeunload/);
});

test("the save button is disabled when there is nothing to save", () => {
  assert.match(component, /disabled=\{isSaving \|\| !hasUnsavedChanges\}/);
});

test("last editor and time come from the canonical activity record, not a static timestamp", () => {
  assert.match(service, /lastNotesUpdate/);
  assert.match(service, /change\.field === "notes"/);
  assert.match(component, /Notes last changed \$\{timestamp\(activity\.lastNotesUpdate\.at\)\} by/);
});

test("activity is read from EventActivity scoped to this event and session", () => {
  assert.match(service, /prisma\.eventActivity\.findMany/);
  assert.match(service, /eventType|entityType: "MatrixRow"/);
  assert.match(service, /entityId: sessionId/);
  // eventId is in the filter so a session id from another event cannot leak in.
  assert.match(service, /eventId,\s*\n\s*entityType: "MatrixRow"/);
  // No synthesised entries and no event-wide fallback.
  assert.doesNotMatch(service, /\.create\(|\.upsert\(/);
});

test("the activity route enforces event read access", () => {
  assert.match(route, /assertEventAccessForUser\(eventId, authResult\.user, "read"\)/);
});

test("an empty or failed timeline is never presented as a clean history", () => {
  assert.match(component, /No changes have been recorded against this session yet\./);
  assert.match(component, /This is a loading failure, not an empty history\./);
  assert.match(component, /What this timeline covers/);
  assert.match(service, /excludes: \[/);
});

test("external information is kept separate from planner notes", () => {
  assert.match(component, /shown separately with its source, never blended in here/);
});
