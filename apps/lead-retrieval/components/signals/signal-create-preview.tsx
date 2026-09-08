"use client";

import { CATEGORY_VISUALS } from "@/components/signals/category-badge";
import type { SignalCategory, SignalTone, SignalVisibility } from "@/components/signals/signal-types";

const EXPLAINER_CARDS = [
  {
    k: "1",
    title: "WHAT YOU'RE DEFINING",
    body: "An instruction for how the message should sound, what to emphasize, and what to avoid during draft generation."
  },
  {
    k: "2",
    title: "HOW IT'S USED WHEN DRAFTING",
    body: "When a campaign draft is generated, SignalThread Lead Retrieval uses this Campaign Agent with the lead and campaign context to shape the message."
  },
  {
    k: "3",
    title: "WHAT CHANGES IN THE OUTPUT",
    body: "The draft’s tone, emphasis, and direction shift to match the Campaign Agent you defined."
  },
  {
    k: "4",
    title: "EXAMPLE",
    body: "Instead of a generic follow-up, the draft leans into the angle and voice you set here."
  }
] as const;

/** Believable static demos when the prompt is empty — category-aware. */
const PIPELINE_FALLBACK: Record<
  SignalCategory,
  { instruction: string; systemBridge: string; draftEffect: string }
> = {
  "AI-Powered": {
    instruction: "Lead with ROI, not features. Keep the opening under two sentences.",
    systemBridge:
      "Your instruction is bundled with the lead (Alex Rivera, Northwind Labs) and campaign context. The generator steers wording to match—nothing is pasted as a fixed block.",
    draftEffect:
      "“Hi Alex — quick note from the summit. Given Northwind’s growth phase, I wanted to lead with how teams like yours measure ROI before we dive into features…”"
  },
  Contextual: {
    instruction:
      "Mid-market B2B SaaS; VP-level buyer; team is evaluating workflow automation against a Q3 deadline.",
    systemBridge:
      "This background rides with Alex Rivera / Northwind Labs when a draft is built, so the message can sound relevant to role, size, and timing—not generic.",
    draftEffect:
      "“…Given your VP remit and the Q3 evaluation window you’re in, here’s a concise take tailored to mid-market SaaS…”"
  },
  Custom: {
    instruction: "We recently helped a similar SaaS organization reduce manual handoffs by roughly 40%.",
    systemBridge:
      "This block is eligible to appear in the body of generated drafts. SignalThread Lead Retrieval may trim for grammar and flow, but the substance stays yours.",
    draftEffect:
      "“…We recently helped a similar SaaS organization reduce manual handoffs by roughly 40%. If useful, I can share how that maps to Northwind…”"
  },
  "Call-to-Action": {
    instruction: "Ask for a 20-minute walkthrough next week; suggest Tuesday or Wednesday afternoon.",
    systemBridge:
      "Your ask is weighted toward the closing of the draft so the next step matches what you wrote—not a vague “let me know.”",
    draftEffect:
      "“…Are you open to a 20-minute walkthrough next Tuesday or Wednesday afternoon? Happy to work around your calendar.”"
  }
};

function pipelineDraftEffect(
  category: SignalCategory,
  toneLabel: string,
  hasPrompt: boolean,
  trimmedPrompt: string
): string {
  if (!hasPrompt) return PIPELINE_FALLBACK[category].draftEffect;

  const tone = toneLabel || "Professional";
  const short =
    trimmedPrompt.length > 160 ? `${trimmedPrompt.slice(0, 157).trim()}…` : trimmedPrompt;

  switch (category) {
    case "AI-Powered":
      return `Illustrative line (${tone}): “Hi Alex — tying this to what you noted (“${short.slice(0, 80)}${short.length > 80 ? "…" : ""}”), here’s a tighter angle for Northwind than a generic template would give.”`;
    case "Contextual":
      return `Illustrative line (${tone}): “Given Northwind’s profile and what you added about context (“${short.slice(0, 70)}…”), here’s a relevant opening…”`;
    case "Custom":
      return `Illustrative line (${tone}): “…${short.slice(0, 120)}${short.length > 120 ? "…" : ""}…” — placed in the body with light edits so it flows with the rest of the email.`;
    case "Call-to-Action":
      return `Illustrative close (${tone}): “…${short.slice(0, 100)}${short.length > 100 ? "…" : ""}” — positioned as the ask instead of a stock sign-off.`;
  }
}

function pipelineSystemBridge(category: SignalCategory, hasPrompt: boolean): string {
  const base = PIPELINE_FALLBACK[category].systemBridge;
  if (!hasPrompt) return base;
  return `${base} Your current text above is what travels with the lead record for this category.`;
}

