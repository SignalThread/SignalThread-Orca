// @lr area=autosave severity=P1 layer=api category=local-only
/**
 * AI Briefing Strategy partial-update safety.
 *
 * Plan §8 and carried-forward note B. This is the regression that motivated the whole
 * autosave section: **editing Product Focus wiped Event Goal, Target Audience and
 * Tone/Voice.** Prompt 1 found the area had 3 files and 8 cases total, and **no
 * dedicated test for the defect itself**.
 *
 * The invariant, stated once:
 *
 *   > Start with all fields populated, edit exactly one, save and reload, and every
 *   > untouched field must remain byte-for-byte unchanged.
 *
 * There are three layers that can each break it independently, so each is asserted:
 *
 *   1. `parseEventBriefingStrategyPatch` — must preserve the difference between "field
 *      omitted" and "field set to empty string". Collapse those and a partial save
 *      becomes a full overwrite.
 *   2. `mergeEventBriefingStrategyPatch` — the pure merge used client-side.
 *   3. `patch_event_briefing_strategy` (migration 0097) — the server-side authority, an
 *      atomic JSONB merge. Its semantics are mirrored here so a divergence between the
 *      TypeScript merge and the SQL merge is visible; the SQL itself belongs to the
 *      excluded `separate-security-db` program.
 */
import assert from "node:assert/strict";
import { before, describe, it, mock } from "node:test";

import {
  mergeEventBriefingStrategyPatch,
  mergeGuardrailsPatch,
  type EventBriefingStrategyFields,
} from "../../lib/import-wizard/event-briefing-strategy-merge";

/**
 * The strategy service imports `server-only`, which throws by design outside a server
 * component graph. Stub it and load the module dynamically so the real parser runs —
 * nothing about its logic is mocked.
 */
let parseEventBriefingStrategyPatch: (raw: unknown) => Record<string, unknown>;

before(async () => {
  mock.module("server-only", { namedExports: {} });
  const mod = await import("../../lib/server/import-wizard/event-briefing-strategy-service");
  parseEventBriefingStrategyPatch = mod.parseEventBriefingStrategyPatch as typeof parseEventBriefingStrategyPatch;
});

/** All four fields populated — the starting state plan §8 mandates. */
const POPULATED: EventBriefingStrategyFields = {
  productFocus: "Industrial IoT sensors",
  targetBuyerPersona: "Plant operations directors",
  eventGoal: "Book 40 qualified demos",
  toneOfVoice: "Direct, technical, no hype",
  guardrails: { excludeUnverifiedSources: true, neutralToneBias: false, technicalDeepDive: true, realtimeDriftDetection: false },
} as EventBriefingStrategyFields;

const TEXT_FIELDS = ["productFocus", "targetBuyerPersona", "eventGoal", "toneOfVoice"] as const;

// ── the regression itself ──────────────────────────────────────────────────────────

describe("note B regression — editing one field never wipes the others", () => {
  for (const edited of TEXT_FIELDS) {
    it(`editing ${edited} leaves the other three byte-identical`, () => {
      const result = mergeEventBriefingStrategyPatch(POPULATED, { [edited]: "NEW VALUE" });

      assert.equal(result[edited], "NEW VALUE", `${edited} must actually change`);
      for (const other of TEXT_FIELDS) {
        if (other === edited) continue;
        assert.equal(
          result[other],
          POPULATED[other],
          `editing ${edited} must not touch ${other} — this is the shipped defect`
        );
      }
      assert.deepStrictEqual(result.guardrails, POPULATED.guardrails, "guardrails must survive a text edit");
    });
  }

  it("editing Product Focus specifically preserves Event Goal, Target Audience and Tone/Voice", () => {
    // Named explicitly because this is the exact case in the plan's note B.
    const result = mergeEventBriefingStrategyPatch(POPULATED, { productFocus: "Edge gateways" });
    assert.equal(result.productFocus, "Edge gateways");
    assert.equal(result.eventGoal, "Book 40 qualified demos");
    assert.equal(result.targetBuyerPersona, "Plant operations directors");
    assert.equal(result.toneOfVoice, "Direct, technical, no hype");
  });
});

// ── omitted vs cleared ─────────────────────────────────────────────────────────────

