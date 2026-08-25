import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Prompt 4: the paged Budget line-items GET route must stay thin (auth + parse +
// delegate) and read-only. Lock that contract so future edits don't accidentally
// widen access or move filter logic into the handler.
const routeSource = readFileSync("app/api/events/[eventId]/budget/line-items/route.ts", "utf8");
const querySource = readFileSync("app/api/events/[eventId]/budget/_lib/paged-query.ts", "utf8");

test("GET paged line-items route is wired and read-scoped", () => {
  assert.equal(routeSource.includes('export const GET = withApiRequestLogging("GET /api/events/:eventId/budget/line-items", getHandler);'), true);
  // Read access only — this is a read path and must not require write.
  assert.match(routeSource, /requireBudgetRouteAccess\(request, eventId, "read"\)/);
  // Delegates to the service and shared parser instead of building the query inline.
  assert.equal(routeSource.includes("getPagedBudgetLineItems(eventId, query)"), true);
  assert.equal(routeSource.includes("parsePagedLineItemsQuery(request.nextUrl.searchParams)"), true);
});

test("shared paged-query parser validates enum filters and coerces paging", () => {
  // Status/approval come in as free text and must be validated against the enums.
  assert.equal(querySource.includes("function parseStatus("), true);
  assert.equal(querySource.includes("function parseApproval("), true);
  // Page/pageSize are coerced to positive ints (service still clamps/defaults).
  assert.equal(querySource.includes("function parsePositiveInt("), true);
});

test("ids-only route is wired, read-scoped, and shares the filter parser", () => {
  const idsSource = readFileSync("app/api/events/[eventId]/budget/line-items/ids/route.ts", "utf8");
  assert.equal(idsSource.includes('export const GET = withApiRequestLogging("GET /api/events/:eventId/budget/line-items/ids", getHandler);'), true);
  assert.match(idsSource, /requireBudgetRouteAccess\(request, eventId, "read"\)/);
  assert.equal(idsSource.includes("getBudgetLineItemIds(eventId, query)"), true);
  // Reuses the same parser so ids selection matches the visible filtered set.
  assert.equal(idsSource.includes("parsePagedLineItemsQuery(request.nextUrl.searchParams)"), true);
});
