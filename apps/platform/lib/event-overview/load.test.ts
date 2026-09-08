import assert from "node:assert/strict";
import test from "node:test";
import { loadAuthorizedEventOverview, type OverviewRegistry } from "./load";
import { overviewFixture } from "./test-fixtures";

const fixture = overviewFixture();
function registry(): OverviewRegistry {
  return {
    async getAccess() { return [{ organizationId: fixture.organization.id, organizationName: fixture.organization.name, organizationSlug: fixture.organization.slug, organizationRole: "OWNER", products: ["orca", "pulse"] }]; },
    async readEvent() { return { id: fixture.event.id, slug: fixture.event.slug, name: fixture.event.name, status: fixture.event.status, starts_at: fixture.event.startsAt, ends_at: fixture.event.endsAt, organization_id: fixture.organization.id }; },
    async getProductNames() { return new Map(); },
    getProductAppUrl: () => "https://product.example",
    buildLaunchHref: fixture.launchHrefFor,
  };
}
const input = { userId: "viewer", eventId: fixture.event.id, platformAdmin: false, now: fixture.now };

test("unauthorized and unknown events do not load product facts or expose organization data", async () => {
  for (const kind of ["not-member", "unknown"]) {
    const reads = registry();
    if (kind === "not-member") reads.getAccess = async () => [];
    else reads.readEvent = async () => null;
    reads.getProductNames = async () => { assert.fail("no product reads before authorization"); };
    const model = await loadAuthorizedEventOverview({ ...input, feedSource: { async getFeeds() { assert.fail("no feeds before authorization"); } } }, reads);
    assert.equal(model, null);
  }
});

test("malformed ids never reach the registry", async () => {
  const reads = registry();
  reads.getAccess = async () => { assert.fail("invalid id queried"); };
  reads.readEvent = async () => { assert.fail("invalid id queried"); };
  assert.equal(await loadAuthorizedEventOverview({ ...input, eventId: "../../another-event" }, reads), null);
});

test("sources get only the authorized event, owning organization and active entitlements", async () => {
  const expected = { organizationId: fixture.organization.id, eventId: fixture.event.id, productKeys: ["orca", "pulse"] };
  const model = await loadAuthorizedEventOverview({
    ...input,
    feedSource: { async getFeeds(scope) { assert.deepEqual(scope, expected); return {}; } },
    insightSource: { async getInsights(scope) { assert.deepEqual(scope, expected); return []; } },
  }, registry());
  assert.ok(model);
  assert.deepEqual(model.products.map((p) => p.key), ["orca", "pulse"]);
  assert.equal(model.event.venue, null, "pre-migration events still load");
  assert.equal(model.event.timezone, null);
  assert.ok(model.products.every((p) => p.fact.kind === "unavailable" && p.status.kind === "available"));
});

test("registry and source errors propagate to the route error boundary rather than fabricate empty success", async () => {
  const reads = registry();
  reads.readEvent = async () => { throw new Error("registry unavailable"); };
  await assert.rejects(loadAuthorizedEventOverview(input, reads), /registry unavailable/);
  await assert.rejects(loadAuthorizedEventOverview({ ...input, feedSource: { async getFeeds() { throw new Error("feed unavailable"); } } }, registry()), /feed unavailable/);
});
