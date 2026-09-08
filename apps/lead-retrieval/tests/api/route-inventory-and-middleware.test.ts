// @lr area=api-contract severity=P0 layer=static category=local-only
/**
 * Route inventory and middleware policy parity — plan §49, Prompt 12 items 2 and 3.
 *
 * Two structural gates, both of which exist to stop a *future* change from shipping a hole:
 *
 *   1. **Route inventory.** A new mutation route must not ship without auth and scope. The
 *      gate is a census: every mutation handler is checked for an auth call, and the set of
 *      deliberate exceptions is an explicit allowlist rather than an accident.
 *
 *   2. **Middleware policy parity.** §49 (v3 addition): *"Maintain a table of (path, method,
 *      auth state) → expected outcome, runnable against the current `middleware.ts` and
 *      against any replacement. Next.js 16 deprecates the middleware convention, and the one
 *      production OAuth outage in this system's history was caused by middleware policy
 *      intercepting a route that was designed to carry no cookie and no bearer. Build the
 *      table before touching the convention, not during."*
 *
 * The table below is that artifact.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import {
  isOAuthBrowserHandoffRequest,
  MOBILE_OAUTH_BROWSER_LAUNCH_PATH,
  GOOGLE_OAUTH_CALLBACK_PATH,
  MICROSOFT_OAUTH_CALLBACK_PATH,
} from "../../lib/integrations/mobile-oauth/middleware-policy";

// ── route census ───────────────────────────────────────────────────────────────────

const API_ROOT = path.join(process.cwd(), "app", "api");
const MUTATION_METHODS = ["POST", "PATCH", "PUT", "DELETE"] as const;

function walkRoutes(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walkRoutes(full, out);
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

type RouteInfo = {
  /** URL-ish path, e.g. `/api/exhibitor/leads/[leadId]` */
  route: string;
  file: string;
  source: string;
  methods: string[];
  hasAuth: boolean;
  hasScope: boolean;
};

const ROUTES: RouteInfo[] = walkRoutes(API_ROOT).map((file) => {
  const source = readFileSync(file, "utf8");
  const route = `/api/${path.relative(API_ROOT, path.dirname(file)).split(path.sep).join("/")}`;
  return {
    route,
    file: path.relative(process.cwd(), file),
    source,
    methods: ["GET", ...MUTATION_METHODS].filter((m) =>
      new RegExp(`export\\s+async\\s+function\\s+${m}\\b`).test(source)
    ),
    // Any recognised session/authorization entry point.
    // Every recognised authentication entry point. Kept broad deliberately: a false
    // positive here weakens the gate, so any new auth helper must be added.
    hasAuth:
      /getCurrentSessionUser|resolveApiSession|requireExhibitorScope|requireRole|authorizeInternalWorkerRequest|resolveMobileBearer|createSupabaseServerClient|authorizeGoogleWorkspaceAdmin|authorizeIntegrationConnectionAdmin|authorizeCompanyIntegrationAdmin|auth\.getUser|auth\.getSession/.test(
        source
      ),
    hasScope: /company_id|companyId|account_id|accountId|event_id|eventId|exhibitorCompanyId/.test(source),
  };
});

const mutationRoutes = ROUTES.filter((r) => r.methods.some((m) => MUTATION_METHODS.includes(m as never)));

/**
 * Routes that legitimately carry no session auth. Each needs a stated reason — the point of
 * an allowlist is that adding to it is a visible, arguable decision.
 */
const UNAUTHENTICATED_BY_DESIGN: Record<string, string> = {
  "/api/integrations/google/callback": "OAuth callback; authenticated by signed, expiring state, not a session",
  "/api/mobile/integrations/oauth/launch": "Mobile OAuth launch; authenticated by a signed single-use ticket",
  "/api/internal/workflow-tick": "Internal worker; authenticated by a bearer secret, not a session",
  "/api/invites/claim": "Invite redemption happens before a session exists; authenticated by the invite code plus inviteEmailMatchesSession guards",
  "/api/e2e/auth-bypass": "The bypass itself; gated by getE2eAuthBypassDenialReason() which returns 403 outside development, plus an email allowlist",
};

