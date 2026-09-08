import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BriefingDetailView } from "../lib/import-wizard/briefing-detail-model";
import type { BatchBriefingContextV1 } from "../lib/import-wizard/batch-briefing-context";
import {
  composeStrategicQuestions,
  composeStrategicTalkingPoints,
  composeWhyTheyMatterHere,
  deriveCompetitorContext,
  deriveContextTalkingPoints,
  deriveContextWhyHereLines,
  deriveSignalsToWatch,
  deriveStrategicGaps,
  isWeakCsvTalkingPoint,
  isWeakCsvWhyLine,
  parseHeadlineIdentity,
  resolveLeadTitle,
} from "../lib/import-wizard/briefing-enrich-from-context";

function baseDetail(overrides?: Partial<BriefingDetailView>): BriefingDetailView {
  const defaults: BriefingDetailView = {
    batchRowId: "row-1",
    leadId: null,
    briefingRecordId: "br-1",
    approvalStatus: "pending",
    headline: "Briefing for Test Lead at TestCo.",
    companySnapshot: {
      name: "TestCo",
      tagline: "Imported lead: Test Lead — Engineer",
      quote: "—",
      headcount: "—",
      techSophistication: "—",
      hq: "—",
    },
    whyHere: [],
    talkingPoints: [{ title: "Lead name", detail: "Imported full name: Test Lead" }],
    questionsToAsk: [],
    competitorContext: "",
    signalsToWatch: [],
    manualContext: null,
    polished: null,
    hasManualBriefEdits: false,
    identityExtras: { email: null, linkedinUrl: null },
    enrichment: null,
  };
  return {
    ...defaults,
    ...overrides,
    polished: overrides?.polished ?? defaults.polished,
    hasManualBriefEdits: overrides?.hasManualBriefEdits ?? false,
  };
}

describe("parseHeadlineIdentity / resolveLeadTitle", () => {
  it("parses name, title, company from standard headline", () => {
    const p = parseHeadlineIdentity("Briefing for Jane Doe — VP Sales at Acme Corp.");
    assert.equal(p.displayName, "Jane Doe");
    assert.equal(p.title, "VP Sales");
    assert.equal(p.company, "Acme Corp");
  });

  it("resolves title from tagline when headline has no title segment", () => {
    const d = baseDetail({ headline: "Briefing for Test Lead at TestCo." });
    assert.equal(resolveLeadTitle(d), "Engineer");
  });

  it("prefers enriched job title over tagline when headline has no title segment", () => {
    const d = baseDetail({
      headline: "Briefing for Test Lead at TestCo.",
      enrichment: {
        companySize: "51-200",
        industry: null,
        seniority: null,
        domain: null,
        linkedinUrl: null,
        jobTitleEnriched: "Director of Sales",
      },
    });
    assert.equal(resolveLeadTitle(d), "Director of Sales");
  });
});

describe("weak CSV heuristics", () => {
  it("detects weak why lines from import metadata", () => {
    assert.ok(isWeakCsvWhyLine("Status in source data: active"));
    assert.ok(!isWeakCsvWhyLine("Custom note about fit"));
  });

  it("detects weak talking points from field dumps", () => {
    assert.ok(isWeakCsvTalkingPoint({ title: "Lead name", detail: "Imported full name: X" }));
    assert.ok(!isWeakCsvTalkingPoint({ title: "Custom", detail: "Something useful" }));
  });
});

describe("composeWhyTheyMatterHere / deriveContextWhyHereLines", () => {
  it("returns empty when no usable signals", () => {
    const lines = composeWhyTheyMatterHere(baseDetail(), {});
    assert.equal(lines.length, 0);
  });

  it("includes target buyer framing when target persona and role resolve", () => {
    const lines = composeWhyTheyMatterHere(baseDetail(), { targetBuyerPersona: "Engineers" });
    assert.ok(
      lines.some(
        (l) =>
          l.includes("Compared to") ||
          l.includes("buyer profile") ||
          l.includes("qualifying early")
      )
    );
  });

  it("includes event goal framing when set", () => {
    const lines = composeWhyTheyMatterHere(baseDetail(), { eventGoal: "lead_generation" });
    assert.ok(lines.some((l) => l.includes("objective for this event") && l.includes("Lead Generation")));
  });

  it("surfaces manual whyMatters as a primary line", () => {
    const detail = baseDetail({ manualContext: { whyMatters: "Key account" } });
    const lines = composeWhyTheyMatterHere(detail, {});
    assert.ok(lines.some((l) => l.includes("Key account")));
  });

  it("deriveContextWhyHereLines aliases composed list", () => {
    const a = composeWhyTheyMatterHere(baseDetail({ manualContext: { whyMatters: "x" } }), {});
    const b = deriveContextWhyHereLines(baseDetail({ manualContext: { whyMatters: "x" } }), {});
    assert.deepEqual(a, b);
  });

  it("rolls up weak CSV why lines into one signal when nothing else exists", () => {
    const detail = baseDetail({
      whyHere: ["Status in source data: VIP", "Follow-up date in source data: 2025-01-01"],
    });
    const lines = composeWhyTheyMatterHere(detail, {});
    assert.ok(lines.length >= 1);
    assert.ok(lines[0]!.includes("Signals from the import row"));
  });
});

