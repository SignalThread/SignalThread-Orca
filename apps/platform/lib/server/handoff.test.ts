import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildProductHandoffUrl, buildProductReturnPath, getProductAppUrl, getProductAuthAuthority } from "./product-registry";

/**
 * The handoff is a bearer credential for a real session, so the properties that
 * matter are structural: what it is built from, what it refuses, and the fact
 * that authorization runs before it exists.
 */

const HANDOFF = readFileSync("lib/server/handoff.ts", "utf8");
const REGISTRY = readFileSync("lib/server/product-registry.ts", "utf8");
const LAUNCH = readFileSync("app/api/launch/[product]/route.ts", "utf8");
const AUTHZ = readFileSync("lib/server/product-launch.ts", "utf8");
const DECISION = readFileSync("lib/server/launch-decision.ts", "utf8");

const MANAGED = [
  "ORCA_APP_URL",
  "NEXT_PUBLIC_ORCA_APP_URL",
  "PULSE_APP_URL",
  "NEXT_PUBLIC_PULSE_APP_URL",
  "LEAD_RETRIEVAL_APP_URL",
  "NEXT_PUBLIC_LEAD_RETRIEVAL_APP_URL",
] as const;
function withEnv<T>(o: Record<string, string | undefined>, run: () => T): T {
  const saved = new Map<string, string | undefined>();
  for (const k of MANAGED) saved.set(k, process.env[k]);
  try {
    for (const k of MANAGED) delete process.env[k];
    for (const [k, v] of Object.entries(o)) if (v !== undefined) process.env[k as string] = v;
    return run();
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k as string] = v;
    }
  }
}

test("the product URL comes from a server-only variable first", () => {
  withEnv({ ORCA_APP_URL: "https://orca.signalthread.ai", NEXT_PUBLIC_ORCA_APP_URL: "https://stale" }, () => {
    assert.equal(getProductAppUrl("orca"), "https://orca.signalthread.ai");
  });
  // NEXT_PUBLIC_* values are inlined at compile time, so the server-only name wins.
  withEnv({ NEXT_PUBLIC_ORCA_APP_URL: "https://orca.signalthread.ai/" }, () => {
    assert.equal(getProductAppUrl("orca"), "https://orca.signalthread.ai", "trailing slash trimmed");
  });
  withEnv({}, () => assert.equal(getProductAppUrl("orca"), null));
  withEnv({ ORCA_APP_URL: "https://x" }, () => assert.equal(getProductAppUrl("housing"), null));
});

test("event context is a relative product path, carrying no authority", () => {
  const path = buildProductReturnPath("orca", "ae9942ba-5759-486b-b591-f1b5ed223370");
  assert.equal(path, "/platform-entry?event_id=ae9942ba-5759-486b-b591-f1b5ed223370");
  assert.ok(path.startsWith("/"), "must be relative to the product origin");
  assert.equal(/^https?:/.test(path), false);
});

test("the event id is URL-encoded into the return path", () => {
  const path = buildProductReturnPath("orca", "a b&c=d");
  assert.equal(path.includes("&c=d"), false, "an injected parameter must not survive");
  assert.match(path, /event_id=a%20b%26c%3Dd/);
});

test("an unknown product yields no launchable path", () => {
  assert.equal(buildProductReturnPath("registration", "evt"), "/");
});

test("Pulse resolves its own base URL through the same two-name convention", () => {
  withEnv({ PULSE_APP_URL: "https://voice.signalthread.ai", NEXT_PUBLIC_PULSE_APP_URL: "https://stale" }, () => {
    assert.equal(getProductAppUrl("pulse"), "https://voice.signalthread.ai");
  });
  withEnv({ NEXT_PUBLIC_PULSE_APP_URL: "https://voice.signalthread.ai/" }, () => {
    assert.equal(getProductAppUrl("pulse"), "https://voice.signalthread.ai", "trailing slash trimmed");
  });
  withEnv({}, () => assert.equal(getProductAppUrl("pulse"), null, "unconfigured means not launchable, not a guess"));
  // Registering Pulse must not make a different product resolvable.
  withEnv({ PULSE_APP_URL: "https://voice.signalthread.ai" }, () => {
    assert.equal(getProductAppUrl("housing"), null);
    assert.equal(getProductAppUrl("orca"), null);
  });
});

test("Pulse lands on its own /platform-entry, carrying the event id as a hint only", () => {
  assert.equal(
    buildProductReturnPath("pulse", "ae9942ba-5759-486b-b591-f1b5ed223370"),
    "/platform-entry?event_id=ae9942ba-5759-486b-b591-f1b5ed223370",
  );
});

