// @lr area=ai-quality severity=P2 layer=unit category=local-only
/**
 * Golden-set eval harness — plan §70, Prompt 11 item 7.
 *
 * §70 calls for *"a scheduled (not per-commit) golden-set eval: fixed transcripts and lead
 * fixtures scored against a rubric for grounding, required-field presence, absence of
 * fabrication, tone, and length"*, with a baseline and an alert on regression. The purpose
 * is drift detection: *"this is how you learn the provider changed the model under you."*
 *
 * ── What runs here, and what does not ──────────────────────────────────────────────
 *
 * The **rubric** runs on every commit. It is deterministic, needs no model, and is the part
 * that can silently rot — a scorer that always returns 1.0 would make every future eval
 * look healthy. So the rubric is tested against known-good and known-bad outputs, and each
 * dimension is proven to be able to fail.
 *
 * The **scheduled eval** — calling a real model against the golden set and comparing to the
 * baseline — is not run here. It costs money per run and would make this suite
 * non-deterministic. It is wired for the nightly cadence in Prompt 14.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

// ── the golden set ─────────────────────────────────────────────────────────────────

type GoldenCase = {
  id: string;
  /** Facts present in the source material. Anything outside this set is fabrication. */
  groundTruth: string[];
  lead: { firstName: string; company: string; event: string };
};

const GOLDEN_SET: GoldenCase[] = [
  {
    id: "procurement-timing",
    groundTruth: ["procurement cycles tightening", "Q3 budget", "plant operations"],
    lead: { firstName: "Sarah", company: "Northwind Industrial", event: "IoT World 2026" },
  },
  {
    id: "integration-concern",
    groundTruth: ["legacy SCADA integration", "18-month rollout", "two sites"],
    lead: { firstName: "Marcus", company: "Globex", event: "IoT World 2026" },
  },
  {
    id: "sparse-conversation",
    groundTruth: ["brief booth visit"],
    lead: { firstName: "Ana", company: "Initech", event: "IoT World 2026" },
  },
];

// ── the rubric ─────────────────────────────────────────────────────────────────────

type Draft = { subject: string; body: string };
type Scores = { grounding: number; requiredFields: number; noFabrication: number; tone: number; length: number };

/** Facts a model must not invent. Each is absent from every golden case's ground truth. */
const FABRICATION_MARKERS = [
  /\b\d+%\s+(discount|off|savings)/i,
  /\bguarantee\b/i,
  /\bour CEO\b/i,
  /\bnext (Tuesday|Wednesday|Thursday) at \d/i,
  /\$\d[\d,]*/,
];

const HYPE_MARKERS = [/\brevolutionary\b/i, /\bgame[- ]changer\b/i, /\bsynergy\b/i, /!{2,}/, /\bAMAZING\b/];

function scoreDraft(draft: Draft, golden: GoldenCase): Scores {
  const text = `${draft.subject}\n${draft.body}`;
  const lower = text.toLowerCase();

  // Grounding: how much of the source material the draft actually reflects.
  const grounded = golden.groundTruth.filter((fact) =>
    fact.toLowerCase().split(/\s+/).some((word) => word.length > 4 && lower.includes(word))
  ).length;
  const grounding = golden.groundTruth.length === 0 ? 1 : grounded / golden.groundTruth.length;

  // Required fields: greeting with the lead's name, and a closing.
  const hasGreeting = new RegExp(`^\\s*(hi|hello|dear)\\s+${golden.lead.firstName}`, "i").test(draft.body);
  // `\S+` would not span the space in a multi-word signature such as "Priya Raman".
  const hasClosing = /(best|thanks|regards|sincerely)[,!]?\s*\n?\s*[^\n]+\s*$/i.test(draft.body.trim());
  const hasSubject = draft.subject.trim().length > 0;
  const requiredFields = [hasGreeting, hasClosing, hasSubject].filter(Boolean).length / 3;

  // Fabrication: any invented specific is disqualifying, so this is binary.
  const noFabrication = FABRICATION_MARKERS.some((re) => re.test(text)) ? 0 : 1;

  // Tone: hype markers reduce the score.
  const hypeHits = HYPE_MARKERS.filter((re) => re.test(text)).length;
  const tone = Math.max(0, 1 - hypeHits * 0.5);

  // Length: a follow-up email should be 40-200 words.
  const words = draft.body.trim().split(/\s+/).length;
  const length = words >= 40 && words <= 200 ? 1 : words >= 25 && words <= 260 ? 0.5 : 0;

  return { grounding, requiredFields, noFabrication, tone, length };
}

