// @lr area=ai-drift severity=P1 layer=unit category=local-only
/**
 * AI model pinning and failure handling — plan §70, Prompt 11 items 4 and 6.
 *
 * §70 exists because this is *"the one failure class a commit-triggered suite structurally
 * cannot catch"*: the model's behaviour changes without a deploy of our code.
 *
 * Two things are testable on every commit despite that:
 *
 *   1. **Which model we asked for.** Item 6 requires a model-identifier change to be a
 *      release-gated event. The gate is this file: the pinned values are asserted, so
 *      changing one requires deliberately editing a test, which a reviewer sees.
 *   2. **How we behave when the model misbehaves.** `generateLeadDraftWithLLM` takes an
 *      injectable invoker, so timeout, rate limit, 5xx, malformed JSON and refusal are all
 *      producible on demand — no Prompt 3 seam required.
 */
import assert from "node:assert/strict";
import { before, describe, it, mock } from "node:test";

import {
  DEFAULT_OPENAI_MODEL,
  generateLeadDraftWithLLM,
} from "../../lib/campaigns/llm-draft-generator";
import type { PromptRecipientContext, SelectedSignalForGeneration } from "../../lib/campaigns/signal-prompt-composer";

let getLeadInsightsOpenAIModel: (env?: NodeJS.ProcessEnv) => string;
let BRIEFING_POLISH_OPENAI_MODEL: string;

before(async () => {
  mock.module("server-only", { namedExports: {} });
  ({ getLeadInsightsOpenAIModel } = await import("../../lib/server/lead-insights/modelConfig"));
  ({ BRIEFING_POLISH_OPENAI_MODEL } = await import("../../lib/server/import-wizard/briefing-ai-polish"));
});

const recipient = (): PromptRecipientContext => ({
  firstName: "Sarah",
  fullName: "Sarah Meister",
  leadName: "Sarah Meister",
  eventName: "IoT World 2026",
  companyText: "Northwind Industrial",
  title: "Director of Plant Operations",
  companySize: "1000-5000",
  industry: "Manufacturing",
  companyDomain: "northwind.example",
  leadCount: 1,
  isMultiLeadDraft: false,
});

const signals: SelectedSignalForGeneration[] = [
  {
    id: "sig-1",
    name: "Pricing pressure",
    category: "contextual_fact",
    defaultPromptText: "Mention that procurement cycles are tightening.",
    tone: ["direct"],
    visibility: "company",
    roleScope: null,
    templateScope: null,
  },
];

const goodResponse = JSON.stringify({
  subject: "Following up from IoT World",
  body: "Hi Sarah,\n\nGood speaking with you about procurement timing.\n\nBest,\nPriya",
});

const generate = (invokeModel: (p: { model: string }) => Promise<string>, over: Record<string, unknown> = {}) =>
  generateLeadDraftWithLLM(
    {
      subjectTemplate: "Following up from {{event}}",
      templateName: "Post-event follow-up",
      recipientContext: recipient(),
      selectedSignals: signals,
      senderName: "Priya Raman",
      ...over,
    },
    { invokeModel: invokeModel as never }
  );

// ── the release gate (item 6) ──────────────────────────────────────────────────────

