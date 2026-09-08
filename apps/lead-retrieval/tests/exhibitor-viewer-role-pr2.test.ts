/**
 * PR2 regression suite for the `exhibitor_viewer` role (exhibitor-side view-only).
 *
 * Pure helpers (`lib/auth/role-scope.ts`) are unit-tested directly. Module
 * code that drags Next.js / Supabase server runtime imports
 * (`lib/auth/session.ts`, `lib/supabase/middleware.ts`, the various
 * auth-callback and exhibitor pages) is verified with source-level
 * assertions, mirroring how the rest of the suite already pins these
 * surfaces.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  isExhibitorAdminRole,
  isExhibitorScopedRole,
  isExhibitorViewerRole
} from "../lib/auth/role-scope";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

test("isExhibitorViewerRole only matches the literal 'exhibitor_viewer'", () => {
  assert.equal(isExhibitorViewerRole("exhibitor_viewer"), true);
  assert.equal(isExhibitorViewerRole("exhibitor_admin"), false);
  assert.equal(isExhibitorViewerRole("platform_admin"), false);
  assert.equal(isExhibitorViewerRole("organizer_admin"), false);
  assert.equal(isExhibitorViewerRole(null), false);
  assert.equal(isExhibitorViewerRole(undefined), false);
  assert.equal(isExhibitorViewerRole(""), false);
  assert.equal(isExhibitorViewerRole("EXHIBITOR_VIEWER"), false);
});

test("isExhibitorAdminRole only matches 'exhibitor_admin'", () => {
  assert.equal(isExhibitorAdminRole("exhibitor_admin"), true);
  assert.equal(isExhibitorAdminRole("exhibitor_viewer"), false);
  assert.equal(isExhibitorAdminRole("platform_admin"), false);
  assert.equal(isExhibitorAdminRole("organizer_admin"), false);
  assert.equal(isExhibitorAdminRole(null), false);
  assert.equal(isExhibitorAdminRole(undefined), false);
});

test("isExhibitorScopedRole matches both exhibitor_admin and exhibitor_viewer, nothing else", () => {
  assert.equal(isExhibitorScopedRole("exhibitor_admin"), true);
  assert.equal(isExhibitorScopedRole("exhibitor_viewer"), true);
  assert.equal(isExhibitorScopedRole("platform_admin"), false);
  assert.equal(isExhibitorScopedRole("organizer_admin"), false);
  assert.equal(isExhibitorScopedRole("viewer"), false);
  assert.equal(isExhibitorScopedRole(null), false);
  assert.equal(isExhibitorScopedRole(undefined), false);
});

test("types/app.ts exposes 'exhibitor_viewer' in the AppRole union", () => {
  const src = read("types/app.ts");
  assert.match(
    src,
    /export\s+type\s+AppRole\s*=[^;]*"exhibitor_viewer"/,
    "AppRole must include 'exhibitor_viewer'"
  );
  for (const role of [
    "platform_admin",
    "organizer_admin",
    "exhibitor_admin",
    "viewer"
  ]) {
    assert.match(src, new RegExp(`"${role}"`), `AppRole must keep ${role}`);
  }
});

test("lib/auth/session.ts normalizes 'exhibitor_viewer' and routes home via the exhibitor web entry resolver", () => {
  const src = read("lib/auth/session.ts");

  assert.match(
    src,
    /APP_ROLES\s*=\s*\[[^\]]*"exhibitor_viewer"[^\]]*\]\s*as\s+const/,
    "APP_ROLES must contain 'exhibitor_viewer'"
  );

  assert.match(
    src,
    /EXHIBITOR_WEB_ENTRY_RESOLVER_PATH/,
    "getRoleHomePath must use EXHIBITOR_WEB_ENTRY_RESOLVER_PATH for exhibitor roles (permissions resolved server-side)"
  );

  assert.match(
    src,
    /export\s+async\s+function\s+requireExhibitorScope\s*\(\s*\)/,
    "requireExhibitorScope() must be exported"
  );
  const fn = src
    .split("export async function requireExhibitorScope")[1]
    ?.split("\n}\n")[0];
  assert.ok(fn, "requireExhibitorScope body must be present");
  assert.match(
    fn!,
    /normalizedRole\s*===\s*"exhibitor_admin"\s*\|\|\s*normalizedRole\s*===\s*"exhibitor_viewer"/,
    "requireExhibitorScope must allow exhibitor_admin OR exhibitor_viewer"
  );
  assert.match(fn!, /redirect\(\s*"\/admin"\s*\)/);
  assert.match(fn!, /redirect\(\s*"\/app\/organizer"\s*\)/);
});

test("app/(public)/login/role-home-path.ts maps exhibitor_viewer to the web entry resolver", () => {
  const src = read("app/(public)/login/role-home-path.ts");
  assert.match(
    src,
    /exhibitor_viewer"[\s\S]*?EXHIBITOR_WEB_ENTRY_RESOLVER_PATH/,
    "roleHomePath() must route exhibitor_viewer through EXHIBITOR_WEB_ENTRY_RESOLVER_PATH"
  );
});

test("app/auth/server-callback/route.ts routes exhibitors via getExhibitorWebEntryPathAfterSignIn (company + permissions)", () => {
  const src = read("app/auth/server-callback/route.ts");
  assert.match(
    src,
    /value\s*===\s*"exhibitor_viewer"[\s\S]*?return\s+"exhibitor_viewer"/,
    "server-callback normalizeRole must accept exhibitor_viewer"
  );
  assert.match(
    src,
    /getExhibitorWebEntryPathAfterSignIn/,
    "server-callback must resolve exhibitor post-auth path via getExhibitorWebEntryPathAfterSignIn"
  );
  assert.match(src, /select\("role, company_id"\)/, "user lookup must include company_id for exhibitor entry");
});

test("app/auth/callback/page.tsx routes exhibitors to the web entry resolver (hash flow)", () => {
  const src = read("app/auth/callback/page.tsx");
  assert.match(
    src,
    /exhibitor_viewer"[\s\S]*?EXHIBITOR_WEB_ENTRY_RESOLVER_PATH/,
    "client callback must route exhibitor_viewer to EXHIBITOR_WEB_ENTRY_RESOLVER_PATH"
  );
});

test("middleware allows exhibitor_viewer on /app/exhibitor/* (and only there)", () => {
  const src = read("lib/supabase/middleware.ts");

  assert.match(
    src,
    /isExhibitorRoute\s*&&\s*role\s*!==\s*"exhibitor_admin"\s*&&\s*role\s*!==\s*"exhibitor_viewer"/,
    "middleware exhibitor branch must whitelist BOTH exhibitor_admin and exhibitor_viewer"
  );

  assert.match(
    src,
    /isAdminRoute\s*&&\s*role\s*!==\s*"platform_admin"/,
    "admin branch must remain platform_admin-only at the gate"
  );
  assert.match(
    src,
    /isOrganizerRoute\s*&&\s*role\s*!==\s*"organizer_admin"/,
    "organizer branch must remain organizer_admin-only at the gate"
  );

  const adminBranch = src
    .split("if (isAdminRoute && role !== \"platform_admin\") {")[1]
    ?.split("\n  }\n\n  if (isOrganizerRoute")[0];
  assert.ok(adminBranch, "admin branch body must be parseable");
  assert.doesNotMatch(
    adminBranch!,
    /"exhibitor_viewer"/,
    "admin gate must not whitelist exhibitor_viewer for any admin surface"
  );
});

test("dashboard/leads/leads-detail pages use requireExhibitorScope() (not requireRole)", () => {
  const pages = [
    "app/(app)/exhibitor/dashboard/page.tsx",
    "app/(app)/exhibitor/leads/page.tsx",
    "app/(app)/exhibitor/leads/[leadId]/page.tsx"
  ];
  for (const rel of pages) {
    const src = read(rel);
    assert.match(
      src,
      /import\s*\{[^}]*requireExhibitorScope[^}]*\}\s*from\s*"@\/lib\/auth\/session"/,
      `${rel} must import requireExhibitorScope`
    );
    assert.match(
      src,
      /await\s+requireExhibitorScope\s*\(\s*\)/,
      `${rel} must call requireExhibitorScope()`
    );
    assert.doesNotMatch(
      src,
      /requireRole\s*\(\s*"exhibitor_admin"\s*\)/,
      `${rel} must NOT call requireRole("exhibitor_admin") (would lock out exhibitor_viewer)`
    );
    assert.match(
      src,
      /isExhibitorAdminRole\s*\(\s*sessionUser\.role\s*\)\s*&&\s*hasWeb/,
      `${rel} must derive canEdit from role + web admin permission`
    );
  }
});

test("dashboard hides Create Event link for exhibitor_viewer (canManage-gated)", () => {
  const src = read("app/(app)/exhibitor/dashboard/page.tsx");
  assert.match(
    src,
    /createEventHref\s*=\s*[\s\S]*?canManage\s*&&[\s\S]*?access\.role\s*===\s*"exhibitor_admin"[\s\S]*?exhibitorAdminMayUseAppEventManagementRoutes/,
    "createEventHref must be gated on canManage and the event-management route helper"
  );
});

test("lead detail hides EnrichLeadForm and threads canEdit into ExhibitorLeadProfileCard", () => {
  const src = read("app/(app)/exhibitor/leads/[leadId]/page.tsx");
  assert.match(
    src,
    /toolbarEnrich=\{\s*canEdit\s*\?\s*\(\s*<EnrichLeadForm/,
    "EnrichLeadForm must only render when canEdit"
  );
  assert.match(
    src,
    /<ExhibitorLeadProfileCard[\s\S]*?canEdit=\{\s*canEdit\s*\}/,
    "ExhibitorLeadProfileCard must receive canEdit"
  );
});

test("leads list threads canEdit into the inner LeadsTable + ExhibitorLeadsTable", () => {
  const src = read("app/(app)/exhibitor/leads/page.tsx");
  assert.match(
    src,
    /<LeadsTable[\s\S]*?canEdit=\{\s*canEdit\s*\}/,
    "LeadsTable must receive canEdit from the page"
  );
  assert.match(
    src,
    /<ExhibitorLeadsTable[\s\S]*?canEdit=\{\s*canEdit\s*\}/,
    "ExhibitorLeadsTable must receive canEdit"
  );
});

test("ExhibitorLeadsTable accepts and gates write affordances on `canEdit`", () => {
  const src = read("components/leads/exhibitor-leads-table.tsx");

  assert.match(src, /canEdit\s*\?:\s*boolean/);
  assert.match(src, /canEdit\s*=\s*true/);
  assert.match(
    src,
    /\{\s*canDelete\s*&&\s*bulkScope\.mode\s*!==\s*"none"\s*\?/,
    "BulkBar must be gated on canDelete"
  );
  assert.match(
    src,
    /\{\s*canDelete\s*\?\s*\([\s\S]*?Select all in view/,
    "Select all in view checkbox must be gated on canDelete"
  );
  assert.match(
    src,
    /\{\s*canDelete\s*\?\s*\(\s*<button[\s\S]*?setDeleteIntent\(\{\s*mode:\s*"single"[\s\S]*?Delete\s*<\/button>/,
    "per-row Delete button must be gated on canDelete"
  );
  assert.match(
    src,
    /\{\s*canEdit\s*\?\s*\(\s*<>[\s\S]*?CardRatingEditor[\s\S]*?LeadTemperatureSegmentedControl[\s\S]*?LeadCardDateField[\s\S]*?<\/>\s*\)\s*:\s*\(\s*<LeadCardReadOnlyMetrics/,
    "inline editors must be replaced with LeadCardReadOnlyMetrics when canEdit is false"
  );
});

test("ExhibitorLeadProfileCard gates writes and toolbar handlers on canEdit", () => {
  const src = read("components/leads/exhibitor-lead-profile-card.tsx");
  assert.match(src, /canEdit\s*\?:\s*boolean/);
  assert.match(src, /canEdit\s*=\s*true/);
  assert.match(
    src,
    /if\s*\(\s*!\s*canEdit\s*\)\s*\{[\s\S]*?setToolbarHandlers\(\s*null\s*\)/,
    "profile card must skip toolbar handler registration when read-only"
  );
  assert.match(
    src,
    /<fieldset[\s\S]*?disabled=\{\s*!\s*canEdit\s*\}/,
    "profile card body must be wrapped in <fieldset disabled={!canEdit}>"
  );
});

test("exhibitor layout bypasses ExhibitorAccessGate for exhibitor_viewer", () => {
  const src = read("app/(app)/exhibitor/layout.tsx");
  assert.match(
    src,
    /if\s*\(\s*isExhibitorViewerRole\s*\(\s*sessionUser\.role\s*\)\s*\)\s*\{[\s\S]*?return\s+children/,
    "layout must early-return children for exhibitor_viewer, skipping the events gate"
  );
});

test("sidebar restricts exhibitor_viewer nav to Dashboard + Leads with no sub-items", () => {
  const src = read("components/layout/sidebar.tsx");
  assert.match(
    src,
    /role\s*===\s*"exhibitor_viewer"[\s\S]*?\/exhibitor\/dashboard[\s\S]*?\/exhibitor\/leads/,
    "sidebar must keep only Dashboard + Leads when role === 'exhibitor_viewer'"
  );
  assert.match(
    src,
    /item\.href\s*===\s*"\/exhibitor\/leads"\s*\?\s*\{\s*\.\.\.item,\s*subItems:\s*undefined\s*\}/,
    "sidebar must strip Leads sub-items for exhibitor_viewer"
  );
});

test("invite redeem mapper maps permissions to exhibitor_admin / exhibitor_viewer", () => {
  const src = read("lib/server/invites/invite-permissions-public-users-role.ts");
  assert.match(src, /export\s+function\s+publicUsersRoleFromInvitePermissions\b/);
  assert.match(src, /export\s+function\s+assertPublicUsersRoleForInviteRedeemDbWrite\b/);
  assert.match(src, /return\s+"exhibitor_admin"/);
  assert.match(src, /return\s+"exhibitor_viewer"/);
  assert.doesNotMatch(
    src,
    /return\s+"exhibitor"/,
    "mapper must not return legacy public.users role 'exhibitor'"
  );
});

test("normalizeAppRole in exhibitor-context maps exhibitor_viewer → exhibitor_viewer (not viewer)", () => {
  const src = read("lib/data/exhibitor-context.ts");
  assert.match(
    src,
    /value\s*===\s*"exhibitor_viewer"[\s\S]*?return\s+"exhibitor_viewer"/,
    "exhibitor-context normalizeAppRole must preserve exhibitor_viewer"
  );
});
