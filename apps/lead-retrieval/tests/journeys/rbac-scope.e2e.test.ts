/**
 * RBAC / scope enforcement journey.
 *
 * Server-side scope is enforced by Supabase RLS + route guards (both `server-only`). This journey
 * drives the importable canonical rules that those guards rely on — the event-access resolution
 * (`computeCompanyEventAccessSet`), server-authoritative event selection
 * (`pickValidatedEventIdForAccess`, which never trusts client input), and the cross-company lead
 * delete partition — and asserts via source contract that the lead routes authenticate, scope by
 * company, and deny viewer writes. RLS specifics: `briefing-rls-exhibitor-admin.test.ts`,
 * `lead-briefings-rls-exhibitor-admin.test.ts`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  computeCompanyEventAccessSet,
  pickValidatedEventIdForAccess,
} from "../../lib/access/event-access-mode";
import { partitionLeadIdsForExhibitorDelete } from "../../lib/leads/exhibitorLeadDeletePartition";

const root = process.cwd();
const createRoute = readFileSync(join(root, "app/api/exhibitor/leads/create/route.ts"), "utf8");
const leadRoute = readFileSync(join(root, "app/api/exhibitor/leads/[leadId]/route.ts"), "utf8");
const bulkRoute = readFileSync(join(root, "app/api/exhibitor/leads/bulk-delete/route.ts"), "utf8");

const EVENT_OWNED_A = "11111111-1111-1111-1111-111111111111";
const EVENT_OWNED_B = "22222222-2222-2222-2222-222222222222";
const EVENT_ASSIGNED = EVENT_OWNED_A;

describe("rbac journey — event access mode gates visibility (real rule)", () => {
  const base = {
    companyOwnedEventIds: [EVENT_OWNED_A, EVENT_OWNED_B],
    assignedCompanyEventIds: [EVENT_ASSIGNED],
    legacyEventIds: [EVENT_OWNED_A],
  };

  it("assigned_events_only must NOT widen to all company events", () => {
    const result = computeCompanyEventAccessSet({
      licenseEligible: true,
      eventAccessMode: "assigned_events_only",
      ...base,
    });
    assert.equal(result.resolution, "company_assigned_only");
    assert.deepEqual(result.eventIds, [EVENT_ASSIGNED]);
    assert.ok(!result.eventIds.includes(EVENT_OWNED_B));
  });

  it("all_company_events exposes every owned event (license required)", () => {
    const result = computeCompanyEventAccessSet({
      licenseEligible: true,
      eventAccessMode: "all_company_events",
      ...base,
    });
    assert.equal(result.resolution, "company_all_events");
    assert.deepEqual(result.eventIds, [EVENT_OWNED_A, EVENT_OWNED_B]);
  });

  it("no license eligibility falls back to legacy event-scoped membership", () => {
    const result = computeCompanyEventAccessSet({
      licenseEligible: false,
      eventAccessMode: "all_company_events",
      ...base,
    });
    assert.equal(result.resolution, "legacy_event_scoped");
    assert.deepEqual(result.eventIds, [EVENT_OWNED_A]);
  });
});

describe("rbac journey — server never trusts a client-supplied event id", () => {
  it("returns the preferred id only when it is in the accessible set, else falls back / null", () => {
    assert.equal(pickValidatedEventIdForAccess([EVENT_OWNED_A, EVENT_OWNED_B], EVENT_OWNED_B), EVENT_OWNED_B);
    assert.equal(pickValidatedEventIdForAccess([EVENT_OWNED_A], EVENT_OWNED_B), EVENT_OWNED_A); // out-of-scope rejected
    assert.equal(pickValidatedEventIdForAccess([], EVENT_OWNED_B), null);
  });
});

describe("rbac journey — cross-company lead access is rejected (real partition)", () => {
  it("a company can delete only its own leads; another company's lead is forbidden", () => {
    const rows = [
      { id: "lead-A", company_id: "company-A" },
      { id: "lead-B", company_id: "company-B" },
    ];
    const { deletable, forbidden, missing } = partitionLeadIdsForExhibitorDelete(
      ["lead-A", "lead-B", "lead-X"],
      rows,
      "company-A"
    );
    assert.deepEqual(deletable, ["lead-A"]);
    assert.deepEqual(missing, ["lead-X"]);
    assert.equal(forbidden.length, 1);
    assert.equal(forbidden[0].leadId, "lead-B");
  });
});

describe("rbac journey — lead routes enforce auth, company scope, and viewer write denial (source contract)", () => {
  it("writes authenticate and scope by company_id", () => {
    assert.match(createRoute, /resolveApiSession\(request\)/);
    assert.match(createRoute, /company_id:\s*companyId/);
    assert.match(leadRoute, /resolveApiSession\(request\)/);
    assert.match(leadRoute, /\.eq\("company_id", accountId\)/);
  });

  it("unauthorized requests get 403 and bulk delete denies viewers", () => {
    assert.match(createRoute, /\{ error: "Forbidden" \}, \{ status: 403 \}/);
    assert.match(bulkRoute, /role === "exhibitor_viewer" \|\| role === "viewer"/);
    assert.match(bulkRoute, /denyExhibitorViewer: true/);
  });
});
