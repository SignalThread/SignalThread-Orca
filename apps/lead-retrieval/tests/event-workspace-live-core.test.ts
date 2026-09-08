import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  aggregateConversationField,
  deriveLiveWorkspace,
  type LiveConversationRow,
  type LiveWorkspaceInput
} from "@/lib/events/event-workspace-live-core";

const HREFS = {
  hotLeads: "/exhibitor/leads?eventId=evt-1&view=hot",
  followUpsDue: "/exhibitor/leads?eventId=evt-1&view=follow_up_due",
  leads: "/exhibitor/leads?eventId=evt-1"
};

let conversationSeq = 0;

function conversation(partial: Partial<LiveConversationRow>): LiveConversationRow {
  conversationSeq += 1;
  return {
    id: `conv-${conversationSeq}`,
    created_at: "2026-03-19T14:00:00Z",
    summary: "Asked about identity requirements before pricing.",
    priority_themes: [],
    objections: [],
    competitors_mentioned: [],
    pain_points: [],
    buying_signals: [],
    rep_behavior_patterns: [],
    transcription_status: "completed",
    synthesis_status: "completed",
    leadId: `lead-${conversationSeq}`,
    leadName: "Ravi Shah",
    leadCompany: "Meridian Bank",
    ...partial
  };
}

function baseInput(partial: Partial<LiveWorkspaceInput>): LiveWorkspaceInput {
  return {
    conversations: [],
    conversationsTodayCount: 0,
    leadsTodayCount: 0,
    hotNeedingFollowUpCount: 0,
    followUpsDueCount: 0,
    followUpsDueTodayCount: 0,
    followUpsOverdueCount: 0,
    briefingCounts: null,
    todayYmd: "2026-03-19",
    hrefs: HREFS,
    ...partial
  };
}

describe("aggregateConversationField — deterministic normalization and ranking", () => {
  it("groups case/whitespace variants, ranks by count then label, and caps rows", () => {
    const conversations = [
      conversation({ priority_themes: ["SSO / SAML provisioning", "Pricing at scale"] }),
      conversation({ priority_themes: ["sso / saml provisioning"] }),
      conversation({ priority_themes: ["  SSO / SAML   provisioning ", "Pricing at scale"] }),
      conversation({ priority_themes: ["Badge printing"] }),
      conversation({ priority_themes: ["badge printing"] })
    ];
    const rows = aggregateConversationField(conversations, "priority_themes", conversations.length);
    assert.equal(rows[0].label, "SSO / SAML provisioning");
    assert.equal(rows[0].conversationCount, 3);
    // Tie between "Pricing at scale" (2) and "Badge printing" (2) → label A–Z.
    assert.deepEqual(
      rows.slice(1).map((r) => r.label),
      ["Badge printing", "Pricing at scale"]
    );
  });

  it("excludes junk items and duplicate mentions within one conversation", () => {
    const conversations = [
      conversation({ objections: ["none", "n/a", "Too expensive", "Too expensive", "  "] }),
      conversation({ objections: ["too EXPENSIVE"] }),
      conversation({ objections: ["Too expensive"] })
    ];
    const rows = aggregateConversationField(conversations, "objections", 3);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].label, "Too expensive");
    assert.equal(rows[0].conversationCount, 3);
  });

  it("requires a minimum module sample and a minimum of two conversations per item", () => {
    const below = [conversation({ priority_themes: ["Migration"] }), conversation({ priority_themes: ["Migration"] })];
    assert.deepEqual(aggregateConversationField(below, "priority_themes", 2), []);

    const enoughSampleButSingletons = [
      conversation({ priority_themes: ["A topic"] }),
      conversation({ priority_themes: ["B topic"] }),
      conversation({ priority_themes: ["C topic"] })
    ];
    assert.deepEqual(aggregateConversationField(enoughSampleButSingletons, "priority_themes", 3), []);
  });

  it("only synthesis-completed conversations contribute", () => {
    const conversations = [
      conversation({ priority_themes: ["Migration"], synthesis_status: "pending" }),
      conversation({ priority_themes: ["Migration"] }),
      conversation({ priority_themes: ["Migration"] }),
      conversation({ priority_themes: ["Migration"], synthesis_status: "failed" })
    ];
    const rows = aggregateConversationField(conversations, "priority_themes", 4);
    assert.equal(rows[0].conversationCount, 2);
  });

  it("caps evidence per row and keeps records human-readable", () => {
    const conversations = Array.from({ length: 8 }, (_, i) =>
      conversation({ priority_themes: ["Migration"], leadName: `Lead ${i}` })
    );
    const rows = aggregateConversationField(conversations, "priority_themes", 8);
    assert.equal(rows[0].evidence.length, 5);
    for (const record of rows[0].evidence) {
      assert.ok(record.leadName.length > 0);
      assert.ok(record.context.length > 0);
    }
  });
});

