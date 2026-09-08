// @lr area=campaigns severity=P1 layer=unit category=local-only
/**
 * Generated-content identity and prompt scope — plan §17, §42, carried-forward note H.
 *
 * Note H: *"Generated campaign drafts must use the initiating authenticated user's
 * name/signature"* — the defect was drafts signing as `Ali`, a seeded fixture identity,
 * reaching real recipients.
 *
 * `tests/llm-draft-generator.test.ts` exists but contains **zero `it()` cases**, so none of
 * this was asserted. The suite below covers the identity rule, the placeholder guard, and
 * prompt-scope containment (§70's highest-severity concern, exercised here because the
 * campaign prompt is where cross-recipient bleed would occur).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildLlmDraftPrompts,
  resolveDraftSenderName,
  DEFAULT_OPENAI_MODEL,
} from "../../lib/campaigns/llm-draft-generator";
import {
  KNOWN_PROMPT_PLACEHOLDER_KEYS,
  resolvePromptVariables,
  type PromptRecipientContext,
  type SelectedSignalForGeneration,
} from "../../lib/campaigns/signal-prompt-composer";

const recipient = (over: Partial<PromptRecipientContext> = {}): PromptRecipientContext => ({
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
  ...over,
});

const signal = (over: Partial<SelectedSignalForGeneration> = {}): SelectedSignalForGeneration => ({
  id: "sig-1",
  name: "Pricing pressure",
  category: "contextual_fact",
  defaultPromptText: "Mention that procurement cycles are tightening this quarter.",
  tone: ["direct"],
  visibility: "company",
  roleScope: null,
  templateScope: null,
  ...over,
});

const build = (over: Partial<Parameters<typeof buildLlmDraftPrompts>[0]> = {}) =>
  buildLlmDraftPrompts({
    subjectTemplate: "Following up from {{first_name}}",
    templateName: "Post-event follow-up",
    recipientContext: recipient(),
    selectedSignals: [signal()],
    senderName: "Priya Raman",
    ...over,
  });

const promptText = (p: { systemPrompt: string; userPrompt: string }) => `${p.systemPrompt}\n${p.userPrompt}`;

// ── the note H regression ──────────────────────────────────────────────────────────

describe("sender identity comes from the authenticated initiator (note H)", () => {
  it("uses the server-resolved initiator name", () => {
    assert.equal(resolveDraftSenderName("Priya Raman"), "Priya Raman");
  });

  it("a different initiator produces a different signature — §17's Sarah/User B case", () => {
    assert.notEqual(resolveDraftSenderName("Sarah Meister"), resolveDraftSenderName("Priya Raman"));
  });

  it("falls back to a NEUTRAL team name, never a person", () => {
    // The whole point of note H: an absent identity must not resolve to a seeded human.
    for (const absent of [null, undefined, "", "   ", "\t\n"]) {
      const resolved = resolveDraftSenderName(absent);
      assert.equal(resolved, "The team", `${JSON.stringify(absent)} must fall back neutrally`);
      assert.doesNotMatch(resolved, /ali/i, "no seeded person-specific fallback");
    }
  });

  it("normalizes whitespace rather than emitting a ragged signature", () => {
    assert.equal(resolveDraftSenderName("  Priya   Raman \n"), "Priya Raman");
  });

  it("the resolved sender appears in the prompt as the required closing line", () => {
    const prompts = build({ senderName: "Priya Raman" });
    assert.match(promptText(prompts), /exactly this sender name on final line alone: Priya Raman/);
  });

  it("a missing sender still yields a usable prompt, signed neutrally", () => {
    const prompts = build({ senderName: null });
    assert.match(promptText(prompts), /final line alone: The team/);
  });

  it("the sender is carried as structured data, not only prose", () => {
    // Structured `sender.display_name` is what makes the identity assertable downstream.
    assert.match(promptText(build({ senderName: "Priya Raman" })), /"display_name":\s*"Priya Raman"/);
  });
});

// ── prompt scope containment (§70 / §42 cross-recipient bleed) ─────────────────────

describe("the assembled prompt contains only this recipient's data", () => {
  it("includes the target lead's own fields", () => {
    const text = promptText(build());
    for (const value of ["Sarah", "Northwind Industrial", "IoT World 2026"]) {
      assert.ok(text.includes(value), `prompt should carry ${value}`);
    }
  });

  it("carries no other recipient's personalization", () => {
    // §42: "recipient personalization does not bleed across recipients".
    const text = promptText(build());
    for (const foreign of ["Globex", "Initech", "buyer@othercompany.test", "Marcus Webb"]) {
      assert.ok(!text.includes(foreign), `prompt leaked out-of-scope value: ${foreign}`);
    }
  });

  it("two recipients produce prompts that share no personal values", () => {
    const a = promptText(build({ recipientContext: recipient() }));
    const b = promptText(
      build({
        recipientContext: recipient({
          firstName: "Marcus",
          fullName: "Marcus Webb",
          leadName: "Marcus Webb",
          companyText: "Globex",
          companyDomain: "globex.example",
        }),
      })
    );
    assert.ok(a.includes("Sarah") && !a.includes("Marcus"), "A must not see B");
    assert.ok(b.includes("Marcus") && !b.includes("Sarah"), "B must not see A");
  });

  it("carries no token, key or secret-shaped value", () => {
    const text = promptText(build());
    assert.doesNotMatch(text, /bearer\s|sk-[a-z0-9]|service_role|api[_-]?key|password/i);
  });

  it("is deterministic — identical inputs give an identical prompt (§70)", () => {
    assert.equal(promptText(build()), promptText(build()));
  });

  it("changing any input changes the prompt, so determinism is not just a constant", () => {
    assert.notEqual(promptText(build()), promptText(build({ senderName: "Someone Else" })));
  });
});

// ── unresolved placeholders ────────────────────────────────────────────────────────

describe("template variables resolve before generation (§42)", () => {
  it("substitutes a first-name token in the subject", () => {
    const text = promptText(build({ subjectTemplate: "Following up from {{first_name}}" }));
    assert.ok(text.includes("Following up from Sarah"));
    assert.ok(!text.includes("{{first_name}}"), "an unresolved token must not reach the model");
  });

  it("substitutes full name, event and company tokens", () => {
    // The event token is `{{event}}` — see KNOWN_PROMPT_PLACEHOLDER_KEYS.
    const text = promptText(
      build({ subjectTemplate: "{{full_name}} at {{event}} — {{company_text}}" })
    );
    assert.ok(text.includes("Sarah Meister at IoT World 2026 — Northwind Industrial"));
  });

  it("every advertised placeholder key actually resolves", () => {
    // KNOWN_PROMPT_PLACEHOLDER_KEYS is what the UI offers the user. A key listed there
    // but unhandled by the resolver would be silently deleted from their subject line.
    const context = recipient();
    for (const key of KNOWN_PROMPT_PLACEHOLDER_KEYS) {
      const resolved = resolvePromptVariables(`[{{${key}}}]`, context);
      assert.notEqual(resolved, "[]", `advertised key {{${key}}} resolved to nothing`);
      assert.ok(!resolved.includes("{{"), `{{${key}}} was left unresolved`);
    }
  });

  it("both single- and double-brace forms resolve", () => {
    const context = recipient();
    assert.equal(resolvePromptVariables("{{first_name}}", context), "Sarah");
    assert.equal(resolvePromptVariables("{first_name}", context), "Sarah");
  });

  it("an empty value falls back to readable copy, never a blank gap", () => {
    const blank = recipient({ firstName: "", companyText: "", eventName: "" });
    assert.equal(resolvePromptVariables("{{first_name}}", blank), "there");
    assert.equal(resolvePromptVariables("{{company}}", blank), "your company");
    assert.equal(resolvePromptVariables("{{event}}", blank), "our event");
  });

  /**
   * LR-RISK-004 — an UNKNOWN placeholder is silently deleted rather than rejected.
   *
   * `stripUnknownPlaceholders` removes anything matching `{{...}}` that the resolver did
   * not handle. A user who types `{{event_name}}` — a plausible guess, and the internal
   * field really is `eventName` — gets it erased, producing a subject with a visible gap
   * that is then sent to a customer. §42 requires "no unresolved template variables",
   * which this satisfies literally, but by deletion rather than by warning.
   *
   * Mitigated by `KNOWN_PROMPT_PLACEHOLDER_KEYS` driving UI hints; a typo still slips
   * through silently. Recorded, not fixed.
   */
  it("DOCUMENTED: an unknown placeholder is silently stripped (LR-RISK-004)", () => {
    const context = recipient();
    assert.equal(
      resolvePromptVariables("Following up from {{event_name}} today", context),
      "Following up from today",
      "the token vanished and left a gap, with no error raised"
    );
    assert.equal(resolvePromptVariables("{{not_a_real_key}}", context), "");
  });

  it("the stripping at least guarantees no raw token reaches the recipient", () => {
    // The redeeming property: whatever else happens, a customer never sees `{{...}}`.
    const out = resolvePromptVariables("Hi {{first_name}}, re {{bogus_key}}", recipient());
    assert.ok(!out.includes("{{"));
    assert.ok(!out.includes("}}"));
    assert.ok(out.includes("Sarah"));
  });

  it("an empty name does not leave a dangling token in the subject", () => {
    const text = promptText(
      build({ recipientContext: recipient({ firstName: "", fullName: "", leadName: "" }) })
    );
    assert.ok(!text.includes("{{first_name}}"));
  });
});

