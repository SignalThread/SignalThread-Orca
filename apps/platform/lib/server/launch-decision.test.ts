import assert from "node:assert/strict";
import test from "node:test";
import { decideProductLaunch } from "./launch-decision";
import type { OrganizationAccess } from "./organization-access";

/**
 * Behavioural tests for the launch authorization decision.
 *
 * The decision is pure, so each denial is asserted against real inputs rather
 * than a mock of the rule. `getOrganizationAccessForUser` already drops inactive
 * memberships, inactive organizations and inactive entitlements before they get
 * here (see organization-access.test.ts); this file covers what happens with the
 * access that survives.
 */

const ACME = "7437a82f-bdc9-425d-9f1c-5525930b43bd";
const GLOBEX = "9d2a1c3e-1111-4222-8333-444455556666";
const EVENT = "ae9942ba-5759-486b-b591-f1b5ed223370";

const org = (organizationId: string, products: string[]): OrganizationAccess => ({
  organizationId,
  organizationSlug: organizationId === ACME ? "acme-events" : "globex-summits",
  organizationName: organizationId === ACME ? "Acme Events" : "Globex Summits",
  organizationRole: "MEMBER",
  products,
});

const acmeEvent = { id: EVENT, organization_id: ACME, status: "ACTIVE" };

test("ACTIVE Pulse entitlement on the event's organization authorizes the launch", () => {
  const decision = decideProductLaunch({ productKey: "pulse", event: acmeEvent, access: [org(ACME, ["orca", "pulse"])] });
  assert.deepEqual(decision, { status: "AUTHORIZED", organizationId: ACME, eventId: EVENT, productKey: "pulse" });
});

test("a missing event is denied before any membership is consulted", () => {
  const decision = decideProductLaunch({ productKey: "pulse", event: null, access: [org(ACME, ["pulse"])] });
  assert.equal(decision.status, "DENIED");
  assert.equal(decision.status === "DENIED" && decision.reason, "EVENT_NOT_FOUND");
});

test("an archived event cannot be launched even by an entitled member", () => {
  const decision = decideProductLaunch({
    productKey: "pulse",
    event: { ...acmeEvent, status: "ARCHIVED" },
    access: [org(ACME, ["pulse"])],
  });
  assert.equal(decision.status === "DENIED" && decision.reason, "EVENT_NOT_LAUNCHABLE");
});

test("no access to the owning organization denies as ORG_NOT_MEMBER", () => {
  // Inactive membership and inactive organization both surface as absent access.
  const decision = decideProductLaunch({ productKey: "pulse", event: acmeEvent, access: [] });
  assert.equal(decision.status === "DENIED" && decision.reason, "ORG_NOT_MEMBER");
});

test("the event-owned organization is authoritative: entitlement elsewhere does not help", () => {
  // The user is entitled to Pulse in Globex, but the event belongs to Acme, where
  // they are not a member. A client cannot substitute Globex: no organization id is
  // an input at all.
  const decision = decideProductLaunch({ productKey: "pulse", event: acmeEvent, access: [org(GLOBEX, ["pulse"])] });
  assert.equal(decision.status === "DENIED" && decision.reason, "ORG_NOT_MEMBER");
});

test("membership without a Pulse entitlement is denied as PRODUCT_NOT_ENTITLED", () => {
  const decision = decideProductLaunch({ productKey: "pulse", event: acmeEvent, access: [org(ACME, ["orca"])] });
  assert.equal(decision.status === "DENIED" && decision.reason, "PRODUCT_NOT_ENTITLED");
});

test("an inactive Pulse entitlement never appears in derived access, so it is denied", () => {
  // deriveOrganizationAccess drops SUSPENDED entitlements; the decision sees the
  // organization with only its ACTIVE products.
  const decision = decideProductLaunch({ productKey: "pulse", event: acmeEvent, access: [org(ACME, [])] });
  assert.equal(decision.status === "DENIED" && decision.reason, "PRODUCT_NOT_ENTITLED");
});

test("the authorized organization is the event's, not the first one in access", () => {
  const decision = decideProductLaunch({
    productKey: "pulse",
    event: acmeEvent,
    access: [org(GLOBEX, ["pulse"]), org(ACME, ["pulse"])],
  });
  assert.equal(decision.status === "AUTHORIZED" && decision.organizationId, ACME);
});

test("the product key is normalised, so casing cannot bypass the entitlement check", () => {
  const decision = decideProductLaunch({ productKey: " Pulse ", event: acmeEvent, access: [org(ACME, ["pulse"])] });
  assert.equal(decision.status, "AUTHORIZED");
  assert.equal(decision.status === "AUTHORIZED" && decision.productKey, "pulse");
});

test("the decision takes no organization id and no return target from anywhere", () => {
  // Structural: the input type has exactly these keys.
  const decision = decideProductLaunch({ productKey: "pulse", event: acmeEvent, access: [org(ACME, ["pulse"])] });
  assert.deepEqual(Object.keys(decision).sort(), ["eventId", "organizationId", "productKey", "status"]);
});