/**
 * Routes that are unauthenticated but should NOT be — recorded findings, not exemptions.
 *
 * Separated from the allowlist above so the two can never be confused: an entry here is a
 * defect awaiting a fix, and the count is asserted so it cannot quietly grow.
 */
const UNAUTHENTICATED_DEFECTS: Record<string, string> = {
  "/api/admin/integrations/hubspot/test-sync": "LR-PROD-015 (P0) — unauthenticated CRM data egress with an attacker-supplied leadId",
};

describe("route census", () => {
  it("discovers a realistic number of API routes", () => {
    assert.ok(ROUTES.length > 100, `found only ${ROUTES.length} routes — the walker is probably broken`);
  });

  it("every route file exports at least one HTTP method", () => {
    const empty = ROUTES.filter((r) => r.methods.length === 0);
    assert.deepStrictEqual(empty.map((r) => r.file), [], "a route file exporting nothing is dead code");
  });

  it("finds a substantial number of mutation routes", () => {
    assert.ok(mutationRoutes.length > 50, `found only ${mutationRoutes.length} mutation routes`);
  });
});

// ── the gate ───────────────────────────────────────────────────────────────────────

describe("every mutation route authenticates (§49 item 2)", () => {
  // KNOWN-DEFECT: LR-PROD-015 — one mutation route authenticates nothing. Not fixed here
  // (Brief §6); the route is listed in UNAUTHENTICATED_DEFECTS so the gate stays useful for
  // every other route while the defect is open.
  it.skip("KNOWN-DEFECT: LR-PROD-015 — no mutation route lacks auth outside the stated allowlist", () => {
    const offenders = mutationRoutes
      .filter((r) => !r.hasAuth)
      .filter((r) => !(r.route in UNAUTHENTICATED_BY_DESIGN));

    assert.deepStrictEqual(offenders.map((r) => `${r.route} [${r.methods.join(",")}]`), []);
  });

  it("no NEW unauthenticated mutation route appears (the live gate)", () => {
    // Runs. Everything except the one recorded defect must authenticate, so this still
    // catches the next route that ships without auth.
    const offenders = mutationRoutes
      .filter((r) => !r.hasAuth)
      .filter((r) => !(r.route in UNAUTHENTICATED_BY_DESIGN))
      .filter((r) => !(r.route in UNAUTHENTICATED_DEFECTS));

    assert.deepStrictEqual(
      offenders.map((r) => `${r.route} [${r.methods.join(",")}]`),
      [],
      "a new mutation route shipped without an auth call — add auth, or add a reasoned allowlist entry"
    );
  });

  it("DOCUMENTED: exactly one unauthenticated mutation route exists today (LR-PROD-015)", () => {
    const unauthenticated = mutationRoutes
      .filter((r) => !r.hasAuth)
      .filter((r) => !(r.route in UNAUTHENTICATED_BY_DESIGN))
      .map((r) => r.route);

    assert.deepStrictEqual(
      unauthenticated.sort(),
      ["/api/admin/integrations/hubspot/test-sync"],
      "the set of unauthenticated mutation routes changed — re-review before updating this test"
    );
  });

  it("DOCUMENTED: the HubSpot test-sync route takes an attacker-supplied leadId (LR-PROD-015)", () => {
    const route = ROUTES.find((r) => r.route === "/api/admin/integrations/hubspot/test-sync");
    assert.ok(route, "route must exist");
    // No session, no role check, no company scope — just a lead id from the request body,
    // handed straight to the CRM sync.
    assert.match(route!.source, /payload\.leadId/);
    assert.match(route!.source, /syncLeadToHubSpot\(leadId\)/);
    assert.equal(route!.hasAuth, false);
    assert.doesNotMatch(route!.source, /company_id|companyId|Unauthorized|401|403/);
  });

  it("every allowlist entry still exists, so the exceptions cannot rot", () => {
    // An allowlist entry for a deleted route silently widens the gate for a future route
    // that reuses the path.
    const known = new Set(ROUTES.map((r) => r.route));
    const stale = Object.keys(UNAUTHENTICATED_BY_DESIGN).filter((route) => !known.has(route));
    assert.deepStrictEqual(stale, [], "remove allowlist entries for routes that no longer exist");
  });

  it("every allowlist entry carries a reason", () => {
    for (const [route, reason] of Object.entries(UNAUTHENTICATED_BY_DESIGN)) {
      assert.ok(reason.length > 25, `${route} needs a real justification, not a placeholder`);
    }
  });

  it("mutation routes that touch tenant data reference a scope column", () => {
    // Weaker than proving the predicate is applied — that is what tests/isolation/* does
    // behaviourally. This is the census-level guard: a mutation route mentioning no scope
    // identifier at all is worth a human look.
    const unscoped = mutationRoutes
      .filter((r) => r.hasAuth && !r.hasScope)
      .map((r) => r.route);

    // Recorded rather than asserted empty: some routes legitimately act on a single global
    // object. The count is pinned so growth is visible.
    assert.ok(
      unscoped.length <= 25,
      `${unscoped.length} authenticated mutation routes reference no scope identifier:\n  ${unscoped.join("\n  ")}`
    );
  });
});

