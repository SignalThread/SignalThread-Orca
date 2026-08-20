import assert from "node:assert/strict";
import test from "node:test";
import { resolveOrganizationSelection } from "./organization-selection";

test("a user with one accessible organization enters it automatically", () => {
  assert.deepEqual(
    resolveOrganizationSelection({
      accessibleOrgIds: ["org-a"],
      requestedOrgId: null,
      selectedOrgId: null,
    }),
    { status: "OK", activeOrgId: "org-a", shouldPersistSelection: true },
  );
});

test("a multi-organization user needs an explicit selection", () => {
  assert.deepEqual(
    resolveOrganizationSelection({
      accessibleOrgIds: ["org-a", "org-b"],
      requestedOrgId: "org-a",
      selectedOrgId: null,
    }),
    { status: "NEEDS_ORG_SELECTION" },
  );
});

test("a fresh login with no selection cookies always opens the picker for a multi-organization user", () => {
  assert.deepEqual(
    resolveOrganizationSelection({
      accessibleOrgIds: ["org-a", "org-b"],
      requestedOrgId: null,
      selectedOrgId: null,
    }),
    { status: "NEEDS_ORG_SELECTION" },
  );
});

test("a prior selection marker must match the active organization", () => {
  assert.deepEqual(
    resolveOrganizationSelection({
      accessibleOrgIds: ["org-a", "org-b"],
      requestedOrgId: "org-a",
      selectedOrgId: "org-b",
    }),
    { status: "NEEDS_ORG_SELECTION" },
  );
});

test("an explicit authorized selection survives refreshes within the session", () => {
  assert.deepEqual(
    resolveOrganizationSelection({
      accessibleOrgIds: ["org-a", "org-b"],
      requestedOrgId: "org-b",
      selectedOrgId: "org-b",
    }),
    { status: "OK", activeOrgId: "org-b", shouldPersistSelection: false },
  );
});

test("a stale or unauthorized organization id never becomes active", () => {
  assert.deepEqual(
    resolveOrganizationSelection({
      accessibleOrgIds: ["org-a", "org-b"],
      requestedOrgId: "org-c",
      selectedOrgId: "org-c",
    }),
    { status: "NEEDS_ORG_SELECTION" },
  );
});
