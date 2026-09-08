// @lr area=auth-rbac severity=P0 layer=unit category=local-only
/**
 * Platform → Lead Retrieval entry decision: claim → map → LR authorization → landing.
 *
 * Mapping is not authorization. A perfectly mapped user who fails Lead Retrieval's
 * own canonical event-access rules is refused with LR_ACCESS_DENIED, and the role
 * decides which existing LR workspace the launch lands in.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolvePlatformEntry, type EntryDeps } from "../lib/platform/handoff-entry";
import {
  LAUNCHABLE_LEAD_RETRIEVAL_ROLES,
  applyLandingCookies,
  buildLeadRetrievalLandingPath,
  decideLeadRetrievalEventAccess
} from "../lib/platform/lr-authorization";
import { NextResponse } from "next/server";
import { EXHIBITOR_APP_ACTIVE_EVENT_COOKIE } from "../lib/exhibitor/exhibitor-app-active-event-constants";

const P_USER = "11111111-1111-4111-8111-111111111111";
const P_ORG = "22222222-2222-4222-8222-222222222222";
const P_EVENT = "33333333-3333-4333-8333-333333333333";
const LR_EVENT_ID = "lr-event-1";

type Access = { resolution: "platform_all" | "organizer_scope" | "company_all_events" | "company_assigned_only" | "legacy_event_scoped" | "none"; eventIds: string[] };

function makeDeps(input: { role: string | null; access: Access; companyId?: string | null }) {
  const calls = { claim: 0, access: [] as string[] };
  const deps: EntryDeps = {
    async claim({ handoff, eventId }) {
      calls.claim += 1;
      if (handoff !== "good-token") return { ok: false, reason: "HANDOFF_INVALID", platformReason: "HANDOFF_INVALID" };
      assert.equal(eventId, P_EVENT);
      return { ok: true, context: { platformUserId: P_USER, platformOrganizationId: P_ORG, platformEventId: P_EVENT } };
    },
    mapping: {
      async findUserByPlatformUserId(id) {
        return id === P_USER ? { id: "lr-user-1", role: input.role, companyId: input.companyId ?? "co-organizer", platformUserId: P_USER } : null;
      },
      async findEventByPlatformEventId(id) {
        return id === P_EVENT ? { id: LR_EVENT_ID, name: "Summit", companyId: "co-organizer", containerKind: "event", platformEventId: P_EVENT } : null;
      },
      async findCompanyIdsByPlatformOrganizationId(id) {
        return id === P_ORG ? ["co-organizer"] : [];
      },
      async findExhibitorCompanyIdsForEvent() {
        return ["co-exh-a"];
      },
      async findMembershipCompanyIdsForUserAtEvent() {
        return [];
      }
    },
    async resolveAccess(lrUserId) {
      calls.access.push(lrUserId);
      return input.access;
    }
  };
  return { deps, calls };
}

const GOOD = { handoff: "good-token", eventId: P_EVENT };

test("a mapped and authorized platform_admin lands in the admin event workspace", async () => {
  const { deps, calls } = makeDeps({ role: "platform_admin", access: { resolution: "platform_all", eventIds: [] } });
  const result = await resolvePlatformEntry(GOOD, deps);
  assert.deepEqual(result, {
    ok: true,
    lrUserId: "lr-user-1",
    role: "platform_admin",
    resolution: "platform_all",
    companyContextId: "co-organizer",
    eventId: LR_EVENT_ID,
    redirectPath: `/admin/events/${LR_EVENT_ID}`
  });
  assert.deepEqual(calls.access, ["lr-user-1"], "authorization runs for the mapped LR user id, never a caller-supplied one");
});

test("a mapped and authorized organizer lands in the organizer workspace scoped to the event", async () => {
  for (const storedRole of ["organizer_admin", "event_organizer", "organizer"]) {
    const { deps } = makeDeps({ role: storedRole, access: { resolution: "organizer_scope", eventIds: ["other", LR_EVENT_ID] } });
    const result = await resolvePlatformEntry(GOOD, deps);
    assert.equal(result.ok, true, storedRole);
    if (result.ok) {
      assert.equal(result.role, "organizer_admin", "stored role values normalize like every LR session does");
      assert.equal(result.redirectPath, `/app/organizer?eventId=${LR_EVENT_ID}`);
    }
  }
});

test("mapped exhibitor roles land in the exhibitor event dashboard", async () => {
  for (const role of ["exhibitor_admin", "exhibitor_viewer"] as const) {
    const { deps } = makeDeps({ role, access: { resolution: "company_assigned_only", eventIds: [LR_EVENT_ID] } });
    const result = await resolvePlatformEntry(GOOD, deps);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.role, role);
      assert.equal(result.redirectPath, `/exhibitor/dashboard?eventId=${LR_EVENT_ID}`);
    }
  }
});

test("mapping is not authorization: a fully mapped user outside LR's accessible set is LR_ACCESS_DENIED", async () => {
  const cases: Array<[string, Access]> = [
    ["organizer_admin", { resolution: "organizer_scope", eventIds: ["some-other-event"] }],
    ["organizer_admin", { resolution: "none", eventIds: [] }],
    ["exhibitor_admin", { resolution: "company_assigned_only", eventIds: ["some-other-event"] }],
    ["exhibitor_admin", { resolution: "company_all_events", eventIds: [] }],
    ["exhibitor_viewer", { resolution: "legacy_event_scoped", eventIds: [] }],
    ["exhibitor_viewer", { resolution: "none", eventIds: [] }]
  ];
  for (const [role, access] of cases) {
    const { deps } = makeDeps({ role, access });
    const result = await resolvePlatformEntry(GOOD, deps);
    assert.deepEqual(result, { ok: false, status: 403, reason: "LR_ACCESS_DENIED", hint: "The linked Lead Retrieval user does not have access to this event." }, `${role}/${access.resolution}`);
  }
});

test("a mapped user with a role that has no event workspace is refused", async () => {
  for (const role of ["viewer", "attendee", null, "superuser"]) {
    const { deps } = makeDeps({ role, access: { resolution: "platform_all", eventIds: [LR_EVENT_ID] } });
    const result = await resolvePlatformEntry(GOOD, deps);
    assert.equal(result.ok, false, String(role));
    if (!result.ok) assert.equal(result.reason, "LR_ROLE_NOT_LAUNCHABLE");
  }
  assert.deepEqual([...LAUNCHABLE_LEAD_RETRIEVAL_ROLES], ["platform_admin", "organizer_admin", "exhibitor_admin", "exhibitor_viewer"]);
});

test("every mapping failure is surfaced by its own code and stops the chain before authorization", async () => {
  const good = makeDeps({ role: "platform_admin", access: { resolution: "platform_all", eventIds: [] } });

  const noUser = { ...good.deps, mapping: { ...good.deps.mapping, findUserByPlatformUserId: async () => null } };
  assert.equal((await resolvePlatformEntry(GOOD, noUser) as { reason?: string }).reason, "USER_MAPPING_NOT_FOUND");

  const noEvent = { ...good.deps, mapping: { ...good.deps.mapping, findEventByPlatformEventId: async () => null } };
  assert.equal((await resolvePlatformEntry(GOOD, noEvent) as { reason?: string }).reason, "EVENT_MAPPING_NOT_FOUND");

  const bucket = {
    ...good.deps,
    mapping: {
      ...good.deps.mapping,
      findEventByPlatformEventId: async () => ({ id: "bucket", name: "Continuous capture", companyId: "co-organizer", containerKind: "continuous_capture", platformEventId: P_EVENT })
    }
  };
  assert.equal((await resolvePlatformEntry(GOOD, bucket) as { reason?: string }).reason, "EVENT_NOT_LAUNCHABLE_CONTAINER");

  const noOrg = { ...good.deps, mapping: { ...good.deps.mapping, findCompanyIdsByPlatformOrganizationId: async () => [] } };
  assert.equal((await resolvePlatformEntry(GOOD, noOrg) as { reason?: string }).reason, "ORGANIZATION_MAPPING_NOT_FOUND");

  const mismatch = { ...good.deps, mapping: { ...good.deps.mapping, findCompanyIdsByPlatformOrganizationId: async () => ["co-unrelated"] } };
  assert.equal((await resolvePlatformEntry(GOOD, mismatch) as { reason?: string }).reason, "EVENT_ORGANIZATION_MISMATCH");

  const ambiguous = {
    ...good.deps,
    mapping: {
      ...good.deps.mapping,
      findCompanyIdsByPlatformOrganizationId: async () => ["co-organizer", "co-exh-a"],
      findUserByPlatformUserId: async () => ({ id: "lr-user-1", role: "platform_admin", companyId: null, platformUserId: P_USER })
    }
  };
  assert.equal((await resolvePlatformEntry(GOOD, ambiguous) as { reason?: string }).reason, "AMBIGUOUS_ORGANIZATION_MAPPING");

  assert.deepEqual(good.calls.access, [], "authorization was never consulted for a launch that failed to map");
});

test("claim failures and malformed requests are refused before any mapping read", async () => {
  const { deps, calls } = makeDeps({ role: "platform_admin", access: { resolution: "platform_all", eventIds: [] } });
  const spyDeps: EntryDeps = {
    ...deps,
    mapping: {
      ...deps.mapping,
      findUserByPlatformUserId: async () => {
        throw new Error("mapping must not run");
      }
    }
  };
  assert.deepEqual(await resolvePlatformEntry({ handoff: "bad-token", eventId: P_EVENT }, spyDeps), {
    ok: false,
    status: 401,
    reason: "HANDOFF_INVALID",
    hint: "This Platform handoff is invalid, has expired, or was already used. Open Lead Retrieval from Platform again.",
    platformReason: "HANDOFF_INVALID"
  });
  assert.equal((await resolvePlatformEntry({ handoff: null, eventId: P_EVENT }, spyDeps) as { reason?: string }).reason, "INVALID_REQUEST");
  assert.equal((await resolvePlatformEntry({ handoff: "good-token", eventId: "not-a-uuid" }, spyDeps) as { reason?: string }).reason, "INVALID_REQUEST");
  assert.equal((await resolvePlatformEntry({ handoff: "bad chars!", eventId: P_EVENT }, spyDeps) as { reason?: string }).reason, "INVALID_REQUEST");
  assert.equal(calls.claim, 1, "only the syntactically valid request reached Platform");

  const denied: EntryDeps = { ...spyDeps, claim: async () => ({ ok: false, reason: "PLATFORM_DENIED", platformReason: "NOT_ENTITLED" }) };
  const result = await resolvePlatformEntry(GOOD, denied);
  assert.deepEqual(result, { ok: false, status: 403, reason: "PLATFORM_DENIED", hint: "Platform did not authorize this launch.", platformReason: "NOT_ENTITLED" });
  const unavailable: EntryDeps = { ...spyDeps, claim: async () => ({ ok: false, reason: "PLATFORM_UNAVAILABLE" }) };
  assert.equal((await resolvePlatformEntry(GOOD, unavailable) as { status?: number }).status, 502);
  const unconfigured: EntryDeps = { ...spyDeps, claim: async () => ({ ok: false, reason: "PLATFORM_NOT_CONFIGURED" }) };
  assert.equal((await resolvePlatformEntry(GOOD, unconfigured) as { status?: number }).status, 503);
});

test("the mapped event comes from Platform's claim, not from the browser's event_id", async () => {
  const OTHER_EVENT = "99999999-9999-4999-8999-999999999999";
  const { deps } = makeDeps({ role: "platform_admin", access: { resolution: "platform_all", eventIds: [] } });
  const swapped: EntryDeps = {
    ...deps,
    claim: async () => ({ ok: true, context: { platformUserId: P_USER, platformOrganizationId: P_ORG, platformEventId: OTHER_EVENT } }),
    mapping: {
      ...deps.mapping,
      findEventByPlatformEventId: async (id) => {
        assert.equal(id, OTHER_EVENT, "mapping keys off the claimed event id");
        return null;
      }
    }
  };
  assert.equal((await resolvePlatformEntry(GOOD, swapped) as { reason?: string }).reason, "EVENT_MAPPING_NOT_FOUND");
});

test("the pure access decision reuses LR's canonical resolution semantics", () => {
  assert.equal(decideLeadRetrievalEventAccess({ role: "platform_admin", access: { resolution: "platform_all", eventIds: [] }, eventId: "e" }).ok, true);
  assert.equal(decideLeadRetrievalEventAccess({ role: "organizer_admin", access: { resolution: "organizer_scope", eventIds: ["e"] }, eventId: "e" }).ok, true);
  assert.deepEqual(decideLeadRetrievalEventAccess({ role: "organizer_admin", access: { resolution: "organizer_scope", eventIds: ["x"] }, eventId: "e" }), { ok: false, reason: "LR_ACCESS_DENIED" });
  assert.deepEqual(decideLeadRetrievalEventAccess({ role: "exhibitor_admin", access: { resolution: "company_all_events", eventIds: ["e"] }, eventId: "" }), { ok: false, reason: "LR_ACCESS_DENIED" });
  assert.deepEqual(decideLeadRetrievalEventAccess({ role: "viewer", access: { resolution: "platform_all", eventIds: ["e"] }, eventId: "e" }), { ok: false, reason: "LR_ROLE_NOT_LAUNCHABLE" });
});

test("landing paths are the existing LR workspaces, and only exhibitor roles get the active-event cookie", () => {
  assert.equal(buildLeadRetrievalLandingPath("platform_admin", "ev 1"), "/admin/events/ev%201");
  assert.equal(buildLeadRetrievalLandingPath("organizer_admin", "ev1"), "/app/organizer?eventId=ev1");
  assert.equal(buildLeadRetrievalLandingPath("exhibitor_admin", "ev1"), "/exhibitor/dashboard?eventId=ev1");
  assert.equal(buildLeadRetrievalLandingPath("exhibitor_viewer", "ev1"), "/exhibitor/dashboard?eventId=ev1");

  for (const role of ["exhibitor_admin", "exhibitor_viewer"] as const) {
    const response = new NextResponse(null);
    applyLandingCookies(response, role, "ev1", { secure: true });
    const cookie = response.cookies.get(EXHIBITOR_APP_ACTIVE_EVENT_COOKIE);
    assert.ok(cookie, role);
    assert.equal(cookie.value, "ev1");
    assert.equal(cookie.path, "/");
    assert.equal(cookie.sameSite, "lax");
    assert.equal(cookie.httpOnly, false, "same attributes the in-app switcher writes (client-readable)");
    assert.equal(cookie.secure, true);
    assert.equal(cookie.domain, undefined);
    assert.equal(cookie.maxAge, 60 * 60 * 24 * 365);
  }
  for (const role of ["platform_admin", "organizer_admin"] as const) {
    const response = new NextResponse(null);
    applyLandingCookies(response, role, "ev1");
    assert.equal(response.cookies.get(EXHIBITOR_APP_ACTIVE_EVENT_COOKIE), undefined, role);
  }
});

test("the entry chain reuses LR's canonical resolver and adds no permission model of its own", () => {
  const authz = readFileSync("lib/platform/lr-authorization.ts", "utf8");
  const server = readFileSync("lib/platform/platform-entry-server.ts", "utf8");
  assert.match(server, /resolveAccessibleEventIdsForUser\(\{ userId: lrUserId \}\)/);
  assert.match(authz, /normalizeSessionRole/);
  assert.equal(/from\("|createAdminClient|supabase/.test(authz), false, "the decision module performs no reads of its own");
});
