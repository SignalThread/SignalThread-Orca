// @lr area=tenant-isolation severity=P0 layer=api
/**
 * Cross-company isolation for email templates — proven behaviorally.
 *
 * ── What this replaces ──────────────────────────────────────────────────────────
 *
 * `tests/documents-email-account-isolation.test.ts` claims these same invariants and
 * proves them by regexing the route's source for `role === "exhibitor_admin"`. Prompt 1
 * found that test is simultaneously:
 *
 *   - a false green: it would pass with every `.eq("account_id", accountId)` deleted,
 *     as long as that string literal remained somewhere in the file
 *   - a false red: it fails today because the literal was refactored into
 *     `isCompanyAccountAdminSession()`, while the invariant itself is intact
 *
 * These tests invoke the real route handlers against a scope-enforcing in-memory
 * database seeded with two companies. A handler that forgets its scoping predicate
 * genuinely reads or writes Company B's row, and the assertion fails on the returned
 * data — not on the source text.
 *
 * The stale source-string tests are left in place and still failing. Per Brief §6 this
 * project does not fix things; Prompt 1 recorded them, and their replacement is here.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { createScopedSupabase, assertEveryQueryScoped, type ScopedSupabase } from "../helpers/scoped-supabase";

/**
 * A COMPLETE, valid update payload.
 *
 * This matters more than it looks. The PATCH handler rejects a partial body with 400
 * before it ever queries the database. An isolation test that sends `{ name }` alone
 * therefore passes whether or not scoping works — it is only proving that validation
 * runs. Caught by the plan §80 deliberate-break drill: with every
 * `.eq("account_id", accountId)` removed from the route, the partial-payload version of
 * these tests stayed green.
 *
 * Every cross-tenant PATCH below sends a payload that WILL reach the database, so the
 * scoping predicate is the only thing standing between Company A and Company B's row.
 */
const validUpdate = (over: Record<string, unknown> = {}) => JSON.stringify({
  name: "hijacked", subject: "hijacked subject", body: "hijacked body", ...over,
});

const COMPANY_A = "company-aaaa";
const COMPANY_B = "company-bbbb";
const TEMPLATE_A = "template-a-1";
const TEMPLATE_B = "template-b-1";

type SessionUser = { id: string; company_id: string | null; role: string; active_company_id?: string | null };

const ADMIN_A: SessionUser = { id: "user-a", company_id: COMPANY_A, role: "exhibitor_admin" };
const ADMIN_B: SessionUser = { id: "user-b", company_id: COMPANY_B, role: "exhibitor_admin" };
const VIEWER_A: SessionUser = { id: "user-a-viewer", company_id: COMPANY_A, role: "exhibitor_viewer" };

let db: ScopedSupabase;
let currentSession: SessionUser | null = ADMIN_A;

function seed() {
  return createScopedSupabase({
    tables: {
      email_templates: [
        { id: TEMPLATE_A, account_id: COMPANY_A, name: "A template", subject: "A subj", body: "A body", is_default: true },
        { id: TEMPLATE_B, account_id: COMPANY_B, name: "B template", subject: "B subj", body: "B body", is_default: true },
      ],
    },
  });
}

/**
 * Load the route with its ambient dependencies replaced.
 *
 * `server-only` is stubbed because it throws by design outside a server component
 * graph; the session and admin client are replaced so the handler runs against the
 * scope-enforcing double. Nothing about the handler's own logic is mocked.
 */
async function loadRoute() {
  mock.module("server-only", { namedExports: {} });
  mock.module("@/lib/auth/session", {
    namedExports: {
      getCurrentSessionUser: async () => currentSession,
      isCompanyAccountAdminSession: (u: SessionUser | null) =>
        Boolean(u) && (u!.role === "exhibitor_admin" || u!.role === "platform_admin"),
      hasActivePlatformAdminAccountContext: (u: SessionUser | null) => Boolean(u?.active_company_id),
    },
  });
  mock.module("@/lib/supabase/admin", { namedExports: { createAdminClient: () => db } });
  return import("../../app/api/exhibitor/email-templates/[templateId]/route");
}

const params = (templateId: string) => ({ params: Promise.resolve({ templateId }) });

beforeEach(() => {
  db = seed();
  currentSession = ADMIN_A;
});
afterEach(() => {
  mock.reset();
});

describe("email templates — cross-company READ isolation (P0)", () => {
  it("Company A admin cannot read Company B's template through the update path", async () => {
    const { PATCH } = await loadRoute();
    currentSession = ADMIN_A;

    const response = await PATCH(
      new Request("http://localhost/api/exhibitor/email-templates/template-b-1", {
        method: "PATCH",
        body: validUpdate(),
      }),
      params(TEMPLATE_B)
    );

    assert.notEqual(response.status, 200, "Company A must not succeed against Company B's template id");

    // The decisive assertion: B's row is untouched in the database end state.
    const templateB = db.rows("email_templates").find((r) => r.id === TEMPLATE_B);
    assert.equal(templateB?.name, "B template", "Company B's template must be byte-identical after the attempt");
    assert.equal(templateB?.account_id, COMPANY_B);
  });

  it("every query against email_templates filters on account_id", async () => {
    const { PATCH } = await loadRoute();
    currentSession = ADMIN_A;
    await PATCH(
      new Request("http://localhost/x", { method: "PATCH", body: validUpdate({ name: "own edit" }) }),
      params(TEMPLATE_A)
    );

    // Service-role bypasses RLS, so an unscoped query has nothing behind it. Plan §50.
    assertEveryQueryScoped(db, "email_templates", "account_id");
  });
});

