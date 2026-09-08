import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  authorizeInternalHealthRequest,
  signInternalHealthPath,
} from "@/lib/internal-health/internal-health-auth";
import {
  getLeadRetrievalInviteLicenseSeatAccessHealth,
  CRITICAL_EXPIRED_ACTIVE_LICENSE_COUNT,
  CRITICAL_SEAT_EXHAUSTED_ACTIVE_COUNT,
  CRITICAL_ACTIVE_EVENTS_WITHOUT_LICENSE_COUNT,
} from "@/lib/internal-health/lead-retrieval/invite-license-seat-access";
import { asAdminClient, createFakeSupabase } from "./helpers/fake-supabase";

const PATHNAME = "/api/internal/health/lead-retrieval/invite-license-seat-access";
const SECRET = "internal-health-secret";
const NOW = "2026-06-30T12:00:00.000Z";

function headers(values: Record<string, string>) {
  const normalized = new Map(Object.entries(values).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (name: string) => normalized.get(name.toLowerCase()) ?? null };
}

const EMPTY = { licenses: [], events: [], invite_codes: [] };

function activeLicense(over: Record<string, unknown>) {
  return {
    status: "active",
    scope: "company",
    company_id: "c-1",
    event_id: null,
    starts_at: "2026-01-01T00:00:00.000Z",
    expires_at: "2027-01-01T00:00:00.000Z",
    seats_total: 10,
    seats_used: 2,
    license_key: "LIC-SECRET-KEY",
    ...over,
  };
}

