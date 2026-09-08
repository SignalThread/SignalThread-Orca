import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  deriveEventReadiness,
  deriveEventReadinessPercent,
  type EventReadinessInput,
  type ReadinessTeamMemberRow
} from "@/lib/events/event-workspace-readiness-core";

const HREFS = {
  settings: "/app/events/evt-1/settings",
  team: "/exhibitor/users",
  strategy: "/exhibitor/briefings/setup",
  importWizard: "/exhibitor/import/wizard"
};

function member(partial: Partial<ReadinessTeamMemberRow>): ReadinessTeamMemberRow {
  return {
    user_id: "user-1",
    status: "active",
    permissions: { app: true },
    full_name: "Sam Ortiz",
    email: "sam@example.com",
    ...partial
  };
}

function baseInput(partial: Partial<EventReadinessInput>): EventReadinessInput {
  return {
    event: {
      name: "Tech Summit 2026",
      status: "UPCOMING",
      start_date: "2026-03-18",
      end_date: "2026-03-20",
      city: "San Francisco",
      state: "CA",
      container_kind: "event",
      briefing_strategy: null
    },
    teamMembers: [member({})],
    pendingInviteCount: 0,
    licenses: [{ seats_total: 10, seats_used: 4 }],
    leadCount: 12,
    briefingCounts: null,
    knowledgeItemCount: 0,
    hrefs: HREFS,
    canManage: true,
    ...partial
  };
}

describe("deriveEventReadiness — checklist truthfulness", () => {
  it("a fully prepared event is complete across required items with a neutral ready hero", () => {
    const r = deriveEventReadiness(baseInput({}));
    const byKey = new Map(r.checklist.map((i) => [i.key, i]));
    assert.equal(byKey.get("event_details")?.state, "complete");
    assert.equal(byKey.get("capture_access")?.state, "complete");
    assert.equal(byKey.get("team_invitations")?.state, "complete");
    assert.equal(byKey.get("seats_licenses")?.state, "complete");
    assert.equal(r.whatMattersNow.tone, "ready");
    assert.equal(r.whatMattersNow.key, "ready");
    assert.match(r.whatMattersNow.title, /Tech Summit 2026/);
  });

  it("missing dates surface as the event-details blocker", () => {
    const r = deriveEventReadiness(
      baseInput({
        event: {
          name: "Tech Summit 2026",
          status: "UPCOMING",
          start_date: null,
          end_date: null,
          city: null,
          state: null,
          container_kind: "event",
          briefing_strategy: null
        }
      })
    );
    const details = r.checklist.find((i) => i.key === "event_details");
    assert.equal(details?.state, "action");
    assert.match(details!.detail, /event dates/);
    assert.equal(r.whatMattersNow.key, "details_incomplete");
    assert.equal(r.whatMattersNow.actionHref, HREFS.settings);
  });

  it("continuous-capture events do not demand dates", () => {
    const r = deriveEventReadiness(
      baseInput({
        event: {
          name: "Always-on capture",
          status: "ACTIVE",
          start_date: null,
          end_date: null,
          city: null,
          state: null,
          container_kind: "continuous_capture",
          briefing_strategy: null
        }
      })
    );
    assert.equal(r.checklist.find((i) => i.key === "event_details")?.state, "complete");
  });

  it("unavailable sources are reported as unavailable — never complete, never 0", () => {
    const r = deriveEventReadiness(
      baseInput({ teamMembers: null, licenses: null, leadCount: null, pendingInviteCount: null })
    );
    assert.equal(r.checklist.find((i) => i.key === "capture_access")?.state, "unavailable");
    assert.equal(r.checklist.find((i) => i.key === "team_invitations")?.state, "unavailable");
    assert.equal(r.checklist.find((i) => i.key === "seats_licenses")?.state, "unavailable");
    assert.equal(r.checklist.find((i) => i.key === "lead_import")?.state, "unavailable");
    const teamKpi = r.kpis.find((k) => k.key === "team");
    assert.equal(teamKpi?.value, "—");
    assert.equal(teamKpi?.state, "unavailable");
    const seatsKpi = r.kpis.find((k) => k.key === "seats");
    assert.equal(seatsKpi?.value, "—");
    assert.equal(r.team, null);
  });
});