describe("email templates — cross-company DELETE isolation (P0)", () => {
  it("Company A admin cannot delete Company B's template", async () => {
    const { DELETE } = await loadRoute();
    currentSession = ADMIN_A;

    await DELETE(
      new Request("http://localhost/x", { method: "DELETE" }),
      params(TEMPLATE_B)
    );

    const remaining = db.rows("email_templates");
    assert.ok(
      remaining.some((r) => r.id === TEMPLATE_B),
      "Company B's template must still exist — a successful toast is not proof (plan §19)"
    );
    assert.equal(remaining.length, 2, "no row may be removed by a cross-tenant delete");
  });

  it("Company A admin CAN delete its own template — isolation must not break the happy path", async () => {
    const { DELETE } = await loadRoute();
    currentSession = ADMIN_A;

    const response = await DELETE(new Request("http://localhost/x", { method: "DELETE" }), params(TEMPLATE_A));

    // Guards that deny everything would pass every test above while breaking the product.
    assert.ok(response.status < 400, `own-tenant delete must succeed, got ${response.status}`);
    assert.equal(
      db.rows("email_templates").some((r) => r.id === TEMPLATE_A),
      false,
      "the template must actually be gone from the database"
    );
    assert.ok(
      db.rows("email_templates").some((r) => r.id === TEMPLATE_B),
      "Company B is unaffected by Company A's legitimate delete"
    );
  });
});

describe("email templates — role authorization is server-side (P0)", () => {
  it("an unauthenticated request is rejected before any query runs", async () => {
    const { PATCH } = await loadRoute();
    currentSession = null;

    const response = await PATCH(
      new Request("http://localhost/x", { method: "PATCH", body: validUpdate() }),
      params(TEMPLATE_A)
    );

    assert.equal(response.status, 401);
    assert.equal(db.queries.length, 0, "an unauthenticated request must not reach the database at all");
  });

  it("a viewer cannot update, and the denial is server-side rather than a hidden button", async () => {
    const { PATCH } = await loadRoute();
    currentSession = VIEWER_A;

    const response = await PATCH(
      new Request("http://localhost/x", { method: "PATCH", body: validUpdate({ name: "viewer edit" }) }),
      params(TEMPLATE_A)
    );

    assert.equal(response.status, 403);
    const template = db.rows("email_templates").find((r) => r.id === TEMPLATE_A);
    assert.equal(template?.name, "A template", "a viewer's write must not land");
  });

  it("a viewer cannot delete", async () => {
    const { DELETE } = await loadRoute();
    currentSession = VIEWER_A;

    const response = await DELETE(new Request("http://localhost/x", { method: "DELETE" }), params(TEMPLATE_A));

    assert.equal(response.status, 403);
    assert.equal(db.rows("email_templates").length, 2, "nothing may be deleted by a viewer");
  });
});

describe("email templates — mass assignment (P0)", () => {
  it("account_id in the request body cannot move a template to another company", async () => {
    const { PATCH } = await loadRoute();
    currentSession = ADMIN_A;

    await PATCH(
      new Request("http://localhost/x", {
        method: "PATCH",
        // Plan §53: mass assignment of company_id / event_id / owner_user_id.
        body: validUpdate({ name: "renamed", account_id: COMPANY_B, id: TEMPLATE_B }),
      }),
      params(TEMPLATE_A)
    );

    const template = db.rows("email_templates").find((r) => r.id === TEMPLATE_A);
    assert.equal(
      template?.account_id,
      COMPANY_A,
      "account_id must derive from the authenticated session, never from the request body"
    );
    assert.equal(db.rows("email_templates").find((r) => r.id === TEMPLATE_B)?.account_id, COMPANY_B);
  });
});

describe("scope-enforcing double — self-verification", () => {
  /**
   * The double is now load-bearing for P0 conclusions, so it gets its own proof. If it
   * silently auto-scoped, every isolation test above would pass regardless of what the
   * product code does — the exact failure mode this file exists to eliminate.
   */
  it("returns another tenant's row when a query omits the scoping predicate", async () => {
    const probe = seed();
    const { data } = await probe.from("email_templates").select("*").eq("id", TEMPLATE_B);
    assert.equal((data as unknown[]).length, 1, "without an account_id predicate, B's row is visible");
    assert.equal((data as { account_id: string }[])[0].account_id, COMPANY_B);
  });

  it("returns nothing when the scoping predicate is present and does not match", async () => {
    const probe = seed();
    const { data } = await probe
      .from("email_templates").select("*").eq("id", TEMPLATE_B).eq("account_id", COMPANY_A);
    assert.deepStrictEqual(data, [], "with the predicate, A cannot see B");
  });

  it("an unfiltered update hits every row, exactly as it would in Postgres", async () => {
    const probe = seed();
    await probe.from("email_templates").update({ name: "clobbered" });
    assert.deepStrictEqual(
      probe.rows("email_templates").map((r) => r.name),
      ["clobbered", "clobbered"],
      "the double must not invent scoping the product code did not write"
    );
  });

  it("assertEveryQueryScoped detects an unscoped query", async () => {
    const probe = seed();
    await probe.from("email_templates").select("*").eq("id", TEMPLATE_A);
    assert.throws(() => assertEveryQueryScoped(probe, "email_templates", "account_id"), /did not filter on "account_id"/);
  });
});