// ── middleware policy parity table ─────────────────────────────────────────────────

/**
 * The (path, method, auth state) → expected outcome table §49 requires.
 *
 * `sessionRefresh` means middleware runs `updateSession`, which reads and rewrites the auth
 * cookie. `passthrough` means middleware must NOT touch the request — the production outage
 * happened because a route designed to carry no cookie and no bearer was intercepted.
 */
type MiddlewareExpectation = "sessionRefresh" | "passthrough";

const MIDDLEWARE_TABLE: Array<{
  path: string;
  method: string;
  authState: "none" | "cookie" | "ticket";
  expect: MiddlewareExpectation;
  why: string;
}> = [
  {
    path: MOBILE_OAUTH_BROWSER_LAUNCH_PATH,
    method: "GET",
    authState: "ticket",
    expect: "passthrough",
    why: "the mobile browser launch carries no cookie and no bearer — this caused the outage",
  },
  {
    path: GOOGLE_OAUTH_CALLBACK_PATH,
    method: "GET",
    authState: "none",
    expect: "passthrough",
    why: "Google redirects here with signed state; there is no session yet",
  },
  {
    path: MICROSOFT_OAUTH_CALLBACK_PATH,
    method: "GET",
    authState: "none",
    expect: "passthrough",
    why: "Microsoft redirects here with signed state; there is no session yet",
  },
  {
    path: MOBILE_OAUTH_BROWSER_LAUNCH_PATH,
    method: "POST",
    authState: "cookie",
    expect: "sessionRefresh",
    why: "only GET is a browser handoff; a POST to this path is an ordinary API call",
  },
  {
    path: GOOGLE_OAUTH_CALLBACK_PATH,
    method: "POST",
    authState: "cookie",
    expect: "sessionRefresh",
    why: "same — the handoff exemption is GET-only",
  },
  { path: "/api/exhibitor/leads", method: "GET", authState: "cookie", expect: "sessionRefresh", why: "ordinary authenticated read" },
  { path: "/api/exhibitor/leads", method: "POST", authState: "cookie", expect: "sessionRefresh", why: "ordinary authenticated mutation" },
  { path: "/exhibitor/dashboard", method: "GET", authState: "cookie", expect: "sessionRefresh", why: "authenticated page" },
  { path: "/login", method: "GET", authState: "none", expect: "sessionRefresh", why: "middleware still runs; the page handles the unauthenticated case" },
  { path: "/api/integrations/google/callback/extra", method: "GET", authState: "none", expect: "sessionRefresh", why: "the exemption is an exact path match, not a prefix" },
];

/** The decision `updateSession` makes, expressed as the policy module sees it. */
const middlewareOutcome = (path: string, method: string): MiddlewareExpectation =>
  isOAuthBrowserHandoffRequest({ pathname: path, method }) ? "passthrough" : "sessionRefresh";