describe("composeStrategicTalkingPoints / deriveContextTalkingPoints", () => {
  it("returns empty when no batch/manual context and only weak CSV points", () => {
    const points = composeStrategicTalkingPoints(baseDetail(), {});
    assert.equal(points.length, 0);
  });

  it("adds product clarity when product focus set without pain or whatWeKnow", () => {
    const points = composeStrategicTalkingPoints(baseDetail(), { productFocus: "CRM Platform" });
    assert.ok(points.some((p) => p.title === "Product clarity"));
    assert.ok(points.some((p) => p.detail.includes("CRM Platform")));
  });

  it("uses batch notes with strategic tie-in title", () => {
    const points = composeStrategicTalkingPoints(baseDetail(), { batchNotes: "Focus on enterprise deals" });
    assert.ok(points.some((p) => p.title === "Strategic tie-in"));
  });

  it("adds suspected pain angle from manual context", () => {
    const detail = baseDetail({ manualContext: { suspectedPain: "Slow pipeline" } });
    const points = composeStrategicTalkingPoints(detail, {});
    assert.ok(points.some((p) => p.title === "Pain-first angle"));
  });

  it("adds competitor mentioned into talking points", () => {
    const detail = baseDetail({ manualContext: { competitorMentioned: "Salesforce" } });
    const points = composeStrategicTalkingPoints(detail, {});
    assert.ok(points.some((p) => p.detail.includes("Salesforce")));
  });

  it("deriveContextTalkingPoints matches composeStrategicTalkingPoints", () => {
    const ctx: BatchBriefingContextV1 = { productFocus: "X" };
    assert.deepEqual(composeStrategicTalkingPoints(baseDetail(), ctx), deriveContextTalkingPoints(baseDetail(), ctx));
  });

  it("does not paste long persona verbatim into Role & influence", () => {
    const longPersona = "A".repeat(100);
    const pts = composeStrategicTalkingPoints(baseDetail(), {
      targetBuyerPersona: longPersona,
    });
    const ri = pts.find((p) => p.title === "Role & influence");
    assert.ok(ri);
    assert.ok(!ri!.detail.includes(longPersona));
    assert.ok(ri!.detail.includes("buyer profile"));
  });
});

describe("composeStrategicQuestions / deriveContextQuestions", () => {
  it("returns empty when no goal, product, manual, or stored questions", () => {
    const q = composeStrategicQuestions(baseDetail(), {});
    assert.equal(q.length, 0);
  });

  it("derives lead_generation question", () => {
    const q = composeStrategicQuestions(baseDetail(), { eventGoal: "lead_generation" });
    assert.ok(q.some((x) => x.includes("capture") || x.includes("qualify")));
  });

  it("derives pipeline_acceleration question", () => {
    const q = composeStrategicQuestions(baseDetail(), { eventGoal: "pipeline_acceleration" });
    assert.ok(q.some((x) => x.includes("priorities") || x.includes("30 days")));
  });

  it("uses free-text event goal with a generic discovery question", () => {
    const q = composeStrategicQuestions(baseDetail(), { eventGoal: "Competitive intelligence at the booth" });
    assert.ok(q.some((x) => x.includes("Competitive intelligence") && x.includes("stated goal")));
  });

  it("derives product-specific question from product focus", () => {
    const q = composeStrategicQuestions(baseDetail(), { productFocus: "DataSync Pro" });
    assert.ok(q.some((x) => x.includes("DataSync Pro")));
  });

  it("derives question from manual whatWeKnow", () => {
    const detail = baseDetail({ manualContext: { whatWeKnow: "They use Salesforce" } });
    const q = composeStrategicQuestions(detail, {});
    assert.ok(q.some((x) => x.includes("Salesforce")));
  });

  it("adds concrete follow-ups when conversation starter exists (no meta coaching)", () => {
    const detail = baseDetail({ manualContext: { conversationStarter: "Ask about Q1" } });
    const q = composeStrategicQuestions(detail, {});
    assert.ok(q.some((x) => x.includes("deadline") || x.includes("dependency")));
    assert.ok(!q.some((x) => /after you open with that angle/i.test(x)));
  });

  it("does not echo raw persona string in questions when persona is set", () => {
    const q = composeStrategicQuestions(baseDetail(), {
      targetBuyerPersona: "Marketers, marketing managers, event managers",
    });
    assert.ok(!q.some((x) => x.includes("Marketers, marketing managers")));
    assert.ok(q.some((x) => x.includes("priority") || x.includes("hurdle")));
  });
});

