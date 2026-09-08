import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

test("exhibitor_viewer event membership resolution filters to permissions.app rows", () => {
  const src = read("lib/server/company-event-access.ts");
  assert.match(
    src,
    /eventMembershipGrantsAppOrAdminSurface\(r\.permissions\)/,
    "viewer event access must use the app/admin event membership entitlement helper"
  );
});

test("leads + dashboard use web admin for canEdit (management), not role alone", () => {
  for (const rel of [
    "app/(app)/exhibitor/leads/page.tsx",
    "app/(app)/exhibitor/dashboard/page.tsx"
  ]) {
    const src = read(rel);
    assert.match(src, /getUserHasExhibitorWebAdminAccess/, `${rel} loads web admin aggregate`);
    assert.match(
      src,
      /isExhibitorAdminRole\([^\n]+\)\s*&&\s*hasWeb/,
      `${rel} gates edit on role AND web admin`
    );
  }
});

test("users page still uses requireRole(exhibitor_admin) (management surface)", () => {
  const users = read("app/(app)/exhibitor/users/page.tsx");
  assert.match(users, /requireRole\s*\(\s*"exhibitor_admin"\s*\)/);
});
