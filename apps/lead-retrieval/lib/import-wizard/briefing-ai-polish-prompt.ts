import type { BatchBriefingContextV1, BriefingGuardrailsV1 } from "@/lib/import-wizard/batch-briefing-context";
import { defaultBriefingGuardrails } from "@/lib/import-wizard/batch-briefing-context";
import type { ImportBriefingManualContextV1 } from "@/lib/import-wizard/briefing-content-json";

export function buildToneInstructions(toneOfVoice: string | undefined): string {
  const t = (toneOfVoice ?? "").trim();
  if (!t) {
    return "Voice: a strong seller who read MANUAL_CONTEXT, BATCH_NOTES, and the bundle — preparing for a real conversation. Direct, specific, situational. Not generic marketing polish, not enablement-deck tone. Prefer concrete details over abstract value props.";
  }
  return `Tone & voice (required): "${t}". Apply it without sanding off specifics — keep named entities, pain, and signals from the inputs when present. Shape and density over synonym swaps; if concise/analytical, stay evidence-oriented and concrete.`;
}

export function buildGuardrailInstructions(g: BriefingGuardrailsV1 | undefined): string {
  const gr = { ...defaultBriefingGuardrails(), ...g };
  const lines: string[] = [];

  if (gr.excludeUnverifiedSources) {
    lines.push(
      "GUARDRAIL — Verified sources only: Do not introduce facts, statistics, competitor claims, or market assertions not clearly supported by the DETERMINISTIC_BUNDLE, FOUNDATIONS, BATCH_NOTES, SOURCE_SNIPPETS, or MANUAL_CONTEXT. Full sentence rewrites are allowed; every substantive claim must remain traceable to those inputs. If a line cannot be grounded, omit it."
    );
  }
  if (gr.neutralToneBias) {
    lines.push(
      "GUARDRAIL — Neutral tone: Remove or soften hype, superlatives, and promotional marketing language. Prefer plain, credible phrasing."
    );
  }
  if (gr.technicalDeepDive) {
    lines.push(
      "GUARDRAIL — Technical depth: Where the source material allows, prefer concrete implementation/architecture language over generic business abstractions. Do not invent technical details."
    );
  }
  if (gr.realtimeDriftDetection) {
    lines.push(
      "GUARDRAIL — Consistency check (single-pass): Remove or rewrite lines that contradict Product Focus, Event Goal, or Target Buyer Persona from FOUNDATIONS. Do not introduce objectives that conflict with the user's stated event goal. Note: this is not runtime monitoring — it is a one-time consistency pass in this response only."
    );
  }

  if (lines.length === 0) {
    return "No additional guardrails beyond global rules.";
  }
  return lines.join("\n\n");
}

/**
 * Per-section targets for the AI-polished view: grounded strategic rewrite, not copy-edit.
 * Kept in one place for tests and prompt parity.
 */
export function buildStrategicRewriteSectionGuidance(): string {
  return [
    "SECTION_REWRITE_TARGETS (same facts as inputs; sharper + more situational — never vaguer):",
    "",
    "• identity (headline optional; personaFitLine; teamContextLine): Person-first — name/role/company signal from the bundle, not generic “engagement brief” labels. Persona fit and team context line must reflect what the team actually wrote in MANUAL_CONTEXT when present. If the deterministic line names a vendor, pain, or urgency, keep that specificity.",
    "• whyHere: Tie this person’s real signals (from DETERMINISTIC_BUNDLE + MANUAL_CONTEXT + BATCH_NOTES) to eventGoal + productFocus with sharper business logic. Do not replace “ready to buy / unhappy with vendor X” with bland “opportunity” language.",
    "• talkingPoints: Situational and differentiated — each title/detail pair should sound like a rep angle for *this* lead, not generic value-prop filler. Preserve names, pain, product hooks, and objection hints that appear in the source.",
    "• questions: What a strong rep would ask live — short, concrete, diagnostic. Reference real context from notes when possible; avoid corporate “explore synergies” phrasing.",
    "• competitorLines: Commercially smart — keep named competitors, products, or positioning from the bundle/notes; do not flatten to “highlight differentiation” filler.",
    "• signals: Observational and tied to this lead — behaviors, cues, or triggers from the bundle/notes; not generic “listen for budget” advice unless the source is thin.",
    "• gaps: Decision-oriented and practical — what we still need to learn to move this deal; probes should sound like something you’d actually ask in the meeting.",
  ].join("\n");
}