describe("deriveCompetitorContext", () => {
  it("returns empty when no competitor signals", () => {
    const lines = deriveCompetitorContext(baseDetail(), {});
    assert.equal(lines.length, 0);
  });

  it("includes stored competitorContext", () => {
    const detail = baseDetail({ competitorContext: "Uses HubSpot CRM" });
    const lines = deriveCompetitorContext(detail, {});
    assert.ok(lines.includes("Uses HubSpot CRM"));
  });

  it("includes manual competitorMentioned with rep-prep framing", () => {
    const detail = baseDetail({ manualContext: { competitorMentioned: "Evaluating Salesforce" } });
    const lines = deriveCompetitorContext(detail, {});
    assert.ok(lines.length >= 2, "should include multiple grounded competitor lines");
    assert.ok(lines.some((l) => l.includes("Evaluating Salesforce") && l.includes("radar")));
  });

  it("includes batch notes when they mention competition", () => {
    const lines1 = deriveCompetitorContext(baseDetail(), { batchNotes: "Focus on competitive wins against Oracle" });
    assert.ok(lines1.length > 0, "should include when competitive thread appears");

    const lines2 = deriveCompetitorContext(baseDetail(), { batchNotes: "General batch of leads" });
    assert.equal(lines2.length, 0, "should skip when no competitive signal");
  });
});

describe("deriveSignalsToWatch", () => {
  it("returns existing signals when no context", () => {
    const detail = baseDetail({ signalsToWatch: ["Existing signal"] });
    const signals = deriveSignalsToWatch(detail, {});
    assert.ok(signals.includes("Existing signal"));
  });

  it("adds priority override signal", () => {
    const detail = baseDetail({ manualContext: { priorityOverride: "high" } });
    const signals = deriveSignalsToWatch(detail, {});
    assert.ok(signals.some((s) => s.includes("high") || s.includes("Priority")));
  });
});

describe("deriveStrategicGaps", () => {
  it("flags account clarity when company name missing", () => {
    const detail = baseDetail({ companySnapshot: { ...baseDetail().companySnapshot, name: "—" } });
    const gaps = deriveStrategicGaps(detail, {});
    assert.ok(gaps.some((u) => u.gap === "Account clarity"));
  });

  it("flags product anchor when product focus missing", () => {
    const gaps = deriveStrategicGaps(baseDetail(), {});
    assert.ok(gaps.some((u) => u.gap === "Product & positioning anchor"));
  });

  it("does NOT flag product anchor when product focus is set", () => {
    const gaps = deriveStrategicGaps(baseDetail(), { productFocus: "Our CRM" });
    assert.ok(!gaps.some((u) => u.gap === "Product & positioning anchor"));
  });

  it("flags event objective when event goal missing", () => {
    const gaps = deriveStrategicGaps(baseDetail(), {});
    assert.ok(gaps.some((u) => u.gap === "Event-level objective"));
  });

  it("returns at most 10 gaps", () => {
    const gaps = deriveStrategicGaps(baseDetail(), {});
    assert.ok(gaps.length <= 10);
  });

  it("each gap has probe text", () => {
    const gaps = deriveStrategicGaps(baseDetail(), {});
    assert.ok(gaps.every((g) => g.probe.trim().length > 10));
  });
});
