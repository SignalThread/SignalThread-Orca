import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  deriveCompletedWorkspace,
  type CompletedWorkspaceInput
} from "@/lib/events/event-workspace-completed-core";
import type { LiveConversationRow } from "@/lib/events/event-workspace-live-core";

const HREFS = {
  hotLeads: "/exhibitor/leads?eventId=evt-1&view=hot",
  hotNoFollowUp: "/exhibitor/leads?eventId=evt-1&temperature=hot&followUp=none",
  followUpsDue: "/exhibitor/leads?eventId=evt-1&view=follow_up_due",
  leads: "/exhibitor/leads?eventId=evt-1",
  campaigns: "/exhibitor/campaigns",
  draftsReview: "/exhibitor/workflows/approvals?eventId=evt-1"
};

let seq = 0;

function conversation(partial: Partial<LiveConversationRow>): LiveConversationRow {
  seq += 1;
  return {
    id: `conv-${seq}`,
    created_at: "2026-03-19T14:00:00Z",
    summary: "Wants a migration plan before renewal.",
    priority_themes: [],
    objections: [],
    competitors_mentioned: [],
    pain_points: [],
    buying_signals: [],
    rep_behavior_patterns: [],
    transcription_status: "completed",
    synthesis_status: "completed",
    leadId: `lead-${seq}`,
    leadName: "Elena Marquez",
    leadCompany: "Vertex",
    ...partial
  };
}

function baseInput(partial: Partial<CompletedWorkspaceInput>): CompletedWorkspaceInput {
  return {
    conversations: [],
    totalLeadCount: 100,
    hotLeadCount: 20,
    warmLeadCount: 50,
    coldLeadCount: 30,
    hotNoFollowUpCount: 0,
    openFollowUpCount: 0,
    dueTodayFollowUpCount: 0,
    overdueFollowUpCount: 0,
    scheduledFollowUpCount: 0,
    stillNewCount: 0,
    briefingCounts: null,
    draftsPendingCount: null,
    hrefs: HREFS,
    ...partial
  };
}

describe("deriveCompletedWorkspace — What Matters Now ladder", () => {
  it("untouched hot leads outrank everything", () => {
    const c = deriveCompletedWorkspace(
      baseInput({ hotNoFollowUpCount: 82, draftsPendingCount: 12, overdueFollowUpCount: 40 })
    );
    assert.equal(c.whatMattersNow.key, "hot_untouched");
    assert.match(c.whatMattersNow.title, /82 hot leads are still waiting/);
    assert.equal(c.whatMattersNow.actionHref, HREFS.hotNoFollowUp);
    assert.equal(c.whatMattersNow.tone, "action");
  });

  it("pending drafts rank second (only when a review destination exists)", () => {
    const c = deriveCompletedWorkspace(baseInput({ draftsPendingCount: 7, overdueFollowUpCount: 3 }));
    assert.equal(c.whatMattersNow.key, "drafts_pending");
    assert.equal(c.whatMattersNow.actionHref, HREFS.draftsReview);

    const noRoute = deriveCompletedWorkspace(
      baseInput({ draftsPendingCount: 7, hrefs: { ...HREFS, draftsReview: null } })
    );
    assert.notEqual(noRoute.whatMattersNow.key, "drafts_pending");
  });

  it("overdue follow-ups rank third", () => {
    const c = deriveCompletedWorkspace(baseInput({ overdueFollowUpCount: 4 }));
    assert.equal(c.whatMattersNow.key, "overdue");
  });

  it("the strongest theme ranks fourth, quoting real counts", () => {
    const conversations = [
      conversation({ priority_themes: ["Migration off incumbent"] }),
      conversation({ priority_themes: ["Migration off incumbent"] }),
      conversation({ priority_themes: ["Migration off incumbent"] })
    ];
    const c = deriveCompletedWorkspace(baseInput({ conversations }));
    assert.equal(c.whatMattersNow.key, "strongest_theme");
    assert.match(c.whatMattersNow.body, /3 captured conversations/);
  });

  it("the neutral wrapped state reports only real counts", () => {
    const c = deriveCompletedWorkspace(baseInput({}));
    assert.equal(c.whatMattersNow.key, "wrapped");
    assert.match(c.whatMattersNow.body, /100 leads, 20 hot/);

    const unavailable = deriveCompletedWorkspace(
      baseInput({ totalLeadCount: null, hotLeadCount: null })
    );
    assert.doesNotMatch(unavailable.whatMattersNow.body, /\d/);
  });
});

