/**
 * Production environment safety guard.
 *
 * Brief §9.7 and §11, plan §75: before any test executes, assert that the configured
 * Supabase project and OAuth client are not production. Abort the whole run if they are.
 *
 * Design notes:
 *
 * - Production identifiers are **never committed**. They are resolved at runtime from
 *   `LR_PROD_SUPABASE_REF` / `LR_PROD_GOOGLE_CLIENT_ID`, or read out of
 *   `.env.production.local` (which is gitignored). A checked-in denylist would put the
 *   production project ref in the repo for the sake of keeping it out of the repo.
 *
 * - The guard is **fail-closed on match, fail-open on absence**. If no Supabase URL is
 *   configured at all, there is nothing to leak into and the run proceeds — that is the
 *   current state of this suite, where no test touches a real database. Set
 *   `LR_REQUIRE_TEST_ENV=1` to invert that and demand a positively identified test
 *   project, which is what CI should use once Prompt 4 introduces real DB tests.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const GUARD_OK = "ok";
export const GUARD_ABORT = "abort";

/** Pull `KEY=value` pairs out of a dotenv file without adding a dependency. */
export function parseDotEnv(text) {
  /** @type {Record<string,string>} */
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

/** `https://abcdefgh.supabase.co` → `abcdefgh`. Returns null if unparseable. */
export function supabaseProjectRef(url) {
  if (!url) return null;
  const m = String(url).trim().match(/^https?:\/\/([a-z0-9-]+)\.supabase\.(co|in|net)/i);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Resolve the identifiers that must never be used by a test run.
 * @param {{repoRoot:string, env:Record<string,string|undefined>}} input
 */
export function resolveProductionIdentifiers({ repoRoot, env }) {
  const refs = new Set();
  const clients = new Set();

  const addRef = (v) => { const r = supabaseProjectRef(v) ?? (v ? String(v).trim().toLowerCase() : null); if (r) refs.add(r); };
  const addClient = (v) => { if (v && String(v).trim()) clients.add(String(v).trim()); };

  addRef(env.LR_PROD_SUPABASE_REF);
  addClient(env.LR_PROD_GOOGLE_CLIENT_ID);

  const prodEnvFile = path.join(repoRoot, ".env.production.local");
  if (existsSync(prodEnvFile)) {
    try {
      const parsed = parseDotEnv(readFileSync(prodEnvFile, "utf8"));
      addRef(parsed.NEXT_PUBLIC_SUPABASE_URL || parsed.SUPABASE_URL);
      addClient(parsed.GOOGLE_WORKSPACE_CLIENT_ID);
    } catch {
      // Unreadable production env file is not itself a reason to block a test run.
    }
  }

  return { refs, clients, sources: { envVars: Boolean(env.LR_PROD_SUPABASE_REF), prodEnvFile: existsSync(prodEnvFile) } };
}

/**
 * @param {{repoRoot:string, env?:Record<string,string|undefined>}} input
 * @returns {{status:string, reasons:string[], checked:object}}
 */
export function checkEnvironment({ repoRoot, env = process.env }) {
  const reasons = [];
  const prod = resolveProductionIdentifiers({ repoRoot, env });

  const configuredUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "";
  const configuredRef = supabaseProjectRef(configuredUrl);
  const configuredClient = (env.GOOGLE_WORKSPACE_CLIENT_ID || "").trim();

  // 1. Never run against a production deployment context.
  if (env.VERCEL_ENV === "production") {
    reasons.push("VERCEL_ENV=production — the test suite must never run in a production deployment context.");
  }
  if (env.NODE_ENV === "production" && env.LR_ALLOW_NODE_ENV_PRODUCTION !== "1") {
    reasons.push("NODE_ENV=production — set LR_ALLOW_NODE_ENV_PRODUCTION=1 only for a deliberate production smoke run.");
  }

  // 2. Never point at the production Supabase project.
  if (configuredRef && prod.refs.has(configuredRef)) {
    reasons.push(
      `Configured Supabase project ref "${configuredRef}" is the PRODUCTION project. ` +
      `Point NEXT_PUBLIC_SUPABASE_URL at a test project before running tests.`
    );
  }

  // 3. Never use the production OAuth client.
  if (configuredClient && prod.clients.has(configuredClient)) {
    reasons.push(
      "Configured GOOGLE_WORKSPACE_CLIENT_ID is the PRODUCTION OAuth client. " +
      "A test run must not be able to consent, refresh, or send as production."
    );
  }

  // 4. Optional strict mode: demand a positively identified test project.
  if (env.LR_REQUIRE_TEST_ENV === "1") {
    if (!configuredRef) {
      reasons.push("LR_REQUIRE_TEST_ENV=1 but no Supabase project is configured. Refusing to run with an ambiguous target.");
    } else {
      const allowed = String(env.LR_TEST_ALLOWED_SUPABASE_REFS || "")
        .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
      if (allowed.length && !allowed.includes(configuredRef)) {
        reasons.push(
          `LR_REQUIRE_TEST_ENV=1 and Supabase ref "${configuredRef}" is not in ` +
          `LR_TEST_ALLOWED_SUPABASE_REFS (${allowed.join(", ")}).`
        );
      }
    }
  }

  return {
    status: reasons.length ? GUARD_ABORT : GUARD_OK,
    reasons,
    checked: {
      configuredSupabaseRef: configuredRef,
      configuredOAuthClientPresent: Boolean(configuredClient),
      productionRefsKnown: prod.refs.size,
      productionClientsKnown: prod.clients.size,
      productionIdentifierSources: prod.sources,
      strictMode: env.LR_REQUIRE_TEST_ENV === "1",
    },
  };
}

/** Print the guard result. Returns true when the run may proceed. */
export function enforceEnvironment({ repoRoot, env = process.env, log = console.error }) {
  const result = checkEnvironment({ repoRoot, env });
  if (result.status === GUARD_OK) return { ok: true, result };

  log("");
  log("  ╔══════════════════════════════════════════════════════════════════╗");
  log("  ║  LR TEST SUITE ABORTED — PRODUCTION ENVIRONMENT DETECTED         ║");
  log("  ╚══════════════════════════════════════════════════════════════════╝");
  log("");
  for (const reason of result.reasons) log(`   ✖ ${reason}`);
  log("");
  log("   No test was executed. Brief §11: the suite refuses to run against");
  log("   production before any test starts, not after one has written a row.");
  log("");
  return { ok: false, result };
}