describe("omitted is not the same as cleared (plan §8)", () => {
  it("an omitted field keeps its existing value", () => {
    const result = mergeEventBriefingStrategyPatch(POPULATED, {});
    assert.deepStrictEqual(result, POPULATED, "an empty patch is a no-op, not a wipe");
  });

  it("an explicit empty string clears only that field", () => {
    const result = mergeEventBriefingStrategyPatch(POPULATED, { eventGoal: "" });
    assert.equal(result.eventGoal, "", "an intentional clear must take effect");
    assert.equal(result.productFocus, POPULATED.productFocus);
    assert.equal(result.targetBuyerPersona, POPULATED.targetBuyerPersona);
    assert.equal(result.toneOfVoice, POPULATED.toneOfVoice);
  });

  it("undefined in a patch means leave alone, not clear", () => {
    const result = mergeEventBriefingStrategyPatch(POPULATED, { eventGoal: undefined });
    assert.equal(
      result.eventGoal,
      POPULATED.eventGoal,
      "undefined !== empty string — collapsing them turns every partial save into an overwrite"
    );
  });

  it("the parser preserves that distinction end to end", () => {
    // A field absent from the JSON body must not appear in the patch at all.
    const omitted = parseEventBriefingStrategyPatch({ productFocus: "x" });
    assert.deepStrictEqual(omitted, { productFocus: "x" });
    assert.equal("eventGoal" in omitted, false, "an absent field must not enter the patch");

    // A field present as "" must appear, so the clear reaches the database.
    const cleared = parseEventBriefingStrategyPatch({ productFocus: "x", eventGoal: "" });
    assert.deepStrictEqual(cleared, { productFocus: "x", eventGoal: "" });
    assert.equal("eventGoal" in cleared, true, "an explicit clear must survive parsing");
  });
});

// ── patch validation ───────────────────────────────────────────────────────────────

describe("patch validation rejects shapes that could cause a wipe", () => {
  it("rejects a non-object patch", () => {
    for (const bad of [null, undefined, "string", 42, []]) {
      assert.throws(() => parseEventBriefingStrategyPatch(bad), /invalid_strategy_patch/);
    }
  });

  it("rejects a non-string value for a text field rather than coercing it", () => {
    // Coercion is how `null` becomes "null" and a field is silently corrupted.
    assert.throws(() => parseEventBriefingStrategyPatch({ productFocus: null }), /invalid_strategy_patch/);
    assert.throws(() => parseEventBriefingStrategyPatch({ productFocus: 42 }), /invalid_strategy_patch/);
    assert.throws(() => parseEventBriefingStrategyPatch({ productFocus: {} }), /invalid_strategy_patch/);
  });

  it("rejects a non-boolean guardrail rather than coercing it", () => {
    assert.throws(
      () => parseEventBriefingStrategyPatch({ guardrails: { neutralToneBias: "yes" } }),
      /invalid_strategy_patch/
    );
  });

  it("rejects an empty patch, so a no-op save cannot look like a successful write", () => {
    assert.throws(() => parseEventBriefingStrategyPatch({}), /empty_strategy_patch/);
  });

  it("ignores unknown keys rather than persisting them", () => {
    // Mass-assignment adjacent: an attacker-supplied key must not reach the JSONB column.
    const patch = parseEventBriefingStrategyPatch({ productFocus: "x", company_id: "other", isAdmin: true });
    assert.deepStrictEqual(patch, { productFocus: "x" });
  });
});

// ── guardrails deep merge ──────────────────────────────────────────────────────────

describe("guardrails merge independently of text fields", () => {
  it("toggling one guardrail preserves the others", () => {
    const result = mergeEventBriefingStrategyPatch(POPULATED, {
      guardrails: { neutralToneBias: true },
    });
    assert.equal(result.guardrails?.neutralToneBias, true);
    assert.equal(result.guardrails?.excludeUnverifiedSources, true, "the untouched guardrail must survive");
    assert.equal(result.guardrails?.technicalDeepDive, true, "and so must this one");
  });

  it("an omitted guardrails key leaves the whole object alone", () => {
    const result = mergeGuardrailsPatch(POPULATED.guardrails, undefined);
    assert.deepStrictEqual(result, POPULATED.guardrails);
  });

  it("editing a text field does not reset guardrails to defaults", () => {
    const result = mergeEventBriefingStrategyPatch(POPULATED, { productFocus: "changed" });
    assert.equal(result.guardrails?.excludeUnverifiedSources, true);
  });
});

// ── concurrency and ordering ───────────────────────────────────────────────────────

describe("concurrent and out-of-order autosaves (plan §8)", () => {
  it("two edits to different fields both survive, in either arrival order", () => {
    const forward = mergeEventBriefingStrategyPatch(
      mergeEventBriefingStrategyPatch(POPULATED, { productFocus: "A" }),
      { eventGoal: "B" }
    );
    const reverse = mergeEventBriefingStrategyPatch(
      mergeEventBriefingStrategyPatch(POPULATED, { eventGoal: "B" }),
      { productFocus: "A" }
    );
    assert.deepStrictEqual(forward, reverse, "field-disjoint patches must commute");
    assert.equal(forward.productFocus, "A");
    assert.equal(forward.eventGoal, "B");
  });

  it("a stale patch cannot revert a sibling field it never mentioned", () => {
    // The precise failure mode migration 0097 exists to prevent: a save that began
    // before another field was edited lands afterwards. Because it carries only its own
    // key, the newer sibling value survives.
    const afterFirstEdit = mergeEventBriefingStrategyPatch(POPULATED, { eventGoal: "NEWER" });
    const staleProductFocusSave = mergeEventBriefingStrategyPatch(afterFirstEdit, {
      productFocus: "typed earlier",
    });
    assert.equal(
      staleProductFocusSave.eventGoal,
      "NEWER",
      "a late-arriving partial save must not carry stale siblings back"
    );
  });

  it("last write wins on the SAME field, which is the defined outcome", () => {
    const result = mergeEventBriefingStrategyPatch(
      mergeEventBriefingStrategyPatch(POPULATED, { productFocus: "first" }),
      { productFocus: "second" }
    );
    assert.equal(result.productFocus, "second");
  });
});