describe("model identifiers are pinned — changing one is a reviewed edit", () => {
  /**
   * These assertions ARE the release gate §70 asks for. There is no separate CI mechanism
   * to build: a model change that does not also change this file fails the suite, and a
   * model change that does change it shows up in review as an intentional diff.
   */
  it("the campaign draft model is pinned", () => {
    assert.equal(DEFAULT_OPENAI_MODEL, "gpt-4o-mini");
  });

  it("the briefing polish model is pinned", () => {
    assert.equal(BRIEFING_POLISH_OPENAI_MODEL, "gpt-4o-mini");
  });

  it("the lead insights model is pinned, and differs deliberately", () => {
    // Insights runs a larger model than drafting. Asserting the difference stops an
    // accidental "unify the models" change from silently downgrading insight quality.
    assert.equal(getLeadInsightsOpenAIModel({} as NodeJS.ProcessEnv), "gpt-4.1");
    assert.notEqual(getLeadInsightsOpenAIModel({} as NodeJS.ProcessEnv), DEFAULT_OPENAI_MODEL);
  });

  it("the model actually sent to the provider is the pinned one", () => {
    // Pinning a constant nobody passes through would be decorative.
    let observed = "";
    return generate(async ({ model }) => {
      observed = model;
      return goodResponse;
    }).then(() => {
      assert.equal(observed, DEFAULT_OPENAI_MODEL);
    });
  });

  it("an explicit override reaches the provider, so per-call selection still works", async () => {
    let observed = "";
    await generateLeadDraftWithLLM(
      {
        subjectTemplate: "Hi {{first_name}}",
        templateName: "t",
        recipientContext: recipient(),
        selectedSignals: signals,
        senderName: "Priya Raman",
      },
      {
        invokeModel: async ({ model }) => {
          observed = model;
          return goodResponse;
        },
        model: "gpt-4.1",
      }
    );
    assert.equal(observed, "gpt-4.1");
  });

  it("DOCUMENTED: the model is env-overridable at runtime with no gate (LR-PROD-004)", async () => {
    // §70 wants a model change to be release-gated. `OPENAI_MODEL` changes it with no
    // deploy and no assertion. Recorded in Prompt 1; the pinning tests above are the
    // partial mitigation — they gate the DEFAULT, not the env override.
    const { readFileSync } = await import("node:fs");
    assert.match(
      readFileSync("lib/campaigns/llm-draft-generator.ts", "utf8"),
      /process\.env\.OPENAI_MODEL\?\.trim\(\) \|\| "gpt-4o-mini"/
    );
  });

  it("the reported model matches what was requested, so telemetry cannot drift", async () => {
    const result = await generate(async () => goodResponse);
    assert.equal(result.model, DEFAULT_OPENAI_MODEL);
  });
});

// ── failure handling (item 4) ──────────────────────────────────────────────────────

describe("provider failures surface rather than producing a plausible draft", () => {
  const failures = [
    { label: "timeout", error: Object.assign(new Error("Request timed out"), { code: "ETIMEDOUT" }) },
    { label: "rate limit", error: Object.assign(new Error("429 Too Many Requests"), { status: 429 }) },
    { label: "5xx", error: Object.assign(new Error("503 Service Unavailable"), { status: 503 }) },
    { label: "network reset", error: Object.assign(new Error("ECONNRESET"), { code: "ECONNRESET" }) },
  ];

  for (const { label, error } of failures) {
    it(`propagates a ${label} instead of returning placeholder content`, async () => {
      await assert.rejects(
        () => generate(async () => { throw error; }),
        (thrown: Error) => {
          assert.ok(thrown instanceof Error);
          return true;
        },
        `a ${label} must not be swallowed into a fabricated draft`
      );
    });
  }

  it("rejects a non-JSON response rather than emailing raw model prose", async () => {
    await assert.rejects(() => generate(async () => "Sure! Here is your email: Hi Sarah..."), SyntaxError);
  });

  it("rejects JSON that is not an object", async () => {
    await assert.rejects(() => generate(async () => '"just a string"'), /non-object JSON/);
    await assert.rejects(() => generate(async () => "[1,2,3]"), /empty subject|non-object/);
  });

  it("rejects a response missing the subject", async () => {
    await assert.rejects(() => generate(async () => JSON.stringify({ body: "Hi" })), /empty subject/);
  });

  it("rejects a response missing the body", async () => {
    await assert.rejects(() => generate(async () => JSON.stringify({ subject: "S" })), /empty body/);
  });

  it("rejects whitespace-only content, which would send a blank email", async () => {
    await assert.rejects(
      () => generate(async () => JSON.stringify({ subject: "   ", body: "   " })),
      /empty subject/
    );
  });

  it("a refusal is a failure, not a draft", async () => {
    // A model that refuses returns prose, not JSON. It must not become an email.
    await assert.rejects(
      () => generate(async () => "I'm sorry, I can't help with that request."),
      SyntaxError
    );
  });

  it("tolerates a fenced JSON code block, which models emit routinely", async () => {
    const result = await generate(async () => "```json\n" + goodResponse + "\n```");
    assert.match(result.subject, /IoT World/);
  });
});

// ── unresolved placeholders never reach a recipient ────────────────────────────────

describe("placeholder leakage is blocked at the output boundary (§42)", () => {
  it("rejects a draft containing a double-brace token", async () => {
    await assert.rejects(
      () => generate(async () => JSON.stringify({ subject: "Hi {{first_name}}", body: "Hello there.\n\nBest,\nPriya" })),
      /unresolved placeholders/
    );
  });

  it("rejects a single-brace token in the body", async () => {
    await assert.rejects(
      () => generate(async () => JSON.stringify({ subject: "Hi Sarah", body: "Hello {first_name}.\n\nBest,\nPriya" })),
      /unresolved placeholders/
    );
  });

  it("a clean draft passes through", async () => {
    const result = await generate(async () => goodResponse);
    assert.ok(!result.subject.includes("{"));
    assert.ok(!result.body.includes("{"));
  });
});

