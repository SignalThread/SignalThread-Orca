"use client";

import { useState, type ReactNode } from "react";
import { hasManualContextInStored } from "@/lib/import-wizard/briefing-content-json";
import type { BriefingDetailView } from "@/lib/import-wizard/briefing-detail-model";
import type { BatchBriefingContextV1 } from "@/lib/import-wizard/batch-briefing-context";
import type { BriefingPolishedBundle } from "@/lib/import-wizard/briefing-polished-types";
import {
  composeIdentityBlock,
  composeStrategicQuestions,
  composeStrategicTalkingPoints,
  composeWhyTheyMatterHere,
  deriveCompetitorContext,
  deriveSignalsToWatch,
  deriveStrategicGaps,
} from "@/lib/import-wizard/briefing-enrich-from-context";

type EditableSection = "identity" | "why" | "talking" | "questions" | "competitors" | "signals" | "gaps";

function SectionCard({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.06)] sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
          {icon ? <span className="text-sm">{icon}</span> : null}
          {title}
        </h3>
        {action}
      </div>
      <div className="mt-3 space-y-2 text-sm text-slate-700">{children}</div>
    </section>
  );
}

function linesToText(lines: string[]): string {
  return lines.join("\n");
}

function textToLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function talkingToText(points: { title: string; detail: string }[]): string {
  return points.map((point) => `${point.title} | ${point.detail}`).join("\n");
}

function textToTalkingPoints(text: string): { title: string; detail: string }[] {
  return textToLines(text)
    .map((line) => {
      const [titleRaw, ...detailParts] = line.split("|");
      const title = String(titleRaw ?? "").trim();
      const detail = detailParts.join("|").trim();
      return title && detail ? { title, detail } : null;
    })
    .filter((point): point is { title: string; detail: string } => point != null);
}

function gapsToText(
  gaps: Array<{ gap: string; whyItMatters: string; probe: string }>
): string {
  return gaps.map((gap) => `${gap.gap} | ${gap.whyItMatters} | ${gap.probe}`).join("\n");
}

function textToGaps(text: string): Array<{ gap: string; whyItMatters: string; probe: string }> {
  return textToLines(text)
    .map((line) => {
      const [gapRaw, whyRaw, ...probeParts] = line.split("|");
      const gap = String(gapRaw ?? "").trim();
      const whyItMatters = String(whyRaw ?? "").trim();
      const probe = probeParts.join("|").trim();
      return gap && whyItMatters && probe ? { gap, whyItMatters, probe } : null;
    })
    .filter((item): item is { gap: string; whyItMatters: string; probe: string } => item != null);
}

function EditButton({
  section,
  onClick,
}: {
  section: EditableSection;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
      data-testid={`brief-section-edit-${section}`}
      onClick={onClick}
    >
      Edit
    </button>
  );
}

function EditorActions({
  busy,
  onCancel,
  onSave,
}: {
  busy: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <div className="mt-3 flex justify-end gap-2">
      <button
        type="button"
        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        disabled={busy}
        onClick={onCancel}
      >
        Cancel
      </button>
      <button
        type="button"
        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
        disabled={busy}
        data-testid="brief-section-save"
        onClick={onSave}
      >
        {busy ? "Saving..." : "Save edits"}
      </button>
    </div>
  );
}

export type ImportBriefingViewSectionsProps = {
  detail: BriefingDetailView;
  batchContext?: BatchBriefingContextV1;
  /** Server-grounded AI polish — wording only; omitted sections fall back to deterministic output. */
  polished?: BriefingPolishedBundle | null;
  /** When `polished` and `polished`, render merged polish + deterministic structure. */
  viewVariant?: "deterministic" | "polished";
  editable?: boolean;
  saveBusy?: boolean;
  onSaveEditedBrief?: (next: BriefingPolishedBundle) => Promise<void> | void;
};

