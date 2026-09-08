/**
 * API/service-level scope tests for resolveLeadsExportScopeWithDeps (same wiring as resolveLeadsExportScope).
 * Pure RBAC rules are delegated to evaluateLeadsExportScopePure — not reimplemented here.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveLeadsExportScopeWithDeps } from "../lib/server/leads/leadsExportResolveScope";
import type { ExportSession } from "../lib/server/leads/leadsExportTypes";

const companyA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const companyB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const eventA = "11111111-1111-1111-1111-111111111111";
const eventB = "22222222-2222-2222-2222-222222222222";
const user1 = "33333333-3333-3333-3333-333333333333";

function sp(init: Record<string, string>) {
  return new URLSearchParams(init);
}

async function jsonError(res: Response) {
  return JSON.parse(await res.text()) as { error: string };
}

function session(partial: Partial<ExportSession> & Pick<ExportSession, "role">): ExportSession {
  return {
    userId: partial.userId ?? user1,
    companyId: partial.companyId ?? "",
    role: partial.role
  };
}

describe("resolveLeadsExportScopeWithDeps (export API scope)", () => {
  const noopOrganizer = async () => [];

  it("platform_admin: 400 when companyId is missing", async () => {
    const out = await resolveLeadsExportScopeWithDeps(
      { session: session({ role: "platform_admin" }), searchParams: sp({}) },
      {
        fetchExhibitorCompanyIdForExport: async () => ({ ok: true, companyId: null }),
        getOrganizerAllowedEventIds: noopOrganizer
      }
    );
    assert.ok(out instanceof Response);
    assert.equal(out.status, 400);
    const body = await jsonError(out);
    assert.match(body.error, /companyId is required/i);
  });

  it("platform_admin: resolves scope when companyId is supplied", async () => {
    const out = await resolveLeadsExportScopeWithDeps(
      { session: session({ role: "platform_admin" }), searchParams: sp({ companyId: companyA }) },
      {
        fetchExhibitorCompanyIdForExport: async () => ({ ok: true, companyId: null }),
        getOrganizerAllowedEventIds: noopOrganizer
      }
    );
    assert.ok(!(out instanceof Response));
    assert.equal(out.kind, "platform");
    assert.equal(out.companyId, companyA);
    assert.equal(out.eventId, null);
  });

  it("platform_admin: optional eventId is applied to scope (does not replace companyId)", async () => {
    const out = await resolveLeadsExportScopeWithDeps(
      {
        session: session({ role: "platform_admin" }),
        searchParams: sp({ companyId: companyA, eventId: eventA })
      },
      {
        fetchExhibitorCompanyIdForExport: async () => ({ ok: true, companyId: null }),
        getOrganizerAllowedEventIds: noopOrganizer
      }
    );
    assert.ok(!(out instanceof Response));
    assert.equal(out.kind, "platform");
    assert.equal(out.companyId, companyA);
    assert.equal(out.eventId, eventA);
  });

  it("exhibitor_admin: export scope is own company from user row, not companyId param for another company", async () => {
    const out = await resolveLeadsExportScopeWithDeps(
      {
        session: session({ role: "exhibitor_admin", companyId: companyA }),
        searchParams: sp({ companyId: companyB, eventId: eventA })
      },
      {
        fetchExhibitorCompanyIdForExport: async () => ({ ok: true, companyId: companyA }),
        getOrganizerAllowedEventIds: noopOrganizer
      }
    );
    assert.ok(!(out instanceof Response));
    assert.equal(out.kind, "exhibitor");
    assert.equal(out.companyId, companyA);
    assert.equal(out.eventId, eventA);
  });

  it("exhibitor_admin: when companyId param matches resolved company, scope unchanged", async () => {
    const out = await resolveLeadsExportScopeWithDeps(
      {
        session: session({ role: "exhibitor_admin", companyId: companyA }),
        searchParams: sp({ companyId: companyA })
      },
      {
        fetchExhibitorCompanyIdForExport: async () => ({ ok: true, companyId: companyA }),
        getOrganizerAllowedEventIds: noopOrganizer
      }
    );
    assert.ok(!(out instanceof Response));
    assert.equal(out.kind, "exhibitor");
    assert.equal(out.companyId, companyA);
  });

  it("exhibitor_admin: 400 when company cannot be resolved", async () => {
    const out = await resolveLeadsExportScopeWithDeps(
      { session: session({ role: "exhibitor_admin", companyId: "" }), searchParams: sp({}) },
      {
        fetchExhibitorCompanyIdForExport: async () => ({ ok: true, companyId: null }),
        getOrganizerAllowedEventIds: noopOrganizer
      }
    );
    assert.ok(out instanceof Response);
    assert.equal(out.status, 400);
  });

  it("exhibitor_admin: 500 when user row lookup fails", async () => {
    const out = await resolveLeadsExportScopeWithDeps(
      { session: session({ role: "exhibitor_admin" }), searchParams: sp({}) },
      {
        fetchExhibitorCompanyIdForExport: async () => ({
          ok: false,
          error: "Failed resolving exhibitor scope."
        }),
        getOrganizerAllowedEventIds: noopOrganizer
      }
    );
    assert.ok(out instanceof Response);
    assert.equal(out.status, 500);
  });

  it("organizer role: 400 when eventId is missing", async () => {
    for (const role of ["organizer_admin", "event_organizer", "organizer"] as const) {
      const out = await resolveLeadsExportScopeWithDeps(
        { session: session({ role }), searchParams: sp({}) },
        {
          fetchExhibitorCompanyIdForExport: async () => ({ ok: true, companyId: null }),
          getOrganizerAllowedEventIds: async () => [eventA]
        }
      );
      assert.ok(out instanceof Response);
      assert.equal(out.status, 400);
      const body = await jsonError(out);
      assert.match(body.error, /eventId is required/i);
    }
  });

  it("organizer role: 403 when eventId is outside getOrganizerScope (injected allowed list)", async () => {
    const out = await resolveLeadsExportScopeWithDeps(
      {
        session: session({ role: "event_organizer" }),
        searchParams: sp({ eventId: eventB })
      },
      {
        fetchExhibitorCompanyIdForExport: async () => ({ ok: true, companyId: null }),
        getOrganizerAllowedEventIds: async () => [eventA]
      }
    );
    assert.ok(out instanceof Response);
    assert.equal(out.status, 403);
    const body = await jsonError(out);
    assert.match(body.error, /outside organizer scope/i);
  });

  it("organizer role: allowed when eventId is in organizer allowed list", async () => {
    const out = await resolveLeadsExportScopeWithDeps(
      {
        session: session({ role: "organizer_admin" }),
        searchParams: sp({ eventId: eventA })
      },
      {
        fetchExhibitorCompanyIdForExport: async () => ({ ok: true, companyId: null }),
        getOrganizerAllowedEventIds: async () => [eventA, eventB]
      }
    );
    assert.ok(!(out instanceof Response));
    assert.equal(out.kind, "organizer");
    assert.equal(out.eventId, eventA);
  });

  it("organizer role: 403 when allowed event list is empty", async () => {
    const out = await resolveLeadsExportScopeWithDeps(
      {
        session: session({ role: "event_organizer" }),
        searchParams: sp({ eventId: eventA })
      },
      {
        fetchExhibitorCompanyIdForExport: async () => ({ ok: true, companyId: null }),
        getOrganizerAllowedEventIds: async () => []
      }
    );
    assert.ok(out instanceof Response);
    assert.equal(out.status, 403);
  });

  it("unsupported role: 403", async () => {
    const out = await resolveLeadsExportScopeWithDeps(
      {
        session: session({ role: "viewer" }),
        searchParams: sp({ companyId: companyA })
      },
      {
        fetchExhibitorCompanyIdForExport: async () => ({ ok: true, companyId: null }),
        getOrganizerAllowedEventIds: noopOrganizer
      }
    );
    assert.ok(out instanceof Response);
    assert.equal(out.status, 403);
  });

  it("q and status search params do not change resolved scope (filters are applied after scope)", async () => {
    const base = await resolveLeadsExportScopeWithDeps(
      {
        session: session({ role: "platform_admin" }),
        searchParams: sp({ companyId: companyA })
      },
      {
        fetchExhibitorCompanyIdForExport: async () => ({ ok: true, companyId: null }),
        getOrganizerAllowedEventIds: noopOrganizer
      }
    );
    const withFilters = await resolveLeadsExportScopeWithDeps(
      {
        session: session({ role: "platform_admin" }),
        searchParams: sp({ companyId: companyA, status: "new", q: "acme" })
      },
      {
        fetchExhibitorCompanyIdForExport: async () => ({ ok: true, companyId: null }),
        getOrganizerAllowedEventIds: noopOrganizer
      }
    );
    assert.ok(!(base instanceof Response) && !(withFilters instanceof Response));
    assert.deepEqual(base, withFilters);
  });
});
