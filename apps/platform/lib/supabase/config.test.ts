import assert from "node:assert/strict";
import test from "node:test";
import { getPlatformAppUrl, requirePlatformAuthConfig, resolveAppOrigin } from "./config";

/**
 * The Supabase project URL is an Auth/API origin and the Platform app URL is a
 * frontend. Orca shipped a bug where the two were interchanged and users were
 * redirected to `https://<ref>.supabase.co/signin`, which returns
 * `{"error":"requested path is invalid"}`. These tests keep that from recurring
 * in the Platform app, independent of whatever a developer's .env.local holds.
 */

const SUPABASE_URL = "https://wtbnpeluwhjjqccdofxd.supabase.co";
const ANON = "anon-key";
const APP = "http://localhost:3001";

const MANAGED = [
  "NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL",
  "NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_PLATFORM_APP_URL",
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

const AUTH = {
  NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL: SUPABASE_URL,
  NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_ANON_KEY: ANON,
};

test("a configured frontend URL is returned as-is", () => {
  withEnv({ ...AUTH, NEXT_PUBLIC_PLATFORM_APP_URL: APP }, () => {
    assert.equal(getPlatformAppUrl(), APP);
    assert.equal(resolveAppOrigin("http://127.0.0.1:9999/x"), APP);
  });
});

test("the Supabase project URL is rejected as a frontend URL", () => {
  withEnv({ ...AUTH, NEXT_PUBLIC_PLATFORM_APP_URL: SUPABASE_URL }, () => {
    assert.equal(getPlatformAppUrl(), null);
    // Falls back to the request origin rather than the auth host.
    assert.equal(resolveAppOrigin("http://localhost:3001/signin"), "http://localhost:3001");
  });
});

test("no managed Supabase API host survives as a frontend URL", () => {
  for (const candidate of [
    "https://other.supabase.co",
    "https://other.supabase.in",
    "https://WTBNPELUWHJJQCCDOFXD.SUPABASE.CO",
  ]) {
    withEnv({ ...AUTH, NEXT_PUBLIC_PLATFORM_APP_URL: candidate }, () => {
      assert.equal(getPlatformAppUrl(), null, `${candidate} must not be usable as a frontend`);
    });
  }
});

test("a self-hosted auth origin is rejected even without a supabase.co domain", () => {
  withEnv(
    {
      NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL: "https://auth.signalthread.test",
      NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_ANON_KEY: ANON,
      NEXT_PUBLIC_PLATFORM_APP_URL: "https://auth.signalthread.test",
    },
    () => assert.equal(getPlatformAppUrl(), null),
  );
});

test("a malformed frontend URL is ignored rather than used", () => {
  withEnv({ ...AUTH, NEXT_PUBLIC_PLATFORM_APP_URL: "not-a-url" }, () => {
    assert.equal(getPlatformAppUrl(), null);
  });
});

test("auth config fails closed when half-configured", () => {
  withEnv({ NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_URL: SUPABASE_URL }, () => {
    assert.throws(() => requirePlatformAuthConfig(), /not configured/i);
  });
  withEnv({ NEXT_PUBLIC_PLATFORM_CORE_SUPABASE_ANON_KEY: ANON }, () => {
    assert.throws(() => requirePlatformAuthConfig(), /not configured/i);
  });
  withEnv({}, () => {
    assert.throws(() => requirePlatformAuthConfig(), /not configured/i);
  });
});

test("a fully configured authority resolves", () => {
  withEnv({ ...AUTH, NEXT_PUBLIC_PLATFORM_APP_URL: APP }, () => {
    const config = requirePlatformAuthConfig();
    assert.equal(config.url, SUPABASE_URL);
    assert.equal(config.anonKey, ANON);
  });
});
