import "server-only";

import OpenAI from "openai";
import type { BatchBriefingContextV1 } from "@/lib/import-wizard/batch-briefing-context";
import type { ImportBriefingManualContextV1 } from "@/lib/import-wizard/briefing-content-json";
import {
  buildFoundationsPayload,
  buildGuardrailInstructions,
  buildQualityBarInstructions,
  buildSpecificityContractInstructions,
  buildStrategicRewriteSectionGuidance,
  buildToneInstructions,
  serializeManualContextForPolish,
} from "@/lib/import-wizard/briefing-ai-polish-prompt";
import type { DeterministicBriefBundle } from "@/lib/import-wizard/briefing-deterministic-bundle";
import type { BriefingPolishedBundle } from "@/lib/import-wizard/briefing-polished-types";

export const BRIEFING_POLISH_OPENAI_MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

function stripCodeFence(value: string): string {
  return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export type BriefingPolishInput = {
  foundations: BatchBriefingContextV1;
  bundle: DeterministicBriefBundle;
  batchNotes: string;
  sourceSnippets: string[];
  manualContext: ImportBriefingManualContextV1 | null;
};

function buildSystemPrompt(): string {
  return [
    "You produce an AI-polished, rep-facing booth brief for B2B exhibitors.",
    "The user-authored FOUNDATIONS and DETERMINISTIC_BUNDLE are the source of truth for facts and intent.",
    "Your job is a GROUNDED STRATEGIC REWRITE: materially more useful, sharper, and less templated than the deterministic text — not a light copy edit.",
    "Preserve concrete specificity: names, pain, competitors, urgency, and signals from MANUAL_CONTEXT, BATCH_NOTES, and the bundle. Better does not mean vaguer.",
    "Anchor all substance on productFocus, targetBuyerPersona, eventGoal, toneOfVoice, and GUARDRAIL_FLAGS / GUARDRAIL_INSTRUCTIONS.",
    "Do NOT invent facts, statistics, named entities, competitors, or outcomes that are not supported by the inputs.",
    "Do NOT replace the exhibitor's stated focus, persona, or event goal with new strategy.",
    "Do NOT replace useful specifics with generic B2B marketing or enablement-deck filler.",
    "You MAY fully rephrase, restructure, merge, reorder, and tighten for rep utility while preserving factual alignment and situational specificity.",
    "Return ONLY valid JSON matching the schema in the user message. No markdown fences.",
  ].join("\n");
}

function buildUserPayload(input: BriefingPolishInput): string {
  const { foundations, bundle, batchNotes, sourceSnippets, manualContext } = input;
  const tone = buildToneInstructions(foundations.toneOfVoice);
  const guard = buildGuardrailInstructions(foundations.guardrails);
  const foundationsPayload = buildFoundationsPayload(foundations);

  return JSON.stringify(
    {
      task: "Produce the AI-polished brief: grounded strategic rewrite of DETERMINISTIC_BUNDLE. Same JSON section schema; visibly upgraded rep utility — must stay specific to this lead and notes (not generic GTM polish).",
      QUALITY_BAR: buildQualityBarInstructions(),
      SPECIFICITY_CONTRACT: buildSpecificityContractInstructions(),
      SECTION_REWRITE_TARGETS: buildStrategicRewriteSectionGuidance(),
      schema: {
        headline:
          "string | null — optional; cleaner identity line if it improves clarity vs DETERMINISTIC_BUNDLE.identity headline; omit to keep deterministic",
        personaFitLine: "string | null — stronger fit/role synthesis vs bundle; omit to keep deterministic",
        teamContextLine: "string | null — tighter team context line; omit to keep deterministic",
        whyHere: "string[] — tie real lead signals to event/product; keep specifics from notes when present",
        talkingPoints: [{ title: "string", detail: "string" }],
        questions: "string[] — live rep questions; anchor to context when possible; not generic discovery scripts",
        competitorLines: "string[] — keep named competitors/positioning from source; commercially sharp",
        signals: "string[] — lead-specific observables; avoid generic “listen for budget” unless source is thin",
        gaps: [{ gap: "string", whyItMatters: "string", probe: "string" }],
      },
      FOUNDATIONS: foundationsPayload,
      TONE_AND_STYLE: tone,
      GUARDRAIL_INSTRUCTIONS: guard,
      BATCH_NOTES: batchNotes || "(none)",
      MANUAL_CONTEXT: serializeManualContextForPolish(manualContext),
      SOURCE_SNIPPETS: sourceSnippets.length ? sourceSnippets : ["(no briefing sources loaded for this event)"],
      DETERMINISTIC_BUNDLE: bundle,
    },
    null,
    0
  );
}

function parsePolishedJson(raw: string): BriefingPolishedBundle {
  const text = stripCodeFence(raw);
  const parsed = JSON.parse(text) as Record<string, unknown>;

  const whyHere = Array.isArray(parsed.whyHere) ? parsed.whyHere.filter((x) => typeof x === "string") : [];
  const talkingPoints = Array.isArray(parsed.talkingPoints)
    ? parsed.talkingPoints
        .map((tp) => tp as Record<string, unknown>)
        .filter((tp) => typeof tp.title === "string" && typeof tp.detail === "string")
        .map((tp) => ({ title: String(tp.title), detail: String(tp.detail) }))
    : [];
  const questions = Array.isArray(parsed.questions) ? parsed.questions.filter((x) => typeof x === "string") : [];
  const competitorLines = Array.isArray(parsed.competitorLines)
    ? parsed.competitorLines.filter((x) => typeof x === "string")
    : [];
  const signals = Array.isArray(parsed.signals) ? parsed.signals.filter((x) => typeof x === "string") : [];

  const gapsRaw = Array.isArray(parsed.gaps) ? parsed.gaps : [];
  const gaps = gapsRaw
    .map((g) => g as Record<string, unknown>)
    .filter((g) => typeof g.gap === "string" && typeof g.whyItMatters === "string" && typeof g.probe === "string")
    .map((g) => ({ gap: String(g.gap), whyItMatters: String(g.whyItMatters), probe: String(g.probe) }));

  const headline = typeof parsed.headline === "string" ? parsed.headline : undefined;
  const personaFitLine =
    typeof parsed.personaFitLine === "string" || parsed.personaFitLine === null ? (parsed.personaFitLine as string | null) : undefined;
  const teamContextLine =
    typeof parsed.teamContextLine === "string" || parsed.teamContextLine === null
      ? (parsed.teamContextLine as string | null)
      : undefined;

  return {
    headline,
    whyHere,
    talkingPoints,
    questions,
    competitorLines,
    signals,
    gaps: gaps.length > 0 ? gaps : undefined,
    personaFitLine: personaFitLine ?? undefined,
    teamContextLine: teamContextLine ?? undefined,
  };
}

export async function runBriefingAiPolish(input: BriefingPolishInput): Promise<BriefingPolishedBundle> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const client = new OpenAI({ apiKey });
  const userContent = buildUserPayload(input);

  const completion = await client.chat.completions.create({
    model: BRIEFING_POLISH_OPENAI_MODEL,
    temperature: 0.48,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: buildSystemPrompt() },
      {
        role: "user",
        content: `Return the AI-polished brief as JSON. Apply QUALITY_BAR, SPECIFICITY_CONTRACT, and SECTION_REWRITE_TARGETS. Inputs:\n\n${truncate(userContent, 95000)}`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) {
    throw new Error("OpenAI returned empty polish content");
  }

  return parsePolishedJson(raw);
}