describe("invite-license-seat-access signing", () => {
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

describe("getLeadRetrievalInviteLicenseSeatAccessHealth", () => {
  it("is healthy when active events are covered with seat capacity and exposes no secrets", async () => {
    const fake = createFakeSupabase({
      ...EMPTY,
      licenses: [activeLicense({})],
      events: [{ id: "e-1", company_id: "c-1", is_active: true, start_date: null, end_date: null }],
      invite_codes: [],
    });
    const health = await getLeadRetrievalInviteLicenseSeatAccessHealth({ supabase: asAdminClient<any>(fake), nowIso: NOW });
    assert.equal(health.check, "invite-license-seat-access");
    assert.equal(health.source, "invite-license-seat-access");
    assert.equal(health.status, "healthy");
    assert.equal(health.metrics.activeLicenses, 1);
    assert.equal(health.metrics.activeEventsWithoutLicense, 0);
    assert.deepEqual(health.issues, []);
    assert.doesNotMatch(JSON.stringify(health), /LIC-SECRET-KEY/);

    for (const call of fake._calls.filter((c) => c.table === "licenses" && c.op === "select")) {
      const cols = String(call.select ?? "").split(",").map((c) => c.trim());
      assert.equal(cols.includes("license_key"), false);
    }
  });

  it("treats company-scoped exhibitor_company_id licenses as covering active/future company events", async () => {
    const fake = createFakeSupabase({
      ...EMPTY,
      licenses: [
        activeLicense({
          scope: "company",
          company_id: "billing-company",
          exhibitor_company_id: "exhibitor-company",
          event_id: null,
        }),
      ],
      events: [
        {
          id: "event-1",
          company_id: "exhibitor-company",
          is_active: false,
          start_date: "2026-07-14",
          end_date: "2026-07-18",
        },
      ],
    });
    const health = await getLeadRetrievalInviteLicenseSeatAccessHealth({ supabase: asAdminClient<any>(fake), nowIso: NOW });
    assert.equal(health.metrics.activeOrFutureEvents, 1);
    assert.equal(health.metrics.activeLicenses, 1);
    assert.equal(health.metrics.activeEventsWithoutLicense, 0);
    assert.equal(health.status, "healthy");
    assert.ok(!health.issues.some((i) => i.code === "active_events_without_license"));
  });

  it("keeps event-scoped licenses covering their event even when billing company differs", async () => {
    const fake = createFakeSupabase({
      ...EMPTY,
      licenses: [
        activeLicense({
          scope: "event",
          event_id: "event-1",
          company_id: "billing-company",
          exhibitor_company_id: "exhibitor-company",
        }),
      ],
      events: [{ id: "event-1", company_id: "exhibitor-company", is_active: true, start_date: null, end_date: null }],
    });
    const health = await getLeadRetrievalInviteLicenseSeatAccessHealth({ supabase: asAdminClient<any>(fake), nowIso: NOW });
    assert.equal(health.metrics.activeOrFutureEvents, 1);
    assert.equal(health.metrics.activeEventsWithoutLicense, 0);
    assert.equal(health.status, "healthy");
  });

  it("does not treat expired company-scoped exhibitor_company_id licenses as covering active/future events", async () => {
    const fake = createFakeSupabase({
      ...EMPTY,
      licenses: [
        activeLicense({
          scope: "company",
          company_id: "billing-company",
          exhibitor_company_id: "exhibitor-company",
          expires_at: "2020-01-01T00:00:00.000Z",
        }),
      ],
      events: [{ id: "event-1", company_id: "exhibitor-company", is_active: true, start_date: null, end_date: null }],
    });
    const health = await getLeadRetrievalInviteLicenseSeatAccessHealth({ supabase: asAdminClient<any>(fake), nowIso: NOW });
    assert.equal(health.metrics.activeLicenses, 0);
    assert.equal(health.metrics.expiredLicensesForActiveEvents, 1);
    assert.equal(health.metrics.activeEventsWithoutLicense, 1);
    assert.ok(health.issues.some((i) => i.code === "active_events_without_license"));
  });

  it("flags expired licenses tied to active events as critical past threshold", async () => {
    const events = Array.from({ length: CRITICAL_EXPIRED_ACTIVE_LICENSE_COUNT }, (_, i) => ({
      id: `e-${i}`,
      company_id: `c-${i}`,
      is_active: true,
      start_date: null,
      end_date: null,
    }));
    const licenses = Array.from({ length: CRITICAL_EXPIRED_ACTIVE_LICENSE_COUNT }, (_, i) =>
      activeLicense({ scope: "event", event_id: `e-${i}`, company_id: `c-${i}`, expires_at: "2020-01-01T00:00:00.000Z" })
    );
    const fake = createFakeSupabase({ ...EMPTY, licenses, events });
    const health = await getLeadRetrievalInviteLicenseSeatAccessHealth({ supabase: asAdminClient<any>(fake), nowIso: NOW });
    assert.equal(health.metrics.expiredLicensesForActiveEvents, CRITICAL_EXPIRED_ACTIVE_LICENSE_COUNT);
    assert.ok(health.issues.some((i) => i.code === "expired_licenses_for_active_events" && i.severity === "critical"));
    assert.equal(health.status, "critical");
  });

  it("does not flag expired licenses for active events when an active replacement covers the event", async () => {
    const fake = createFakeSupabase({
      ...EMPTY,
      events: [{ id: "e-1", company_id: "c-1", is_active: true, start_date: null, end_date: null }],
      licenses: [
        activeLicense({
          scope: "event",
          event_id: "e-1",
          company_id: "c-1",
          expires_at: "2020-01-01T00:00:00.000Z",
        }),
        activeLicense({
          scope: "event",
          event_id: "e-1",
          company_id: "c-1",
        }),
      ],
    });
    const health = await getLeadRetrievalInviteLicenseSeatAccessHealth({ supabase: asAdminClient<any>(fake), nowIso: NOW });
    assert.equal(health.metrics.expiredLicensesForActiveEvents, 0);
    assert.equal(health.metrics.expiredLicensesForActiveEventsSuperseded, 1);
    assert.ok(!health.issues.some((i) => i.code === "expired_licenses_for_active_events"));
    assert.equal(health.status, "healthy");
  });

  it("flags seat-exhausted active licenses as critical past threshold", async () => {
    const licenses = Array.from({ length: CRITICAL_SEAT_EXHAUSTED_ACTIVE_COUNT }, (_, i) =>
      activeLicense({ company_id: `c-${i}`, seats_total: 5, seats_used: 5 })
    );
    const fake = createFakeSupabase({ ...EMPTY, licenses, events: [] });
    const health = await getLeadRetrievalInviteLicenseSeatAccessHealth({ supabase: asAdminClient<any>(fake), nowIso: NOW });
    assert.equal(health.metrics.seatExhaustedActiveLicenses, CRITICAL_SEAT_EXHAUSTED_ACTIVE_COUNT);
    assert.ok(health.issues.some((i) => i.code === "seats_exhausted_active_licenses" && i.severity === "critical"));
  });

  it("flags active/future events with no covering license", async () => {
    const events = Array.from({ length: CRITICAL_ACTIVE_EVENTS_WITHOUT_LICENSE_COUNT }, (_, i) => ({
      id: `e-${i}`,
      company_id: `c-${i}`,
      is_active: true,
      start_date: null,
      end_date: null,
    }));
    const fake = createFakeSupabase({ ...EMPTY, licenses: [], events });
    const health = await getLeadRetrievalInviteLicenseSeatAccessHealth({ supabase: asAdminClient<any>(fake), nowIso: NOW });
    assert.equal(health.metrics.activeOrFutureEvents, CRITICAL_ACTIVE_EVENTS_WITHOUT_LICENSE_COUNT);
    assert.equal(health.metrics.activeEventsWithoutLicense, CRITICAL_ACTIVE_EVENTS_WITHOUT_LICENSE_COUNT);
    assert.ok(health.issues.some((i) => i.code === "active_events_without_license" && i.severity === "critical"));
  });

  it("warns (not critical) on near-capacity active licenses", async () => {
    const fake = createFakeSupabase({
      ...EMPTY,
      licenses: [activeLicense({ seats_total: 10, seats_used: 9 })],
      events: [],
    });
    const health = await getLeadRetrievalInviteLicenseSeatAccessHealth({ supabase: asAdminClient<any>(fake), nowIso: NOW });
    assert.equal(health.metrics.nearCapacityActiveLicenses, 1);
    assert.equal(health.metrics.seatExhaustedActiveLicenses, 0);
    assert.equal(health.status, "warning");
    assert.ok(!health.issues.some((i) => i.severity === "critical"));
  });

  it("derives invite status and warns on aging pending invites", async () => {
    const fake = createFakeSupabase({
      ...EMPTY,
      invite_codes: [
        { used_at: null, expires_at: "2027-01-01T00:00:00.000Z", created_at: "2026-06-20T00:00:00.000Z" }, // pending > 7d
        { used_at: null, expires_at: "2020-01-01T00:00:00.000Z", created_at: "2019-12-01T00:00:00.000Z" }, // expired unused
        { used_at: "2026-06-29T00:00:00.000Z", expires_at: "2027-01-01T00:00:00.000Z", created_at: "2026-06-28T00:00:00.000Z" }, // redeemed
      ],
    });
    const health = await getLeadRetrievalInviteLicenseSeatAccessHealth({ supabase: asAdminClient<any>(fake), nowIso: NOW });
    assert.equal(health.metrics.pendingInvites, 1);
    assert.equal(health.metrics.pendingInvitesOver7d, 1);
    assert.equal(health.metrics.expiredUnusedInvites, 1);
    assert.equal(health.status, "warning");
    assert.ok(health.issues.some((i) => i.code === "pending_invites_aging" && i.severity === "warning"));
  });

  it("route contract: GET only, authenticates before DB, no secret columns selected", () => {
    const route = readFileSync(
      join(process.cwd(), "app/api/internal/health/lead-retrieval/invite-license-seat-access/route.ts"),
      "utf8"
    );
    const service = readFileSync(
      join(process.cwd(), "lib/internal-health/lead-retrieval/invite-license-seat-access.ts"),
      "utf8"
    );
    assert.match(route, /export async function GET/);
    assert.doesNotMatch(route, /export async function POST|export async function PUT|export async function DELETE/);
    assert.ok(route.indexOf("authorizeLeadRetrievalInternalHealthRequest") < route.indexOf("createAdminClient"));
    assert.doesNotMatch(service, /\.insert\(|\.update\(|\.delete\(/);
    assert.doesNotMatch(service, /select:\s*"[^"]*\b(license_key|code_hash|email)\b[^"]*"/);
  });
});
