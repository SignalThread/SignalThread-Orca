import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  authorizeInternalHealthRequest,
  signInternalHealthPath,
} from "@/lib/internal-health/internal-health-auth";
import {
  getLeadRetrievalAccessReadinessHealth,
  CRITICAL_INVALID_ROLE_COUNT,
  CRITICAL_MISSING_COMPANY_COUNT,
  CRITICAL_ACTIVE_EVENTS_WITHOUT_ACCESS_COUNT,
} from "@/lib/internal-health/lead-retrieval/access-readiness";
import { asAdminClient, createFakeSupabase } from "./helpers/fake-supabase";

const PATHNAME = "/api/internal/health/lead-retrieval/access-readiness";
const SECRET = "internal-health-secret";
const NOW = "2026-06-30T12:00:00.000Z";

function headers(values: Record<string, string>) {
  const normalized = new Map(Object.entries(values).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (name: string) => normalized.get(name.toLowerCase()) ?? null };
}

describe("access-readiness signing", () => {
  it("accepts a valid signature for this path", () => {
    const timestamp = "1782820800000";
    const signature = signInternalHealthPath({ secret: SECRET, timestamp, pathname: PATHNAME });
    assert.deepEqual(
      authorizeInternalHealthRequest({
        headers: headers({
          "x-internal-health-timestamp": timestamp,
          "x-internal-health-signature": signature,
        }),
        pathname: PATHNAME,
        secret: SECRET,
        nowMs: Number(timestamp),
      }),
      { ok: true }
    );
  });
});

