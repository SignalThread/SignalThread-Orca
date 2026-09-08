// @lr area=tenant-isolation severity=P0 layer=unit category=local-only
/**
 * Canonical Platform id → Lead Retrieval row resolution.
 *
 * The only permitted keys are users.platform_user_id, companies.platform_organization_id
 * and events.platform_event_id. There is no fallback -- not email, not name, not slug,
 * not "first matching row" -- and a Platform organization that owns several LR
 * companies is narrowed by the mapped event and user or refused as ambiguous.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  LAUNCHABLE_EVENT_CONTAINER_KIND,
  resolveEventMapping,
  resolveOrganizationContext,
  resolveUserMapping,
  type LeadRetrievalEventMapping,
  type LeadRetrievalUserMapping,
  type MappingDeps
} from "../lib/platform/identity-mapping";

const P_USER = "11111111-1111-4111-8111-111111111111";
const P_ORG = "22222222-2222-4222-8222-222222222222";
const P_EVENT = "33333333-3333-4333-8333-333333333333";

const LR_USER: LeadRetrievalUserMapping = { id: "lr-user-1", role: "exhibitor_admin", companyId: "co-organizer", platformUserId: P_USER };
const LR_EVENT: LeadRetrievalEventMapping = {
  id: "lr-event-1",
  name: "Leadership Summit 2026",
  companyId: "co-organizer",
  containerKind: "event",
  platformEventId: P_EVENT
};

type Calls = { users: unknown[]; events: unknown[]; companies: unknown[]; exhibitors: unknown[]; memberships: unknown[] };

function deps(overrides: Partial<MappingDeps> = {}, calls: Calls = { users: [], events: [], companies: [], exhibitors: [], memberships: [] }) {
  const base: MappingDeps = {
    async findUserByPlatformUserId(id) {
      calls.users.push(id);
      return id === P_USER ? LR_USER : null;
    },
    async findEventByPlatformEventId(id) {
      calls.events.push(id);
      return id === P_EVENT ? LR_EVENT : null;
    },
    async findCompanyIdsByPlatformOrganizationId(id) {
      calls.companies.push(id);
      return id === P_ORG ? ["co-organizer"] : [];
    },
    async findExhibitorCompanyIdsForEvent(eventId) {
      calls.exhibitors.push(eventId);
      return ["co-exh-a", "co-exh-b"];
    },
    async findMembershipCompanyIdsForUserAtEvent(userId, eventId) {
      calls.memberships.push([userId, eventId]);
      return [];
    }
  };
  return { deps: { ...base, ...overrides }, calls };
}

test("a user resolves by users.platform_user_id only, normalized to the canonical lowercase uuid", async () => {
  const { deps: d, calls } = deps();
  assert.deepEqual(await resolveUserMapping(P_USER.toUpperCase(), d), { ok: true, value: LR_USER });
  assert.deepEqual(calls.users, [P_USER], "the loader receives the normalized id");
  assert.deepEqual(await resolveUserMapping("44444444-4444-4444-8444-444444444444", d), { ok: false, reason: "USER_MAPPING_NOT_FOUND" });
  assert.deepEqual(await resolveUserMapping("ali@example.com", d), { ok: false, reason: "INVALID_PLATFORM_ID" }, "an email never reaches the loader");
  assert.deepEqual(await resolveUserMapping(null, d), { ok: false, reason: "INVALID_PLATFORM_ID" });
  assert.equal(calls.users.length, 2, "non-canonical input is rejected before any query");
});

test("a row whose stored mapping does not equal the requested id is not a match", async () => {
  // Guards against a loader that returns "something" for an unmatched key.
  const { deps: d } = deps({ findUserByPlatformUserId: async () => ({ ...LR_USER, platformUserId: "55555555-5555-4555-8555-555555555555" }) });
  assert.deepEqual(await resolveUserMapping(P_USER, d), { ok: false, reason: "USER_MAPPING_NOT_FOUND" });
  const { deps: e } = deps({ findEventByPlatformEventId: async () => ({ ...LR_EVENT, platformEventId: "55555555-5555-4555-8555-555555555555" }) });
  assert.deepEqual(await resolveEventMapping(P_EVENT, e), { ok: false, reason: "EVENT_MAPPING_NOT_FOUND" });
});

test("an event resolves by events.platform_event_id only and must be a real event container", async () => {
  const { deps: d, calls } = deps();
  assert.deepEqual(await resolveEventMapping(P_EVENT, d), { ok: true, value: LR_EVENT });
  assert.deepEqual(calls.events, [P_EVENT]);
  assert.deepEqual(await resolveEventMapping("66666666-6666-4666-8666-666666666666", d), { ok: false, reason: "EVENT_MAPPING_NOT_FOUND" });
  assert.deepEqual(await resolveEventMapping("Leadership Summit 2026", d), { ok: false, reason: "INVALID_PLATFORM_ID" }, "an event name never reaches the loader");
  assert.equal(LAUNCHABLE_EVENT_CONTAINER_KIND, "event");
});

test("a continuous_capture bucket (or any non-event container) is never accepted as a Platform event", async () => {
  for (const containerKind of ["continuous_capture", "CONTINUOUS_CAPTURE", "", "workspace"]) {
    const { deps: d } = deps({ findEventByPlatformEventId: async () => ({ ...LR_EVENT, containerKind }) });
    assert.deepEqual(await resolveEventMapping(P_EVENT, d), { ok: false, reason: "EVENT_NOT_LAUNCHABLE_CONTAINER" }, containerKind || "<empty>");
  }
});

test("an organization with exactly one mapped company related to the event resolves to it", async () => {
  const { deps: d, calls } = deps();
  const result = await resolveOrganizationContext({ platformOrganizationId: P_ORG.toUpperCase(), event: LR_EVENT, user: LR_USER }, d);
  assert.deepEqual(result, { ok: true, value: { companyId: "co-organizer", mappedCompanyIds: ["co-organizer"] } });
  assert.deepEqual(calls.companies, [P_ORG]);
  assert.equal(calls.memberships.length, 0, "the user's memberships are consulted only when needed");
});

test("an organization mapped to no company is ORGANIZATION_MAPPING_NOT_FOUND, and a slug never reaches the loader", async () => {
  const { deps: d, calls } = deps();
  assert.deepEqual(
    await resolveOrganizationContext({ platformOrganizationId: "77777777-7777-4777-8777-777777777777", event: LR_EVENT, user: LR_USER }, d),
    { ok: false, reason: "ORGANIZATION_MAPPING_NOT_FOUND" }
  );
  assert.deepEqual(await resolveOrganizationContext({ platformOrganizationId: "acme", event: LR_EVENT, user: LR_USER }, d), {
    ok: false,
    reason: "INVALID_PLATFORM_ID"
  });
  assert.deepEqual(calls.companies, ["77777777-7777-4777-8777-777777777777"]);
});

test("mapped companies unrelated to the event are EVENT_ORGANIZATION_MISMATCH, never silently accepted", async () => {
  const { deps: d } = deps({ findCompanyIdsByPlatformOrganizationId: async () => ["co-other"] });
  assert.deepEqual(await resolveOrganizationContext({ platformOrganizationId: P_ORG, event: LR_EVENT, user: LR_USER }, d), {
    ok: false,
    reason: "EVENT_ORGANIZATION_MISMATCH"
  });
});

test("a company that exhibits at the event (not only the owner) is a valid organization context", async () => {
  const { deps: d } = deps({ findCompanyIdsByPlatformOrganizationId: async () => ["co-exh-b"] });
  assert.deepEqual(await resolveOrganizationContext({ platformOrganizationId: P_ORG, event: LR_EVENT, user: { ...LR_USER, companyId: null } }, d), {
    ok: true,
    value: { companyId: "co-exh-b", mappedCompanyIds: ["co-exh-b"] }
  });
});

test("two mapped companies both related to the event are narrowed by the user's own company", async () => {
  const { deps: d } = deps({ findCompanyIdsByPlatformOrganizationId: async () => ["co-exh-a", "co-organizer"] });
  const asOrganizerStaff = await resolveOrganizationContext({ platformOrganizationId: P_ORG, event: LR_EVENT, user: { ...LR_USER, companyId: "co-organizer" } }, d);
  assert.deepEqual(asOrganizerStaff, { ok: true, value: { companyId: "co-organizer", mappedCompanyIds: ["co-exh-a", "co-organizer"] } });
  const asExhibitorStaff = await resolveOrganizationContext({ platformOrganizationId: P_ORG, event: LR_EVENT, user: { ...LR_USER, companyId: "co-exh-a" } }, d);
  assert.deepEqual(asExhibitorStaff, { ok: true, value: { companyId: "co-exh-a", mappedCompanyIds: ["co-exh-a", "co-organizer"] } });
});

test("when the user's company does not decide it, a single event membership does; none or several is AMBIGUOUS", async () => {
  const mapped = async () => ["co-exh-a", "co-exh-b"];
  const userElsewhere = { ...LR_USER, companyId: "co-unrelated" };

  const { deps: one } = deps({ findCompanyIdsByPlatformOrganizationId: mapped, findMembershipCompanyIdsForUserAtEvent: async () => ["co-exh-b"] });
  assert.deepEqual(await resolveOrganizationContext({ platformOrganizationId: P_ORG, event: LR_EVENT, user: userElsewhere }, one), {
    ok: true,
    value: { companyId: "co-exh-b", mappedCompanyIds: ["co-exh-a", "co-exh-b"] }
  });

  const membershipLookups: Array<[string, string]> = [];
  const { deps: none } = deps({
    findCompanyIdsByPlatformOrganizationId: mapped,
    findMembershipCompanyIdsForUserAtEvent: async (userId, eventId) => {
      membershipLookups.push([userId, eventId]);
      return [];
    }
  });
  assert.deepEqual(await resolveOrganizationContext({ platformOrganizationId: P_ORG, event: LR_EVENT, user: userElsewhere }, none), {
    ok: false,
    reason: "AMBIGUOUS_ORGANIZATION_MAPPING"
  });
  assert.deepEqual(membershipLookups, [["lr-user-1", "lr-event-1"]], "memberships are looked up for the mapped user at the mapped event");

  const { deps: several } = deps({ findCompanyIdsByPlatformOrganizationId: mapped, findMembershipCompanyIdsForUserAtEvent: async () => ["co-exh-a", "co-exh-b"] });
  assert.deepEqual(await resolveOrganizationContext({ platformOrganizationId: P_ORG, event: LR_EVENT, user: userElsewhere }, several), {
    ok: false,
    reason: "AMBIGUOUS_ORGANIZATION_MAPPING"
  });

  // A membership at an unrelated company cannot widen the candidate set.
  const { deps: outside } = deps({ findCompanyIdsByPlatformOrganizationId: mapped, findMembershipCompanyIdsForUserAtEvent: async () => ["co-unrelated"] });
  assert.deepEqual(await resolveOrganizationContext({ platformOrganizationId: P_ORG, event: LR_EVENT, user: userElsewhere }, outside), {
    ok: false,
    reason: "AMBIGUOUS_ORGANIZATION_MAPPING"
  });
});

test("candidate order never decides anything: the same ambiguous set is refused whichever row comes first", async () => {
  const userElsewhere = { ...LR_USER, companyId: null };
  for (const order of [["co-exh-a", "co-exh-b"], ["co-exh-b", "co-exh-a"]]) {
    const { deps: d } = deps({ findCompanyIdsByPlatformOrganizationId: async () => order });
    assert.deepEqual(await resolveOrganizationContext({ platformOrganizationId: P_ORG, event: LR_EVENT, user: userElsewhere }, d), {
      ok: false,
      reason: "AMBIGUOUS_ORGANIZATION_MAPPING"
    });
  }
});

test("the real loaders query only the three mapping columns and local keys -- never email, name or slug", () => {
  const source = readFileSync("lib/platform/identity-mapping-supabase.ts", "utf8");
  const predicates = [...source.matchAll(/\.(eq|in|ilike|like|or|match|textSearch)\(\s*"([^"]+)"/g)].map((m) => `${m[1]}:${m[2]}`);
  assert.deepEqual(
    predicates.sort(),
    ["eq:event_id", "eq:event_id", "eq:platform_event_id", "eq:platform_organization_id", "eq:platform_user_id", "eq:user_id", "in:status"].sort()
  );
  assert.equal(/email|slug|\bname\b.*\.eq|ilike|limit\(1\)|single\(\)/.test(source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")), false,
    "no email/name/slug predicate, no LIMIT 1, no .single() that would pick a first row");
  assert.match(source, /maybeSingle\(\)/, "unique keys are read with maybeSingle so a second row is an error, not a pick");
  assert.match(source, /import "server-only"/);
});