describe("deriveLiveWorkspace — modules appear only when supported", () => {
  it("modules hide below the minimum sample; the body explains quietly", () => {
    const live = deriveLiveWorkspace(
      baseInput({
        conversations: [
          conversation({ priority_themes: ["Migration"] }),
          conversation({ priority_themes: ["Migration"] })
        ]
      })
    );
    assert.deepEqual(live.modules, []);
  });

  it("null conversations (query failure) produce no modules or operational claims", () => {
    const live = deriveLiveWorkspace(baseInput({ conversations: null }));
    assert.deepEqual(live.modules, []);
    assert.equal(live.operational, null);
  });

  it("a supported field renders its module while unsupported ones disappear", () => {
    const conversations = [
      conversation({ objections: ["Mid-contract with a competitor"] }),
      conversation({ objections: ["Mid-contract with a competitor"] }),
      conversation({ objections: ["Mid-contract with a competitor"] })
    ];
    const live = deriveLiveWorkspace(baseInput({ conversations }));
    assert.deepEqual(live.modules.map((m) => m.key), ["objections"]);
    assert.equal(live.modules[0].rows[0].conversationCount, 3);
  });

  it("uses structured buying signals for the evidence-backed messaging module", () => {
    const conversations = [
      conversation({ buying_signals: ["ROI / pipeline attribution"] }),
      conversation({ buying_signals: ["roi / pipeline attribution"] }),
      conversation({ buying_signals: ["ROI / pipeline attribution"] })
    ];
    const messaging = deriveLiveWorkspace(baseInput({ conversations })).modules.find((module) => module.key === "buying_signals");
    assert.equal(messaging?.title, "Messaging that’s resonating");
    assert.equal(messaging?.rows[0]?.label, "ROI / pipeline attribution");
    assert.equal(messaging?.rows[0]?.conversationCount, 3);
    assert.equal(messaging?.rows[0]?.evidence.length, 3);
  });

  it("supports zero, one, and several evidence-backed competitor mentions without invented rows", () => {
    const zero = deriveLiveWorkspace(baseInput({ conversations: [conversation({}), conversation({}), conversation({})] }));
    assert.equal(zero.modules.find((module) => module.key === "competitors"), undefined);

    const one = deriveLiveWorkspace(
      baseInput({
        conversations: [
          conversation({ competitors_mentioned: ["Cvent"] }),
          conversation({ competitors_mentioned: ["cvent"] }),
          conversation({ competitors_mentioned: ["Cvent"] })
        ]
      })
    ).modules.find((module) => module.key === "competitors");
    assert.deepEqual(one?.rows.map((row) => row.label), ["Cvent"]);
    assert.equal(one?.rows[0]?.evidence.length, 3);

    const many = deriveLiveWorkspace(
      baseInput({
        conversations: [
          conversation({ competitors_mentioned: ["Cvent", "Bizzabo"] }),
          conversation({ competitors_mentioned: ["Cvent", "Bizzabo"] }),
          conversation({ competitors_mentioned: ["Cvent", "Bizzabo"] })
        ]
      })
    ).modules.find((module) => module.key === "competitors");
    assert.deepEqual(many?.rows.map((row) => row.label), ["Bizzabo", "Cvent"]);
  });
});

describe("deriveLiveWorkspace — KPI honesty", () => {
  it("null counts render as unavailable, never 0, and lose their drill-down", () => {
    const live = deriveLiveWorkspace(
      baseInput({
        conversationsTodayCount: null,
        leadsTodayCount: null,
        hotNeedingFollowUpCount: null,
        followUpsDueCount: null
      })
    );
    for (const key of ["conversations_today", "leads_today", "hot_needing_follow_up", "follow_ups_due"]) {
      const kpi = live.kpis.find((k) => k.key === key);
      assert.equal(kpi?.value, null);
      assert.equal(kpi?.display, "—");
      assert.equal(kpi?.href, null);
    }
  });

  it("always returns exactly the four live-event action KPIs and excludes briefs", () => {
    const live = deriveLiveWorkspace(baseInput({ briefingCounts: { generated: 12, approved: 7 } }));
    assert.deepEqual(live.kpis.map((kpi) => kpi.key), [
      "conversations_today",
      "leads_today",
      "hot_needing_follow_up",
      "follow_ups_due"
    ]);
    assert.equal(live.kpis.some((kpi) => kpi.label === "Briefs approved"), false);
  });

  it("real zeros are shown as honest zeros with working drill-downs", () => {
    const live = deriveLiveWorkspace(baseInput({}));
    const hot = live.kpis.find((k) => k.key === "hot_needing_follow_up");
    assert.equal(hot?.display, "0");
    assert.equal(hot?.href, HREFS.hotLeads);
  });
});

