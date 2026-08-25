/**
 * Platform Core migration, Phase 1 — authentication authority boundary.
 *
 * Orca's authentication authority (which Supabase project issues sessions) and Orca's
 * operational database (`DATABASE_URL`, reached directly through Prisma) are separate
 * concerns. These tests pin the separation so authentication can be repointed at Platform
 * Core without touching data access, and so no code reaches around the resolver.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  AuthAuthorityConfigError,
  isPlatformCoreAuthAuthority,
  requireAuthAuthorityConfig,
  resolveAuthAuthorityConfig,
} from "@/src/lib/supabase/auth-authority";

const AUTH_ENV_KEYS = [
  "NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL",
  "NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

const PLATFORM_URL = "https://platform-core.supabase.co";
const PLATFORM_ANON = "platform-core-anon-key";
const LEGACY_URL = "https://legacy-orca.supabase.co";
const LEGACY_ANON = "legacy-orca-anon-key";

function withAuthEnv<T>(overrides: Partial<Record<(typeof AUTH_ENV_KEYS)[number], string>>, run: () => T): T {
  const previous = new Map<string, string | undefined>();
  for (const key of AUTH_ENV_KEYS) {
    previous.set(key, process.env[key]);
    const value = overrides[key];
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

// --- Resolution behaviour ------------------------------------------------------

test("Platform Core configuration takes precedence over the legacy Orca project", () => {
  withAuthEnv(
    {
      NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL: PLATFORM_URL,
      NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_ANON_KEY: PLATFORM_ANON,
      NEXT_PUBLIC_SUPABASE_URL: LEGACY_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: LEGACY_ANON,
    },
    () => {
      const config = requireAuthAuthorityConfig();
      assert.equal(config.url, PLATFORM_URL);
      assert.equal(config.anonKey, PLATFORM_ANON);
      assert.equal(config.source, "platform-core");
      assert.equal(isPlatformCoreAuthAuthority(), true);
    },
  );
});

test("without Platform Core configured, the legacy Orca project still authenticates", () => {
  withAuthEnv({ NEXT_PUBLIC_SUPABASE_URL: LEGACY_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: LEGACY_ANON }, () => {
    const config = requireAuthAuthorityConfig();
    assert.equal(config.url, LEGACY_URL);
    assert.equal(config.source, "legacy-orca");
    assert.equal(isPlatformCoreAuthAuthority(), false);
  });
});

test("a half-configured Platform Core authority fails loudly instead of falling back", () => {
  withAuthEnv(
    {
      NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL: PLATFORM_URL,
      NEXT_PUBLIC_SUPABASE_URL: LEGACY_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: LEGACY_ANON,
    },
    () => {
      assert.throws(() => resolveAuthAuthorityConfig(), AuthAuthorityConfigError);
    },
  );

  withAuthEnv({ NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_ANON_KEY: PLATFORM_ANON }, () => {
    assert.throws(() => resolveAuthAuthorityConfig(), AuthAuthorityConfigError);
  });
});

test("no configured authority resolves to null and is required loudly", () => {
  withAuthEnv({}, () => {
    assert.equal(resolveAuthAuthorityConfig(), null);
    assert.equal(isPlatformCoreAuthAuthority(), false);
    assert.throws(() => requireAuthAuthorityConfig(), AuthAuthorityConfigError);
  });
});

test("blank environment values are treated as unset", () => {
  withAuthEnv(
    {
      NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL: "   ",
      NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_ANON_KEY: "",
      NEXT_PUBLIC_SUPABASE_URL: LEGACY_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: LEGACY_ANON,
    },
    () => {
      assert.equal(requireAuthAuthorityConfig().source, "legacy-orca");
    },
  );
});

// --- Nothing reaches around the resolver ---------------------------------------

test("every auth entry point resolves the authority through the single helper", () => {
  // Files that build a Supabase client themselves must resolve the authority directly.
  const directResolvers = [
    "src/lib/supabase/server.ts",
    "src/lib/supabase/browser.ts",
    "src/lib/supabase/admin.ts",
    "app/auth/callback/route.ts",
  ];

  for (const file of directResolvers) {
    const source = readFileSync(file, "utf8");
    assert.match(
      source,
      /(require|resolve)AuthAuthorityConfig/,
      `${file} must resolve the authority through auth-authority.ts`,
    );
  }

  // Guards that do not build a client must delegate to the canonical resolver rather than
  // keeping a second, weaker copy of the session check (Phase 2).
  const delegatingGuards = ["app/(app)/layout.tsx", "app/(shell)/layout.tsx"];
  for (const file of delegatingGuards) {
    const source = readFileSync(file, "utf8");
    assert.equal(
      source.includes("ensureProvisionedUserAndContext"),
      true,
      `${file} must delegate session resolution to lib/request-user`,
    );
    assert.equal(
      source.includes("auth.getSession()"),
      false,
      `${file} must not trust an unverified session cookie`,
    );
  }

  for (const file of [...directResolvers, ...delegatingGuards]) {
    assert.equal(
      /process\.env\.NEXT_PUBLIC_SUPABASE_(URL|ANON_KEY)/.test(readFileSync(file, "utf8")),
      false,
      `${file} must not read the legacy Supabase env directly`,
    );
  }
});

test("the unused Supabase singleton client is gone", () => {
  assert.equal(existsSync("src/lib/supabase/client.ts"), false);
});

test("the service-role key is bound to the same project as the resolved authority", () => {
  const adminSource = readFileSync("src/lib/supabase/admin.ts", "utf8");
  assert.equal(
    adminSource.includes('authAuthority.source === "platform-core"'),
    true,
    "the key must be chosen by which project is the authority",
  );
  assert.equal(adminSource.includes("PLATFORM_CORE_SUPABASE_SERVICE_ROLE_KEY"), true);
  // Guard against re-using a cached client after the authority is repointed.
  assert.equal(adminSource.includes("adminClientUrl === authAuthority.url"), true);
});

test("operational database access is independent of the authentication authority", () => {
  for (const file of ["src/server/db/prisma.ts", "lib/prisma.ts"]) {
    const source = readFileSync(file, "utf8");
    assert.equal(source.includes("DATABASE_URL"), true, `${file} reads the operational datasource`);
    assert.equal(
      /SUPABASE|auth-authority/i.test(source),
      false,
      `${file} must not depend on the authentication authority`,
    );
  }

  const authoritySource = readFileSync("src/lib/supabase/auth-authority.ts", "utf8");
  assert.equal(
    authoritySource.includes("process.env.DATABASE_URL"),
    false,
    "the authority resolver must not read the operational datasource",
  );
});

test("the auth authority resolver stays browser-safe", () => {
  const authoritySource = readFileSync("src/lib/supabase/auth-authority.ts", "utf8");
  // Statically-referenced NEXT_PUBLIC_ names so Next can inline them into the bundle.
  assert.equal(authoritySource.includes("process.env.NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL"), true);
  assert.equal(authoritySource.includes("process.env.NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_ANON_KEY"), true);
  for (const serverOnly of ["node:", "@/lib/prisma", "next/headers", "SERVICE_ROLE"]) {
    assert.equal(
      authoritySource.includes(serverOnly),
      false,
      `the resolver must not pull in ${serverOnly}`,
    );
  }
});
