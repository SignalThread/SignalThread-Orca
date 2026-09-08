import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  buildBrowserFacingUrl,
  getBrowserFacingOrigin
} from "../lib/http/browser-facing-url";
import { createGoogleOAuthState, verifyGoogleOAuthState } from "../lib/integrations/google/oauth-state";
import { buildGoogleOAuthResultUrl } from "../lib/integrations/google/redirect";

test("login started on localhost never redirects to the 0.0.0.0 bind address", () => {
  const request = new Request("http://0.0.0.0:3000/login", {
    headers: { host: "localhost:3000" }
  });

  assert.equal(getBrowserFacingOrigin(request), "http://localhost:3000");
  assert.equal(
    buildBrowserFacingUrl(request, "/exhibitor/integrations/google-workspace").href,
    "http://localhost:3000/exhibitor/integrations/google-workspace"
  );
});

test("non-bind local, preview, and production request origins are preserved", () => {
  const localhost = new Request("http://localhost:3000/login");
  const preview = new Request("https://lead-retrieval-git-feature.example.vercel.app/login");
  const production = new Request("https://lr.signalthread.ai/login");

  assert.equal(getBrowserFacingOrigin(localhost), "http://localhost:3000");
  assert.equal(
    getBrowserFacingOrigin(preview),
    "https://lead-retrieval-git-feature.example.vercel.app"
  );
  assert.equal(getBrowserFacingOrigin(production), "https://lr.signalthread.ai");
});

test("middleware, auth routing, and Google callback share the canonical URL builder", () => {
  for (const file of [
    "lib/supabase/middleware.ts",
    "app/auth/server-callback/route.ts",
    "app/api/auth/exhibitor-web-entry/route.ts",
    "app/api/admin/account-context/route.ts",
    "lib/integrations/google/redirect.ts"
  ]) {
    assert.match(readFileSync(file, "utf8"), /buildBrowserFacingUrl/);
  }
});

test("Google callback keeps the signed return path on the Workspace management page", () => {
  const secret = "test-secret-that-is-at-least-thirty-two-bytes-long";
  const { state } = createGoogleOAuthState({
    userId: "user-1",
    companyId: "company-1",
    returnTo: "/exhibitor/integrations/google-workspace",
    now: new Date("2026-07-30T12:00:00.000Z"),
    secret
  });
  const payload = verifyGoogleOAuthState(state, {
    now: new Date("2026-07-30T12:01:00.000Z"),
    secret
  });
  const request = new Request("http://0.0.0.0:3000/api/integrations/google/callback", {
    headers: { host: "localhost:3000" }
  });

  assert.equal(
    buildGoogleOAuthResultUrl(request, payload.returnTo, "connected").href,
    "http://localhost:3000/exhibitor/integrations/google-workspace?google=connected"
  );

  const source = readFileSync("app/api/integrations/google/callback/route.ts", "utf8");
  assert.match(source, /buildGoogleOAuthResultUrlForState\(request, target, result\)/);
  assert.match(source, /redirectWithResult\([\s\S]*request,[\s\S]*payload,[\s\S]*capabilities\.calendarFreeBusy \? "connected" : "permission_required"/);
});