// ── retry does not double-generate (item 4) ────────────────────────────────────────

describe("retry accounting", () => {
  it("one generate call invokes the model exactly once", async () => {
    let calls = 0;
    await generate(async () => { calls++; return goodResponse; });
    assert.equal(calls, 1, "an internal retry loop would double the cost of every draft");
  });

  it("a failure does not silently retry", async () => {
    let calls = 0;
    await assert.rejects(() => generate(async () => { calls++; throw new Error("429"); }));
    assert.equal(calls, 1, "retry must be an explicit caller decision, not hidden here");
  });

  it("two separate generations are independent", async () => {
    let calls = 0;
    const invoke = async () => { calls++; return goodResponse; };
    await generate(invoke);
    await generate(invoke);
    assert.equal(calls, 2);
  });
});

// ── identity survives the model round trip ─────────────────────────────────────────

describe("the initiating user's signature survives generation (§17)", () => {
  it("appends the resolved sender when the model omits it", async () => {
    const result = await generate(async () =>
      JSON.stringify({ subject: "Following up", body: "Hi Sarah,\n\nGood to meet you." })
    );
    assert.match(result.body, /Priya Raman\s*$/, "the initiator's name must close the email");
  });

  /**
   * LR-PROD-014 (P1) — the signature is DUPLICATED whenever the model produces its own
   * sign-off, which the prompt explicitly instructs it to do.
   *
   * Order of operations:
   *   1. `sanitizeFinalEmailBody` collapses "Best,\nPriya Raman" onto one line
   *      → "Best, Priya Raman"
   *   2. `ensureSenderSignature` strips an existing signature with a regex requiring the
   *      closing word and the name on SEPARATE lines
   *      (`/\n\n(best|thanks|regards|...)[,!]?\s*\n[^\n]+\s*$/i`)
   *   3. Step 1 already joined them, so step 2 matches nothing and appends a second one.
   *
   * Result, sent to a real recipient:
   *   "…Text.\n\nBest, Priya Raman\n\nBest,\nPriya Raman"
   *
   * Reproduces for Best, / Thanks, / Regards,. Only a model response with NO sign-off
   * produces a correct single signature — and the prompt asks for a sign-off, so the
   * broken path is the common one.
   */
  // KNOWN-DEFECT: LR-PROD-014 — not fixed here, per Brief §6.
  it.skip("KNOWN-DEFECT: LR-PROD-014 — does not duplicate a signature the model already produced", async () => {
    for (const closing of ["Best", "Thanks", "Regards"]) {
      const result = await generate(async () =>
        JSON.stringify({ subject: "Following up", body: `Hi Sarah,\n\nGood to meet you.\n\n${closing},\nPriya Raman` })
      );
      assert.equal(
        (result.body.match(/Priya Raman/g) || []).length,
        1,
        `"${closing}," produced a duplicated signature`
      );
    }
  });

  it("DOCUMENTED: a model-produced sign-off yields two signatures (LR-PROD-014)", async () => {
    const result = await generate(async () =>
      JSON.stringify({ subject: "Following up", body: "Hi Sarah,\n\nGood to meet you.\n\nBest,\nPriya Raman" })
    );
    assert.equal((result.body.match(/Priya Raman/g) || []).length, 2, "currently duplicated");
    assert.match(result.body, /Best, Priya Raman\n\nBest,\nPriya Raman$/);
  });

  it("DOCUMENTED: the prompt instructs the model to produce a sign-off (LR-PROD-014 is the common path)", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("lib/campaigns/llm-draft-generator.ts", "utf8");
    assert.match(source, /closing word \(Best,\/Thanks,\)/);
  });

  it("uses the neutral fallback rather than a seeded person when identity is absent", async () => {
    const result = await generate(async () =>
      JSON.stringify({ subject: "Following up", body: "Hi Sarah,\n\nGood to meet you." }),
      { senderName: null }
    );
    assert.match(result.body, /The team\s*$/);
    assert.doesNotMatch(result.body, /ali/i);
  });

  it("adds a greeting when the model omits one", async () => {
    const result = await generate(async () =>
      JSON.stringify({ subject: "Following up", body: "Good to meet you at the show." })
    );
    assert.match(result.body, /^Hi Sarah,/);
  });
});