// ── the TypeScript merge must agree with the SQL merge ─────────────────────────────

/**
 * A faithful model of `patch_event_briefing_strategy` (migration 0097).
 *
 * The database is the authority — it performs `strategy || (patch - 'guardrails')` plus a
 * nested merge for guardrails. Executing the real function belongs to the excluded
 * `separate-security-db` program, so this models it instead. That is weaker than running
 * the SQL, and is labelled as such: its value is catching a divergence between the two
 * merge implementations, which is a real and silent failure mode.
 */
function sqlMergeModel(
  existing: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const { guardrails: patchGuardrails, ...rest } = patch;
  const merged: Record<string, unknown> = { ...existing, ...rest };
  if ("guardrails" in patch) {
    merged.guardrails = {
      ...((existing.guardrails as Record<string, unknown>) ?? {}),
      ...((patchGuardrails as Record<string, unknown>) ?? {}),
    };
  }
  return merged;
}

describe("TypeScript merge agrees with the migration 0097 JSONB merge", () => {
  const cases: Array<[string, Partial<EventBriefingStrategyFields>]> = [
    ["single text field", { productFocus: "X" }],
    ["explicit clear", { eventGoal: "" }],
    ["two text fields", { productFocus: "X", toneOfVoice: "Y" }],
    ["guardrail only", { guardrails: { neutralToneBias: true } }],
    ["text plus guardrail", { productFocus: "X", guardrails: { excludeUnverifiedSources: false } }],
  ];

  for (const [label, patch] of cases) {
    it(`agrees for: ${label}`, () => {
      const ts = mergeEventBriefingStrategyPatch(POPULATED, patch);
      const sql = sqlMergeModel(
        POPULATED as unknown as Record<string, unknown>,
        patch as unknown as Record<string, unknown>
      );
      for (const field of TEXT_FIELDS) {
        assert.equal(ts[field], sql[field], `${field} diverges between the TS and SQL merges for ${label}`);
      }
      if ("guardrails" in patch) {
        assert.deepStrictEqual(
          ts.guardrails,
          sql.guardrails,
          `guardrails diverge between the TS and SQL merges for ${label}`
        );
      }
    });
  }

  it("DOCUMENTED DIVERGENCE — the two merges disagree on absent guardrail keys (LR-PROD-005)", () => {
    // Pinned rather than asserted-equal, because the divergence is real and currently
    // unresolved. `mergeGuardrailsPatch` spreads `defaultBriefingGuardrails()` first, so
    // it materialises all four keys as `false`. The SQL `||` operator merges only the
    // keys present, leaving the rest absent.
    //
    // For a legacy event row with partial guardrails, the client-side value therefore
    // says `technicalDeepDive: false` where the database says nothing at all. Both read
    // as falsy today, so no behaviour is known to be broken — but any consumer that
    // distinguishes "never configured" from "explicitly off" would see two different
    // answers depending on which merge produced the value.
    //
    // Recorded as LR-PROD-005. Not fixed, per Brief §6.
    const legacyPartial = { excludeUnverifiedSources: true };
    const ts = mergeGuardrailsPatch(legacyPartial, { neutralToneBias: true });
    const sql = sqlMergeModel({ guardrails: legacyPartial }, { guardrails: { neutralToneBias: true } })
      .guardrails as Record<string, unknown>;

    assert.deepStrictEqual(ts, {
      excludeUnverifiedSources: true,
      neutralToneBias: true,
      technicalDeepDive: false,
      realtimeDriftDetection: false,
    }, "TS merge back-fills every key with false");

    assert.deepStrictEqual(sql, {
      excludeUnverifiedSources: true,
      neutralToneBias: true,
    }, "SQL merge leaves absent keys absent");

    assert.notDeepStrictEqual(ts, sql, "if these ever converge, delete this test and LR-PROD-005");
  });

  it("the SQL model itself would catch a full-object overwrite", () => {
    // Sanity-check the model: if a caller sent the whole object instead of a patch, the
    // sibling fields would be replaced. This is what the RPC is designed to make
    // impossible from a partial save, and what a naive `.update()` would have done.
    const overwrite = sqlMergeModel(POPULATED as never, {
      productFocus: "X", targetBuyerPersona: "", eventGoal: "", toneOfVoice: "",
    });
    assert.equal(overwrite.eventGoal, "", "a full-object send does clobber — which is why partial patches matter");
  });
});
