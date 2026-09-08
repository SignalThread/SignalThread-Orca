/**
 * Shared deterministic fixture primitives for core-journey tests (Phase 2 harness).
 *
 * Design constraints discovered from existing repo conventions:
 * - The `/tests` lane runs on `node:test` + `tsx`. Most tests are pure/contract tests
 *   using inline fixtures or the in-memory `fake-supabase` shim. Live-DB tests are
 *   env-gated (see `leads-export-supabase.integration.test.ts`).
 * - The supported live-DB setup primitive in the node:test lane is the **lead**, created
 *   under a *pre-existing* test company (and optional event). Company/event/user creation
 *   requires auth users + memberships and currently only exists in the Playwright `/e2e`
 *   lane (`e2e/helpers/supabase.ts`). Those are intentionally NOT re-implemented here; see
 *   JOURNEY_MATRIX.md "Harness status".
 * - Every created record is tagged with the test-run id inside a name field so cleanup can
 *   target only test data, mirroring the `e2eWorkflowArtifactNamePrefix` convention.
 *
 * Direct DB inserts here are *setup* fixtures only (allowed by the existing integration
 * convention). Journey tests that prove the real create path (Prompt 3+) must call the
 * actual product route/service rather than these seed helpers.
 */
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { JourneyCleanupRegistry } from "./journey-cleanup";

/** Human-readable tag embedded in fixture name fields. */
export const JOURNEY_TEST_PREFIX = "LRJ";

/** Create a unique, recognizable test-run id, e.g. `lrj-1a2b3c4d`. */
export function createTestRunId(): string {
  return `${JOURNEY_TEST_PREFIX.toLowerCase()}-${randomUUID().slice(0, 8)}`;
}

/** Deterministic name prefix for all fixtures belonging to a run, e.g. `LRJ lrj-1a2b3c4d`. */
export function journeyNamePrefix(testRunId: string): string {
  const normalized = String(testRunId ?? "").trim();
  if (!normalized) {
    throw new Error("Journey fixtures require a non-empty testRunId.");
  }
  return `${JOURNEY_TEST_PREFIX} ${normalized}`;
}

/** A tagged name for a fixture, e.g. `LRJ lrj-1a2b3c4d Lead`. */
export function taggedName(testRunId: string, label = "Lead"): string {
  return `${journeyNamePrefix(testRunId)} ${label}`.trim();
}

export type JourneyEnv = {
  enabled: boolean;
  reason: string | null;
  url: string;
  serviceKey: string;
  companyId: string;
  eventId: string | null;
};

/**
 * Resolve whether live-DB journey fixtures can run. Opt-in via `JOURNEY_LIVE_DB=1` plus a
 * Supabase service connection and a pre-existing test company. When disabled, `reason`
 * explains exactly which prerequisite is missing so tests can skip with a precise message.
 */
export function resolveJourneyEnv(): JourneyEnv {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const companyId = (process.env.JOURNEY_TEST_COMPANY_ID || "").trim();
  const eventId = (process.env.JOURNEY_TEST_EVENT_ID || "").trim();
  const optedIn = process.env.JOURNEY_LIVE_DB === "1";

  let reason: string | null = null;
  if (!optedIn) reason = "JOURNEY_LIVE_DB!=1 (live-DB journey fixtures are opt-in)";
  else if (!url) reason = "missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL";
  else if (!serviceKey) reason = "missing SUPABASE_SERVICE_ROLE_KEY";
  else if (!companyId) reason = "missing JOURNEY_TEST_COMPANY_ID (a pre-existing companies row)";

  return {
    enabled: reason === null,
    reason,
    url,
    serviceKey,
    companyId,
    eventId: eventId || null,
  };
}

let cachedClient: SupabaseClient | null = null;

/** Lazily build a service-role Supabase client for live-DB fixtures. Throws if not enabled. */
export function getJourneySupabase(env?: JourneyEnv): SupabaseClient {
  const resolved = env ?? resolveJourneyEnv();
  if (!resolved.enabled) {
    throw new Error(`Journey live-DB fixtures unavailable: ${resolved.reason}`);
  }
  if (!cachedClient) {
    cachedClient = createClient(resolved.url, resolved.serviceKey);
  }
  return cachedClient;
}

export type TestLeadRow = {
  id: string;
  full_name: string;
  company_id: string;
  event_id: string | null;
};

export type CreateTestLeadInput = {
  testRunId: string;
  companyId: string;
  eventId?: string | null;
  /** Extra lead columns to set on insert (e.g. job_title, rating, temperature). */
  fields?: Record<string, unknown>;
  /** Label appended to the tagged name; defaults to "Lead". */
  label?: string;
};

/**
 * Seed a lead row directly (setup fixture only). The row is tagged with the test-run id and
 * scoped to the given company/event. When a registry is passed, a scoped delete is registered
 * so cleanup removes only this row (matched by id AND company_id).
 */
export async function createTestLead(
  client: SupabaseClient,
  input: CreateTestLeadInput,
  registry?: JourneyCleanupRegistry
): Promise<TestLeadRow> {
  const fullName = taggedName(input.testRunId, input.label ?? "Lead");
  const payload: Record<string, unknown> = {
    company_id: input.companyId,
    full_name: fullName,
    status: "new",
    ...(input.eventId ? { event_id: input.eventId } : {}),
    ...(input.fields ?? {}),
  };

  const { data, error } = await (client as unknown as SupabaseLike)
    .from("leads")
    .insert(payload)
    .select("id, full_name, company_id, event_id")
    .single();
  if (error) throw error;
  const row = data as TestLeadRow;

  if (registry) {
    registry.register(`lead:${row.id}`, async () => {
      await (client as unknown as SupabaseLike)
        .from("leads")
        .delete()
        .eq("id", row.id)
        .eq("company_id", input.companyId);
    });
  }
  return row;
}

/** Patch a previously seeded test lead, scoped to its company. */
export async function updateTestLead(
  client: SupabaseClient,
  leadId: string,
  companyId: string,
  patch: Record<string, unknown>
): Promise<void> {
  const { error } = await (client as unknown as SupabaseLike)
    .from("leads")
    .update(patch)
    .eq("id", leadId)
    .eq("company_id", companyId);
  if (error) throw error;
}

/** Delete a previously seeded test lead, scoped to its company. */
export async function deleteTestLead(
  client: SupabaseClient,
  leadId: string,
  companyId: string
): Promise<void> {
  const { error } = await (client as unknown as SupabaseLike)
    .from("leads")
    .delete()
    .eq("id", leadId)
    .eq("company_id", companyId);
  if (error) throw error;
}

/**
 * Minimal structural type for the fluent Supabase calls used above. Mirrors the pattern the
 * existing integration test relies on (`supabase as any`) but keeps the casts local and typed.
 */
type SupabaseLike = {
  from: (table: string) => {
    insert: (payload: unknown) => {
      select: (cols: string) => {
        single: () => Promise<{ data: unknown; error: unknown }>;
      };
    };
    update: (patch: unknown) => {
      eq: (col: string, val: unknown) => {
        eq: (col: string, val: unknown) => Promise<{ error: unknown }>;
      };
    };
    delete: () => {
      eq: (col: string, val: unknown) => {
        eq: (col: string, val: unknown) => Promise<{ error: unknown }>;
      };
    };
  };
};
