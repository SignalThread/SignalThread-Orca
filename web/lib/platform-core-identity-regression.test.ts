/**
 * Platform Core migration, Phase 1 — canonical user identity.
 *
 * Proves that Orca resolves an authenticated identity through the canonical Platform Core
 * user id, that email survives only as an explicit and switchable transitional bridge, and
 * that identity resolution still grants no authorization by itself.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test, { type TestContext } from "node:test";
import { UserRole } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import {
  isEmailIdentityBridgeEnabled,
  isValidPlatformUserId,
  normalizePlatformEmail,
  resolveAppUserByPlatformIdentity,
} from "@/lib/platform/identity";
import {
  createPlannerFixtureHarness,
  hasPlannerTestDatabaseUrl,
  type PlannerFixtureHarness,
} from "@/lib/test-harness/planner-fixtures";

const requestUserSource = readFileSync("lib/request-user.ts", "utf8");
const identitySource = readFileSync("lib/platform/identity.ts", "utf8");
const rootSchemaSource = readFileSync("../prisma/schema.prisma", "utf8");
const webSchemaSource = readFileSync("prisma/schema.prisma", "utf8");
const migrationSource = readFileSync(
  "../prisma/migrations/20260820120000_add_user_platform_user_id/migration.sql",
  "utf8",
);

function createHarnessOrSkip(t: TestContext, runLabel: string): PlannerFixtureHarness | null {
  if (!hasPlannerTestDatabaseUrl()) {
    t.skip("DATABASE_URL is not configured for DB-backed platform identity tests.");
    return null;
  }
  return createPlannerFixtureHarness({ runLabel: `${runLabel}-${randomUUID().slice(0, 8)}` });
}

function withEnv<T>(overrides: Record<string, string | undefined>, run: () => T): T {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
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

// --- Schema / migration guarantees (no DB required) --------------------------

test("User carries a unique, nullable canonical Platform Core user id in both schema copies", () => {
  for (const [label, schema] of [["root", rootSchemaSource], ["web", webSchemaSource]] as const) {
    const userModel = sourceBetween(schema, "model User {", "\n}");
    assert.match(
      userModel,
      /platformUserId\s+String\?\s+@unique @db\.Uuid/,
      `${label} schema: platformUserId must be nullable, unique, and a UUID`,
    );
    assert.equal(
      userModel.includes("@@index([platformUserId])"),
      true,
      `${label} schema: platformUserId must be indexed`,
    );
    // Email stays unique for now — it is still the transitional bridge key.
    assert.match(userModel, /email\s+String\s+@unique @db\.Text/, `${label} schema: email column preserved`);
  }
});

test("the Phase 1 migration is additive and destroys nothing", () => {
  assert.equal(migrationSource.includes('ALTER TABLE "User" ADD COLUMN "platformUserId" UUID'), true);
  assert.equal(migrationSource.includes('CREATE UNIQUE INDEX "User_platformUserId_key"'), true);
  for (const destructive of ["DROP TABLE", "DROP COLUMN", "DELETE FROM", "TRUNCATE", "UPDATE "]) {
    assert.equal(
      migrationSource.toUpperCase().includes(destructive),
      false,
      `migration must not contain ${destructive}`,
    );
  }
  // The column must remain nullable so existing rows survive the migration unlinked.
  assert.equal(migrationSource.includes("NOT NULL"), false);
});

// --- Resolver wiring (no DB required) ----------------------------------------

test("the authenticated request path resolves identity by platform user id, not by email", () => {
  assert.equal(
    requestUserSource.includes("resolveAppUserFromPlatformIdentity"),
    true,
    "request-user must call the platform identity resolver",
  );
  assert.equal(
    requestUserSource.includes("resolveAppUserFromSupabaseIdentity"),
    false,
    "the email-keyed resolver must be gone",
  );

  const resolver = sourceBetween(
    requestUserSource,
    "async function resolveAppUserFromPlatformIdentity",
    "async function resolveFromAuthenticatedIdentity",
  );
  assert.equal(
    resolver.includes("resolveAppUserByPlatformIdentity"),
    true,
    "resolution must go through lib/platform/identity",
  );
  // Canonical resolution must happen first. The only remaining email query is a
  // uniqueness guard that selects an id and never loads an identity to serve.
  const canonicalIndex = resolver.indexOf("resolveAppUserByPlatformIdentity");
  const emailQueryIndex = resolver.indexOf("where: { email }");
  assert.notEqual(canonicalIndex, -1);
  if (emailQueryIndex !== -1) {
    assert.equal(
      canonicalIndex < emailQueryIndex,
      true,
      "identity must be resolved canonically before email is consulted at all",
    );
    const emailQuery = resolver.slice(emailQueryIndex, emailQueryIndex + 200);
    assert.equal(
      emailQuery.includes("select: { id: true }"),
      true,
      "the remaining email query must be an existence guard, not an identity lookup",
    );
    assert.equal(
      resolver.includes('reason: "PLATFORM_IDENTITY_NOT_LINKED"'),
      true,
      "a matching email must produce an explicit unlinked outcome, never a served session",
    );
  }
});

test("the canonical lookup precedes the email bridge and the bridge is switchable", () => {
  const resolver = sourceBetween(
    identitySource,
    "export async function resolveAppUserByPlatformIdentity",
    "\n}\n",
  );
  const canonicalIndex = resolver.indexOf("where: { platformUserId }");
  const emailIndex = resolver.indexOf("where: { email }");
  assert.notEqual(canonicalIndex, -1, "canonical lookup present");
  assert.notEqual(emailIndex, -1, "bridge lookup present");
  assert.equal(canonicalIndex < emailIndex, true, "platform id must be tried before email");
  assert.equal(resolver.includes("isEmailIdentityBridgeEnabled()"), true, "bridge must be gated by a flag");
});

test("the email bridge is explicit in both directions and off by default in production", () => {
  // Phase 2 retires the bridge: production must opt in, everywhere else keeps it for the
  // fixtures that create users without a Platform id.
  assert.equal(
    withEnv({ PLATFORM_IDENTITY_EMAIL_BRIDGE: undefined, NODE_ENV: "production" }, isEmailIdentityBridgeEnabled),
    false,
    "production defaults to no email bridge",
  );
  assert.equal(
    withEnv({ PLATFORM_IDENTITY_EMAIL_BRIDGE: undefined, NODE_ENV: "development" }, isEmailIdentityBridgeEnabled),
    true,
  );
  assert.equal(
    withEnv({ PLATFORM_IDENTITY_EMAIL_BRIDGE: "true", NODE_ENV: "production" }, isEmailIdentityBridgeEnabled),
    true,
    "production can opt back in for a migration window",
  );
  for (const off of ["false", "0", "off"]) {
    assert.equal(
      withEnv({ PLATFORM_IDENTITY_EMAIL_BRIDGE: off, NODE_ENV: "development" }, isEmailIdentityBridgeEnabled),
      false,
    );
  }
});

test("platform user ids must be UUIDs and emails are normalized before matching", () => {
  assert.equal(isValidPlatformUserId(randomUUID()), true);
  assert.equal(isValidPlatformUserId("not-a-uuid"), false);
  assert.equal(isValidPlatformUserId(null), false);
  assert.equal(normalizePlatformEmail("  Person@Example.COM "), "person@example.com");
});

test("the development fallback never fabricates a Platform Core id", () => {
  const devFallback = sourceBetween(
    requestUserSource,
    "async function resolveFromDevFallback",
    "export async function ensureProvisionedUserAndContext",
  );
  assert.equal(
    devFallback.includes("supabaseUserId: appUser.platformUserId ?? appUser.id"),
    true,
    "dev fallback reports the row's real link state",
  );
  assert.equal(
    devFallback.includes("resolveAppUserFromPlatformIdentity"),
    false,
    "dev fallback must not run identity resolution, which would claim an invented id",
  );
  assert.equal(devFallback.includes("buildContextForResolvedAppUser"), true);
});

test("the authenticated path creates no users at all (Phase 2 removed auto-provisioning)", () => {
  // Phase 1 created new rows with a canonical platform id. Phase 2 goes further: the auth
  // path never creates an Orca user, so there is no email-first creation path to guard.
  assert.equal(requestUserSource.includes("createAppUserWithMembership"), false);
  assert.equal(requestUserSource.includes("user.create("), false);
  assert.equal(requestUserSource.includes("tx.user.create"), false);
});

test("the request context surfaces the canonical id and how identity was reached", () => {
  assert.equal(requestUserSource.includes("platformUserId: string | null;"), true);
  assert.equal(requestUserSource.includes("identityLinkMode: PlatformIdentityLinkMode | null;"), true);

  const meRouteSource = readFileSync("app/api/me/route.ts", "utf8");
  assert.equal(meRouteSource.includes("platformUserId: context.platformUserId"), true);
  assert.equal(meRouteSource.includes("identityLinkMode: context.identityLinkMode"), true);
});

test("an unlinked row with the same email is reported, never served or duplicated", () => {
  const resolver = sourceBetween(
    requestUserSource,
    "async function resolveAppUserFromPlatformIdentity",
    "async function resolveFromAuthenticatedIdentity",
  );
  assert.equal(
    resolver.includes('reason: "PLATFORM_IDENTITY_NOT_LINKED"'),
    true,
    "an unlinked account with a matching email must be an explicit, actionable outcome",
  );
  assert.equal(
    resolver.includes('reason: "ORCA_ACCESS_NOT_PROVISIONED"'),
    true,
    "an unknown platform identity must be denied, not provisioned",
  );
  assert.equal(
    resolver.includes("createAppUserWithMembership"),
    false,
    "the resolver must not create a row under any branch",
  );
});

// --- DB-backed behaviour -----------------------------------------------------

test("canonical platform id resolves the Orca user directly", async (t) => {
  const harness = createHarnessOrSkip(t, "platform-identity-canonical");
  if (!harness) return;

  try {
    const organization = await harness.createOrganization();
    const user = await harness.createUser({ orgId: organization.id, role: UserRole.MEMBER });
    const platformUserId = randomUUID();
    await getPrisma().user.update({ where: { id: user.id }, data: { platformUserId } });

    const resolution = await resolveAppUserByPlatformIdentity({
      platformUserId,
      // A deliberately wrong email: the canonical id alone must resolve the row.
      email: "someone-else@planner.test",
    });

    assert.equal(resolution.status, "RESOLVED");
    if (resolution.status !== "RESOLVED") return;
    assert.equal(resolution.appUser.id, user.id);
    assert.equal(resolution.linkMode, "CANONICAL");
  } finally {
    await harness.cleanup();
  }
});

test("the email bridge links a legacy row once, then resolves canonically", async (t) => {
  const harness = createHarnessOrSkip(t, "platform-identity-bridge");
  if (!harness) return;

  try {
    const organization = await harness.createOrganization();
    const user = await harness.createUser({ orgId: organization.id, role: UserRole.MEMBER });
    const platformUserId = randomUUID();

    const first = await resolveAppUserByPlatformIdentity({ platformUserId, email: user.email });
    assert.equal(first.status, "RESOLVED");
    if (first.status !== "RESOLVED") return;
    assert.equal(first.appUser.id, user.id);
    assert.equal(first.linkMode, "EMAIL_BRIDGE_LINKED");
    assert.equal(first.appUser.platformUserId, platformUserId);

    // The claim is persisted, so the second call no longer depends on email at all.
    const second = await resolveAppUserByPlatformIdentity({ platformUserId, email: null });
    assert.equal(second.status, "RESOLVED");
    if (second.status !== "RESOLVED") return;
    assert.equal(second.appUser.id, user.id);
    assert.equal(second.linkMode, "CANONICAL");
  } finally {
    await harness.cleanup();
  }
});

test("a matching email belonging to a different platform identity is refused, not merged", async (t) => {
  const harness = createHarnessOrSkip(t, "platform-identity-conflict");
  if (!harness) return;

  try {
    const organization = await harness.createOrganization();
    const user = await harness.createUser({ orgId: organization.id, role: UserRole.MEMBER });
    const originalPlatformUserId = randomUUID();
    await getPrisma().user.update({
      where: { id: user.id },
      data: { platformUserId: originalPlatformUserId },
    });

    const resolution = await resolveAppUserByPlatformIdentity({
      platformUserId: randomUUID(),
      email: user.email,
    });

    assert.equal(resolution.status, "CONFLICT");
    if (resolution.status !== "CONFLICT") return;
    assert.equal(resolution.reason, "PLATFORM_IDENTITY_CONFLICT");

    // The existing link is untouched.
    const reread = await getPrisma().user.findUnique({
      where: { id: user.id },
      select: { platformUserId: true },
    });
    assert.equal(reread?.platformUserId, originalPlatformUserId);
  } finally {
    await harness.cleanup();
  }
});

test("with the bridge disabled, a matching email no longer resolves an unlinked user", async (t) => {
  const harness = createHarnessOrSkip(t, "platform-identity-bridge-off");
  if (!harness) return;

  try {
    const organization = await harness.createOrganization();
    const user = await harness.createUser({ orgId: organization.id, role: UserRole.MEMBER });

    const previous = process.env.PLATFORM_IDENTITY_EMAIL_BRIDGE;
    process.env.PLATFORM_IDENTITY_EMAIL_BRIDGE = "false";
    try {
      const resolution = await resolveAppUserByPlatformIdentity({
        platformUserId: randomUUID(),
        email: user.email,
      });
      assert.equal(resolution.status, "NOT_FOUND");
    } finally {
      if (previous === undefined) delete process.env.PLATFORM_IDENTITY_EMAIL_BRIDGE;
      else process.env.PLATFORM_IDENTITY_EMAIL_BRIDGE = previous;
    }

    // Nothing was written while the bridge was off.
    const reread = await getPrisma().user.findUnique({
      where: { id: user.id },
      select: { platformUserId: true },
    });
    assert.equal(reread?.platformUserId, null);
  } finally {
    await harness.cleanup();
  }
});

test("a malformed platform user id is rejected before any lookup", async (t) => {
  const harness = createHarnessOrSkip(t, "platform-identity-invalid");
  if (!harness) return;

  try {
    const resolution = await resolveAppUserByPlatformIdentity({
      platformUserId: "definitely-not-a-uuid",
      email: "anyone@planner.test",
    });
    assert.equal(resolution.status, "CONFLICT");
    if (resolution.status !== "CONFLICT") return;
    assert.equal(resolution.reason, "PLATFORM_USER_ID_INVALID");
  } finally {
    await harness.cleanup();
  }
});

test("linking is idempotent under repeated resolution", async (t) => {
  const harness = createHarnessOrSkip(t, "platform-identity-idempotent");
  if (!harness) return;

  try {
    const organization = await harness.createOrganization();
    const user = await harness.createUser({ orgId: organization.id, role: UserRole.MEMBER });
    const platformUserId = randomUUID();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const resolution = await resolveAppUserByPlatformIdentity({ platformUserId, email: user.email });
      assert.equal(resolution.status, "RESOLVED");
      if (resolution.status !== "RESOLVED") return;
      assert.equal(resolution.appUser.id, user.id);
      assert.equal(resolution.appUser.platformUserId, platformUserId);
    }

    const linkedCount = await getPrisma().user.count({ where: { platformUserId } });
    assert.equal(linkedCount, 1, "exactly one Orca row may hold a given platform identity");
  } finally {
    await harness.cleanup();
  }
});

test("with the bridge off, an unlinked account is reported rather than duplicated", async (t) => {
  const harness = createHarnessOrSkip(t, "platform-identity-not-linked");
  if (!harness) return;

  try {
    const organization = await harness.createOrganization();
    const user = await harness.createUser({ orgId: organization.id, role: UserRole.MEMBER });

    const previous = process.env.PLATFORM_IDENTITY_EMAIL_BRIDGE;
    process.env.PLATFORM_IDENTITY_EMAIL_BRIDGE = "false";
    try {
      // Resolution finds nothing canonical, and the bridge is off.
      const resolution = await resolveAppUserByPlatformIdentity({
        platformUserId: randomUUID(),
        email: user.email,
      });
      assert.equal(resolution.status, "NOT_FOUND");

      // The row still exists exactly once, so a naive create would violate the unique
      // email index. request-user reports PLATFORM_IDENTITY_NOT_LINKED instead.
      const rows = await getPrisma().user.count({ where: { email: user.email } });
      assert.equal(rows, 1);
    } finally {
      if (previous === undefined) delete process.env.PLATFORM_IDENTITY_EMAIL_BRIDGE;
      else process.env.PLATFORM_IDENTITY_EMAIL_BRIDGE = previous;
    }
  } finally {
    await harness.cleanup();
  }
});
