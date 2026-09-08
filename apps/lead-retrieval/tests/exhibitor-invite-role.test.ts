import test from "node:test";
import assert from "node:assert/strict";
import {
  EXHIBITOR_INVITE_ROLE_OPTIONS,
  exhibitorInviteEventUserPermissions,
  exhibitorTeamRoleProductLabel,
  isOrganizerRoleForExhibitorScope,
  normalizeExhibitorInviteAccessType,
  normalizeExhibitorInviteRole
} from "../lib/exhibitor/exhibitor-invite-role";

test("normalizeExhibitorInviteRole accepts canonical db roles", () => {
  assert.equal(normalizeExhibitorInviteRole("exhibitor_admin"), "exhibitor_admin");
  assert.equal(normalizeExhibitorInviteRole("Exhibitor_Admin"), "exhibitor_admin");
  assert.equal(normalizeExhibitorInviteRole("viewer"), "viewer");
});

test("normalizeExhibitorInviteRole accepts wire-level exhibitor_viewer as viewer seat role", () => {
  assert.equal(normalizeExhibitorInviteRole("exhibitor_viewer"), "viewer");
  assert.equal(normalizeExhibitorInviteRole("EXHIBITOR_VIEWER"), "viewer");
});

test("normalizeExhibitorInviteRole rejects organizer/platform roles and junk", () => {
  for (const bad of ["organizer_admin", "platform_admin", "event_organizer", "", "  ", null, undefined, "hacker"]) {
    assert.equal(
      normalizeExhibitorInviteRole(bad as unknown),
      null,
      `expected ${String(bad)} to be rejected`
    );
  }
});

test("exhibitorInviteEventUserPermissions: exhibitor admin with app access", () => {
  assert.deepEqual(
    exhibitorInviteEventUserPermissions({ role: "exhibitor_admin", hasAppAccess: true }),
    { admin: true, app: true }
  );
});

test("exhibitorInviteEventUserPermissions: exhibitor admin with NO app access (role still admin, seat not consumed)", () => {
  assert.deepEqual(
    exhibitorInviteEventUserPermissions({ role: "exhibitor_admin", hasAppAccess: false }),
    { admin: true, app: false }
  );
});

test("exhibitorInviteEventUserPermissions: app user with app access (seat consumed, not admin)", () => {
  assert.deepEqual(
    exhibitorInviteEventUserPermissions({ role: "viewer", hasAppAccess: true }),
    { admin: false, app: true }
  );
});

test("exhibitorInviteEventUserPermissions: app user with NO app access (no admin, no seat)", () => {
  assert.deepEqual(
    exhibitorInviteEventUserPermissions({ role: "viewer", hasAppAccess: false }),
    { admin: false, app: false }
  );
});

test("normalizeExhibitorInviteAccessType defaults to 'app' when omitted", () => {
  assert.deepEqual(normalizeExhibitorInviteAccessType(undefined), { accessType: "app", hasAppAccess: true });
  assert.deepEqual(normalizeExhibitorInviteAccessType(""), { accessType: "app", hasAppAccess: true });
  assert.deepEqual(normalizeExhibitorInviteAccessType("app"), { accessType: "app", hasAppAccess: true });
});

test("normalizeExhibitorInviteAccessType parses 'no_app' explicitly", () => {
  assert.deepEqual(normalizeExhibitorInviteAccessType("no_app"), {
    accessType: "no_app",
    hasAppAccess: false
  });
  assert.deepEqual(normalizeExhibitorInviteAccessType("NO_APP"), {
    accessType: "no_app",
    hasAppAccess: false
  });
});

test("exhibitorTeamRoleProductLabel never surfaces 'Viewer'", () => {
  assert.equal(exhibitorTeamRoleProductLabel("viewer"), "App user");
  assert.equal(exhibitorTeamRoleProductLabel("Viewer"), "App user");
  assert.equal(exhibitorTeamRoleProductLabel("VIEWER"), "App user");
  assert.equal(exhibitorTeamRoleProductLabel(null), "App user");
  assert.equal(exhibitorTeamRoleProductLabel(undefined), "App user");
  assert.equal(exhibitorTeamRoleProductLabel("exhibitor_admin"), "Exhibitor admin");
});

test("EXHIBITOR_INVITE_ROLE_OPTIONS exposes only Exhibitor admin + App user (no 'Viewer' label)", () => {
  assert.equal(EXHIBITOR_INVITE_ROLE_OPTIONS.length, 2);
  const labels = EXHIBITOR_INVITE_ROLE_OPTIONS.map((o) => o.label);
  const values = EXHIBITOR_INVITE_ROLE_OPTIONS.map((o) => o.value);
  assert.deepEqual(values.sort(), ["exhibitor_admin", "viewer"]);
  assert.deepEqual(labels.sort(), ["App user", "Exhibitor admin"]);
  for (const label of labels) {
    assert.notEqual(label.toLowerCase(), "viewer", "UI must never expose the 'Viewer' label");
  }
});

test("isOrganizerRoleForExhibitorScope guards organizer/platform roles from exhibitor mutations", () => {
  assert.equal(isOrganizerRoleForExhibitorScope("organizer_admin"), true);
  assert.equal(isOrganizerRoleForExhibitorScope("platform_admin"), true);
  assert.equal(isOrganizerRoleForExhibitorScope("event_organizer"), true);
  assert.equal(isOrganizerRoleForExhibitorScope("exhibitor_admin"), false);
  assert.equal(isOrganizerRoleForExhibitorScope("viewer"), false);
  assert.equal(isOrganizerRoleForExhibitorScope(null), false);
  assert.equal(isOrganizerRoleForExhibitorScope(""), false);
});
