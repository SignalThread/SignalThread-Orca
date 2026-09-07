import assert from "node:assert/strict";
import test from "node:test";
import { isSecureDeployment, orcaAuthCookieOptions } from "@/src/lib/supabase/cookie-options";

/**
 * Orca's auth cookie must stay **host-scoped**.
 *
 * A `Domain=.signalthread.ai` cookie would be readable by every present and
 * future subdomain, and `@supabase/ssr` writes the session with
 * `httpOnly: false`, so one XSS or subdomain takeover anywhere under the apex
 * would hand over a session valid for every product. Cross-product SSO is a
 * deliberate handoff, never a shared cookie -- these tests pin that decision so
 * it cannot be undone by a convenience change later.
 */

const MANAGED = ["NODE_ENV", "NEXT_PUBLIC_ORCA_APP_URL"] as const;

function withEnv<T>(overrides: Record<string, string | undefined>, run: () => T): T {
  const saved = new Map<string, string | undefined>();
  for (const key of MANAGED) saved.set(key, process.env[key]);
  try {
    for (const key of MANAGED) delete process.env[key];
    for (const [key, value] of Object.entries(overrides)) {
      if (value !== undefined) process.env[key as string] = value;
    }
    return run();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key as string] = value;
    }
  }
}

test("orca: no Domain attribute is ever configured", () => {
  for (const env of [
    { NODE_ENV: "production", NEXT_PUBLIC_ORCA_APP_URL: "https://orca.signalthread.ai" },
    { NODE_ENV: "development", NEXT_PUBLIC_ORCA_APP_URL: "http://localhost:3000" },
    {},
  ]) {
    withEnv(env, () => {
      const options = orcaAuthCookieOptions();
      assert.equal("domain" in options, false, "a Domain key must not exist at all");
      assert.equal((options as Record<string, unknown>).domain, undefined);
    });
  }
});

test("the parent domain is never named anywhere in the options", () => {
  withEnv({ NODE_ENV: "production", NEXT_PUBLIC_ORCA_APP_URL: "https://orca.signalthread.ai" }, () => {
    const serialized = JSON.stringify(orcaAuthCookieOptions());
    assert.equal(serialized.includes("signalthread.ai"), false);
    assert.equal(serialized.includes(".signalthread"), false);
  });
});

test("production over HTTPS marks the cookie Secure", () => {
  withEnv({ NODE_ENV: "production", NEXT_PUBLIC_ORCA_APP_URL: "https://orca.signalthread.ai" }, () => {
    assert.equal(isSecureDeployment(), true);
    assert.equal(orcaAuthCookieOptions().secure, true);
  });
});

test("local HTTP development does not mark the cookie Secure", () => {
  // A Secure cookie on an http origin is dropped by the browser, which would
  // silently break local sign-in.
  withEnv({ NODE_ENV: "development", NEXT_PUBLIC_ORCA_APP_URL: "http://localhost:3000" }, () => {
    assert.equal(isSecureDeployment(), false);
    assert.equal(orcaAuthCookieOptions().secure, false);
  });
});

test("a local production build over HTTP still receives a usable cookie", () => {
  // NODE_ENV alone would say "secure", stranding a locally served production build.
  withEnv({ NODE_ENV: "production", NEXT_PUBLIC_ORCA_APP_URL: "http://localhost:3000" }, () => {
    assert.equal(isSecureDeployment(), false);
  });
});

test("a malformed app URL falls back to NODE_ENV rather than silently disabling Secure", () => {
  withEnv({ NODE_ENV: "production", NEXT_PUBLIC_ORCA_APP_URL: "not-a-url" }, () => {
    assert.equal(isSecureDeployment(), true, "a typo must not downgrade production security");
  });
  withEnv({ NODE_ENV: "production" }, () => {
    assert.equal(isSecureDeployment(), true);
  });
});

test("path and sameSite match the intended contract", () => {
  withEnv({ NODE_ENV: "production", NEXT_PUBLIC_ORCA_APP_URL: "https://orca.signalthread.ai" }, () => {
    const options = orcaAuthCookieOptions();
    assert.equal(options.path, "/");
    // Lax keeps the session on top-level navigations into the app (the launcher
    // handoff is a top-level GET) while refusing cross-site subrequests.
    assert.equal(options.sameSite, "lax");
  });
});

test("removal uses the same scope as writing", () => {
  // @supabase/ssr merges cookieOptions over its defaults for set AND remove, so a
  // single source of options means sign-out clears exactly what sign-in wrote.
  // Anything scope-bearing must therefore be identical across calls.
  withEnv({ NODE_ENV: "production", NEXT_PUBLIC_ORCA_APP_URL: "https://orca.signalthread.ai" }, () => {
    const a = orcaAuthCookieOptions();
    const b = orcaAuthCookieOptions();
    assert.deepEqual(a, b);
    for (const key of ["path", "sameSite", "secure"] as const) {
      assert.equal(a[key], b[key]);
    }
  });
});