describe("deriveCompletedWorkspace — outcome KPIs", () => {
  it("null counts render unavailable, never 0; the same count is never reused contradictorily", () => {
    const c = deriveCompletedWorkspace(
      baseInput({ totalLeadCount: null, hotLeadCount: null, openFollowUpCount: null, overdueFollowUpCount: null, scheduledFollowUpCount: null })
    );
    for (const key of ["total_leads", "hot_leads", "follow_ups_open"]) {
      const kpi = c.kpis.find((k) => k.key === key);
      assert.equal(kpi?.display, "—", key);
      assert.equal(kpi?.href, null, key);
    }
  });

  it("follow-ups-open splits overdue vs scheduled in the caption", () => {
    const c = deriveCompletedWorkspace(baseInput({ openFollowUpCount: 12, dueTodayFollowUpCount: 0, overdueFollowUpCount: 3, scheduledFollowUpCount: 9 }));
    const kpi = c.kpis.find((k) => k.key === "follow_ups_open");
    assert.equal(kpi?.display, "12");
    assert.equal(kpi?.caption, "3 overdue · 0 due today · 9 scheduled ahead");
  });

  it("briefs KPI is conditional on real usage", () => {
    assert.equal(
      deriveCompletedWorkspace(baseInput({})).kpis.some((k) => k.key === "briefs_approved"),
      false
    );
    const withBriefs = deriveCompletedWorkspace(baseInput({ briefingCounts: { generated: 40, approved: 32 } }));
    assert.equal(withBriefs.kpis.find((k) => k.key === "briefs_approved")?.display, "32 of 40");
  });

  it("hot KPI caption carries the temperature split when available", () => {
    const c = deriveCompletedWorkspace(baseInput({}));
    assert.equal(c.kpis.find((k) => k.key === "hot_leads")?.caption, "50 warm · 30 cold");
  });
});

describe("deriveCompletedWorkspace — final recap and coaching", () => {
  it("recap modules derive deterministically with buying signals included", () => {
    const conversations = [
      conversation({ buying_signals: ["Budget confirmed"], objections: ["Needs SOC 2"] }),
      conversation({ buying_signals: ["Budget confirmed"], objections: ["Needs SOC 2"] }),
      conversation({ buying_signals: ["budget confirmed"] })
    ];
    const c = deriveCompletedWorkspace(baseInput({ conversations }));
    const signals = c.recapModules.find((m) => m.key === "buying_signals");
    assert.equal(signals?.rows[0].label, "Budget confirmed");
    assert.equal(signals?.rows[0].conversationCount, 3);
    const objections = c.recapModules.find((m) => m.key === "objections");
    assert.equal(objections?.rows[0].conversationCount, 2);
  });

  it("no recap below the minimum sample; no coaching below the pattern threshold", () => {
    const c = deriveCompletedWorkspace(
      baseInput({
        conversations: [
          conversation({ priority_themes: ["Migration"], rep_behavior_patterns: ["Opens on features"] }),
          conversation({ priority_themes: ["Migration"], rep_behavior_patterns: ["Opens on features"] })
        ]
      })
    );
    assert.deepEqual(c.recapModules, []);
    assert.deepEqual(c.coaching, []);
  });
});

describe("deriveCompletedWorkspace — follow-up readiness, snapshot, actions", () => {
  it("readiness rows use honest labels (still marked new, no follow-up scheduled)", () => {
    const c = deriveCompletedWorkspace(
      baseInput({ hotNoFollowUpCount: 5, overdueFollowUpCount: 2, scheduledFollowUpCount: 8, stillNewCount: 40 })
    );
    const labels = c.followUpReadiness!.map((r) => r.label);
    assert.ok(labels.includes("Hot leads with no follow-up scheduled"));
    assert.ok(labels.includes("Leads still marked new"));
    assert.doesNotMatch(labels.join(" "), /uncontacted|contacted/i);
  });

  it("drafts row appears only with a real review destination", () => {
    const withRoute = deriveCompletedWorkspace(baseInput({ draftsPendingCount: 4 }));
    assert.ok(withRoute.followUpReadiness!.some((r) => r.key === "drafts_ready"));
    const withoutRoute = deriveCompletedWorkspace(
      baseInput({ draftsPendingCount: 4, hrefs: { ...HREFS, draftsReview: null } })
    );
    assert.equal(withoutRoute.followUpReadiness!.some((r) => r.key === "drafts_ready"), false);
  });

  it("all-null follow-up sources collapse the panel to unavailable", () => {
    const c = deriveCompletedWorkspace(
      baseInput({
        hotNoFollowUpCount: null,
        overdueFollowUpCount: null,
        scheduledFollowUpCount: null,
        stillNewCount: null,
        draftsPendingCount: null
      })
    );
    assert.equal(c.followUpReadiness, null);
  });

  it("executive snapshot holds only deterministic findings and hides without them", () => {
    const empty = deriveCompletedWorkspace(baseInput({}));
    assert.deepEqual(empty.executiveSnapshot, []);

    const conversations = [
      conversation({ priority_themes: ["Migration"] }),
      conversation({ priority_themes: ["Migration"] }),
      conversation({ priority_themes: ["Migration"] })
    ];
    const c = deriveCompletedWorkspace(baseInput({ conversations, hotNoFollowUpCount: 9 }));
    const keys = c.executiveSnapshot.map((r) => r.key);
    assert.deepEqual(keys, ["strongest_finding", "follow_up_gap", "next_step"]);
    const values = c.executiveSnapshot.map((r) => r.value).join(" ");
    assert.doesNotMatch(values, /\$|pipeline|revenue|vs\.? /i);
  });

  it("take-it-further offers only real destinations, gated by permission and data", () => {
    const admin = deriveCompletedWorkspace(baseInput({ draftsPendingCount: 3 }));
    assert.deepEqual(
      admin.takeItFurther.map((a) => a.key),
      ["launch_campaign", "review_drafts", "review_hot_leads", "open_leads"]
    );

    const viewer = deriveCompletedWorkspace(
      baseInput({ hrefs: { ...HREFS, campaigns: null, draftsReview: null }, hotLeadCount: 0 })
    );
    assert.deepEqual(viewer.takeItFurther.map((a) => a.key), ["open_leads"]);
  });
});
