import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const eventsPageSource = readFileSync("app/(shell)/events/page.tsx", "utf8");
const newEventPageSource = readFileSync("app/(shell)/events/new/page.tsx", "utf8");
const eventApiRouteSource = readFileSync("app/api/events/route.ts", "utf8");
const eventsServiceSource = readFileSync("lib/events.ts", "utf8");
const lifecycleSource = readFileSync("lib/event-lifecycle.ts", "utf8");
const useEventsDataSource = readFileSync("src/hooks/use-events-data.ts", "utf8");
const searchAndFilterSource = readFileSync("components/search-and-filter-bar.tsx", "utf8");

test("/events redirects to Command Center instead of rendering a competing event list", () => {
  assert.equal(eventsPageSource.includes('import { redirect } from "next/navigation"'), true);
  assert.equal(eventsPageSource.includes('redirect("/dashboard")'), true);
  assert.equal(eventsPageSource.includes("useEventsData"), false);
  assert.equal(eventsPageSource.includes("SearchAndFilterBar"), false);
  assert.equal(eventsPageSource.includes("Duplicate Existing Event"), false);
});

test("event creation remains available through the dedicated builder route and API", () => {
  assert.equal(newEventPageSource.includes('import { NewEventBuilder } from "../_components/new-event-builder"'), true);
  assert.equal(eventApiRouteSource.includes("export async function POST"), true);
  assert.equal(eventApiRouteSource.includes("createEventRoute"), true);
  assert.equal(eventApiRouteSource.includes("createEvent({"), true);
  assert.equal(eventsServiceSource.includes("export async function createEvent("), true);
  assert.equal(eventsServiceSource.includes("createEventWithinTransaction"), true);
});

test("event listing APIs and direct workspace routes remain intact", () => {
  assert.equal(eventApiRouteSource.includes("export async function GET"), true);
  assert.equal(eventApiRouteSource.includes("listEventsForUser"), true);
  assert.equal(eventsServiceSource.includes("export async function listEventsForUser"), true);
});

test("shared lifecycle labels replace Draft, Active, and Complete wording", () => {
  assert.equal(lifecycleSource.includes('DRAFT: { label: "Planning"'), true);
  assert.equal(lifecycleSource.includes('ACTIVE: { label: "Live"'), true);
  assert.equal(lifecycleSource.includes('COMPLETED: { label: "Completed"'), true);
  assert.equal(lifecycleSource.includes('CANCELED: { label: "Canceled"'), true);
  assert.equal(useEventsDataSource.includes("EVENT_LIFECYCLE_FILTER_OPTIONS"), true);
  assert.equal(searchAndFilterSource.includes("All visible events"), true);
  assert.equal(searchAndFilterSource.includes("Live"), true);
  assert.equal(searchAndFilterSource.includes("Canceled"), true);
  assert.equal(searchAndFilterSource.includes("All Statuses"), false);
});
