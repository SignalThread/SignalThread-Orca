import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { EXHIBITOR_APP_ACCESS_READY_HREF, EXHIBITOR_WEB_ENTRY_RESOLVER_PATH } from "../lib/exhibitor/exhibitor-web-home";

const root = process.cwd();
function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

test("exhibitor web entry resolver API exists and delegates to getExhibitorWebEntryPathAfterSignIn", () => {
  const src = read("app/api/auth/exhibitor-web-entry/route.ts");
  assert.match(src, /getExhibitorWebEntryPathAfterSignIn/);
  assert.match(src, /NextResponse\.redirect/);
  assert.match(src, /createServerClient/);
  assert.match(src, /copyCookies\(source,\s*target\)/);
  assert.match(
    src,
    /supabase\.auth\.getUser\(\)[\s\S]*buildRedirect\(request,\s*path,\s*response\)/,
    "entry redirect must carry any refreshed auth cookies onto the protected exhibitor navigation"
  );
});

test("getExhibitorWebEntryPathAfterSignIn: web admin and zero-event direct portfolios delegate to the canonical landing resolver", () => {
  const src = read("lib/server/exhibitor-web-entry-redirect.ts");
  assert.match(
    src,
    /hasPortfolioWebAdminAccess/,
    "a direct company portfolio is an authoritative web entry even before event_users exists"
  );
  assert.match(
    src,
    /if\s*\(\s*hasWeb\s*\|\|\s*hasPortfolioWebAdminAccess\s*\)\s*\{[\s\S]*?resolveExhibitorWebAdminLandingPath/,
    "web admin landing uses portfolio vs event-level resolver"
  );
  assert.match(
    src,
    /exhibitorAdminMayUseAppEventManagementRoutes/,
    "zero-event access reuses the canonical server-side portfolio entitlement"
  );
  assert.match(
    src,
    /if\s*\(\s*hasApp\s*\)\s*\{[^}]*return\s+"\/exhibitor\/dashboard"/,
    "app without web admin lands on dashboard (read-only web for app entitlements)"
  );
});

test("resolveExhibitorWebAdminLandingPath: company_all_events uses Manage (/app/events)", () => {
  const src = read("lib/server/exhibitor-web-entry-redirect.ts");
  assert.match(src, /isExhibitorDirectPortfolioEventAccessResolution/);
  assert.match(src, /EXHIBITOR_EVENTS_ENTRY_HREF/);
});

test("exhibitor app-access-ready page: headline + web admins redirected via resolveExhibitorWebAdminLandingPath", () => {
  const src = read("app/(app)/exhibitor/app-access-ready/page.tsx");
  assert.match(src, /Your mobile app access is ready/);
  assert.match(src, /SignalThread Scan/);
  assert.match(src, /resolveExhibitorWebAdminLandingPath/);
});

test("exhibitor dashboard Create Event is gated by web admin or the canonical direct-portfolio entitlement", () => {
  const src = read("app/(app)/exhibitor/dashboard/page.tsx");
  assert.match(src, /getUserHasExhibitorWebAdminAccess/);
  assert.match(
    src,
    /const\s+canManage\s*=[\s\S]*?allowsManagementSurfaces/,
    "first-event affordances use the resolved direct-portfolio entitlement"
  );
  assert.match(
    src,
    /exhibitorShouldPromptEventChoice/,
    "multi-event + no URL/cookie should prompt explicit event choice"
  );
});

test("exhibitor_viewer on requireRole('exhibitor_admin') is sent to /exhibitor/leads", () => {
  const src = read("lib/auth/session.ts");
  assert.match(
    src,
    /isExhibitorViewerRole\(normalizedRole\)[\s\S]*?redirect\("\/exhibitor\/leads"\)/,
    "viewer must not follow exhibitor admin branch"
  );
});

test("next.config rewrites /app-access-ready to exhibitor app-access-ready", () => {
  const src = read("next.config.mjs");
  assert.match(src, /app-access-ready/);
  assert.match(src, /exhibitor\/app-access-ready/);
});

test("app-only post-auth entry uses EXHIBITOR_WEB_ENTRY_RESOLVER_PATH from login/callback (shared constant)", () => {
  for (const rel of [
    "app/(public)/login/role-home-path.ts",
    "app/auth/callback/page.tsx",
    "lib/auth/session.ts"
  ]) {
    const src = read(rel);
    assert.match(src, /EXHIBITOR_WEB_ENTRY_RESOLVER_PATH/);
  }
  assert.equal(EXHIBITOR_WEB_ENTRY_RESOLVER_PATH, "/api/auth/exhibitor-web-entry");
});

test("middleware redirects preserve Supabase cookie writes when auth state changes during request handling", () => {
  const src = read("lib/supabase/middleware.ts");
  assert.match(src, /function copyCookies\(source: NextResponse, target: NextResponse\)/);
  assert.match(src, /const withResponseCookies = \(target: NextResponse\)/);
  assert.match(src, /buildRequestHeadersWithCurrentCookies\(request, requestHeaders\)/);
  assert.match(src, /response = createPassThroughResponse\(\)/);
  assert.match(src, /redirectWithResponseCookies/);
  assert.match(src, /jsonWithResponseCookies/);
});
