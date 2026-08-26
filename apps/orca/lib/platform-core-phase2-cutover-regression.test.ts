/**
 * Platform Core migration, Phase 2 — authentication cutover.
 *
 * Pins the cutover posture: Platform Core is the authentication authority, Orca is no
 * longer an authentication entry point, authentication alone never becomes Orca access,
 * and nothing falls back to email or a default organization.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  createDevelopmentEntitlementClaims,
  isEntitlementDenialWaivableInDevelopment,
  readEntitlementClaims,
  resolveEntitlementMode,
  resolveOrcaEntitlement,
} from "@/lib/platform/entitlements";
import {
  buildOrcaReturnToUrl,
  getPlatformSignInUrl,
  getPlatformSignOutUrl,
  isPlatformEntryRoutingConfigured,
} from "@/lib/platform/entry";
import { areOrcaInvitesDisabled, resolvePlatformInvitationCapability } from "@/lib/platform/invitations";
import {
  isLegacyAuthAuthorityAllowed,
  resolveAuthAuthorityPosture,
} from "@/src/lib/supabase/auth-authority";

const requestUserSource = readFileSync("lib/request-user.ts", "utf8");
const loginPageSource = readFileSync("app/(public)/login/page.tsx", "utf8");
const legacyLoginSource = readFileSync("app/(public)/login/legacy-otp-login-form.tsx", "utf8");
const callbackSource = readFileSync("app/auth/callback/route.ts", "utf8");
const logoutSource = readFileSync("app/(shell)/_components/logout-button.tsx", "utf8");
const inviteRouteSource = readFileSync("app/api/admin/invite-user/route.ts", "utf8");
const entitlementsSource = readFileSync("lib/platform/entitlements.ts", "utf8");
const invitationsSource = readFileSync("lib/platform/invitations.ts", "utf8");
const entrySource = readFileSync("lib/platform/entry.ts", "utf8");

const MANAGED_ENV = [
  "NODE_ENV",
  "NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL",
  "NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "ALLOW_LEGACY_ORCA_AUTH_AUTHORITY",
  "PLATFORM_ENTITLEMENT_MODE",
  "PLATFORM_PRODUCT_KEY",
  "NEXT_PUBLIC_PLATFORM_CORE_APP_URL",
  "NEXT_PUBLIC_ORCA_APP_URL",
  "NEXT_PUBLIC_PLATFORM_CORE_SIGN_IN_PATH",
  "NEXT_PUBLIC_PLATFORM_CORE_SIGN_OUT_PATH",
] as const;

const PLATFORM_AUTH = {
  NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL: "https://platform-core.supabase.co",
  NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_ANON_KEY: "platform-core-anon-key",
} as const;

const LEGACY_AUTH = {
  NEXT_PUBLIC_SUPABASE_URL: "https://legacy-orca.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "legacy-orca-anon-key",
} as const;

const LINKED_PLATFORM_USER_ID = "11111111-1111-4111-8111-111111111111";
const PLATFORM_ORG_ID = "22222222-2222-4222-8222-222222222222";

function withEnv<T>(overrides: Partial<Record<(typeof MANAGED_ENV)[number], string>>, run: () => T): T {
  const previous = new Map<string, string | undefined>();
  for (const key of MANAGED_ENV) {
    previous.set(key, process.env[key]);
    const value = overrides[key];
    if (value === undefined) delete process.env[key];
    else process.env[key as string] = value;
  }
  try {
    return run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key as string] = value;
    }
  }
}

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

// --- 1. Auth authority cutover posture ----------------------------------------

test("production accepts Platform Core as the authentication authority", () => {
  withEnv({ NODE_ENV: "production", ...PLATFORM_AUTH }, () => {
    const posture = resolveAuthAuthorityPosture();
    assert.equal(posture.status, "OK");
    if (posture.status !== "OK") return;
    assert.equal(posture.config.source, "platform-core");
  });
});

test("production refuses to authenticate against the legacy Orca project", () => {
  withEnv({ NODE_ENV: "production", ...LEGACY_AUTH }, () => {
    const posture = resolveAuthAuthorityPosture();
    assert.equal(posture.status, "BLOCKED");
    if (posture.status !== "BLOCKED") return;
    assert.equal(posture.reason, "LEGACY_AUTH_AUTHORITY_NOT_PERMITTED");
    assert.equal(isLegacyAuthAuthorityAllowed(), false);
  });
});

test("legacy production auth is possible only as a deliberate rollback", () => {
  withEnv({ NODE_ENV: "production", ALLOW_LEGACY_ORCA_AUTH_AUTHORITY: "true", ...LEGACY_AUTH }, () => {
    assert.equal(isLegacyAuthAuthorityAllowed(), true);
    assert.equal(resolveAuthAuthorityPosture().status, "OK");
  });
});

test("an unconfigured or half-configured authority fails closed", () => {
  withEnv({ NODE_ENV: "production" }, () => {
    const posture = resolveAuthAuthorityPosture();
    assert.equal(posture.status, "BLOCKED");
    if (posture.status !== "BLOCKED") return;
    assert.equal(posture.reason, "AUTH_AUTHORITY_NOT_CONFIGURED");
  });

  // Half-configured Platform Core must never silently fall back to the legacy project.
  withEnv(
    {
      NODE_ENV: "production",
      NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL: PLATFORM_AUTH.NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL,
      ...LEGACY_AUTH,
    },
    () => {
      const posture = resolveAuthAuthorityPosture();
      assert.equal(posture.status, "BLOCKED");
      if (posture.status !== "BLOCKED") return;
      assert.equal(posture.reason, "AUTH_AUTHORITY_MISCONFIGURED");
    },
  );
});

test("session resolution refuses to run against a blocked authority", () => {
  const guard = sourceBetween(
    requestUserSource,
    "export async function ensureProvisionedUserAndContext",
    "const supabase = await createServerSupabaseClient()",
  );
  assert.equal(guard.includes("resolveAuthAuthorityPosture()"), true);
  assert.equal(guard.includes('status: "UNAUTHENTICATED"'), true);
});

test("the auth project and the operational database stay independently configurable", () => {
  withEnv({ NODE_ENV: "production", ...PLATFORM_AUTH }, () => {
    const posture = resolveAuthAuthorityPosture();
    assert.equal(posture.status, "OK");
    if (posture.status !== "OK") return;
    assert.equal(posture.config.url.includes("platform-core"), true);
  });

  const authoritySource = readFileSync("src/lib/supabase/auth-authority.ts", "utf8");
  assert.equal(authoritySource.includes("process.env.DATABASE_URL"), false);
  for (const file of ["src/server/db/prisma.ts", "lib/prisma.ts"]) {
    assert.equal(/SUPABASE|auth-authority/i.test(readFileSync(file, "utf8")), false, file);
  }
});

// --- 2. Orca is no longer an authentication entry point ------------------------

test("the login route redirects to Platform Core instead of signing users in", () => {
  assert.equal(loginPageSource.includes("getPlatformSignInUrl"), true);
  assert.equal(loginPageSource.includes("redirect(platformSignInUrl)"), true);
  // The one-time-code form no longer lives on the entry route itself.
  assert.equal(loginPageSource.includes("signInWithOtp"), false);
  assert.equal(loginPageSource.includes("verifyOtp"), false);
});

test("standalone signup is gone — Orca cannot mint an identity", () => {
  assert.equal(legacyLoginSource.includes("shouldCreateUser: false"), true);
  assert.equal(legacyLoginSource.includes("shouldCreateUser: true"), false);
});

test("the legacy sign-in form is reachable only under a permitted legacy authority", () => {
  assert.equal(loginPageSource.includes('authority?.source === "legacy-orca"'), true);
  assert.equal(loginPageSource.includes("isLegacyAuthAuthorityAllowed()"), true);
});

test("Platform sign-in and sign-out URLs are configuration, never hardcoded", () => {
  withEnv(
    {
      NEXT_PUBLIC_PLATFORM_CORE_APP_URL: "https://platform.example.com",
      NEXT_PUBLIC_ORCA_APP_URL: "https://orca.example.com",
    },
    () => {
      const signIn = getPlatformSignInUrl("/events/abc");
      assert.equal(signIn?.startsWith("https://platform.example.com/signin"), true);
      assert.equal(signIn?.includes(encodeURIComponent("https://orca.example.com/events/abc")), true);

      const signOut = getPlatformSignOutUrl();
      assert.equal(signOut?.startsWith("https://platform.example.com/signout"), true);
      assert.equal(isPlatformEntryRoutingConfigured(), true);
    },
  );

  // Paths are overridable so Orca does not dictate Platform Core's routes.
  withEnv(
    {
      NEXT_PUBLIC_PLATFORM_CORE_APP_URL: "https://platform.example.com",
      NEXT_PUBLIC_PLATFORM_CORE_SIGN_IN_PATH: "/auth/start",
    },
    () => {
      assert.equal(getPlatformSignInUrl(null)?.includes("/auth/start"), true);
    },
  );

  withEnv({}, () => {
    assert.equal(getPlatformSignInUrl(null), null);
    assert.equal(isPlatformEntryRoutingConfigured(), false);
  });

  assert.equal(/https:\/\/[a-z0-9-]+\.supabase\.co/.test(entrySource), false, "no hardcoded projects");
});

test("a crafted return path cannot turn the round trip into an open redirect", () => {
  withEnv(
    {
      NEXT_PUBLIC_PLATFORM_CORE_APP_URL: "https://platform.example.com",
      NEXT_PUBLIC_ORCA_APP_URL: "https://orca.example.com",
    },
    () => {
      for (const hostile of ["https://evil.example.com/steal", "//evil.example.com", "evil.example.com"]) {
        assert.equal(
          buildOrcaReturnToUrl(hostile),
          "https://orca.example.com",
          `must not honour ${hostile}`,
        );
      }
      assert.equal(buildOrcaReturnToUrl("/dashboard"), "https://orca.example.com/dashboard");
    },
  );
});

test("the callback refuses Orca-owned account lifecycle under Platform Core", () => {
  assert.equal(callbackSource.includes("LEGACY_ONLY_OTP_TYPES"), true);
  for (const lifecycleType of ["signup", "recovery", "email_change"]) {
    assert.equal(callbackSource.includes(`"${lifecycleType}"`), true, lifecycleType);
  }
  const branch = sourceBetween(
    callbackSource,
    "LEGACY_ONLY_OTP_TYPES.has(type)",
    "const result = await supabase.auth.verifyOtp",
  );
  assert.equal(branch.includes('NextResponse.redirect(new URL("/login"'), true);
});

test("logout ends the Platform session and returns to Platform Core", () => {
  assert.equal(logoutSource.includes("getPlatformSignOutUrl()"), true);
  assert.equal(logoutSource.includes('signOut({ scope: "global" })'), true);
  assert.equal(logoutSource.includes("window.location.assign(platformSignOutUrl)"), true);
  // Orca context is cleared too, so no stale active-org cookie survives the round trip.
  assert.equal(logoutSource.includes('method: "DELETE"'), true);
});

// --- 3. Auto-provisioning and DEFAULT_ORG_ID removal ---------------------------

test("the request path creates no users, memberships, or tenant assignments", () => {
  for (const forbidden of [
    "createAppUserWithMembership",
    "user.create(",
    "membership.upsert",
    "membership.create",
    "user.update(",
  ]) {
    assert.equal(requestUserSource.includes(forbidden), false, `request path must not call ${forbidden}`);
  }
});

test("an unknown Platform identity is denied, never provisioned", () => {
  const resolver = sourceBetween(
    requestUserSource,
    "async function resolveAppUserFromPlatformIdentity",
    "async function resolveFromAuthenticatedIdentity",
  );
  assert.equal(resolver.includes('reason: "ORCA_ACCESS_NOT_PROVISIONED"'), true);
});

test("DEFAULT_ORG_ID no longer appears in authenticated identity or access resolution", () => {
  // The only permitted mention is the helper documenting that it is retired.
  const mentions = requestUserSource.split("DEFAULT_ORG_ID").length - 1;
  assert.equal(mentions <= 1, true, `DEFAULT_ORG_ID still referenced ${mentions} times`);
  assert.equal(requestUserSource.includes("process.env.DEFAULT_ORG_ID"), false);
  assert.equal(requestUserSource.includes("isDefaultOrgIdUsedForAccessResolution"), true);
});

test("a user with no provisioned membership is denied rather than given one", () => {
  const readBlock = sourceBetween(
    requestUserSource,
    "function readProvisionedMemberships",
    "Resolve the Orca user row",
  );
  assert.equal(readBlock.includes('reason: "ORCA_ACCESS_NOT_PROVISIONED"'), true);
  for (const write of ["upsert", "update", "create", "$transaction"]) {
    assert.equal(readBlock.includes(write), false, `membership read must not ${write}`);
  }
  // It reads no database at all now — the caller passes the already-loaded list, so auth
  // resolution does not grow a second membership query.
  assert.equal(readBlock.includes("getPrisma"), false);
  assert.equal(readBlock.includes("await"), false);
});

// --- 4. Entitlement boundary ---------------------------------------------------

test("entitlement mode fails closed in production and permits migration elsewhere", () => {
  withEnv({ NODE_ENV: "production" }, () => assert.equal(resolveEntitlementMode(), "claims"));
  withEnv({ NODE_ENV: "development" }, () => assert.equal(resolveEntitlementMode(), "migration"));
  withEnv({ NODE_ENV: "development", PLATFORM_ENTITLEMENT_MODE: "claims" }, () =>
    assert.equal(resolveEntitlementMode(), "claims"),
  );
});

test("authentication alone never grants entry in production", () => {
  withEnv({ NODE_ENV: "production" }, () => {
    const decision = resolveOrcaEntitlement({
      claims: null,
      // A fully linked, fully provisioned user — still denied without claims.
      subject: { platformUserId: LINKED_PLATFORM_USER_ID, hasProvisionedOrcaAccess: true },
    });
    assert.equal(decision.status, "DENIED");
    if (decision.status !== "DENIED") return;
    assert.equal(decision.reason, "PLATFORM_ENTITLEMENT_UNAVAILABLE");
  });
});

test("Platform Core claims are authoritative in both directions", () => {
  withEnv({ NODE_ENV: "production" }, () => {
    const granted = resolveOrcaEntitlement({
      claims: { version: 1, access: [PLATFORM_ORG_ID].map((organizationId: string) => ({ organizationId, organizationRole: "MEMBER", products: ["orca"] })), legacy: false, platformAdmin: false },
      subject: { platformUserId: null, hasProvisionedOrcaAccess: false },
    });
    assert.equal(granted.status, "GRANTED");
    if (granted.status !== "GRANTED") return;
    assert.equal(granted.source, "platform-claims");
    assert.deepEqual([...granted.organizationIds], [PLATFORM_ORG_ID]);

    // Entitled to a different product only.
    const denied = resolveOrcaEntitlement({
      claims: { version: 1, access: [], legacy: false, platformAdmin: false },
      subject: { platformUserId: LINKED_PLATFORM_USER_ID, hasProvisionedOrcaAccess: true },
    });
    assert.equal(denied.status, "DENIED");
    if (denied.status !== "DENIED") return;
    assert.equal(denied.reason, "PLATFORM_ENTITLEMENT_MISSING_PRODUCT");
  });
});

test("migration mode still requires explicitly provisioned state, never authentication alone", () => {
  withEnv({ NODE_ENV: "development", PLATFORM_ENTITLEMENT_MODE: "migration" }, () => {
    const unlinked = resolveOrcaEntitlement({
      claims: null,
      subject: { platformUserId: null, hasProvisionedOrcaAccess: true },
    });
    assert.equal(unlinked.status, "DENIED");
    if (unlinked.status !== "DENIED") return;
    assert.equal(unlinked.reason, "PLATFORM_IDENTITY_NOT_LINKED");

    const unprovisioned = resolveOrcaEntitlement({
      claims: null,
      subject: { platformUserId: LINKED_PLATFORM_USER_ID, hasProvisionedOrcaAccess: false },
    });
    assert.equal(unprovisioned.status, "DENIED");
    if (unprovisioned.status !== "DENIED") return;
    assert.equal(unprovisioned.reason, "ORCA_ACCESS_NOT_PROVISIONED");

    const granted = resolveOrcaEntitlement({
      claims: null,
      subject: { platformUserId: LINKED_PLATFORM_USER_ID, hasProvisionedOrcaAccess: true },
    });
    assert.equal(granted.status, "GRANTED");
    if (granted.status !== "GRANTED") return;
    assert.equal(granted.source, "migration-provisioned");
  });
});

test("an explicit Orca role counts as provisioned access in migration mode", () => {
  withEnv({ NODE_ENV: "development", PLATFORM_ENTITLEMENT_MODE: "migration" }, () => {
    // A platform admin with no organization membership is still deliberately provisioned.
    const decision = resolveOrcaEntitlement({
      claims: null,
      subject: { platformUserId: LINKED_PLATFORM_USER_ID, hasProvisionedOrcaAccess: true },
    });
    assert.equal(decision.status, "GRANTED");
  });

  // The caller supplies that fact from the Orca role, not from the act of authenticating.
  const builder = sourceBetween(
    requestUserSource,
    "async function buildContextForResolvedAppUser",
    "async function resolveFromDevFallback",
  );
  assert.equal(
    builder.includes("memberships.length > 0 || appUser.role === UserRole.SUPER_ADMIN"),
    true,
  );
});

test("the development waiver can never override an explicit Platform Core denial", () => {
  assert.equal(isEntitlementDenialWaivableInDevelopment("PLATFORM_ENTITLEMENT_UNAVAILABLE"), true);
  assert.equal(isEntitlementDenialWaivableInDevelopment("ORCA_ACCESS_NOT_PROVISIONED"), true);
  assert.equal(
    isEntitlementDenialWaivableInDevelopment("PLATFORM_ENTITLEMENT_MISSING_PRODUCT"),
    false,
    "a product Platform Core withheld stays withheld, even locally",
  );

  const builder = sourceBetween(
    requestUserSource,
    "async function buildContextForResolvedAppUser",
    "async function resolveFromDevFallback",
  );
  assert.equal(builder.includes("isEntitlementDenialWaivableInDevelopment(entitlement.reason)"), true);
  // The waiver itself is development-gated.
  assert.equal(builder.includes("isDevNoMembershipBypassEnabled()"), true);
  const bypassHelper = sourceBetween(
    requestUserSource,
    "function isDevNoMembershipBypassEnabled",
    "async function readRequestedOrgId",
  );
  assert.equal(bypassHelper.includes('process.env.NODE_ENV === "development"'), true);
});

test("auth resolution does not grow extra queries for the entitlement check", () => {
  const builder = sourceBetween(
    requestUserSource,
    "async function buildContextForResolvedAppUser",
    "async function resolveFromDevFallback",
  );
  // One membership read, reused by both the entitlement subject and the org context.
  assert.equal(builder.split("listMemberships(").length - 1, 1);
  assert.equal(builder.includes("resolveOrcaEntitlement("), true);
  // Entitlements come from the session, never from a call back to Platform Core.
  for (const remoteCall of ["fetch(", "axios", "PLATFORM_CORE_API_URL"]) {
    assert.equal(requestUserSource.includes(remoteCall), false, `no ${remoteCall} on the auth path`);
  }
});

test("entitlements are read from server-controlled app_metadata only", () => {
  assert.equal(readEntitlementClaims(null), null);
  assert.equal(readEntitlementClaims({}), null);
  assert.equal(readEntitlementClaims({ signalthread: {} }), null);
  // Legacy flat claims still parse, projected into the org-scoped shape. With no
  // organizations named there is nothing to scope to, so `access` is empty and the
  // claim entitles nothing -- legacy cannot widen anything.
  assert.deepEqual(readEntitlementClaims({ signalthread: { products: ["Orca"] } }), {
    version: 0,
    access: [],
    legacy: true,
    platformAdmin: false,
    syncedAt: null,
  });
  assert.deepEqual(readEntitlementClaims({ signalthread: { products: [1, "orca", null] } }), {
    version: 0,
    access: [],
    legacy: true,
    platformAdmin: false,
    syncedAt: null,
  });

  // A legacy claim naming organizations projects the product list onto each of them.
  assert.deepEqual(
    readEntitlementClaims({ signalthread: { products: ["orca"], organizations: ["org-1"] } }),
    {
      version: 0,
      access: [{ organizationId: "org-1", organizationRole: "", products: ["orca"] }],
      legacy: true,
      platformAdmin: false,
      syncedAt: null,
    },
  );

  // The structured contract is authoritative whenever `access` is present: a legacy
  // `products` array sitting beside it is ignored entirely rather than merged.
  assert.deepEqual(
    readEntitlementClaims({
      signalthread: {
        v: 1,
        products: ["orca", "housing"],
        organizations: ["org-legacy"],
        access: [{ organization_id: "org-1", organization_role: "ADMIN", products: ["ORCA"] }],
        platform_admin: true,
      },
    }),
    {
      version: 1,
      access: [{ organizationId: "org-1", organizationRole: "ADMIN", products: ["orca"] }],
      legacy: false,
      platformAdmin: true,
      syncedAt: null,
    },
  );

  // user_metadata is user-editable and must never be *read* for access decisions
  // (naming it in a comment explaining why is fine).
  assert.equal(requestUserSource.includes("supabaseUser.user_metadata"), false);
  assert.equal(requestUserSource.includes("readEntitlementClaims(supabaseUser.app_metadata)"), true);
  assert.equal(entitlementsSource.includes("user_metadata"), true, "documented as deliberately excluded");
});

test("the development entitlement can never apply in production", () => {
  withEnv({ NODE_ENV: "production" }, () => {
    assert.equal(createDevelopmentEntitlementClaims(), null);
  });
  withEnv({ NODE_ENV: "development" }, () => {
    const claims = createDevelopmentEntitlementClaims();
    assert.equal(claims?.developmentBypass, true);
  });
});

test("entitlement is enforced before any organization context is granted", () => {
  const builder = sourceBetween(
    requestUserSource,
    "async function buildContextForResolvedAppUser",
    "async function resolveFromDevFallback",
  );
  const entitlementIndex = builder.indexOf("resolveOrcaEntitlement(");
  const selectionIndex = builder.indexOf("resolveOrganizationSelection(");
  assert.notEqual(entitlementIndex, -1);
  assert.notEqual(selectionIndex, -1);
  assert.equal(entitlementIndex < selectionIndex, true, "entry is decided before org context");
});

test("organization access still comes from Orca membership and can only shrink", () => {
  // Phase 2 asserted `arePlatformOrganizationClaimsAuthoritative() === false`, because the
  // Platform and Orca organization id spaces were not yet comparable. Phase 3 adopted the
  // Platform uuid as Orca's `Organization.id`, so that flag is now true and is covered by
  // `platform-core-phase3-canonical-context.test.ts`.
  //
  // The Phase 2 guarantee this test still owns is narrower and must never regress: the set
  // of organizations a user can reach originates in Orca's own membership data, and a
  // Platform claim can only narrow it.
  const builder = sourceBetween(
    requestUserSource,
    "async function buildContextForResolvedAppUser",
    "async function resolveFromDevFallback",
  );
  assert.equal(
    builder.includes("listAccessibleOrganizationsForUser("),
    true,
    "the candidate set is still Orca membership",
  );
  assert.equal(
    builder.indexOf("listAccessibleOrganizationsForUser(") <
      builder.indexOf("restrictOrganizationsToPlatformClaims("),
    true,
    "claims narrow an already-computed Orca set rather than producing it",
  );

  // And because auto-provisioning is gone, that reach can only shrink.
  assert.equal(requestUserSource.includes("membership.create"), false);
  assert.equal(requestUserSource.includes("membership.upsert"), false);
});

// --- 5. Invitations -------------------------------------------------------------

test("Orca invites are disabled once Platform Core authenticates", () => {
  withEnv({ NODE_ENV: "production", ...PLATFORM_AUTH }, () => {
    const capability = resolvePlatformInvitationCapability();
    assert.equal(capability.status, "PLATFORM_MANAGED");
    if (capability.status !== "PLATFORM_MANAGED") return;
    assert.equal(capability.reason, "INVITES_OWNED_BY_PLATFORM_CORE");
    assert.equal(areOrcaInvitesDisabled(), true);
  });

  withEnv({ NODE_ENV: "development", ...LEGACY_AUTH }, () => {
    assert.equal(resolvePlatformInvitationCapability().status, "LEGACY_ORCA_INVITES");
    assert.equal(areOrcaInvitesDisabled(), false);
  });
});

test("the invite route refuses before doing any work when Platform Core owns invites", () => {
  const handler = sourceBetween(inviteRouteSource, "async function postHandler", "let body: InviteBody");
  const gateIndex = handler.indexOf("resolvePlatformInvitationCapability()");
  const authIndex = handler.indexOf("resolveRequestUser(request)");
  assert.notEqual(gateIndex, -1);
  assert.equal(gateIndex < authIndex, true, "the gate runs before any provisioning work");
  assert.equal(handler.includes("status: 410"), true);
});

test("no cross-product shortcut was invented in place of a Platform invitation API", () => {
  // The required Platform Core dependency is documented, not implemented against a guess.
  assert.equal(invitationsSource.includes("PLATFORM_CORE_API_URL"), true);
  assert.equal(invitationsSource.includes("getPrisma"), false, "no direct data access");
  assert.equal(invitationsSource.includes("createClient("), false, "no second Supabase client");
});

// --- 6. Speaker portal tokens are untouched -------------------------------------

test("public speaker token flows are independent of the auth cutover", () => {
  const intakeSource = readFileSync("src/server/services/speaker-intake.ts", "utf8");

  // Only what it imports proves coupling; prose explaining the separation does not.
  const importedModules = [...intakeSource.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]!);
  for (const authCoupling of ["auth-authority", "request-user", "entitlements", "supabase"]) {
    assert.equal(
      importedModules.some((module) => module.toLowerCase().includes(authCoupling)),
      false,
      `speaker intake must not import ${authCoupling}`,
    );
  }
  assert.equal(intakeSource.includes("SUPABASE_SERVICE_ROLE_KEY"), false, "no auth-project secret");
  assert.equal(
    importedModules.some((module) => module.includes("product-token-secrets")),
    true,
    "signs with product-owned secrets",
  );
  assert.equal(existsSync("src/server/security/product-token-secrets.ts"), true);
});
