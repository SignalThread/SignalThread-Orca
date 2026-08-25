import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const PAGE = "app/(shell)/events/[eventId]/activity/page.tsx";
const COMPONENT = "app/(shell)/events/[eventId]/activity/_components/event-activity.tsx";

const pageSource = readFileSync(PAGE, "utf8");
const componentSource = readFileSync(COMPONENT, "utf8");

test("the placeholder page is replaced by the real Activity component", () => {
  assert.equal(pageSource.includes("coming soon"), false, "placeholder copy removed");
  assert.equal(pageSource.includes("EventActivity"), true, "renders the Activity component");
  assert.equal(pageSource.includes("await params"), true, "resolves the event route param");
});

test("the page fetches only the current event's activity endpoint", () => {
  assert.equal(
    componentSource.includes("`/api/events/${eventId}/activity"),
    true,
    "fetches the event-scoped activity API",
  );
  // No cross-event or unscoped fetches, and no mutation verbs.
  assert.equal(/method:\s*["'](POST|PATCH|PUT|DELETE)["']/.test(componentSource), false, "read-only fetch");
});

test("no edit or delete controls exist on the audit log", () => {
  assert.equal(/>\s*(Delete|Edit|Remove)\s*</.test(componentSource), false, "no edit/delete buttons");
  assert.equal(componentSource.toLowerCase().includes("onclick={() => handledelete"), false);
});

test("filters use the label 'Module', never 'Function'", () => {
  assert.equal(componentSource.includes("Module"), true);
  assert.equal(componentSource.includes("Function"), false);
});

test("changing a filter resets pagination to the first page", () => {
  // updateFilter and clearFilters both reset the cursor stack to [null].
  assert.equal(componentSource.includes("setCursorStack([null])"), true);
});

test("filters persist while paging via buildActivityQuery(filters, cursor)", () => {
  assert.equal(componentSource.includes("buildActivityQuery(filters, currentCursor)"), true);
});

test("actor filter options are sourced from event-scoped actors payload", () => {
  assert.equal(componentSource.includes("payload.actors"), true);
  assert.equal(componentSource.includes("setActors"), true);
  assert.equal(componentSource.includes(">\n          Actor"), true);
  assert.equal(componentSource.includes("All actors"), true);
});

test("system/non-user actors render without a user relation", () => {
  assert.equal(componentSource.includes("actorDisplayLabel(entry)"), true);
  assert.equal(componentSource.includes('entry.actorKind !== "USER"'), true);
});

test("change details expand and collapse accessibly", () => {
  assert.equal(componentSource.includes("aria-expanded={isOpen}"), true);
  assert.equal(componentSource.includes("aria-controls={`activity-changes-"), true);
  assert.equal(componentSource.includes("toggleExpanded(entry.id)"), true);
});

test("entries without changes render no expander", () => {
  assert.equal(componentSource.includes("const expandable = hasChanges(entry)"), true);
  assert.equal(componentSource.includes("{expandable ? ("), true);
});

test("empty, filtered-empty, loading, and error states are all handled", () => {
  for (const marker of ['"loading"', '"error"', '"empty-filtered"', '"empty"', '"list"']) {
    assert.equal(componentSource.includes(marker), true, `body state ${marker} handled`);
  }
  assert.equal(componentSource.includes('role="alert"'), true, "error is announced");
  assert.equal(componentSource.includes("No activity yet"), true, "empty-event copy");
  assert.equal(componentSource.includes("No matching activity"), true, "filtered-empty copy");
  assert.equal(
    componentSource.includes("Activity will appear here as changes are recorded"),
    true,
    "empty state explains future activity without implying completeness",
  );
});

test("pagination exposes accessible Previous/Next controls", () => {
  assert.equal(componentSource.includes('aria-label="Activity pagination"'), true);
  assert.equal(/>\s*Previous\s*</.test(componentSource), true);
  assert.equal(/>\s*Next\s*</.test(componentSource), true);
  assert.equal(componentSource.includes("disabled={!nextCursor || isLoading}"), true);
});

test("timestamps use machine-readable datetime", () => {
  assert.equal(componentSource.includes("<time dateTime={entry.createdAt}>"), true);
});

test("expired/malformed cursor recovery returns to the first page", () => {
  assert.equal(componentSource.includes('payload?.code === "INVALID_CURSOR"'), true);
  assert.equal(componentSource.includes("This page link expired"), true);
});