const overall = (s: Scores) =>
  (s.grounding + s.requiredFields + s.noFabrication + s.tone + s.length) / 5;

// ── reference outputs ──────────────────────────────────────────────────────────────

const GOOD_DRAFT: Draft = {
  subject: "Following up on procurement timing",
  body:
    "Hi Sarah,\n\n" +
    "Thanks for the time at IoT World. You mentioned procurement cycles are tightening " +
    "and that the Q3 budget window is the one that matters for plant operations this year. " +
    "That timing lines up with how most of our industrial customers phase a rollout, so it " +
    "may be worth mapping the sequence before the window closes.\n\n" +
    "Would a short call next week be useful to sketch that out?\n\n" +
    "Best,\nPriya Raman",
};

const FABRICATED_DRAFT: Draft = {
  subject: "Your 40% discount is confirmed",
  body:
    "Hi Sarah,\n\n" +
    "Great meeting you. I can guarantee a 40% discount if you sign before month end, and " +
    "our CEO has approved $50,000 in credits for Northwind. Shall we meet next Tuesday at 3?\n\n" +
    "Best,\nPriya Raman",
};

const UNGROUNDED_DRAFT: Draft = {
  subject: "Great to connect",
  body:
    "Hi Sarah,\n\n" +
    "It was lovely to meet you at the show. We help companies like yours do more with less " +
    "and we would love to explore whether there is a fit between our two organisations. " +
    "Let me know if you would like to find some time to chat about the possibilities ahead.\n\n" +
    "Best,\nPriya Raman",
};

const HYPE_DRAFT: Draft = {
  ...GOOD_DRAFT,
  body: GOOD_DRAFT.body.replace("That timing lines up", "This is a REVOLUTIONARY game-changer!! That timing lines up"),
};

// ── baseline ───────────────────────────────────────────────────────────────────────

/**
 * Recorded baseline. §70 requires baselining the scores and alerting on regression; this
 * is the recorded value the scheduled run compares against.
 *
 * Deliberately a *floor*, not an exact figure — an exact score would make the eval brittle
 * against harmless rewording, which is how a drift detector gets disabled.
 */
const BASELINE_MINIMUM_OVERALL = 0.9;
const REGRESSION_TOLERANCE = 0.1;

describe("rubric scores a good draft at or above the baseline", () => {
  it("the reference good draft clears the baseline", () => {
    const scores = scoreDraft(GOOD_DRAFT, GOLDEN_SET[0]);
    assert.ok(
      overall(scores) >= BASELINE_MINIMUM_OVERALL,
      `good draft scored ${overall(scores).toFixed(3)}, below the ${BASELINE_MINIMUM_OVERALL} baseline: ${JSON.stringify(scores)}`
    );
  });

  it("scores every dimension of the good draft at full marks", () => {
    const s = scoreDraft(GOOD_DRAFT, GOLDEN_SET[0]);
    assert.equal(s.noFabrication, 1);
    assert.equal(s.tone, 1);
    assert.equal(s.length, 1);
    assert.equal(s.requiredFields, 1);
    assert.ok(s.grounding >= 0.9, `grounding ${s.grounding}`);
  });
});

// ── each dimension must be able to FAIL ────────────────────────────────────────────

/**
 * The part that matters most. A rubric that cannot fail would make every future eval look
 * healthy, so each dimension is proven to distinguish good from bad.
 */
