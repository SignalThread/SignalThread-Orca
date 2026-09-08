// @lr area=test-infra severity=P1 layer=static
/**
 * The runner's own contract.
 *
 * Plan §65 — "test the tests". A runner that miscounts, hides a flake, or lets a
 * mistyped `--area` report 0/0 ✓ is worse than no runner, because every downstream
 * prompt's number is derived from it.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  AREAS,
  AREA_NAMES,
  LAYERS,
  SEVERITIES,
  assertKnownArea,
  assertKnownLayer,
  assertKnownSeverity,
} from "../../scripts/testing/areas.mjs";
import { parseDirective, compileRegistry, resolveTags } from "../../scripts/testing/tags.mjs";
import {
  checkEnvironment,
  parseDotEnv,
  supabaseProjectRef,
  GUARD_OK,
  GUARD_ABORT,
} from "../../scripts/testing/env-guard.mjs";

const REPO_ROOT = process.cwd();

// ── area registry ───────────────────────────────────────────────────────────────

describe("area registry", () => {
  it("every area declares a description, repo, owning prompt, and plan refs", () => {
    for (const [name, def] of Object.entries(AREAS)) {
      assert.ok(def.description?.length > 10, `${name} needs a real description`);
      assert.ok(["web", "mobile", "both"].includes(def.repo), `${name} has an invalid repo: ${def.repo}`);
      assert.ok(def.prompt >= 2 && def.prompt <= 14, `${name} has an out-of-range prompt: ${def.prompt}`);
      assert.ok(def.planRefs?.length > 0, `${name} must cite the plan sections it proves`);
    }
  });

  it("area names are stable, sorted, and unique", () => {
    assert.deepStrictEqual(AREA_NAMES, [...new Set(AREA_NAMES)].sort());
  });

  it("rejects an unknown area and suggests the nearest match", () => {
    assert.throws(
      () => assertKnownArea("tenant-isolatoin"),
      (err: Error) => {
        assert.match(err.message, /Unknown test area/);
        assert.match(err.message, /Did you mean: tenant-isolation/);
        return true;
      },
      "a typo must fail loudly — silently matching nothing would report 0/0 ✓ and read as a pass"
    );
  });

  it("rejects unknown severities and layers", () => {
    assert.throws(() => assertKnownSeverity("P9"), /Unknown severity/);
    assert.throws(() => assertKnownLayer("integration"), /Unknown test layer/);
    for (const s of SEVERITIES) assert.equal(assertKnownSeverity(s), s);
    for (const l of LAYERS) assert.equal(assertKnownLayer(l), l);
  });

  it("covers every area named by the prompts document", () => {
    // The areas each prompt declares in TESTING_PROMPTS.md must all exist here,
    // or a prompt will fail at the point it tries to register its tests.
    const required = [
      "auth-session", "auth-rbac", "tenant-isolation", "event-isolation", "rls",
      "lead-domain", "import", "autosave", "navigation", "filters", "collections",
      "mobile-capture", "mobile-offline", "mobile-localdb", "cross-surface",
      "audio-recording", "conversation-pipeline",
      "intelligence-readmodel", "dashboards", "fallback-provenance",
      "workflows", "campaigns", "signals",
      "provider-oauth", "provider-gmail", "provider-calendar", "provider-followup",
      "ai-prompt-scope", "ai-quality", "ai-drift",
      "api-contract", "async-jobs", "webhooks", "migrations", "client-compat",
      "security", "bypass-assertions", "config", "feature-flags",
      "performance", "resilience", "observability", "visual", "production-smoke", "governance",
    ];
    for (const area of required) {
      assert.ok(AREAS[area], `TESTING_PROMPTS.md declares area "${area}" but the registry does not define it`);
    }
  });
});

// ── tagging ─────────────────────────────────────────────────────────────────────

describe("tag resolution", () => {
  it("parses an in-file directive", () => {
    const parsed = parseDirective(
      "// @lr area=rls severity=P0 layer=db category=separate-security-db\nimport x from 'y';"
    );
    assert.deepStrictEqual(parsed, {
      area: "rls", severity: "P0", layer: "db", category: "separate-security-db",
    });
  });

  it("ignores a directive below the header window", () => {
    const source = `${"\n".repeat(80)}// @lr area=rls severity=P0`;
    assert.equal(parseDirective(source), null);
  });

  it("prefers an in-file directive over the registry", () => {
    const compiled = compileRegistry({ "WEB/tests/**": { area: "lead-domain", severity: "P2", layer: "unit", category: "local-only" } });
    const tags = resolveTags("WEB/tests/a.test.ts", compiled, "// @lr area=rls severity=P0 layer=db category=separate-security-db");
    assert.equal(tags.area, "rls");
    assert.equal(tags.severity, "P0");
    assert.equal(tags.source, "directive");
  });

  it("prefers the more specific registry pattern", () => {
    const compiled = compileRegistry({
      "WEB/**": { area: "governance", severity: "P3", layer: "static", category: "local-only" },
      "WEB/tests/auth/**": { area: "auth-session", severity: "P0", layer: "api", category: "local-only" },
    });
    assert.equal(resolveTags("WEB/tests/auth/login.test.ts", compiled, null).area, "auth-session");
    assert.equal(resolveTags("WEB/tests/other.test.ts", compiled, null).area, "governance");
  });

  it("returns UNTAGGED rather than guessing when nothing matches", () => {
    const tags = resolveTags("WEB/tests/orphan.test.ts", compileRegistry({}), null);
    assert.equal(tags.area, "UNTAGGED");
    assert.equal(tags.severity, "UNTAGGED");
  });

  it("throws on a directive naming an area that does not exist", () => {
    assert.throws(
      () => resolveTags("WEB/tests/a.test.ts", compileRegistry({}), "// @lr area=not-a-real-area severity=P0 category=local-only"),
      /Unknown test area/
    );
  });
});

describe("retro-tag registry", () => {
  const registry = JSON.parse(
    readFileSync(join(REPO_ROOT, "scripts/testing/tag-registry.json"), "utf8")
  ) as { tags: Record<string, { area: string; severity: string; layer: string; category: string }> };

  it("tags every discovered test file — no file may be UNTAGGED", () => {
    assert.ok(Object.keys(registry.tags).length > 400, "expected the full pre-existing suite to be tagged");
  });

  it("only uses areas, severities and layers that exist in the registry", () => {
    for (const [file, tags] of Object.entries(registry.tags)) {
      assert.ok(AREAS[tags.area], `${file} is tagged with unknown area "${tags.area}"`);
      assert.ok(SEVERITIES.includes(tags.severity as never), `${file} has unknown severity "${tags.severity}"`);
      assert.ok(LAYERS.includes(tags.layer as never), `${file} has unknown layer "${tags.layer}"`);
      assert.ok(tags.category, `${file} has no category — Brief §9 requires all three tags`);
    }
  });

  it("classifies the known P0 isolation files as P0", () => {
    // These are the files Prompt 1 identified as claiming P0 invariants. If one of
    // them silently drops to P2, it stops being release-blocking.
    const mustBeP0 = [
      "WEB/tests/cross-tenant-resource-isolation.test.ts",
      "WEB/tests/documents-email-account-isolation.test.ts",
      "WEB/tests/briefing-rls-exhibitor-admin.test.ts",
      "WEB/tests/imported-lead-event-scope-contract.test.ts",
      "WEB/tests/publish-leads-materialization-scope.test.ts",
    ];
    for (const file of mustBeP0) {
      const tags = registry.tags[file];
      assert.ok(tags, `${file} is missing from the tag registry`);
      assert.equal(tags.severity, "P0", `${file} must stay P0`);
    }
  });
});

// ── environment guard ───────────────────────────────────────────────────────────

describe("environment safety guard", () => {
  it("extracts a Supabase project ref from a URL", () => {
    assert.equal(supabaseProjectRef("https://abcdefgh.supabase.co"), "abcdefgh");
    assert.equal(supabaseProjectRef("https://ABCDEFGH.supabase.co/rest/v1"), "abcdefgh");
    assert.equal(supabaseProjectRef("http://localhost:54321"), null);
    assert.equal(supabaseProjectRef(""), null);
    assert.equal(supabaseProjectRef(undefined as never), null);
  });

  it("parses dotenv text including quoted values", () => {
    const parsed = parseDotEnv(`# comment\nA=1\nB="two"\nC='three'\n\nD=has=equals`);
    assert.deepStrictEqual(parsed, { A: "1", B: "two", C: "three", D: "has=equals" });
  });

  it("ABORTS when the configured project is the production project", () => {
    const result = checkEnvironment({
      repoRoot: REPO_ROOT,
      env: {
        LR_PROD_SUPABASE_REF: "prodref",
        NEXT_PUBLIC_SUPABASE_URL: "https://prodref.supabase.co",
      },
    });
    assert.equal(result.status, GUARD_ABORT);
    assert.match(result.reasons.join(" "), /PRODUCTION project/);
  });

  it("ABORTS when the configured OAuth client is the production client", () => {
    const result = checkEnvironment({
      repoRoot: REPO_ROOT,
      env: {
        LR_PROD_GOOGLE_CLIENT_ID: "prod-client-id.apps.googleusercontent.com",
        GOOGLE_WORKSPACE_CLIENT_ID: "prod-client-id.apps.googleusercontent.com",
      },
    });
    assert.equal(result.status, GUARD_ABORT);
    assert.match(result.reasons.join(" "), /PRODUCTION OAuth client/);
  });

  it("ABORTS in a production deployment context", () => {
    assert.equal(checkEnvironment({ repoRoot: REPO_ROOT, env: { VERCEL_ENV: "production" } }).status, GUARD_ABORT);
    assert.equal(checkEnvironment({ repoRoot: REPO_ROOT, env: { NODE_ENV: "production" } }).status, GUARD_ABORT);
  });

  it("allows a deliberate production smoke run only with an explicit override", () => {
    const result = checkEnvironment({
      repoRoot: REPO_ROOT,
      env: { NODE_ENV: "production", LR_ALLOW_NODE_ENV_PRODUCTION: "1" },
    });
    assert.equal(result.status, GUARD_OK);
  });

  it("permits a non-production project", () => {
    const result = checkEnvironment({
      repoRoot: REPO_ROOT,
      env: {
        LR_PROD_SUPABASE_REF: "prodref",
        NEXT_PUBLIC_SUPABASE_URL: "https://testref.supabase.co",
      },
    });
    assert.equal(result.status, GUARD_OK);
  });

  it("strict mode refuses to run against an unidentified project", () => {
    const ambiguous = checkEnvironment({ repoRoot: REPO_ROOT, env: { LR_REQUIRE_TEST_ENV: "1" } });
    assert.equal(ambiguous.status, GUARD_ABORT);
    assert.match(ambiguous.reasons.join(" "), /ambiguous target/);
  });

  it("strict mode refuses a project outside the allowlist", () => {
    const result = checkEnvironment({
      repoRoot: REPO_ROOT,
      env: {
        LR_REQUIRE_TEST_ENV: "1",
        NEXT_PUBLIC_SUPABASE_URL: "https://unknownref.supabase.co",
        LR_TEST_ALLOWED_SUPABASE_REFS: "testref,otherref",
      },
    });
    assert.equal(result.status, GUARD_ABORT);
    assert.match(result.reasons.join(" "), /not in/);
  });

  it("strict mode admits an allowlisted project", () => {
    const result = checkEnvironment({
      repoRoot: REPO_ROOT,
      env: {
        LR_REQUIRE_TEST_ENV: "1",
        NEXT_PUBLIC_SUPABASE_URL: "https://testref.supabase.co",
        LR_TEST_ALLOWED_SUPABASE_REFS: "testref,otherref",
      },
    });
    assert.equal(result.status, GUARD_OK);
  });
});
