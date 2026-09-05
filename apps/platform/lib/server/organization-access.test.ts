import assert from "node:assert/strict";
import test from "node:test";
import { deriveOrganizationAccess } from "./organization-access";

const ACME = "7437a82f-bdc9-425d-9f1c-5525930b43bd";
const GLOBEX = "9d2a1c3e-1111-4222-8333-444455556666";

const membership = (organizationId: string, o: { status?: string; orgStatus?: string; role?: string } = {}) => ({
  organization_id: organizationId,
  role: o.role ?? "MEMBER",
  status: o.status ?? "ACTIVE",
  organization: {
    id: organizationId,
    slug: organizationId === ACME ? "acme-events" : "globex-summits",
    name: organizationId === ACME ? "Acme Events" : "Globex Summits",
    status: o.orgStatus ?? "ACTIVE",
  },
});

test("an ACTIVE membership of an ACTIVE org carries its ACTIVE entitlements", () => {
  const access = deriveOrganizationAccess(
    [membership(ACME, { role: "OWNER" })],
    [
      { organization_id: ACME, product_key: "orca", status: "ACTIVE" },
      { organization_id: ACME, product_key: "PULSE", status: "ACTIVE" },
    ],
  );
  assert.deepEqual(access, [
    { organizationId: ACME, organizationSlug: "acme-events", organizationName: "Acme Events", organizationRole: "OWNER", products: ["orca", "pulse"] },
  ]);
});

test("an inactive membership grants nothing", () => {
  for (const status of ["INVITED", "SUSPENDED"]) {
    const access = deriveOrganizationAccess(
      [membership(ACME, { status })],
      [{ organization_id: ACME, product_key: "pulse", status: "ACTIVE" }],
    );
    assert.deepEqual(access, [], `${status} membership must not derive access`);
  }
});

test("an inactive organization grants nothing even with an ACTIVE membership", () => {
  const access = deriveOrganizationAccess(
    [membership(ACME, { orgStatus: "SUSPENDED" })],
    [{ organization_id: ACME, product_key: "pulse", status: "ACTIVE" }],
  );
  assert.deepEqual(access, []);
});

test("a membership whose organization row is missing grants nothing", () => {
  const access = deriveOrganizationAccess(
    [{ ...membership(ACME), organization: null }],
    [{ organization_id: ACME, product_key: "pulse", status: "ACTIVE" }],
  );
  assert.deepEqual(access, []);
});

test("an inactive entitlement is dropped but the membership remains, with no products", () => {
  const access = deriveOrganizationAccess(
    [membership(ACME)],
    [
      { organization_id: ACME, product_key: "orca", status: "ACTIVE" },
      { organization_id: ACME, product_key: "pulse", status: "SUSPENDED" },
    ],
  );
  assert.deepEqual(access.map((a) => a.products), [["orca"]]);
});

test("an entitlement on another organization does not leak across", () => {
  const access = deriveOrganizationAccess(
    [membership(ACME)],
    [{ organization_id: GLOBEX, product_key: "pulse", status: "ACTIVE" }],
  );
  assert.deepEqual(access.map((a) => a.products), [[]]);
});

test("output is ordered by organization id and products are de-duplicated", () => {
  const access = deriveOrganizationAccess(
    [membership(GLOBEX), membership(ACME)],
    [
      { organization_id: ACME, product_key: "pulse", status: "ACTIVE" },
      { organization_id: ACME, product_key: "pulse", status: "ACTIVE" },
    ],
  );
  assert.deepEqual(access.map((a) => a.organizationId), [ACME, GLOBEX]);
  assert.deepEqual(access[0].products, ["pulse"]);
});
