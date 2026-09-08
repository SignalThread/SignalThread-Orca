import test from "node:test";
import assert from "node:assert/strict";
import { resolveCompanyScopedLicenseOwnerWithExplicitHost } from "../lib/licenses/resolve-company-scoped-license-owner";

test("explicit host resolves when organizer ids match", () => {
  const result = resolveCompanyScopedLicenseOwnerWithExplicitHost({
    exhibitorOrganizerId: "org-a",
    hostCompanyId: "host-1",
    hostOrganizerId: "org-a"
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.licenseOwnerCompanyId, "host-1");
  }
});

test("explicit host rejects organizer mismatch", () => {
  const result = resolveCompanyScopedLicenseOwnerWithExplicitHost({
    exhibitorOrganizerId: "org-a",
    hostCompanyId: "host-1",
    hostOrganizerId: "org-b"
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.error, /same organizer/i);
  }
});

test("explicit host rejects empty host id", () => {
  const result = resolveCompanyScopedLicenseOwnerWithExplicitHost({
    exhibitorOrganizerId: "org-a",
    hostCompanyId: "",
    hostOrganizerId: "org-a"
  });
  assert.equal(result.ok, false);
});