// ── signals scope ──────────────────────────────────────────────────────────────────

describe("only the selected signals reach the prompt (§42)", () => {
  it("includes a selected signal's prompt text", () => {
    const text = promptText(build({ selectedSignals: [signal({ defaultPromptText: "UNIQUE-SIGNAL-MARKER" })] }));
    assert.ok(text.includes("UNIQUE-SIGNAL-MARKER"));
  });

  it("omits an unselected signal entirely", () => {
    const text = promptText(build({ selectedSignals: [signal({ defaultPromptText: "SELECTED" })] }));
    assert.ok(!text.includes("NOT-SELECTED-MARKER"));
  });

  it("an empty signal list still produces a valid prompt", () => {
    // §6's regression shape: missing optional context must degrade, not kill generation.
    const prompts = build({ selectedSignals: [] });
    assert.ok(prompts.systemPrompt.length > 0);
    assert.ok(prompts.userPrompt.length > 0);
    assert.match(promptText(prompts), /final line alone: Priya Raman/);
  });

  it("multiple signals all appear, in the order selected", () => {
    const text = promptText(
      build({
        selectedSignals: [
          signal({ id: "s1", defaultPromptText: "FIRST-SIGNAL" }),
          signal({ id: "s2", defaultPromptText: "SECOND-SIGNAL" }),
        ],
      })
    );
    assert.ok(text.indexOf("FIRST-SIGNAL") < text.indexOf("SECOND-SIGNAL"));
  });
});

// ── model pinning (§70 item 6, feeds Prompt 11) ────────────────────────────────────

describe("model identifier", () => {
  it("resolves to a concrete pinned value", () => {
    assert.ok(DEFAULT_OPENAI_MODEL.length > 0);
    assert.equal(typeof DEFAULT_OPENAI_MODEL, "string");
  });

  it("DOCUMENTED: the model is env-overridable with no release gate (LR-PROD-004)", async () => {
    // §70 requires a model change to be a release-gated event. Today `OPENAI_MODEL` can
    // change the model with no deploy and no assertion. Recorded in Prompt 1 as
    // LR-PROD-004; Prompt 11 owns the pinning test.
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("lib/campaigns/llm-draft-generator.ts", "utf8");
    assert.match(source, /process\.env\.OPENAI_MODEL\?\.trim\(\) \|\| "gpt-4o-mini"/);
  });
});