test("Lead Retrieval resolves its own base URL through the same two-name convention", () => {
  withEnv({ LEAD_RETRIEVAL_APP_URL: "https://lr.signalthread.ai", NEXT_PUBLIC_LEAD_RETRIEVAL_APP_URL: "https://stale" }, () => {
    assert.equal(getProductAppUrl("lead-retrieval"), "https://lr.signalthread.ai", "server-only name wins");
  });
  withEnv({ NEXT_PUBLIC_LEAD_RETRIEVAL_APP_URL: "https://lr.signalthread.ai/" }, () => {
    assert.equal(getProductAppUrl("lead-retrieval"), "https://lr.signalthread.ai", "public fallback, trailing slash trimmed");
  });
  withEnv({}, () => assert.equal(getProductAppUrl("lead-retrieval"), null, "unconfigured means not launchable, not a guess"));
  // Registering Lead Retrieval must not make any other product resolvable, nor borrow another product's URL.
  withEnv({ LEAD_RETRIEVAL_APP_URL: "https://lr.signalthread.ai" }, () => {
    assert.equal(getProductAppUrl("pulse"), null);
    assert.equal(getProductAppUrl("orca"), null);
    assert.equal(getProductAppUrl("registration"), null);
    assert.equal(getProductAppUrl("housing"), null);
  });
  withEnv({ PULSE_APP_URL: "https://voice.signalthread.ai", ORCA_APP_URL: "https://orca.signalthread.ai" }, () => {
    assert.equal(getProductAppUrl("lead-retrieval"), null, "no cross-product fallback");
  });
});

test("Lead Retrieval is an own-authority product: it never receives a Platform Core session", () => {
  assert.equal(getProductAuthAuthority("lead-retrieval"), "own");
  assert.equal(getProductAuthAuthority("pulse"), "own", "Pulse unchanged");
  assert.equal(getProductAuthAuthority("orca"), "platform-core", "Orca unchanged");
  assert.equal(getProductAuthAuthority("registration"), null);
  assert.equal(getProductAuthAuthority("housing"), null);
});

test("Lead Retrieval lands on its own /platform-entry, carrying the event id as a hint only", () => {
  assert.equal(
    buildProductReturnPath("lead-retrieval", "ae9942ba-5759-486b-b591-f1b5ed223370"),
    "/platform-entry?event_id=ae9942ba-5759-486b-b591-f1b5ed223370",
  );
  assert.equal(buildProductReturnPath("lead-retrieval", "a b"), "/platform-entry?event_id=a%20b", "encoded, never interpolated raw");
});

test("Lead Retrieval's handoff URL is the own-authority shape: token to /platform-entry, correlator relayed, no Supabase callback", () => {
  const url = buildProductHandoffUrl({
    productKey: "lead-retrieval",
    appUrl: "https://lr.signalthread.ai",
    hashedToken: "pkce_token",
    eventId: "ae9942ba-5759-486b-b591-f1b5ed223370",
    launchState: "a".repeat(64),
  });
  assert.equal(
    url,
    "https://lr.signalthread.ai/platform-entry?handoff=pkce_token&event_id=ae9942ba-5759-486b-b591-f1b5ed223370&state=" + "a".repeat(64),
  );
  const withoutState = buildProductHandoffUrl({
    productKey: "lead-retrieval",
    appUrl: "https://lr.signalthread.ai",
    hashedToken: "pkce_token",
    eventId: "ae9942ba-5759-486b-b591-f1b5ed223370",
  });
  assert.equal(withoutState, "https://lr.signalthread.ai/platform-entry?handoff=pkce_token&event_id=ae9942ba-5759-486b-b591-f1b5ed223370");
  assert.equal(String(url).includes("/auth/callback"), false, "an own-authority product never gets a Platform Core token exchange URL");
  assert.equal(String(url).includes("token_hash"), false);
  // A malformed correlator refuses the whole URL rather than dropping the binding.
  assert.equal(
    buildProductHandoffUrl({ productKey: "lead-retrieval", appUrl: "https://lr.signalthread.ai", hashedToken: "t", eventId: "e", launchState: "short" }),
    null,
  );
});

test("adding Lead Retrieval touched only the registry tables: generic launch, claim and authorization code name no product", () => {
  const HANDOFF_ROUTE = readFileSync("app/api/launch/[product]/route.ts", "utf8");
  const CLAIM_ROUTE = readFileSync("app/api/launch/[product]/claim/route.ts", "utf8");
  const CLAIM_CORE = readFileSync("lib/server/handoff-claim-core.ts", "utf8");
  for (const [name, source] of [
    ["handoff.ts", HANDOFF],
    ["product-launch.ts", AUTHZ],
    ["launch-decision.ts", DECISION],
    ["launch route", HANDOFF_ROUTE],
    ["claim route", CLAIM_ROUTE],
    ["handoff-claim-core.ts", CLAIM_CORE],
  ] as const) {
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.equal(/lead-retrieval|leadRetrieval|LEAD_RETRIEVAL/.test(code), false, `${name} carries no Lead Retrieval conditional`);
  }
  // The registry is the only place the product key appears on the Platform side of the handoff.
  assert.match(REGISTRY, /"lead-retrieval": \["LEAD_RETRIEVAL_APP_URL", "NEXT_PUBLIC_LEAD_RETRIEVAL_APP_URL"\]/);
  assert.match(REGISTRY, /"lead-retrieval": "own"/);
});

