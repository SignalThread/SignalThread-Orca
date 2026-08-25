import assert from "node:assert/strict";
import test from "node:test";
import {
  getPlatformCoreBaseUrl,
  getPlatformSignInUrl,
  getPlatformSignOutUrl,
  isPlatformEntryRoutingConfigured,
  resolvePlatformCoreBaseUrl,
} from "./entry";

/**
 * The SignalThread Platform frontend and the Platform Core Supabase project are different
 * services. Configuring the frontend variable with the Supabase project URL used to send
 * unauthenticated users to `https://<ref>.supabase.co/signin`, which answers
 * `{"error":"requested path is invalid"}`. Orca must fail closed instead of redirecting to
 * an auth host that cannot serve a sign-in page.
 */

const SUPABASE_URL = "https://wtbnpeluwhjjqccdofxd.supabase.co";
const ANON_KEY = "anon-key";
const PLATFORM_APP = "https://platform.signalthread.test";

const MANAGED = [
  "NEXT_PUBLIC_PLATFORM_CORE_APP_URL",
  "NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL",
  "NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_PLATFORM_CORE_SIGN_IN_PATH",
  "NEXT_PUBLIC_PLATFORM_CORE_SIGN_OUT_PATH",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_ORCA_APP_URL",
  "NODE_ENV",
] as const;

