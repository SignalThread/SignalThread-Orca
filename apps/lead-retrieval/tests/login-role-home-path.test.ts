import test from "node:test";
import assert from "node:assert/strict";
import { EXHIBITOR_WEB_ENTRY_RESOLVER_PATH } from "../lib/exhibitor/exhibitor-web-home";
import { roleHomePath } from "../app/(public)/login/role-home-path";

test("roleHomePath maps platform_admin to /admin", () => {
  assert.equal(roleHomePath("platform_admin"), "/admin");
  assert.equal(roleHomePath("PLATFORM_ADMIN"), "/admin");
});

test("roleHomePath maps organizer variants to /app/organizer", () => {
  assert.equal(roleHomePath("event_organizer"), "/app/organizer");
  assert.equal(roleHomePath("organizer_admin"), "/app/organizer");
  assert.equal(roleHomePath("organizer"), "/app/organizer");
});

test("roleHomePath maps exhibitor_admin to the web entry resolver (permissions-aware redirect)", () => {
  assert.equal(roleHomePath("exhibitor_admin"), EXHIBITOR_WEB_ENTRY_RESOLVER_PATH);
});

test("roleHomePath maps exhibitor_viewer to the web entry resolver (permissions-aware redirect)", () => {
  assert.equal(roleHomePath("exhibitor_viewer"), EXHIBITOR_WEB_ENTRY_RESOLVER_PATH);
  assert.equal(roleHomePath("EXHIBITOR_VIEWER"), EXHIBITOR_WEB_ENTRY_RESOLVER_PATH);
  assert.equal(roleHomePath("  exhibitor_viewer  "), EXHIBITOR_WEB_ENTRY_RESOLVER_PATH);
});

test("roleHomePath falls back to /login?error=role for unknown/missing roles", () => {
  assert.equal(roleHomePath(""), "/login?error=role");
  assert.equal(roleHomePath(null), "/login?error=role");
  assert.equal(roleHomePath(undefined), "/login?error=role");
  assert.equal(roleHomePath("viewer"), "/login?error=role");
  assert.equal(roleHomePath("exhibitor"), "/login?error=role");
});