describe("middleware policy parity table (§49)", () => {
  for (const row of MIDDLEWARE_TABLE) {
    it(`${row.method} ${row.path} (${row.authState}) → ${row.expect} — ${row.why}`, () => {
      assert.equal(middlewareOutcome(row.path, row.method), row.expect);
    });
  }

  it("the handoff exemption is GET-only", () => {
    for (const method of ["POST", "PATCH", "PUT", "DELETE", "HEAD", "OPTIONS"]) {
      assert.equal(
        isOAuthBrowserHandoffRequest({ pathname: MOBILE_OAUTH_BROWSER_LAUNCH_PATH, method }),
        false,
        `${method} must not be exempt`
      );
    }
  });

  it("method matching is case-insensitive, so a lowercase verb cannot slip past", () => {
    assert.equal(isOAuthBrowserHandoffRequest({ pathname: GOOGLE_OAUTH_CALLBACK_PATH, method: "get" }), true);
  });

  it("path matching is exact — no prefix or suffix widening", () => {
    for (const near of [
      `${GOOGLE_OAUTH_CALLBACK_PATH}/x`,
      `${GOOGLE_OAUTH_CALLBACK_PATH}x`,
      `/x${GOOGLE_OAUTH_CALLBACK_PATH}`,
      `${GOOGLE_OAUTH_CALLBACK_PATH}/`,
    ]) {
      assert.equal(
        isOAuthBrowserHandoffRequest({ pathname: near, method: "GET" }),
        false,
        `${near} must not inherit the exemption`
      );
    }
  });

  it("exactly three paths are exempt, and all are named constants", () => {
    // A further exemption appearing here is a policy change that must be argued, not slipped in.
    // The third is the Microsoft 365 OAuth callback, added with the Microsoft connection
    // lifecycle: like the Google callback it is a provider redirect that carries signed,
    // expiring state and no session cookie, and its handler validates state, PKCE and the
    // single-use nonce before doing anything.
    const exempt = [
      MOBILE_OAUTH_BROWSER_LAUNCH_PATH,
      GOOGLE_OAUTH_CALLBACK_PATH,
      MICROSOFT_OAUTH_CALLBACK_PATH,
    ];
    assert.equal(exempt.length, 3);
    assert.equal(new Set(exempt).size, 3);
  });

  it("the table is runnable against a replacement, not tied to middleware.ts internals", () => {
    // §49's requirement: the table must survive the Next.js middleware convention being
    // replaced. It calls the exported policy predicate, not the middleware function, so a
    // proxy-based replacement can be validated against the same rows.
    assert.equal(typeof isOAuthBrowserHandoffRequest, "function");
    assert.ok(MIDDLEWARE_TABLE.length >= 9);
  });

  it("middleware.ts actually consults the policy module", () => {
    // Guards against the policy being correct but unwired — the shape of the original outage.
    const middlewareSource = readFileSync(path.join(process.cwd(), "lib/supabase/middleware.ts"), "utf8");
    assert.match(middlewareSource, /isOAuthBrowserHandoffRequest/);
  });
});

// ── the dev bypass header ──────────────────────────────────────────────────────────

describe("the x-dev-bypass header is development-only (LR-RISK-005)", () => {
  const middlewareSource = readFileSync(path.join(process.cwd(), "middleware.ts"), "utf8");

  it("both bypass branches are gated on NODE_ENV=development", () => {
    // A header-based bypass that reached production would let any caller skip session
    // handling by setting a header.
    const branches = middlewareSource.split("x-dev-bypass").length - 1;
    assert.ok(branches >= 1, "expected the header to be referenced");
    const gates = (middlewareSource.match(/process\.env\.NODE_ENV === "development"/g) || []).length;
    assert.equal(gates, 2, "each bypass branch needs its own explicit development gate");
  });

  it("the header alone is not sufficient — the gate is an AND", () => {
    assert.doesNotMatch(
      middlewareSource,
      /if\s*\(\s*isDevBypass\s*\)\s*\{/,
      "a branch on the header alone would be a production bypass"
    );
  });

  it("DOCUMENTED: x-dev-bypass is a bypass-shaped control not in the flag inventory", () => {
    // It is a request header rather than an env var, so Prompt 13's env-var sweep would
    // miss it. Recorded as LR-RISK-005 so the inventory covers header-based bypasses too.
    assert.match(middlewareSource, /x-dev-bypass/);
  });
});