/** Mental model primer — place near top of create page. */
export function SignalCreateExplainer({ category }: { category: SignalCategory }) {
  const catVisual = CATEGORY_VISUALS[category];

  return (
    <div className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${catVisual.cardWrap}`}>
      <div className="border-b border-slate-200/80 bg-white/90 px-5 py-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">WHEN CAMPAIGNS RUN</p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Campaign Agents shape generated drafts</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
          When a draft is generated, this Campaign Agent helps guide the tone, emphasis, and direction of the message. It
          influences how the draft is written, not just how the record is labeled.
        </p>
      </div>

      <div className="px-5 py-4">
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {EXPLAINER_CARDS.map((step) => (
            <li
              key={step.k}
              className="flex gap-3 rounded-xl border border-slate-200/90 bg-white/80 p-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.7)]"
            >
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-700"
                aria-hidden
              >
                {step.k}
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{step.title}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-slate-700">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/**
 * One visual family per signal category (matches product category colors).
 * Lanes differ by surface weight + labels + icons—not unrelated lane hues.
 */
const CATEGORY_PIPELINE_THEME: Record<
  SignalCategory,
  {
    chip: string;
    accent: string;
    laneSignal: string;
    laneContext: string;
    laneOutcome: string;
    label: string;
    footer: string;
    inlineChip: string;
    arrow: string;
    iconMuted: string;
  }
> = {
  "AI-Powered": {
    chip: "bg-violet-100/95 text-violet-900 ring-1 ring-violet-200/85",
    accent: "border-l-[3px] border-violet-500/90",
    laneSignal: "border-violet-200/90 bg-violet-50/95 shadow-sm ring-1 ring-violet-900/[0.04]",
    laneContext: "border-violet-200/65 bg-violet-50/55",
    laneOutcome: "border-violet-200/75 bg-violet-50/70",
    label: "text-violet-900/80",
    footer: "text-violet-800/75",
    inlineChip: "bg-white/90 text-violet-950 ring-1 ring-violet-200/75",
    arrow: "text-violet-300/90",
    iconMuted: "text-violet-600/85"
  },
  Contextual: {
    chip: "bg-blue-100/95 text-blue-900 ring-1 ring-blue-200/85",
    accent: "border-l-[3px] border-blue-500/90",
    laneSignal: "border-blue-200/90 bg-blue-50/95 shadow-sm ring-1 ring-blue-900/[0.04]",
    laneContext: "border-blue-200/65 bg-blue-50/55",
    laneOutcome: "border-blue-200/75 bg-blue-50/70",
    label: "text-blue-900/80",
    footer: "text-blue-800/75",
    inlineChip: "bg-white/90 text-blue-950 ring-1 ring-blue-200/75",
    arrow: "text-blue-300/90",
    iconMuted: "text-blue-600/85"
  },
  Custom: {
    chip: "bg-orange-100/95 text-orange-900 ring-1 ring-orange-200/85",
    accent: "border-l-[3px] border-orange-500/90",
    laneSignal: "border-orange-200/90 bg-orange-50/95 shadow-sm ring-1 ring-orange-900/[0.04]",
    laneContext: "border-orange-200/65 bg-orange-50/55",
    laneOutcome: "border-orange-200/75 bg-orange-50/70",
    label: "text-orange-900/80",
    footer: "text-orange-800/75",
    inlineChip: "bg-white/90 text-orange-950 ring-1 ring-orange-200/75",
    arrow: "text-orange-300/90",
    iconMuted: "text-orange-600/85"
  },
  "Call-to-Action": {
    chip: "bg-emerald-100/95 text-emerald-900 ring-1 ring-emerald-200/85",
    accent: "border-l-[3px] border-emerald-500/90",
    laneSignal: "border-emerald-200/90 bg-emerald-50/95 shadow-sm ring-1 ring-emerald-900/[0.04]",
    laneContext: "border-emerald-200/65 bg-emerald-50/55",
    laneOutcome: "border-emerald-200/75 bg-emerald-50/70",
    label: "text-emerald-900/80",
    footer: "text-emerald-800/75",
    inlineChip: "bg-white/90 text-emerald-950 ring-1 ring-emerald-200/75",
    arrow: "text-emerald-300/90",
    iconMuted: "text-emerald-600/85"
  }
};

function PipelineLaneIcon({ lane, className }: { lane: "signal" | "context" | "effect"; className?: string }) {
  if (lane === "signal") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (lane === "context") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M21 15a4 4 0 01-4 4H7l-4 3V7a4 4 0 014-4h10a4 4 0 014 4v8z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PipelineArrow({ className }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center ${className ?? "text-slate-300"}`} aria-hidden>
      <svg className="h-4 w-4 md:h-5 md:w-5" viewBox="0 0 24 24" fill="none">
        <path
          d="M9 6l6 6-6 6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/** Category-unified pipeline: instruction → merged context → draft effect. Lives in Preview step. */
export function SignalCreateDraftPipeline({
  category,
  defaultPrompt,
  tones,
  templateId: _templateId,
  name: _name,
  visibility: _visibility,
  roleScope: _roleScope,
  templateScope: _templateScope
}: {
  category: SignalCategory;
  templateId: string | null;
  name: string;
  defaultPrompt: string;
  tones: SignalTone[];
  visibility: SignalVisibility;
  roleScope: string;
  templateScope: string;
}) {
  const toneLabel = tones[0] ?? "Professional";
  const catVisual = CATEGORY_VISUALS[category];
  const trimmedPrompt = defaultPrompt.trim();
  const hasPrompt = trimmedPrompt.length > 0;
  const fallback = PIPELINE_FALLBACK[category];

  const instructionContent = hasPrompt ? trimmedPrompt : fallback.instruction;
  const systemContent = pipelineSystemBridge(category, hasPrompt);
  const draftContent = pipelineDraftEffect(category, toneLabel, hasPrompt, trimmedPrompt);
  const t = CATEGORY_PIPELINE_THEME[category];

  return (
    <div className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${catVisual.cardWrap}`}>
      <div className="border-b border-slate-200/80 bg-white/90 px-5 py-3.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">From input to draft</p>
        <h3 className="mt-1 text-base font-semibold text-slate-900">How your Campaign Agent translates in practice</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">
          <span className="font-medium text-slate-800">{catVisual.label}</span>
          <span className="text-slate-400"> — </span>
          Three steps, left to right: your instruction, lead &amp; context the system adds, then how the draft reads. Color
          follows this category so the flow reads as one path—not three separate “lane types.”
        </p>
      </div>

      <div className="px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-stretch md:gap-1">
          <div className={`min-w-0 flex-1 rounded-xl border px-3 py-3 ${t.laneSignal} ${t.accent}`}>
            <div className="flex gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/70 bg-white/55">
                <PipelineLaneIcon lane="signal" className={`h-4 w-4 shrink-0 ${t.iconMuted}`} />
              </span>
              <div className="min-w-0 flex-1">
                <p className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${t.chip}`}>
                  Your signal
                </p>
                <p className={`mt-2 text-[10px] font-semibold uppercase tracking-wide ${t.label}`}>
                  What you author for drafting
                </p>
              </div>
            </div>
            <p
              className={`mt-3 min-h-[4.5rem] whitespace-pre-wrap text-sm leading-relaxed ${
                hasPrompt ? "text-slate-900" : "text-slate-700 italic"
              }`}
            >
              {instructionContent}
            </p>
            {!hasPrompt ? (
              <p className={`mt-2 text-[11px] leading-snug ${t.footer}`}>
                Placeholder for this category—your default prompt replaces it under Name &amp; instructions.
              </p>
            ) : null}
          </div>

          <PipelineArrow className={`md:py-0 md:pt-10 ${t.arrow}`} />
          <div className={`min-w-0 flex-1 rounded-xl border px-3 py-3 ${t.laneContext} ${t.accent}`}>
            <div className="flex gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/60 bg-white/40">
                <PipelineLaneIcon lane="context" className={`h-4 w-4 shrink-0 ${t.iconMuted}`} />
              </span>
              <div className="min-w-0 flex-1">
                <p className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${t.chip}`}>
                  Lead & context
                </p>
                <p className={`mt-2 text-[10px] font-semibold uppercase tracking-wide ${t.label}`}>
                  Inputs merged with your signal
                </p>
              </div>
            </div>
            <p className="mt-3 flex flex-wrap items-center gap-1.5 text-sm leading-relaxed text-slate-800">
              <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${t.inlineChip}`}>Alex Rivera</span>
              <span className="text-slate-400">·</span>
              <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${t.inlineChip}`}>Northwind Labs</span>
              <span className="text-slate-400">·</span>
              <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${t.inlineChip}`}>B2B SaaS</span>
            </p>
            <p className="mt-3 text-sm leading-relaxed text-slate-800">{systemContent}</p>
          </div>

          <PipelineArrow className={`md:py-0 md:pt-10 ${t.arrow}`} />
          <div className={`min-w-0 flex-1 rounded-xl border px-3 py-3 ${t.laneOutcome} ${t.accent}`}>
            <div className="flex gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/60 bg-white/45">
                <PipelineLaneIcon lane="effect" className={`h-4 w-4 shrink-0 ${t.iconMuted}`} />
              </span>
              <div className="min-w-0 flex-1">
                <p className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${t.chip}`}>
                  Draft effect
                </p>
                <p className={`mt-2 text-[10px] font-semibold uppercase tracking-wide ${t.label}`}>
                  How the message reads
                </p>
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-900">{draftContent}</p>
            <p className={`mt-2 text-[11px] leading-snug ${t.footer}`}>
              Example only—illustrates outcome, not a live draft run.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
