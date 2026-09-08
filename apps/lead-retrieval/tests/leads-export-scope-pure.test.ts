import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateLeadsExportScopePure } from "../lib/server/leads/leadsExportScopePure";

describe("evaluateLeadsExportScopePure (RBAC / scope)", () => {
  const companyA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const companyB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const event1 = "11111111-1111-1111-1111-111111111111";
  const event2 = "22222222-2222-2222-2222-222222222222";

  it("platform_admin requires companyId param", () => {
    const r = evaluateLeadsExportScopePure({
      role: "platform_admin",
      sessionCompanyId: "",
      companyIdParam: null,
      eventIdParam: null,
      exhibitorCompanyFromUserRow: null,
      organizerAllowedEventIds: null
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.status, 400);
  });

  it("platform_admin exports within company + optional event scope", () => {
    const r = evaluateLeadsExportScopePure({
      role: "platform_admin",
      sessionCompanyId: "",
      companyIdParam: companyA,
      eventIdParam: event1,
      exhibitorCompanyFromUserRow: null,
      organizerAllowedEventIds: null
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.scope.kind, "platform");
      assert.equal(r.scope.companyId, companyA);
      assert.equal(r.scope.eventId, event1);
    }
  });

  it("exhibitor_admin uses user company; ignores foreign companyId param mismatch", () => {
    const r = evaluateLeadsExportScopePure({
      role: "exhibitor_admin",
      sessionCompanyId: companyA,
      companyIdParam: companyB,
      eventIdParam: event1,
      exhibitorCompanyFromUserRow: companyA,
      organizerAllowedEventIds: null
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.scope.kind, "exhibitor");
      assert.equal(r.scope.companyId, companyA);
      assert.equal(r.scope.eventId, event1);
    }
  });

  it("exhibitor_admin allows explicit companyId when it matches session company", () => {
    const r = evaluateLeadsExportScopePure({
      role: "exhibitor_admin",
      sessionCompanyId: companyA,
      companyIdParam: companyA,
      eventIdParam: null,
      exhibitorCompanyFromUserRow: companyA,
      organizerAllowedEventIds: null
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.scope.kind, "exhibitor");
      assert.equal(r.scope.companyId, companyA);
    }
  });

  it("exhibitor_admin fails when no company can be resolved", () => {
    const r = evaluateLeadsExportScopePure({
      role: "exhibitor_admin",
      sessionCompanyId: "",
      companyIdParam: null,
      eventIdParam: null,
      exhibitorCompanyFromUserRow: null,
      organizerAllowedEventIds: null
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.status, 400);
  });

  it("organizer_admin requires eventId", () => {
    const r = evaluateLeadsExportScopePure({
      role: "organizer_admin",
      sessionCompanyId: "",
      companyIdParam: null,
      eventIdParam: null,
      exhibitorCompanyFromUserRow: null,
      organizerAllowedEventIds: [event1]
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.status, 400);
  });

  it("organizer_admin denies event outside allowed list", () => {
    const r = evaluateLeadsExportScopePure({
      role: "organizer_admin",
      sessionCompanyId: "",
      companyIdParam: null,
      eventIdParam: event2,
      exhibitorCompanyFromUserRow: null,
      organizerAllowedEventIds: [event1]
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.status, 403);
  });

  it("organizer_admin allows event inside scope (product rule: organizer may export scoped event)", () => {
    const r = evaluateLeadsExportScopePure({
      role: "event_organizer",
      sessionCompanyId: "",
      companyIdParam: null,
      eventIdParam: event1,
      exhibitorCompanyFromUserRow: null,
      organizerAllowedEventIds: [event1, event2]
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.scope.kind, "organizer");
      assert.equal(r.scope.eventId, event1);
    }
  });

  it("viewer gets forbidden", () => {
    const r = evaluateLeadsExportScopePure({
      role: "viewer",
      sessionCompanyId: companyA,
      companyIdParam: null,
      eventIdParam: null,
      exhibitorCompanyFromUserRow: null,
      organizerAllowedEventIds: null
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.status, 403);
  });
});