function withEnv(overrides: Record<string, string | undefined>, run: () => void): void {
  const saved = new Map<string, string | undefined>();
  for (const key of MANAGED) saved.set(key, process.env[key]);
  try {
    for (const key of MANAGED) delete process.env[key];
    for (const [key, value] of Object.entries(overrides)) {
      if (value !== undefined) process.env[key] = value;
    }
    run();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const AUTH_ONLY = {
  NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL: SUPABASE_URL,
  NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_ANON_KEY: ANON_KEY,
  NEXT_PUBLIC_ORCA_APP_URL: "http://localhost:3000",
};

// 1. Platform app URL configured -> redirects to the Platform frontend /signin.
test("a configured Platform frontend produces a sign-in redirect to that frontend", () => {
  withEnv({ ...AUTH_ONLY, NEXT_PUBLIC_PLATFORM_CORE_APP_URL: PLATFORM_APP }, () => {
    const signIn = getPlatformSignInUrl("/events/abc");
    assert.ok(signIn, "a sign-in URL must be produced when the frontend is configured");
    const url = new URL(signIn);
    assert.equal(url.origin, PLATFORM_APP);
    assert.equal(url.pathname, "/signin");
    assert.equal(url.searchParams.get("redirect_to"), "http://localhost:3000/events/abc");
    assert.equal(isPlatformEntryRoutingConfigured(), true);
  });
});

// 2. Platform app URL missing -> never redirects to *.supabase.co/signin.
test("an unset Platform frontend fails closed instead of falling back to the auth host", () => {
  withEnv({ ...AUTH_ONLY, NEXT_PUBLIC_PLATFORM_CORE_APP_URL: undefined }, () => {
    assert.equal(resolvePlatformCoreBaseUrl().status, "unset");
    assert.equal(getPlatformCoreBaseUrl(), null);
    assert.equal(getPlatformSignInUrl("/events/abc"), null);
    assert.equal(getPlatformSignOutUrl(), null);
    assert.equal(isPlatformEntryRoutingConfigured(), false);
  });
});

test("the Supabase project URL is rejected as a Platform frontend", () => {
  withEnv({ ...AUTH_ONLY, NEXT_PUBLIC_PLATFORM_CORE_APP_URL: SUPABASE_URL }, () => {
    const resolution = resolvePlatformCoreBaseUrl();
    assert.equal(resolution.status, "auth-host-rejected");
    assert.equal(getPlatformSignInUrl("/events/abc"), null);
    assert.equal(getPlatformSignOutUrl(), null);
    assert.equal(isPlatformEntryRoutingConfigured(), false);
  });
});

test("no managed Supabase API host can ever become a sign-in or sign-out destination", () => {
  for (const candidate of [
    SUPABASE_URL,
    "https://other-project.supabase.co",
    "https://other-project.supabase.in",
    "https://wtbnpeluwhjjqccdofxd.supabase.co/",
    "https://WTBNPELUWHJJQCCDOFXD.SUPABASE.CO",
  ]) {
    withEnv({ ...AUTH_ONLY, NEXT_PUBLIC_PLATFORM_CORE_APP_URL: candidate }, () => {
      assert.equal(getPlatformSignInUrl("/x"), null, `${candidate} must not yield a sign-in URL`);
      assert.equal(getPlatformSignOutUrl(), null, `${candidate} must not yield a sign-out URL`);
    });
  }
});

test("a self-hosted auth origin is rejected even when it is not a supabase.co domain", () => {
  withEnv(
    {
      ...AUTH_ONLY,
      NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL: "https://auth.signalthread.test",
      NEXT_PUBLIC_PLATFORM_CORE_APP_URL: "https://auth.signalthread.test",
    },
    () => {
      assert.equal(resolvePlatformCoreBaseUrl().status, "auth-host-rejected");
      assert.equal(getPlatformSignInUrl("/x"), null);
    },
  );
});

test("the legacy Orca Supabase origin is also rejected as a frontend", () => {
  withEnv(
    {
      ...AUTH_ONLY,
      NEXT_PUBLIC_SUPABASE_URL: "https://legacy-orca.supabase.co",
      NEXT_PUBLIC_PLATFORM_CORE_APP_URL: "https://legacy-orca.supabase.co",
    },
    () => {
      assert.equal(resolvePlatformCoreBaseUrl().status, "auth-host-rejected");
      assert.equal(getPlatformSignInUrl("/x"), null);
    },
  );
});

// 3. The Supabase URL remains usable for auth.
test("rejecting the auth host as a frontend does not disturb the auth authority variables", () => {
  withEnv({ ...AUTH_ONLY, NEXT_PUBLIC_PLATFORM_CORE_APP_URL: SUPABASE_URL }, () => {
    assert.equal(getPlatformSignInUrl("/x"), null);
    // The auth authority still reads its own variables, untouched by routing resolution.
    assert.equal(process.env.NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL, SUPABASE_URL);
    assert.equal(process.env.NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_ANON_KEY, ANON_KEY);
  });
});

// 4. Production fails closed.
test("production fails closed rather than guessing a frontend URL", () => {
  for (const appUrl of [undefined, SUPABASE_URL]) {
    withEnv(
      { ...AUTH_ONLY, NODE_ENV: "production", NEXT_PUBLIC_PLATFORM_CORE_APP_URL: appUrl },
      () => {
        const signIn = getPlatformSignInUrl("/events/abc");
        const signOut = getPlatformSignOutUrl();
        assert.equal(signIn, null, "production must not invent a sign-in URL");
        assert.equal(signOut, null, "production must not invent a sign-out URL");
        for (const value of [signIn, signOut]) {
          assert.equal(String(value).includes("supabase.co"), false);
        }
      },
    );
  }
});

test("a malformed Platform frontend URL is reported as invalid, not silently used", () => {
  withEnv({ ...AUTH_ONLY, NEXT_PUBLIC_PLATFORM_CORE_APP_URL: "not-a-url" }, () => {
    assert.equal(resolvePlatformCoreBaseUrl().status, "invalid");
    assert.equal(getPlatformSignInUrl("/x"), null);
  });
});

// Sign-out carries the same boundary as sign-in.
test("sign-out targets the Platform frontend when configured", () => {
  withEnv({ ...AUTH_ONLY, NEXT_PUBLIC_PLATFORM_CORE_APP_URL: PLATFORM_APP }, () => {
    const signOut = getPlatformSignOutUrl();
    assert.ok(signOut);
    const url = new URL(signOut);
    assert.equal(url.origin, PLATFORM_APP);
    assert.equal(url.pathname, "/signout");
    assert.equal(url.searchParams.get("redirect_to"), "http://localhost:3000");
  });
});

test("custom sign-in and sign-out paths still cannot escape onto the auth host", () => {
  withEnv(
    {
      ...AUTH_ONLY,
      NEXT_PUBLIC_PLATFORM_CORE_APP_URL: SUPABASE_URL,
      NEXT_PUBLIC_PLATFORM_CORE_SIGN_IN_PATH: "/auth/login",
      NEXT_PUBLIC_PLATFORM_CORE_SIGN_OUT_PATH: "/auth/logout",
    },
    () => {
      assert.equal(getPlatformSignInUrl("/x"), null);
      assert.equal(getPlatformSignOutUrl(), null);
    },
  );
});