/**
 * Instructions that forbid near-copy output and set a quality bar without inventing facts.
 */
export function buildQualityBarInstructions(): string {
  return [
    "QUALITY_BAR:",
    "1) This is a GROUNDED STRATEGIC REWRITE of DETERMINISTIC_BUNDLE — not grammar fixes, not synonym swaps, not light trimming.",
    "2) FORBIDDEN: low-value near-copy — output that mirrors the deterministic text with only minor edits (same sentence skeleton + a few word changes). Users must see a meaningful upgrade.",
    "3) REQUIRED: section-level improvement — restructure lines, merge redundancy, change emphasis, sharpen verbs, reduce template feel. When the source is thin, prefer FEWER, stronger lines over padding.",
    "4) If inputs truly cannot support a richer version of a section, be honest: compress, merge bullets, or shorten — do not invent filler to sound smart.",
    "5) Self-check before returning: for each non-empty section, ask whether a rep would read this as clearly more useful than Standard; if not, push further (still grounded).",
    "6) SPECIFICITY CHECK: better must not mean vaguer — if you would replace a concrete detail with generic B2B language, stop and keep or sharpen the detail instead.",
  ].join("\n");
}

/**
 * Anti-generic rules: preserve lead/notes specificity; penalize generic GTM filler.
 */
export function buildSpecificityContractInstructions(): string {
  return [
    "SPECIFICITY_CONTRACT (read before writing):",
    "• PRESERVE: concrete details from DETERMINISTIC_BUNDLE, MANUAL_CONTEXT (suspected pain, competitor mentioned, conversation starter, why matters, what we know), BATCH_NOTES, and SOURCE_SNIPPETS — names, vendors, products, urgency, objections, quoted signals.",
    "• REWARD: rewrites that carry those specifics forward in clearer, stronger phrasing — still grounded.",
    "• FORBIDDEN: swapping real specifics for generic sales language — e.g. replacing “doesn’t like current vendor / ready to buy” with vague “strong opportunity” or “explore alignment.”",
    "• FORBIDDEN: generic enablement-deck tone — “drive value,” “unlock synergies,” “leverage capabilities,” “differentiate our solution” unless that exact framing appears in the inputs.",
    "• FORBIDDEN: weakening person-first, direct openers into bland corporate phrasing when the source is already sharp.",
    "• ONLY generalize when the deterministic text is already vague — then tighten without inventing facts.",
    "• Sound like a rep who actually read the notes, not a generic polished GTM writer.",
  ].join("\n");
}

export function serializeManualContextForPolish(m: ImportBriefingManualContextV1 | null): string {
  if (!m || typeof m !== "object") return "(none)";
  const rows: string[] = [];
  const add = (label: string, v: unknown) => {
    const s = typeof v === "string" ? v.trim() : "";
    if (s) rows.push(`${label}: ${s}`);
  };
  add("Why this lead matters", m.whyMatters);
  add("What we already know", m.whatWeKnow);
  add("Suspected pain point", m.suspectedPain);
  add("Conversation starter", m.conversationStarter);
  add("Competitor mentioned", m.competitorMentioned);
  add("Internal notes", m.internalNotes);
  if (m.priorityOverride != null && m.priorityOverride !== "auto") {
    rows.push(`Priority override: ${m.priorityOverride}`);
  }
  return rows.length ? rows.join("\n") : "(none)";
}

export function buildFoundationsPayload(foundations: BatchBriefingContextV1): {
  productFocus: string;
  targetBuyerPersona: string;
  eventGoal: string;
  toneOfVoice: string;
  GUARDRAIL_FLAGS: {
    excludeUnverifiedSources: boolean;
    neutralToneBias: boolean;
    technicalDeepDive: boolean;
    realtimeDriftDetection: boolean;
  };
} {
  const gr = { ...defaultBriefingGuardrails(), ...foundations.guardrails };
  return {
    productFocus: foundations.productFocus ?? "",
    targetBuyerPersona: foundations.targetBuyerPersona ?? "",
    eventGoal: foundations.eventGoal ?? "",
    toneOfVoice: foundations.toneOfVoice ?? "",
    GUARDRAIL_FLAGS: {
      excludeUnverifiedSources: !!gr.excludeUnverifiedSources,
      neutralToneBias: !!gr.neutralToneBias,
      technicalDeepDive: !!gr.technicalDeepDive,
      realtimeDriftDetection: !!gr.realtimeDriftDetection,
    },
  };
}
