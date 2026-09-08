// @lr area=rls severity=P0 layer=db
/**
 * Row-level security as an enforcement layer (plan §50).
 *
 * ── Status: WRITTEN, NOT RUN ────────────────────────────────────────────────────
 *
 * Prompt 4 established that this repository has **no test database**: `.env.local`,
 * `.env.production.local` and `.env.vercel.local` all resolve to the same Supabase
 * project ref — production. Creating the companies, events, users and leads these tests
 * require would write fixtures into production, which Brief §11 forbids and the runner's
 * environment guard actively blocks (exit 78).
 *
 * These tests are therefore committed and reported `not-run` by the runner, exactly like
 * the Maestro device flows. They are **never counted as passes**. To execute them:
 *
 *   1. create a separate Supabase project and apply migrations 0001–0097
 *   2. set LR_TEST_SUPABASE_URL and LR_TEST_SUPABASE_SERVICE_ROLE_KEY
 *   3. add that project's ref to LR_TEST_ALLOWED_SUPABASE_REFS
 *
 * ── Why this cannot be replaced by the scope-enforcing double ───────────────────
 *
 * `tests/isolation/*` proves the *application* re-applies scope before service-role
 * mutations. That is a necessary check and plan §50 names it explicitly. But the
 * service-role client bypasses RLS entirely, so those tests say nothing about whether
 * RLS itself would hold if a query reached Postgres through the anon key — which is what
 * mobile and any direct Supabase client actually use.
 *
 * Prompt 1 found the existing "RLS coverage" is five files that grep migration SQL for
 * policy text. That proves a string exists in a file. It cannot detect a policy that
 * parses, applies, and is wrong.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

// ── harness ─────────────────────────────────────────────────────────────────────────

type Ctx = {
  admin: SupabaseLike;
  /** A client authenticated AS a given user, subject to RLS. */
  asUser(userId: string): SupabaseLike;
  companyA: string;
  companyB: string;
  eventA1: string;
  eventA2: string;
  adminAUser: string;
  adminBUser: string;
  viewerAUser: string;
  leadA1: string;
  leadA2: string;
  leadB1: string;
  cleanup(): Promise<void>;
};

type SupabaseLike = {
  from(table: string): {
    select(cols: string): Promise<{ data: unknown[] | null; error: { message: string } | null }> & Record<string, unknown>;
    [k: string]: unknown;
  };
};

let ctx: Ctx | null = null;

/**
 * Build the fixture. Intentionally left unimplemented until a test project exists — a
 * stub that silently returned an empty context would let every assertion below pass
 * vacuously, which is precisely the false-green class this project exists to remove.
 */
async function buildFixture(): Promise<Ctx> {
  throw new Error(
    "RLS fixture requires a dedicated test Supabase project. " +
      "Set LR_TEST_SUPABASE_URL, LR_TEST_SUPABASE_SERVICE_ROLE_KEY and " +
      "LR_TEST_ALLOWED_SUPABASE_REFS, then implement buildFixture(). " +
      "The runner reports this file as not-run until then."
  );
}

before(async () => {
  ctx = await buildFixture();
});

after(async () => {
  // Plan §11: failed cleanup is a test failure, not a warning.
  await ctx?.cleanup();
});

// ── the invariants ──────────────────────────────────────────────────────────────────

describe("RLS — cross-company reads (P0)", () => {
  it("Company B's admin cannot select Company A's leads through the anon client", async () => {
    const b = ctx!.asUser(ctx!.adminBUser);
    const { data, error } = await b.from("leads").select("id, company_id");
    assert.equal(error, null, "the query must succeed and simply return nothing, not error");
    const leaked = (data ?? []).filter((r) => (r as { company_id: string }).company_id === ctx!.companyA);
    assert.deepStrictEqual(leaked, [], "RLS must return zero of Company A's rows to Company B");
  });

  it("selecting Company A's lead by its exact id returns nothing for Company B", async () => {
    // The blunt cross-tenant read: B knows A's primary key and asks for it directly.
    const b = ctx!.asUser(ctx!.adminBUser);
    const { data } = await (b.from("leads").select("id") as unknown as {
      eq(c: string, v: string): Promise<{ data: unknown[] | null }>;
    }).eq("id", ctx!.leadA1);
    assert.deepStrictEqual(data, [], "knowing the id must not be sufficient to read the row");
  });
});