describe("deriveEventReadiness — team distinctions (company user ≠ assigned ≠ capture-ready)", () => {
  it("invited members are not counted as active and mark the team item in progress", () => {
    const r = deriveEventReadiness(
      baseInput({
        teamMembers: [member({}), member({ user_id: "user-2", status: "invited", full_name: "Priya N." })],
        pendingInviteCount: 1
      })
    );
    const teamItem = r.checklist.find((i) => i.key === "team_invitations");
    assert.equal(teamItem?.state, "progress");
    assert.match(teamItem!.detail, /1 invitation is/);
    const kpi = r.kpis.find((k) => k.key === "team");
    assert.equal(kpi?.value, "1 (+1 invited)");
    const rows = r.team!;
    assert.equal(rows.find((m) => m.userId === "user-2")?.state, "invited");
  });

  it("active members without app permission do not count as capture-capable", () => {
    const r = deriveEventReadiness(
      baseInput({
        teamMembers: [
          member({ permissions: { admin: true } }),
          member({ user_id: "user-2", permissions: { app: true }, full_name: "Dana Kim" })
        ]
      })
    );
    const capture = r.checklist.find((i) => i.key === "capture_access");
    assert.equal(capture?.state, "complete");
    assert.match(capture!.detail, /^1 teammate can capture/);
    assert.equal(r.team!.find((m) => m.displayName === "Dana Kim")?.captureAccess, true);
    assert.equal(r.team!.find((m) => m.displayName === "Sam Ortiz")?.captureAccess, false);
  });

  it("no capture-capable member is the top blocker after details are complete", () => {
    const r = deriveEventReadiness(
      baseInput({ teamMembers: [member({ permissions: { admin: true } })] })
    );
    assert.equal(r.whatMattersNow.key, "no_capture_access");
    assert.equal(r.whatMattersNow.actionHref, HREFS.team);
    const kpi = r.kpis.find((k) => k.key === "capture");
    assert.equal(kpi?.value, "Not set");
  });

  it("empty team with no invites is an action state", () => {
    const r = deriveEventReadiness(baseInput({ teamMembers: [], pendingInviteCount: 0 }));
    assert.equal(r.checklist.find((i) => i.key === "team_invitations")?.state, "action");
  });

  it("team panel ordering is deterministic: active first, then name, then id", () => {
    const r = deriveEventReadiness(
      baseInput({
        teamMembers: [
          member({ user_id: "u-3", status: "invited", full_name: "Alex Chen" }),
          member({ user_id: "u-2", status: "active", full_name: "Zoe Park" }),
          member({ user_id: "u-1", status: "active", full_name: "Zoe Park" })
        ]
      })
    );
    assert.deepEqual(
      r.team!.map((m) => m.userId),
      ["u-1", "u-2", "u-3"]
    );
  });
});

describe("deriveEventReadiness — seats and licenses", () => {
  it("no active license is an action state and the seats KPI says so", () => {
    const r = deriveEventReadiness(baseInput({ licenses: [] }));
    assert.equal(r.checklist.find((i) => i.key === "seats_licenses")?.state, "action");
    assert.equal(r.kpis.find((k) => k.key === "seats")?.value, "No license");
  });

  it("exhausted seats block, with honest counts", () => {
    const r = deriveEventReadiness(baseInput({ licenses: [{ seats_total: 6, seats_used: 6 }] }));
    const item = r.checklist.find((i) => i.key === "seats_licenses");
    assert.equal(item?.state, "action");
    assert.match(item!.detail, /All 6 seats/);
  });

  it("seat totals sum across active licenses", () => {
    const r = deriveEventReadiness(
      baseInput({
        licenses: [
          { seats_total: 6, seats_used: 4 },
          { seats_total: 4, seats_used: 2 }
        ]
      })
    );
    assert.equal(r.kpis.find((k) => k.key === "seats")?.value, "6 / 10");
  });

  it("seats blocker ranks below details, capture, and team blockers", () => {
    const r = deriveEventReadiness(
      baseInput({
        teamMembers: [member({ permissions: {} })],
        licenses: [{ seats_total: 6, seats_used: 6 }]
      })
    );
    assert.equal(r.whatMattersNow.key, "no_capture_access");
  });
});