test("the handoff uses the Supabase-native one-time primitive, not custom crypto", () => {
  assert.match(HANDOFF, /generateLink/);
  assert.match(HANDOFF, /type:\s*"magiclink"/);
  assert.equal(/jsonwebtoken|jose|createHmac|createSign|randomBytes/.test(HANDOFF), false,
    "no home-grown token signing");
});

test("only a same-origin relative return path is accepted", () => {
  assert.match(REGISTRY, /startsWith\("\/"\)/);
  assert.match(REGISTRY, /startsWith\("\/\/"\)/);
  assert.match(HANDOFF, /INVALID_RETURN_PATH/);
});

test("the Supabase action_link is discarded so the redirect allowlist is never involved", () => {
  assert.match(HANDOFF, /hashed_token/);
  assert.equal(/action_link/.test(HANDOFF.replace(/\/\*[\s\S]*?\*\//g, "")), false,
    "only the hashed_token travels; the generated link is unused");
});

test("the service-role key never leaves Platform", () => {
  assert.match(HANDOFF, /^import "server-only";/m);
  assert.equal(/SERVICE_ROLE/.test(LAUNCH), false, "the route never handles the key directly");
});

test("authorization is invoked before the handoff is minted", () => {
  const authorizeAt = LAUNCH.indexOf("authorizeProductLaunch");
  const mintAt = LAUNCH.indexOf("mintProductHandoff");
  assert.ok(authorizeAt > 0 && mintAt > 0);
  assert.ok(authorizeAt < mintAt, "minting before checking would be an entitlement bypass");
});

test("the launch route trusts only the event id from the client", () => {
  assert.match(LAUNCH, /searchParams\.get\("event_id"\)/);
  for (const forbidden of ["organization_id", "return_to", "organizationId"]) {
    assert.equal(
      LAUNCH.includes(`searchParams.get("${forbidden}")`),
      false,
      `${forbidden} must never be read from the request`,
    );
  }
});

test("the handoff destination is built from the validated event, not the request", () => {
  assert.match(LAUNCH, /eventId:\s*decision\.eventId/);
  assert.equal(/eventId:\s*eventId[,\s]/.test(LAUNCH.slice(LAUNCH.indexOf("mintProductHandoff("))), false,
    "the raw request event id must never reach the mint");
  assert.match(HANDOFF, /buildProductHandoffUrl\(/);
});

test("authorization resolves the organization from the event, never from input", () => {
  assert.match(AUTHZ, /\.from\("events"\)/);
  assert.match(AUTHZ, /getOrganizationAccessForUser/);
  assert.match(AUTHZ, /decideProductLaunch\(\{ productKey: input\.productKey, event, access \}\)/);
  assert.match(DECISION, /ORG_NOT_MEMBER/);
  assert.match(DECISION, /PRODUCT_NOT_ENTITLED/);
  assert.match(DECISION, /EVENT_NOT_FOUND/);
  // Entitlement is checked against the owning org's derived product list.
  assert.match(DECISION, /owning\.products\.includes\(productKey\)/);
  assert.match(DECISION, /input\.event!\.organization_id/);
});

test("archived events are not launchable", () => {
  assert.match(DECISION, /ARCHIVED/);
  assert.match(DECISION, /EVENT_NOT_LAUNCHABLE/);
});

test("nothing sensitive is logged on the handoff path", () => {
  for (const src of [HANDOFF, LAUNCH, AUTHZ, DECISION]) {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    assert.equal(/console\.(log|info|warn|error|debug)/.test(code), false);
    assert.equal(/hashed_token.*console|console.*hashed_token/.test(code), false);
  }
});

test("the pattern generalises to future products without new authorization code", () => {
  // authorizeProductLaunch takes a product key rather than hard-coding Orca.
  assert.match(AUTHZ, /productKey: string/);
  assert.equal(/=== "orca"|=== "pulse"/.test(AUTHZ + DECISION), false, "authorization must stay product-agnostic");
  // Adding a product is a table entry plus a return-path case.
  assert.match(REGISTRY, /PRODUCT_APP_URL_ENV/);
});