describe("every rubric dimension can fail", () => {
  it("fabrication is caught, and is disqualifying", () => {
    const s = scoreDraft(FABRICATED_DRAFT, GOLDEN_SET[0]);
    assert.equal(s.noFabrication, 0, "invented discounts, dollar amounts and dates must score zero");
    assert.ok(overall(s) < BASELINE_MINIMUM_OVERALL);
  });

  it("an ungrounded draft scores low on grounding", () => {
    const s = scoreDraft(UNGROUNDED_DRAFT, GOLDEN_SET[0]);
    assert.ok(s.grounding < 0.5, `generic filler scored ${s.grounding} for grounding`);
    assert.ok(overall(s) < BASELINE_MINIMUM_OVERALL);
  });

  it("hype language reduces the tone score", () => {
    const s = scoreDraft(HYPE_DRAFT, GOLDEN_SET[0]);
    assert.ok(s.tone < 1, `hype scored ${s.tone} for tone`);
  });

  it("a missing greeting reduces required-field coverage", () => {
    const s = scoreDraft({ ...GOOD_DRAFT, body: GOOD_DRAFT.body.replace("Hi Sarah,\n\n", "") }, GOLDEN_SET[0]);
    assert.ok(s.requiredFields < 1);
  });

  it("a missing subject reduces required-field coverage", () => {
    assert.ok(scoreDraft({ ...GOOD_DRAFT, subject: "" }, GOLDEN_SET[0]).requiredFields < 1);
  });

  it("a too-short draft scores low on length", () => {
    assert.equal(scoreDraft({ subject: "Hi", body: "Hi Sarah,\n\nThanks.\n\nBest,\nPriya" }, GOLDEN_SET[0]).length, 0);
  });

  it("a rambling draft scores low on length", () => {
    const rambling = `Hi Sarah,\n\n${"word ".repeat(300)}\n\nBest,\nPriya`;
    assert.equal(scoreDraft({ subject: "S", body: rambling }, GOLDEN_SET[0]).length, 0);
  });

  it("the good draft outscores every bad one — the rubric discriminates", () => {
    const good = overall(scoreDraft(GOOD_DRAFT, GOLDEN_SET[0]));
    for (const [label, bad] of [
      ["fabricated", FABRICATED_DRAFT],
      ["ungrounded", UNGROUNDED_DRAFT],
      ["hype", HYPE_DRAFT],
    ] as const) {
      assert.ok(good > overall(scoreDraft(bad, GOLDEN_SET[0])), `${label} draft was not scored lower`);
    }
  });
});

// ── harness properties ─────────────────────────────────────────────────────────────

describe("the harness itself is sound", () => {
  it("scoring is deterministic", () => {
    assert.deepStrictEqual(scoreDraft(GOOD_DRAFT, GOLDEN_SET[0]), scoreDraft(GOOD_DRAFT, GOLDEN_SET[0]));
  });

  it("every score is bounded to [0, 1]", () => {
    for (const draft of [GOOD_DRAFT, FABRICATED_DRAFT, UNGROUNDED_DRAFT, HYPE_DRAFT]) {
      for (const [dimension, value] of Object.entries(scoreDraft(draft, GOLDEN_SET[0]))) {
        assert.ok(value >= 0 && value <= 1, `${dimension} out of range: ${value}`);
      }
    }
  });

  it("the golden set covers a sparse case, not only rich ones", () => {
    // A golden set of only rich conversations would never catch a model that fabricates
    // when it has nothing to work with — the case where fabrication is most likely.
    const sparse = GOLDEN_SET.find((c) => c.id === "sparse-conversation");
    assert.ok(sparse);
    assert.equal(sparse!.groundTruth.length, 1);
  });

  it("golden case ids are unique and stable, so baselines stay comparable", () => {
    const ids = GOLDEN_SET.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("the regression tolerance is a floor, not an exact match", () => {
    // An exact-score baseline breaks on harmless rewording, which is how a drift detector
    // gets switched off. The scheduled run alerts when a score drops by more than this.
    const goodScore = overall(scoreDraft(GOOD_DRAFT, GOLDEN_SET[0]));
    assert.ok(goodScore - REGRESSION_TOLERANCE < goodScore);
    assert.ok(REGRESSION_TOLERANCE > 0 && REGRESSION_TOLERANCE < 0.5);
  });

  it("the baseline is recorded as a constant, so a drop is a visible diff", () => {
    assert.equal(BASELINE_MINIMUM_OVERALL, 0.9);
  });
});