describe("deriveEventReadiness — optional strategy/playbook behavior", () => {
  it("absent playbook is optional, never a blocker, and renders no strategy panel data", () => {
    const r = deriveEventReadiness(baseInput({ knowledgeItemCount: 0 }));
    const item = r.checklist.find((i) => i.key === "strategy_playbook");
    assert.equal(item?.state, "optional");
    assert.equal(r.strategy.configured, false);
    assert.equal(r.whatMattersNow.tone, "ready", "missing playbook must not block readiness");
  });

  it("a configured strategy summarizes goal and trusted sources", () => {
    const r = deriveEventReadiness(
      baseInput({
        event: {
          name: "Tech Summit 2026",
          status: "UPCOMING",
          start_date: "2026-03-18",
          end_date: "2026-03-20",
          city: null,
          state: null,
          container_kind: "event",
          briefing_strategy: {
            eventGoal: "Lead generation",
            productFocus: "Lead Retrieval App",
            targetBuyerPersona: "Event marketers",
            toneOfVoice: "Authoritative"
          }
        },
        knowledgeItemCount: 2
      })
    );
    const item = r.checklist.find((i) => i.key === "strategy_playbook");
    assert.equal(item?.state, "complete");
    assert.match(item!.detail, /Goal: Lead generation/);
    assert.match(item!.detail, /2 trusted sources/);
    assert.equal(r.strategy.configured, true);
    assert.equal(r.strategy.eventGoal, "Lead generation");
  });

  it("malformed strategy json is treated as unconfigured, not a crash", () => {
    const r = deriveEventReadiness(
      baseInput({
        event: {
          name: "E",
          status: "UPCOMING",
          start_date: "2026-03-18",
          end_date: "2026-03-20",
          city: null,
          state: null,
          container_kind: "event",
          briefing_strategy: ["not", "an", "object"]
        }
      })
    );
    assert.equal(r.strategy.configured, false);
  });
});

describe("deriveEventReadiness — briefs and import are conditional", () => {
  it("brief item appears only when leads exist and briefs were generated", () => {
    const withBriefs = deriveEventReadiness(
      baseInput({ briefingCounts: { generated: 10, approved: 6 } })
    );
    const item = withBriefs.checklist.find((i) => i.key === "briefs");
    assert.equal(item?.state, "progress");
    assert.match(item!.detail, /6 of 10/);

    const noLeads = deriveEventReadiness(
      baseInput({ leadCount: 0, briefingCounts: { generated: 0, approved: 0 } })
    );
    assert.equal(noLeads.checklist.some((i) => i.key === "briefs"), false);
  });

  it("zero leads keeps import optional — pre-event lists are not required", () => {
    const r = deriveEventReadiness(baseInput({ leadCount: 0 }));
    assert.equal(r.checklist.find((i) => i.key === "lead_import")?.state, "optional");
    assert.equal(r.whatMattersNow.tone, "ready");
  });
});

describe("deriveEventReadiness — KPI derivation", () => {
  it("setup KPI counts only required items with known state", () => {
    const r = deriveEventReadiness(baseInput({}));
    const setup = r.kpis.find((k) => k.key === "setup");
    // Required known items: details, capture, team, seats, lead_import (complete).
    assert.equal(setup?.value, "5 of 5");
    assert.equal(setup?.state, "ok");
  });

  it("unavailable items drop out of the setup denominator instead of faking completion", () => {
    const r = deriveEventReadiness(baseInput({ licenses: null }));
    const setup = r.kpis.find((k) => k.key === "setup");
    assert.equal(setup?.value, "4 of 4");
  });
});

describe("deriveEventReadinessPercent", () => {
  it("uses the canonical checklist and returns a percentage only when required sources are known", () => {
    const prepared = deriveEventReadiness(baseInput({ leadCount: 0 }));
    assert.equal(deriveEventReadinessPercent(prepared), 100);

    const incomplete = deriveEventReadiness(baseInput({
      leadCount: 0,
      teamMembers: [],
      pendingInviteCount: 0
    }));
    assert.ok((deriveEventReadinessPercent(incomplete) ?? 100) < 100);
  });

  it("does not manufacture a readiness percentage when a required source is unavailable", () => {
    const unavailable = deriveEventReadiness(baseInput({ teamMembers: null, leadCount: 0 }));
    assert.equal(deriveEventReadinessPercent(unavailable), null);
  });
});

describe("deriveEventReadiness — viewer (read-only) behavior", () => {
  it("viewers get honest states but no action buttons anywhere", () => {
    const r = deriveEventReadiness(
      baseInput({
        canManage: false,
        teamMembers: [],
        pendingInviteCount: 0,
        licenses: []
      })
    );
    for (const item of r.checklist) {
      assert.equal(item.actionLabel, null, `${item.key} action label leaks to viewer`);
      assert.equal(item.actionHref, null, `${item.key} action href leaks to viewer`);
    }
    assert.equal(r.whatMattersNow.actionLabel, null);
    assert.equal(r.whatMattersNow.actionHref, null);
    // States themselves remain truthful.
    assert.equal(r.checklist.find((i) => i.key === "team_invitations")?.state, "action");
  });
});