describe("RLS — cross-company writes (P0)", () => {
  it("Company B cannot update Company A's lead", async () => {
    const b = ctx!.asUser(ctx!.adminBUser);
    await (b.from("leads") as unknown as {
      update(p: Record<string, unknown>): { eq(c: string, v: string): Promise<unknown> };
    }).update({ full_name: "hijacked" }).eq("id", ctx!.leadA1);

    // Verify through the admin client: RLS may report success while affecting zero rows.
    const { data } = await (ctx!.admin.from("leads").select("full_name") as unknown as {
      eq(c: string, v: string): { maybeSingle(): Promise<{ data: { full_name: string } | null }> };
    }).eq("id", ctx!.leadA1).maybeSingle();
    assert.notEqual(data?.full_name, "hijacked", "the row must be unchanged in the database end state");
  });

  it("Company B cannot delete Company A's lead", async () => {
    const b = ctx!.asUser(ctx!.adminBUser);
    await (b.from("leads") as unknown as {
      delete(): { eq(c: string, v: string): Promise<unknown> };
    }).delete().eq("id", ctx!.leadA1);

    const { data } = await (ctx!.admin.from("leads").select("id") as unknown as {
      eq(c: string, v: string): { maybeSingle(): Promise<{ data: unknown }> };
    }).eq("id", ctx!.leadA1).maybeSingle();
    assert.notEqual(data, null, "Company A's lead must still exist");
  });

  it("Company B cannot insert a lead into Company A", async () => {
    const b = ctx!.asUser(ctx!.adminBUser);
    const { error } = (await (b.from("leads") as unknown as {
      insert(r: Record<string, unknown>): Promise<{ error: { message: string } | null }>;
    }).insert({ company_id: ctx!.companyA, event_id: ctx!.eventA1, full_name: "planted" })) ?? {};
    assert.notEqual(error, null, "an insert naming another company must be refused by policy");
  });
});

describe("RLS — same company, different event (P0)", () => {
  it("a user scoped to Event A1 cannot read Event A2's leads", async () => {
    // Plan §3: event isolation within one company is a distinct invariant from tenant
    // isolation, and is the one the imported-leads incident actually violated.
    const a = ctx!.asUser(ctx!.viewerAUser);
    const { data } = await a.from("leads").select("id, event_id");
    const otherEvent = (data ?? []).filter((r) => (r as { event_id: string }).event_id === ctx!.eventA2);
    assert.deepStrictEqual(otherEvent, [], "event scope must hold inside a single company");
  });
});

describe("RLS — viewer is read-only at the database layer (P0)", () => {
  it("a viewer cannot update a lead even in its own event", async () => {
    const v = ctx!.asUser(ctx!.viewerAUser);
    await (v.from("leads") as unknown as {
      update(p: Record<string, unknown>): { eq(c: string, v: string): Promise<unknown> };
    }).update({ full_name: "viewer wrote this" }).eq("id", ctx!.leadA1);

    const { data } = await (ctx!.admin.from("leads").select("full_name") as unknown as {
      eq(c: string, v: string): { maybeSingle(): Promise<{ data: { full_name: string } | null }> };
    }).eq("id", ctx!.leadA1).maybeSingle();
    assert.notEqual(
      data?.full_name,
      "viewer wrote this",
      "read-only must be enforced by policy, not only by the UI and the route handler"
    );
  });

  it("a viewer CAN read its own event's leads — deny-everything is not the goal", async () => {
    const v = ctx!.asUser(ctx!.viewerAUser);
    const { data } = await v.from("leads").select("id");
    assert.ok((data ?? []).length > 0, "a policy that denies everything would pass every test above");
  });
});

describe("RLS — unauthenticated access (P0)", () => {
  it("an anonymous client reads no leads at all", async () => {
    const anon = ctx!.asUser("");
    const { data } = await anon.from("leads").select("id");
    assert.deepStrictEqual(data ?? [], [], "no policy may expose leads to an unauthenticated caller");
  });
});

describe("RLS — service role intentionally bypasses, and the app must re-scope", () => {
  it("the service-role client CAN see every company — which is why §50 requires app-level scoping", () => {
    // Documents the boundary rather than asserting a leak is acceptable. The
    // corresponding application-layer proof is tests/isolation/*, which asserts every
    // service-role query carries its tenant predicate.
    assert.ok(true);
  });
});