describe("getLeadRetrievalAccessReadinessHealth", () => {
  it("is healthy with valid scoping and exposes no identifiers", async () => {
    const fake = createFakeSupabase({
      users: [
        { id: "user-secret-1", role: "exhibitor_admin", company_id: "company-secret-1", event_access_mode: "all_company_events" },
        { id: "user-secret-2", role: "platform_admin", company_id: null, event_access_mode: "all_company_events" },
      ],
      events: [{ id: "event-secret-1", company_id: "company-secret-1", status: "active", is_active: true, start_date: null, end_date: null }],
      event_users: [{ event_id: "event-secret-1", user_id: "user-secret-1", exhibitor_company_id: "company-secret-1", status: "active" }],
      companies: [{ id: "company-secret-1" }],
    });

    const health = await getLeadRetrievalAccessReadinessHealth({ supabase: asAdminClient<any>(fake), nowIso: NOW });
    assert.equal(health.check, "access-readiness");
    assert.equal(health.source, "access-readiness");
    assert.equal(health.status, "healthy");
    assert.equal(health.metrics.totalUsers, 2);
    assert.equal(health.metrics.exhibitorUsersMissingCompany, 0);
    assert.equal(health.metrics.activeEventsWithoutExhibitorAccess, 0);
    assert.deepEqual(health.issues, []);
    assert.doesNotMatch(JSON.stringify(health), /user-secret|company-secret|event-secret/);

    for (const call of fake._calls.filter((c) => c.table === "users" && c.op === "select")) {
      const cols = String(call.select ?? "").split(",").map((c) => c.trim());
      assert.equal(cols.includes("email"), false);
      assert.equal(cols.includes("full_name"), false);
    }
  });

  it("flags invalid role values as critical past threshold", async () => {
    const fake = createFakeSupabase({
      users: Array.from({ length: CRITICAL_INVALID_ROLE_COUNT }, (_, i) => ({
        id: `u-${i}`,
        role: "bogus_role",
        company_id: "c-1",
        event_access_mode: "all_company_events",
      })),
      events: [],
      event_users: [],
      companies: [{ id: "c-1" }],
    });
    const health = await getLeadRetrievalAccessReadinessHealth({ supabase: asAdminClient<any>(fake), nowIso: NOW });
    assert.equal(health.metrics.usersInvalidRole, CRITICAL_INVALID_ROLE_COUNT);
    assert.equal(health.status, "critical");
    assert.ok(health.issues.some((i) => i.code === "users_invalid_role" && i.severity === "critical"));
  });

  it("does not flag legacy event_organizer role because session auth normalizes it", async () => {
    const fake = createFakeSupabase({
      users: [
        {
          id: "u-legacy",
          role: "event_organizer",
          company_id: null,
          event_access_mode: "all_company_events",
        },
      ],
      events: [],
      event_users: [],
      companies: [],
    });
    const health = await getLeadRetrievalAccessReadinessHealth({ supabase: asAdminClient<any>(fake), nowIso: NOW });
    assert.equal(health.metrics.usersInvalidRole, 0);
    assert.equal(health.status, "healthy");
    assert.ok(!health.issues.some((i) => i.code === "users_invalid_role"));
  });

  it("flags exhibitor users missing company context as critical past threshold", async () => {
    const fake = createFakeSupabase({
      users: Array.from({ length: CRITICAL_MISSING_COMPANY_COUNT }, (_, i) => ({
        id: `u-${i}`,
        role: "exhibitor_admin",
        company_id: null,
        event_access_mode: "all_company_events",
      })),
      events: [],
      event_users: [],
      companies: [],
    });
    const health = await getLeadRetrievalAccessReadinessHealth({ supabase: asAdminClient<any>(fake), nowIso: NOW });
    assert.equal(health.metrics.exhibitorUsersMissingCompany, CRITICAL_MISSING_COMPANY_COUNT);
    assert.ok(health.issues.some((i) => i.code === "exhibitor_users_missing_company" && i.severity === "critical"));
  });

  it("flags active/future events with no exhibitor access", async () => {
    const fake = createFakeSupabase({
      users: [],
      events: Array.from({ length: CRITICAL_ACTIVE_EVENTS_WITHOUT_ACCESS_COUNT }, (_, i) => ({
        id: `e-${i}`,
        company_id: "c-1",
        status: "active",
        is_active: true,
        start_date: null,
        end_date: null,
      })),
      event_users: [],
      companies: [{ id: "c-1" }],
    });
    const health = await getLeadRetrievalAccessReadinessHealth({ supabase: asAdminClient<any>(fake), nowIso: NOW });
    assert.equal(health.metrics.activeOrFutureEvents, CRITICAL_ACTIVE_EVENTS_WITHOUT_ACCESS_COUNT);
    assert.equal(health.metrics.activeEventsWithoutExhibitorAccess, CRITICAL_ACTIVE_EVENTS_WITHOUT_ACCESS_COUNT);
    assert.ok(health.issues.some((i) => i.code === "active_events_without_exhibitor_access" && i.severity === "critical"));
  });

  it("counts orphaned event access rows as a warning, not critical, in small numbers", async () => {
    const fake = createFakeSupabase({
      users: [{ id: "u-1", role: "exhibitor_admin", company_id: "c-1", event_access_mode: "all_company_events" }],
      events: [{ id: "e-1", company_id: "c-1", status: "completed", is_active: false, start_date: "2020-01-01", end_date: "2020-01-02" }],
      event_users: [
        { event_id: "ghost-event", user_id: "ghost-user", exhibitor_company_id: "ghost-company", status: "active" },
      ],
      companies: [{ id: "c-1" }],
    });
    const health = await getLeadRetrievalAccessReadinessHealth({ supabase: asAdminClient<any>(fake), nowIso: NOW });
    assert.equal(health.metrics.eventAccessOrphanUserCount, 1);
    assert.equal(health.metrics.eventAccessOrphanEventCount, 1);
    assert.equal(health.metrics.eventAccessOrphanCompanyCount, 1);
    assert.equal(health.metrics.orphanedEventAccessRows, 3);
    assert.equal(health.status, "warning");
    assert.ok(health.issues.some((i) => i.code === "orphaned_event_access_rows" && i.severity === "warning"));
  });

  it("does not treat a past event without access as active risk", async () => {
    const fake = createFakeSupabase({
      users: [],
      events: [{ id: "e-past", company_id: "c-1", status: "completed", is_active: false, start_date: "2020-01-01", end_date: "2020-01-02" }],
      event_users: [],
      companies: [{ id: "c-1" }],
    });
    const health = await getLeadRetrievalAccessReadinessHealth({ supabase: asAdminClient<any>(fake), nowIso: NOW });
    assert.equal(health.metrics.activeOrFutureEvents, 0);
    assert.equal(health.metrics.activeEventsWithoutExhibitorAccess, 0);
    assert.equal(health.status, "healthy");
  });

  it("route contract: GET only, authenticates before DB, no PII columns selected", () => {
    const route = readFileSync(
      join(process.cwd(), "app/api/internal/health/lead-retrieval/access-readiness/route.ts"),
      "utf8"
    );
    const service = readFileSync(
      join(process.cwd(), "lib/internal-health/lead-retrieval/access-readiness.ts"),
      "utf8"
    );
    assert.match(route, /export async function GET/);
    assert.doesNotMatch(route, /export async function POST|export async function PUT|export async function DELETE/);
    assert.ok(route.indexOf("authorizeLeadRetrievalInternalHealthRequest") < route.indexOf("createAdminClient"));
    assert.doesNotMatch(service, /\.insert\(|\.update\(|\.delete\(/);
    assert.doesNotMatch(service, /select:\s*"[^"]*\b(email|full_name)\b[^"]*"/);
  });
});