describe("deriveLiveWorkspace — What Matters Now ladder", () => {
  it("hot leads needing follow-up outrank everything", () => {
    const live = deriveLiveWorkspace(
      baseInput({
        hotNeedingFollowUpCount: 12,
        followUpsDueCount: 30,
        conversations: [
          conversation({ transcription_status: "failed" }),
          conversation({ priority_themes: ["Migration"] }),
          conversation({ priority_themes: ["Migration"] })
        ]
      })
    );
    assert.equal(live.whatMattersNow.key, "hot_needing_follow_up");
    assert.match(live.whatMattersNow.title, /12 hot leads need/);
    assert.equal(live.whatMattersNow.actionHref, HREFS.hotLeads);
  });

  it("overdue follow-ups rank second", () => {
    const live = deriveLiveWorkspace(baseInput({ hotNeedingFollowUpCount: 0, followUpsDueCount: 5 }));
    assert.equal(live.whatMattersNow.key, "follow_ups_overdue");
    assert.equal(live.whatMattersNow.actionHref, HREFS.followUpsDue);
  });

  it("processing failures rank third", () => {
    const live = deriveLiveWorkspace(
      baseInput({ conversations: [conversation({ transcription_status: "failed" })] })
    );
    assert.equal(live.whatMattersNow.key, "processing_failures");
  });

  it("a leading topic ranks fourth, quoting real counts only", () => {
    const conversations = [
      conversation({ priority_themes: ["SSO provisioning"] }),
      conversation({ priority_themes: ["SSO provisioning"] }),
      conversation({ priority_themes: ["SSO provisioning"] })
    ];
    const live = deriveLiveWorkspace(baseInput({ conversations }));
    assert.equal(live.whatMattersNow.key, "top_topic");
    assert.match(live.whatMattersNow.title, /SSO provisioning/);
    assert.match(live.whatMattersNow.body, /3 captured conversations/);
  });

  it("the steady state reports real captured counts and never fabricates", () => {
    const live = deriveLiveWorkspace(baseInput({ conversationsTodayCount: 9, leadsTodayCount: 14 }));
    assert.equal(live.whatMattersNow.key, "steady");
    assert.match(live.whatMattersNow.body, /9 conversations and 14 leads/);

    const unavailable = deriveLiveWorkspace(
      baseInput({ conversationsTodayCount: null, leadsTodayCount: null })
    );
    assert.equal(unavailable.whatMattersNow.key, "steady");
    assert.doesNotMatch(unavailable.whatMattersNow.body, /\d/);
  });
});

describe("deriveLiveWorkspace — follow-up status and operational honesty", () => {
  it("keeps independently sourced follow-up states and the existing event-scoped queue destination", () => {
    const status = deriveLiveWorkspace(
      baseInput({ hotNeedingFollowUpCount: 4, followUpsDueTodayCount: 2, followUpsOverdueCount: 3 })
    ).followUpStatus;
    assert.deepEqual(status, {
      hotAwaitingFollowUp: 4,
      dueToday: 2,
      overdue: 3,
      actionHref: HREFS.followUpsDue
    });
  });

  it("does not turn an unavailable follow-up query into a zero", () => {
    const status = deriveLiveWorkspace(
      baseInput({ hotNeedingFollowUpCount: null, followUpsDueTodayCount: null, followUpsOverdueCount: null })
    ).followUpStatus;
    assert.equal(status.hotAwaitingFollowUp, null);
    assert.equal(status.dueToday, null);
    assert.equal(status.overdue, null);
  });

  it("operational notices exist only when real failures exist", () => {
    const clean = deriveLiveWorkspace(baseInput({ conversations: [conversation({})] }));
    assert.equal(clean.operational, null);

    const failing = deriveLiveWorkspace(
      baseInput({
        conversations: [
          conversation({ transcription_status: "failed" }),
          conversation({ synthesis_status: "failed" }),
          conversation({})
        ]
      })
    );
    assert.equal(failing.operational?.failedCount, 2);
    assert.equal(failing.operational?.evidence.length, 2);
  });

  it("does not report completed no-speech recordings as processing failures", () => {
    const live = deriveLiveWorkspace(
      baseInput({
        conversations: [
          conversation({
            transcript: null,
            summary: null,
            synthesis_status: "failed",
            synthesis_error: "Transcript is empty; no speech was detected."
          }),
          conversation({ transcript: "usable audio", synthesis_status: "failed" })
        ]
      })
    );

    assert.equal(live.operational?.failedCount, 1);
  });

  it("reports structured and legacy synthesis coverage without inventing modules", () => {
    const live = deriveLiveWorkspace(
      baseInput({
        conversations: [
          conversation({ priority_themes: ["Badge reliability"] }),
          conversation({ priority_themes: [] }),
          conversation({ priority_themes: [] })
        ]
      })
    );

    assert.deepEqual(live.intelligenceCoverage, {
      analyzedCount: 3,
      totalCount: null,
      isSampled: false,
      structuredCount: 1,
      legacyCount: 2
    });
    assert.deepEqual(live.modules, []);
  });
});