export function ImportBriefingViewSections({
  detail,
  batchContext,
  polished,
  viewVariant = "deterministic",
  editable = false,
  saveBusy = false,
  onSaveEditedBrief,
}: ImportBriefingViewSectionsProps) {
  const [editing, setEditing] = useState<EditableSection | null>(null);
  const [draftText, setDraftText] = useState("");
  const [identityDraft, setIdentityDraft] = useState({
    headline: "",
    personaFitLine: "",
    teamContextLine: "",
  });
  const ctx = batchContext ?? {};

  const identityBase = composeIdentityBlock(detail, ctx);
  const whyDeterministic = composeWhyTheyMatterHere(detail, ctx);
  const talkingDeterministic = composeStrategicTalkingPoints(detail, ctx);
  const questionsDeterministic = composeStrategicQuestions(detail, ctx);
  const competitorDeterministic = deriveCompetitorContext(detail, ctx);
  const signalsDeterministic = deriveSignalsToWatch(detail, ctx);
  const gapsDeterministic = deriveStrategicGaps(detail, ctx);

  const usePolished = viewVariant === "polished" && polished != null;

  const identity = usePolished
    ? {
        ...identityBase,
        headline: polished!.headline?.trim() ? polished!.headline!.trim() : identityBase.headline,
        personaFitLine:
          polished!.personaFitLine !== undefined && polished!.personaFitLine !== null
            ? polished!.personaFitLine
            : identityBase.personaFitLine,
        teamContextLine:
          polished!.teamContextLine !== undefined && polished!.teamContextLine !== null
            ? polished!.teamContextLine
            : identityBase.teamContextLine,
      }
    : identityBase;

  const whyLines = usePolished && polished!.whyHere.length > 0 ? polished!.whyHere : whyDeterministic;
  const talkingPoints = usePolished && polished!.talkingPoints.length > 0 ? polished!.talkingPoints : talkingDeterministic;
  const questions = usePolished && polished!.questions.length > 0 ? polished!.questions : questionsDeterministic;
  const competitorLines = usePolished && polished!.competitorLines.length > 0 ? polished!.competitorLines : competitorDeterministic;
  const signals = usePolished && polished!.signals.length > 0 ? polished!.signals : signalsDeterministic;
  const strategicGaps = usePolished && polished!.gaps && polished!.gaps.length > 0 ? polished!.gaps : gapsDeterministic;

  const currentBundle: BriefingPolishedBundle = {
    headline: identity.headline,
    personaFitLine: identity.personaFitLine,
    teamContextLine: identity.teamContextLine,
    whyHere: whyLines,
    talkingPoints,
    questions,
    competitorLines,
    signals,
    gaps: strategicGaps,
  };

  const beginEdit = (section: EditableSection) => {
    setEditing(section);
    if (section === "identity") {
      setIdentityDraft({
        headline: currentBundle.headline ?? "",
        personaFitLine: currentBundle.personaFitLine ?? "",
        teamContextLine: currentBundle.teamContextLine ?? "",
      });
      setDraftText("");
      return;
    }
    if (section === "why") setDraftText(linesToText(whyLines));
    if (section === "talking") setDraftText(talkingToText(talkingPoints));
    if (section === "questions") setDraftText(linesToText(questions));
    if (section === "competitors") setDraftText(linesToText(competitorLines));
    if (section === "signals") setDraftText(linesToText(signals));
    if (section === "gaps") setDraftText(gapsToText(strategicGaps));
  };

  const saveSection = async (section: EditableSection) => {
    if (!onSaveEditedBrief) return;
    const next: BriefingPolishedBundle = { ...currentBundle };
    if (section === "identity") {
      next.headline = identityDraft.headline.trim() || undefined;
      next.personaFitLine = identityDraft.personaFitLine.trim() || null;
      next.teamContextLine = identityDraft.teamContextLine.trim() || null;
    }
    if (section === "why") next.whyHere = textToLines(draftText);
    if (section === "talking") next.talkingPoints = textToTalkingPoints(draftText);
    if (section === "questions") next.questions = textToLines(draftText);
    if (section === "competitors") next.competitorLines = textToLines(draftText);
    if (section === "signals") next.signals = textToLines(draftText);
    if (section === "gaps") next.gaps = textToGaps(draftText);
    await onSaveEditedBrief(next);
    setEditing(null);
  };

  const actionFor = (section: EditableSection) =>
    editable ? <EditButton section={section} onClick={() => beginEdit(section)} /> : null;

  const textEditor = (section: EditableSection, help: string) =>
    editing === section ? (
      <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3" data-testid={`brief-section-editor-${section}`}>
        <p className="mb-2 text-xs font-medium text-slate-600">{help}</p>
        <textarea
          className="min-h-28 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          value={draftText}
          onChange={(event) => setDraftText(event.target.value)}
          disabled={saveBusy}
        />
        <EditorActions busy={saveBusy} onCancel={() => setEditing(null)} onSave={() => void saveSection(section)} />
      </div>
    ) : null;

  return (
    <div className="import-brief-view-sections space-y-4" data-testid="import-brief-view-sections">
      {/* Who They Are — identity snapshot */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/80 shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
        <div className="border-b border-slate-100 bg-white/90 px-4 py-3 sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              <span className="text-sm">👤</span>
              Who they are
            </h3>
            {actionFor("identity")}
          </div>
        </div>
        <div className="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
          <div>
            <p className="text-lg font-semibold leading-snug text-slate-950">{identity.headline}</p>
            {identity.personaFitLine ? (
              <p className="mt-2 text-sm font-medium leading-relaxed text-indigo-900/90">{identity.personaFitLine}</p>
            ) : null}
            {identity.teamContextLine ? (
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{identity.teamContextLine}</p>
            ) : null}
          </div>

          {identity.contactRows.length > 0 ? (
            <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-100 pt-3 text-sm">
              {identity.contactRows.map((row) => (
                <div key={row.label}>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{row.label}</span>
                  <p className="mt-0.5 font-medium text-slate-800">{row.value}</p>
                </div>
              ))}
            </div>
          ) : null}

          {identity.companyFacts.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {identity.companyFacts.map((f) => (
                <div key={`${f.label}-${f.value}`} className="rounded-xl border border-slate-100 bg-white px-3 py-2.5 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{f.label}</p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-900">{f.value}</p>
                </div>
              ))}
            </div>
          ) : null}

          {identity.quote ? (
            <blockquote className="border-l-4 border-indigo-300/70 pl-3 text-sm italic leading-relaxed text-slate-600">
              {identity.quote}
            </blockquote>
          ) : null}
          {editing === "identity" ? (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3" data-testid="brief-section-editor-identity">
              <label className="block text-xs font-semibold text-slate-700">
                Headline
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  value={identityDraft.headline}
                  onChange={(event) => setIdentityDraft((draft) => ({ ...draft, headline: event.target.value }))}
                  disabled={saveBusy}
                />
              </label>
              <label className="mt-3 block text-xs font-semibold text-slate-700">
                Persona fit line
                <textarea
                  className="mt-1 min-h-20 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  value={identityDraft.personaFitLine}
                  onChange={(event) => setIdentityDraft((draft) => ({ ...draft, personaFitLine: event.target.value }))}
                  disabled={saveBusy}
                />
              </label>
              <label className="mt-3 block text-xs font-semibold text-slate-700">
                Team context line
                <textarea
                  className="mt-1 min-h-20 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  value={identityDraft.teamContextLine}
                  onChange={(event) => setIdentityDraft((draft) => ({ ...draft, teamContextLine: event.target.value }))}
                  disabled={saveBusy}
                />
              </label>
              <EditorActions busy={saveBusy} onCancel={() => setEditing(null)} onSave={() => void saveSection("identity")} />
            </div>
          ) : null}
        </div>
      </div>

      {/* Why They May Matter Here */}
      <div className="rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-600 to-violet-700 p-4 text-white shadow-md sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-white/80">
            <span className="text-sm">✦</span>
            Why they may matter here
          </h3>
          {editable ? (
            <button
              type="button"
              className="rounded-md border border-white/25 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-white/20"
              data-testid="brief-section-edit-why"
              onClick={() => beginEdit("why")}
            >
              Edit
            </button>
          ) : null}
        </div>
        {whyLines.length > 0 ? (
          <ul className="mt-3 space-y-2.5">
            {whyLines.map((line, i) => (
              <li key={`${line.slice(0, 40)}-${i}`} className="flex gap-2 text-sm leading-snug text-white/95">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-300" aria-hidden="true" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-white/85">
            No relevance cues yet. Add event context on the batch or individual lead notes to strengthen this section.
          </p>
        )}
        {textEditor("why", "One line per relevance cue.")}
      </div>

      {/* Top Talking Points */}
      <SectionCard title="Top talking points" icon="💬" action={actionFor("talking")}>
        {talkingPoints.length > 0 ? (
          <ul className="space-y-3.5">
            {talkingPoints.map((tp, i) => (
              <li key={`${tp.title}-${i}`} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{tp.title}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-800">{tp.detail}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">None from mapped data or context. Add product focus or lead notes to generate talking points.</p>
        )}
        {textEditor("talking", "Use one talking point per line: Title | Detail")}
      </SectionCard>

      {/* Questions to Ask */}
      <SectionCard title="Questions to ask" icon="❓" action={actionFor("questions")}>
        {questions.length > 0 ? (
          <ul className="space-y-3">
            {questions.map((q, i) => (
              <li key={`${q.slice(0, 40)}-${i}`} className="flex gap-2.5 text-sm leading-relaxed">
                <span className="mt-0.5 shrink-0 font-semibold text-indigo-500" aria-hidden="true">
                  {i + 1}.
                </span>
                <span>{q}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">Set an event goal or add lead context to generate suggested questions.</p>
        )}
        {textEditor("questions", "One question per line.")}
      </SectionCard>

      {/* Competitor Context */}
      {competitorLines.length > 0 ? (
        <SectionCard title="Competitor context" icon="⚔️" action={actionFor("competitors")}>
          <ul className="space-y-2.5">
            {competitorLines.map((line, i) => (
              <li key={`comp-${i}`} className="flex gap-2 text-sm leading-relaxed">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-rose-400" aria-hidden="true" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
          {textEditor("competitors", "One competitor-context line per row.")}
        </SectionCard>
      ) : null}

      {/* Cues to Watch */}
      {signals.length > 0 ? (
        <SectionCard title="Cues to watch" icon="📡" action={actionFor("signals")}>
          <ul className="space-y-2">
            {signals.map((s, i) => (
              <li key={`sig-${i}`} className="flex gap-2 text-sm leading-relaxed">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400" aria-hidden="true" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
          {textEditor("signals", "One cue per line.")}
        </SectionCard>
      ) : null}

      {/* Your team's notes — supporting */}
      {detail.manualContext && hasManualContextInStored({ manualContext: detail.manualContext }) ? (
        <SectionCard title="Your team's notes" icon="📝">
          <dl className="space-y-2 text-sm">
            {[
              ["Why this lead matters", detail.manualContext.whyMatters],
              ["What we already know", detail.manualContext.whatWeKnow],
              ["Suspected pain point", detail.manualContext.suspectedPain],
              ["Conversation starter", detail.manualContext.conversationStarter],
              ["Competitor mentioned", detail.manualContext.competitorMentioned],
              ["Internal notes", detail.manualContext.internalNotes],
            ].map(([label, val]) =>
              val != null && String(val).trim() !== "" ? (
                <div key={label}>
                  <dt className="text-[10px] font-bold uppercase text-slate-500">{label}</dt>
                  <dd className="mt-0.5 text-slate-800">{String(val)}</dd>
                </div>
              ) : null
            )}
            {detail.manualContext.priorityOverride != null && detail.manualContext.priorityOverride !== "auto" ? (
              <div>
                <dt className="text-[10px] font-bold uppercase text-slate-500">Priority override</dt>
                <dd className="mt-0.5 text-slate-800">{detail.manualContext.priorityOverride}</dd>
              </div>
            ) : null}
          </dl>
        </SectionCard>
      ) : null}

      {/* What We Still Don't Know */}
      {strategicGaps.length > 0 ? (
        <div className="rounded-2xl border border-amber-200/90 bg-gradient-to-b from-amber-50/90 to-white p-4 sm:p-5" data-testid="brief-unknowns-section">
          <div className="flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-amber-900/90">
              <span className="text-sm">🔍</span>
              What we still don&apos;t know
            </h3>
            {actionFor("gaps")}
          </div>
          <ul className="mt-4 space-y-4">
            {strategicGaps.map((item, i) => (
              <li key={`unk-${i}`} className="rounded-xl border border-amber-100/90 bg-white/90 px-3 py-3 text-sm shadow-sm">
                <p className="font-semibold text-amber-950">{item.gap}</p>
                <p className="mt-1.5 text-amber-900/90">{item.whyItMatters}</p>
                <p className="mt-2 border-t border-amber-100/80 pt-2 text-amber-950/95">
                  <span className="font-semibold text-amber-900">Ask next: </span>
                  {item.probe}
                </p>
              </li>
            ))}
          </ul>
          {textEditor("gaps", "Use one gap per line: Gap | Why it matters | Probe")}
          <p className="mt-4 text-xs text-amber-800/90">
            Use the conversation to close the gaps that matter for your next step — better signal beats longer briefs.
          </p>
        </div>
      ) : null}
    </div>
  );
}
