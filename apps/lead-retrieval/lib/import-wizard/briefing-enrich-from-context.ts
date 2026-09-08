/**
 * Pure compositors for Review Brief: batch/event context + individual manual context + mapped row data.
 * All outputs are grounded — no invented firmographics, revenue, or intent.
 */

import type { BatchBriefingContextV1 } from "@/lib/import-wizard/batch-briefing-context";
import { EVENT_GOAL_PRESETS } from "@/lib/import-wizard/batch-briefing-context";
import type { BriefingDetailView } from "@/lib/import-wizard/briefing-detail-model";

function ne(s: string | undefined | null): string | null {
  if (s == null) return null;
  const t = String(s).trim();
  return t.length > 0 ? t : null;
}

/** Avoid pasting long exhibitor persona strings into copy; reference the lens instead. */
const LONG_PERSONA = 90;

function exhibitorBuyerLensPhrase(personaRaw: string | null | undefined): string {
  const p = ne(personaRaw);
  if (!p) return "the buyer profile your team set for this event";
  if (p.length > LONG_PERSONA) return "the buyer profile your team set for this event";
  return `“${p}”`;
}

/** Human-readable goal for copy: preset label if value matches a legacy slug, otherwise the free-text string. */
function goalDisplayTextForCopy(value: string): string {
  const opt = EVENT_GOAL_PRESETS.find((o) => o.value === value);
  return opt ? opt.label : value.trim();
}

function legacyGoalDescriptionOptional(value: string): string | null {
  const opt = EVENT_GOAL_PRESETS.find((o) => o.value === value);
  return opt ? opt.description : null;
}

function isLegacyEventGoalSlug(value: string): boolean {
  return EVENT_GOAL_PRESETS.some((o) => o.value === value);
}

/** Parse `Briefing for Name — Title at Company.` from build-briefing-detail layers. */
export function parseHeadlineIdentity(headline: string): {
  displayName: string | null;
  title: string | null;
  company: string | null;
} {
  const t = headline.trim();
  const re = /^Briefing for (.+?)(?: — (.+?))? at (.+?)\.?$/i;
  const m = t.match(re);
  if (!m) return { displayName: null, title: null, company: null };
  return {
    displayName: ne(m[1]) ?? null,
    title: ne(m[2]) ?? null,
    company: ne(m[3]) ?? null,
  };
}

/** Title from `companySnapshot.tagline` patterns produced by deriveBriefingBlocksFromMappedRow. */
export function parseTitleFromTagline(tagline: string): string | null {
  if (!tagline || tagline === "—") return null;
  const m1 = tagline.match(/^Imported lead:\s*(.+?)\s*—\s*(.+)$/);
  if (m1) return ne(m1[2]);
  const m2 = tagline.match(/^Title in import:\s*(.+)$/i);
  if (m2) return ne(m2[1]);
  return null;
}

export function resolveLeadTitle(detail: BriefingDetailView): string | null {
  const fromHeadline = parseHeadlineIdentity(detail.headline).title;
  if (fromHeadline) return fromHeadline;
  const enriched = ne(detail.enrichment?.jobTitleEnriched);
  if (enriched) return enriched;
  return parseTitleFromTagline(detail.companySnapshot.tagline);
}

const WEAK_WHY_PREFIXES = [
  /^status in source data:/i,
  /^follow-up date in source data:/i,
  /^priority score in source data:/i,
  /^rating in source data:/i,
];

export function isWeakCsvWhyLine(line: string): boolean {
  const t = line.trim();
  return WEAK_WHY_PREFIXES.some((re) => re.test(t));
}

const WEAK_TP_TITLES = new Set(["Lead name", "Company", "Email", "LinkedIn", "Role"]);

export function isWeakCsvTalkingPoint(tp: { title: string; detail: string }): boolean {
  if (!WEAK_TP_TITLES.has(tp.title)) return false;
  return /^(Imported (full name|lead name):|Company field:|Email on file:|LinkedIn URL in import:|Job title in import:)/i.test(
    tp.detail.trim()
  );
}

/** Compact rollup when the only signals are CSV metadata lines. */
function rollupImportSignals(lines: string[]): string | null {
  const parts: string[] = [];
  for (const line of lines) {
    if (!isWeakCsvWhyLine(line)) continue;
    const m = line.match(/^([^:]+):\s*(.+)$/);
    if (m) {
      const label = m[1]!.replace(/\s+in source data$/i, "").trim();
      parts.push(`${label}: ${m[2]!.trim()}`);
    }
  }
  if (parts.length === 0) return null;
  return `Signals from the import row: ${parts.join("; ")}.`;
}

type ScoredLine = { score: number; line: string };

function takeTopLines(candidates: ScoredLine[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of [...candidates].sort((a, b) => b.score - a.score)) {
    const k = c.line.trim().toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c.line);
    if (out.length >= max) break;
  }
  return out;
}

/** Compare lead role to batch target persona — grounded token overlap, no scoring fiction. */
export type PersonaFitKind = "strong" | "relevant" | "needs_validation" | null;

export function evaluateTargetPersonaFit(
  targetPersona: string | null | undefined,
  roleTitle: string | null | undefined
): PersonaFitKind {
  const p = ne(targetPersona);
  if (!p) return null;
  const r = ne(roleTitle);
  if (!r) return "needs_validation";
  const rl = r.toLowerCase();
  const tokens = p
    .toLowerCase()
    .split(/[\s,/;&]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2);
  if (tokens.length === 0) return "needs_validation";
  let hits = 0;
  for (const t of tokens) {
    if (rl.includes(t)) hits++;
  }
  if (hits >= 2) return "strong";
  if (hits === 1) return tokens.length <= 2 ? "strong" : "relevant";
  const first = tokens[0];
  if (first && rl.includes(first)) return "relevant";
  return "needs_validation";
}

function personaFitCopy(kind: PersonaFitKind): string | null {
  if (kind == null) return null;
  if (kind === "strong") {
    return "Strong fit with the buyer profile you defined for this event, based on role on file — still confirm authority and scope live.";
  }
  if (kind === "relevant") {
    return "Relevant to your target persona, with fit still to confirm in conversation against role and company context.";
  }
  return "Potential fit to validate against your target persona — confirm scope, authority, and day-to-day relevance before going deep.";
}

function buildCompanyFactRows(detail: BriefingDetailView): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  const push = (label: string, value: string | null | undefined) => {
    const v = ne(value);
    if (!v) return;
    rows.push({ label, value: v });
  };
  const e = detail.enrichment;
  const snap = detail.companySnapshot;
  if (e) {
    push("Company size", e.companySize);
    push("Industry", e.industry);
    push("Seniority (signal)", e.seniority ?? e.jobTitleEnriched);
    push("Domain", e.domain);
  }
  if (snap.headcount !== "—") push("Headcount", snap.headcount);
  if (snap.techSophistication !== "—") push("Tech sophistication", snap.techSophistication);
  if (snap.hq !== "—") push("HQ", snap.hq);
  const seen = new Set<string>();
  return rows.filter((r) => {
    const k = `${r.label}:${r.value}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function identityContactRows(detail: BriefingDetailView): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  const em = ne(detail.identityExtras?.email);
  const li = ne(detail.identityExtras?.linkedinUrl) ?? ne(detail.enrichment?.linkedinUrl);
  if (em) out.push({ label: "Email", value: em });
  if (li) out.push({ label: "LinkedIn", value: li });
  return out;
}

/** Premium identity block — lead & company first; persona fit compares lead to ICP (not “you’re prioritizing”). */
export type BriefingIdentityBlock = {
  headline: string;
  personaFitLine: string | null;
  teamContextLine: string | null;
  contactRows: { label: string; value: string }[];
  companyFacts: { label: string; value: string }[];
  quote: string | null;
};

export function composeIdentityBlock(detail: BriefingDetailView, batchCtx: BatchBriefingContextV1): BriefingIdentityBlock {
  const { displayName, title, company } = parseHeadlineIdentity(detail.headline);
  const resolvedTitle = title ?? resolveLeadTitle(detail);
  const co = company ?? (detail.companySnapshot.name !== "—" ? ne(detail.companySnapshot.name) : null);
  const parts = [ne(displayName), ne(resolvedTitle), ne(co)].filter(Boolean) as string[];
  const headline = parts.length > 0 ? parts.join(" · ") : detail.headline;

  const fitKind = evaluateTargetPersonaFit(batchCtx.targetBuyerPersona, resolvedTitle);
  const personaFitLine = personaFitCopy(fitKind);

  const wm = ne(detail.manualContext?.whatWeKnow);
  const teamContextLine =
    wm && wm.length < 280 ? `What your team already knows: ${wm}` : wm ? `What your team already knows: ${wm.slice(0, 240)}…` : null;

  return {
    headline,
    personaFitLine,
    teamContextLine,
    contactRows: identityContactRows(detail),
    companyFacts: buildCompanyFactRows(detail),
    quote: ne(detail.companySnapshot.quote) && detail.companySnapshot.quote !== "—" ? detail.companySnapshot.quote : null,
  };
}

/** @deprecated Use composeIdentityBlock */
export function composeIdentityPresentation(
  detail: BriefingDetailView,
  batchCtx: BatchBriefingContextV1
): {
  identityLine: string;
  narrative: string | null;
  showFirmographics: boolean;
} {
  const b = composeIdentityBlock(detail, batchCtx);
  const narrative = [b.personaFitLine, b.teamContextLine].filter(Boolean).join(" ") || null;
  return {
    identityLine: b.headline,
    narrative,
    showFirmographics: b.companyFacts.length > 0,
  };
}

/**
 * Full “Why they may matter here” list — prioritized, synthesized; not a raw concat of CSV dumps.
 */
export function composeWhyTheyMatterHere(detail: BriefingDetailView, batchCtx: BatchBriefingContextV1): string[] {
  const mc = detail.manualContext;
  const candidates: ScoredLine[] = [];

  const po = mc?.priorityOverride;
  if (po && po !== "auto") {
    const rank = po === "high" ? "high" : po === "low" ? "lower" : "normal";
    candidates.push({
      score: po === "high" ? 100 : po === "low" ? 55 : 72,
      line:
        po === "high"
          ? "Your team marked this lead as high priority — worth focused time on the floor."
          : `Your team set priority to ${rank} — use that as a ranking signal against other conversations.`,
    });
  }

  const why = ne(mc?.whyMatters);
  if (why) {
    candidates.push({ score: 92, line: why.length > 220 ? `${why.slice(0, 217)}…` : why });
  }

  const pain = ne(mc?.suspectedPain);
  const eg = ne(batchCtx.eventGoal);
  const gl = eg ? goalDisplayTextForCopy(eg) : null;
  if (pain && gl) {
    candidates.push({
      score: 86,
      line: `The pain you captured (${pain}) is a useful hook given your team’s ${gl} objective for this event — pressure-test urgency, owner, and timeline early.`,
    });
  } else if (pain && ne(batchCtx.productFocus)) {
    candidates.push({
      score: 84,
      line: `${pain} is the thread to pull — tie it to ${ne(batchCtx.productFocus)} with a concrete outcome, not features.`,
    });
  } else if (pain) {
    candidates.push({
      score: 80,
      line: `${pain} is the hypothesis — validate who feels it, how expensive it is, and what “fixed” looks like.`,
    });
  }

  const wk = ne(mc?.whatWeKnow);
  if (wk && ne(batchCtx.productFocus)) {
    candidates.push({
      score: 78,
      line: `Start from what you already know (${wk}) and bridge to how ${ne(batchCtx.productFocus)} fits their reality.`,
    });
  } else if (wk) {
    candidates.push({
      score: 76,
      line: `Ground the conversation in what you already know: ${wk} — confirm what’s still true before you pitch.`,
    });
  }

  const persona = ne(batchCtx.targetBuyerPersona);
  const role = resolveLeadTitle(detail);
  if (persona && role) {
    const lens = exhibitorBuyerLensPhrase(persona);
    candidates.push({
      score: 74,
      line: `Compared to ${lens}, the title on file suggests a lead worth qualifying early on fit, authority, and urgency.`,
    });
  }

  if (eg && gl) {
    const desc = legacyGoalDescriptionOptional(eg);
    candidates.push({
      score: 68,
      line: desc
        ? `Your team’s objective for this event is ${gl} (${desc.toLowerCase()}). Judge whether this conversation should end in a clear next step that serves that objective — not a generic handoff.`
        : `Your team’s objective for this event is ${gl}. Use it to steer toward a measurable next step that matches what success means for your booth.`,
    });
  }

  const notes = ne(batchCtx.batchNotes);
  if (notes && notes.length < 200) {
    candidates.push({
      score: 62,
      line: `Strategic note from your team for this batch: ${notes}`,
    });
  }

  const pf = ne(batchCtx.productFocus);
  if (pf && why) {
    candidates.push({
      score: 64,
      line: `Connect ${pf} to the reason this lead matters: ${why.length > 120 ? `${why.slice(0, 117)}…` : why}`,
    });
  }

  for (const line of detail.whyHere) {
    if (!isWeakCsvWhyLine(line)) {
      candidates.push({ score: 45, line });
    }
  }

  let lines = takeTopLines(candidates, 4);

  if (lines.length === 0) {
    const rollup = rollupImportSignals(detail.whyHere);
    if (rollup) lines = [rollup];
  }

  return lines;
}

/** Rep-ready talking points: synthesized; de-emphasizes CSV field dumps when better angles exist. */
export function composeStrategicTalkingPoints(
  detail: BriefingDetailView,
  batchCtx: BatchBriefingContextV1
): { title: string; detail: string }[] {
  const mc = detail.manualContext;
  const points: { title: string; detail: string }[] = [];
  const seenD = new Set<string>();

  const add = (title: string, detailStr: string) => {
    const d = detailStr.trim();
    if (!d || seenD.has(d)) return;
    seenD.add(d);
    points.push({ title, detail: d });
  };

  const companyLabel =
    ne(detail.companySnapshot.name) && detail.companySnapshot.name !== "—"
      ? detail.companySnapshot.name
      : null;
  const industry = ne(detail.enrichment?.industry);

  const pain = ne(mc?.suspectedPain);
  const pf = ne(batchCtx.productFocus);
  if (pain && pf && companyLabel) {
    add(
      "Outcome thread",
      `At ${companyLabel}, anchor on ${pain}. Position ${pf} around the business outcome they’d celebrate — not a feature tour.`
    );
  } else if (pain && pf) {
    add(
      "Outcome thread",
      `Anchor on ${pain}. Position ${pf} around the outcome they’d celebrate — one proof point, one ask.`
    );
  } else if (pain) {
    add("Pain-first angle", `Lead with ${pain} — who owns it, what triggered it now, and what “relief” looks like.`);
  }

  const wk = ne(mc?.whatWeKnow);
  if (wk && companyLabel) {
    add(
      "Company-aware follow-through",
      `You already know ${wk} about ${companyLabel} — validate what’s changed, then tie the next step to their stated priorities.`
    );
  } else if (wk) {
    add(
      "Build on what you already know",
      `Your team captured: ${wk}. Validate what’s still true, then bridge to a concrete next step.`
    );
  }

  const comp = ne(mc?.competitorMentioned);
  if (comp && pf) {
    add(
      "Differentiation angle",
      `${comp} is in the conversation — contrast ${pf} on outcomes and proof they care about, not a knock list.`
    );
  } else if (comp) {
    add(
      "Competitive thread",
      `${comp} is in play — clarify evaluation criteria, timeline, and what would make switching worth the disruption.`
    );
  }

  const persona = ne(batchCtx.targetBuyerPersona);
  const role = resolveLeadTitle(detail);
  if (persona && role) {
    add(
      "Role & influence",
      `Title on file is “${role}” — map that against ${exhibitorBuyerLensPhrase(persona)}: who owns budget, who blocks, and who else should be in the loop.`
    );
  }

  const bn = ne(batchCtx.batchNotes);
  if (bn && pf && companyLabel) {
    add("Strategic tie-in", `${bn} — connect that thread to how ${companyLabel} would measure success with ${pf}.`);
  } else if (bn && pf) {
    add("Strategic tie-in", `${bn} — connect that thread to outcomes with ${pf}.`);
  } else if (bn) {
    add("Strategic tie-in", bn);
  }

  if (industry && pf && companyLabel) {
    add(
      "Industry-aware positioning",
      `${companyLabel} sits in ${industry} — frame ${pf} against how peers in that space buy and measure ROI.`
    );
  }

  if (pf && !pain && !wk) {
    add(
      "Product clarity",
      `Keep ${pf} concrete: one outcome, one proof point, one ask — avoid a generic pitch.`
    );
  }

  const starter = ne(mc?.conversationStarter);
  if (starter) {
    add(
      "Suggested opener",
      `Your team suggested opening with: ${starter} — use it to earn permission to go one level deeper on pain and process.`
    );
  }

  for (const tp of detail.talkingPoints) {
    if (isWeakCsvTalkingPoint(tp)) continue;
    add(tp.title, tp.detail);
  }

  return points.slice(0, 6);
}

/**
 * Prospect-facing discovery questions. Templates are chosen using strategy from Briefing Knowledge as a lens
 * (which questions to prioritize), not as claims about what the prospect wants.
 */
export function composeStrategicQuestions(detail: BriefingDetailView, batchCtx: BatchBriefingContextV1): string[] {
  const questions: string[] = [];
  const seen = new Set<string>();
  const q = (s: string) => {
    const t = s.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    questions.push(t);
  };

  const mc = detail.manualContext;
  const eg = ne(batchCtx.eventGoal);
  const pf = ne(batchCtx.productFocus);
  const role = resolveLeadTitle(detail);

  if (eg && isLegacyEventGoalSlug(eg)) {
    if (eg === "lead_generation") {
      q("What’s weakest in how you capture and qualify leads today — volume, quality, or speed to follow-up?");
    } else if (eg === "pipeline_acceleration") {
      q("Where does this sit in your priorities right now — and what would need to change for you to advance it in the next 30 days?");
    } else if (eg === "product_launch") {
      q("Are you actively looking in this category — what triggered the search, and what would make a new option worth evaluating?");
    } else if (eg === "brand_awareness") {
      q("When you evaluate vendors in this space, what proof do you need before you’d take a real next step?");
    } else if (eg === "customer_engagement") {
      q("What would make the next 90 days noticeably better for your team — and what’s blocking that today?");
    } else if (eg === "partner_development") {
      q("What does a strong partnership need to deliver on your side — economics, integrations, and timing?");
    }
  } else if (eg) {
    const short = eg.length > 120 ? `${eg.slice(0, 117)}…` : eg;
    q(
      `Your team’s stated goal for this event is: “${short}”. What would make this conversation a clear step toward that — and what would you need to see next?`
    );
  }

  if (pf) {
    q(`If ${pf} were a success a year from now, what would be different in your day-to-day work?`);
  }

  const wk = ne(mc?.whatWeKnow);
  if (wk) {
    const wkShort = wk.length > 120 ? `${wk.slice(0, 117)}…` : wk;
    q(`Last your team understood: ${wkShort} — what’s changed since, and what would raise or lower priority?`);
  }

  const pain = ne(mc?.suspectedPain);
  if (pain) {
    q(`When ${pain} shows up, who feels it first — and what would “fixed” look like on their calendar?`);
  }

  const starter = ne(mc?.conversationStarter);
  if (starter) {
    q("What deadline, owner, or dependency is most likely to block progress if you don’t surface it in the first few minutes?");
    q("If they’re not ready to commit, what smaller step would still be worth doing this month?");
  }

  const comp = ne(mc?.competitorMentioned);
  if (comp) {
    q(
      `How are you comparing vendors in this space — including ${comp} — and what would make one choice the easy one?`
    );
  }

  if (ne(batchCtx.targetBuyerPersona)) {
    if (role) {
      q(
        `For someone in a role like ${role}, what usually has to be true for this to become a priority this quarter instead of next year?`
      );
    } else {
      q("What internal hurdle usually slows these initiatives — and whose buy-in actually moves them forward?");
    }
  }

  for (const existing of detail.questionsToAsk) {
    q(existing);
  }

  return questions.slice(0, 10);
}

/** Competitor section — manual competitorMentioned is first-class; no invented weaknesses. */
export function deriveCompetitorContext(detail: BriefingDetailView, batchCtx: BatchBriefingContextV1): string[] {
  const lines: string[] = [];

  const stored = ne(detail.competitorContext);
  if (stored) lines.push(stored);

  const comp = ne(detail.manualContext?.competitorMentioned);
  if (comp) {
    lines.push(
      `${comp} is on the radar — validate how they’re running the bake-off, what “good” looks like, and what would flip their choice.`
    );
    lines.push(
      `Probe: timeline, success criteria, and who owns the decision — not a teardown of the other vendor.`
    );
    lines.push(
      `Position on proof and outcomes your team can stand behind; avoid claiming weaknesses you can’t verify.`
    );
  }

  const notes = ne(batchCtx.batchNotes);
  if (notes) {
    const lower = notes.toLowerCase();
    if (
      lower.includes("compet") ||
      lower.includes("versus") ||
      lower.includes(" vs ") ||
      lower.includes("alternative") ||
      lower.includes("incumbent")
    ) {
      lines.push(`Batch note (competitive thread): ${notes}`);
    }
  }

  return lines;
}

export function deriveSignalsToWatch(detail: BriefingDetailView, batchCtx: BatchBriefingContextV1): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (s: string) => {
    const t = s.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };

  for (const s of detail.signalsToWatch) add(s);

  const mc = detail.manualContext;
  if (mc?.priorityOverride && mc.priorityOverride !== "auto") {
    if (mc.priorityOverride === "high") {
      add("Priority is high — watch for time, attention level, and whether they bring others into the chat.");
    } else {
      add(`Priority set to “${mc.priorityOverride}” — calibrate depth and follow-up accordingly.`);
    }
  }

  const pain = ne(mc?.suspectedPain);
  if (pain) {
    add(`Listen for whether “${pain}” shows up in their language — that confirms the pain is live.`);
  }

  const wk = ne(mc?.whatWeKnow);
  if (wk) {
    add(`Listen for updates to what you think you know: “${wk.length > 80 ? `${wk.slice(0, 77)}…` : wk}”.`);
  }

  const persona = ne(batchCtx.targetBuyerPersona);
  const role = resolveLeadTitle(detail);
  if (persona && role) {
    add(
      `Listen for whether someone in a “${role}” role has the buying power you need for ${exhibitorBuyerLensPhrase(persona)} — and whether they pull others in or decide alone.`
    );
  }

  const eg = ne(batchCtx.eventGoal);
  const gl = eg ? goalDisplayTextForCopy(eg) : null;
  if (gl) {
    add(
      `Listen for cues that this conversation could advance your team’s ${gl} objective — budget signal, timing, and who else is involved.`
    );
  }

  return out;
}

/** Strategic gap analysis — unknown / why it matters / what to ask next. */
export type StrategicGap = {
  gap: string;
  whyItMatters: string;
  probe: string;
};

function strategicGapExhibitorPriority(g: StrategicGap, batchCtx: BatchBriefingContextV1): number {
  const eg = ne(batchCtx.eventGoal);
  const pf = ne(batchCtx.productFocus);
  let w = 0;
  switch (g.gap) {
    case "Urgency & timeline":
      if (eg === "lead_generation" || eg === "pipeline_acceleration") w += 24;
      break;
    case "Decision owner & committee":
      if (eg === "pipeline_acceleration" || eg === "lead_generation") w += 18;
      break;
    case "Success criteria":
      if (eg === "lead_generation" || eg === "brand_awareness") w += 12;
      break;
    case "Budget & approval path":
      if (eg === "pipeline_acceleration") w += 14;
      break;
    case "Current workflow & tools":
    case "Implementation constraints":
      if (pf) w += 10;
      break;
    case "Event-level objective":
    case "Product & positioning anchor":
      w += 30;
      break;
    default:
      break;
  }
  return w;
}

/**
 * Critical discovery unknowns — catalog of sales-relevant gaps; only rows that still look unknown for this lead.
 * Heuristics use manual context length/keywords; they do not invent facts.
 */
export function deriveStrategicGaps(detail: BriefingDetailView, batchCtx: BatchBriefingContextV1): StrategicGap[] {
  const mc = detail.manualContext;
  const wk = ne(mc?.whatWeKnow);
  const pain = ne(mc?.suspectedPain);
  const why = ne(mc?.whyMatters);
  const comp = ne(mc?.competitorMentioned);
  const starter = ne(mc?.conversationStarter);
  const pf = ne(batchCtx.productFocus);
  const eg = ne(batchCtx.eventGoal);

  const wkText = wk ?? "";
  const wkLower = wkText.toLowerCase();
  const hasSubstantialContext = wkText.length >= 40;
  const mentionsWorkflow = /\b(use|using|tool|stack|workflow|process|crm|salesforce|hubspot|system)\b/i.test(wkLower);
  const mentionsTimeline = /\b(q[1-4]|quarter|month|week|deadline|urgent|this year|timeline)\b/i.test(wkLower);
  const mentionsBudget = /\b(budget|cost|price|roi|renewal|contract)\b/i.test(wkLower);
  const mentionsDecision = /\b(cfo|cio|cto|vp|director|committee|stakeholder|owner|approve)\b/i.test(wkLower);

  const catalog: StrategicGap[] = [];

  if (!mentionsWorkflow && !hasSubstantialContext) {
    catalog.push({
      gap: "Current workflow & tools",
      whyItMatters: "Without this, you’re guessing how your offer fits their day-to-day reality.",
      probe: "Walk me through how you handle this today — tools, owners, and where it breaks.",
    });
  }

  if (!pain && !mentionsTimeline) {
    catalog.push({
      gap: "Urgency & timeline",
      whyItMatters: "Timing drives follow-up priority and what proof to bring next.",
      probe: "What happens if this stays as-is for the next quarter — and what would force a decision sooner?",
    });
  }

  if (!mentionsDecision && !hasSubstantialContext) {
    catalog.push({
      gap: "Decision owner & committee",
      whyItMatters: "You need to know who can say yes and who can veto.",
      probe: "Who else weighs in on a change like this — and what do they care about most?",
    });
  }

  if (!mentionsBudget) {
    catalog.push({
      gap: "Budget & approval path",
      whyItMatters: "Even strong fit stalls without a realistic path to fund and approve.",
      probe: "How do you usually fund and approve investments in this category?",
    });
  }

  if (!wk || wkText.length < 35) {
    catalog.push({
      gap: "Success criteria",
      whyItMatters: "You can’t align the pitch to outcomes they actually measure.",
      probe: "If this went perfectly, what would be true 6–12 months from now on your side?",
    });
  }

  if (!pain) {
    catalog.push({
      gap: "Switching trigger",
      whyItMatters: "Knowing the trigger tells you whether this is a live opportunity or a future nurture.",
      probe: "What would have to happen for you to seriously consider switching or adding something new?",
    });
  }

  if (!comp) {
    catalog.push({
      gap: "Incumbent, satisfaction & evaluation stage",
      whyItMatters: "You need both the current stack and how far along they are in any comparison.",
      probe: "What are you using today — what’s working or not — and are you actively comparing alternatives?",
    });
  }

  if (pain && !hasSubstantialContext) {
    catalog.push({
      gap: "Implementation constraints",
      whyItMatters: "Pain without constraints leads to proposals that can’t land internally.",
      probe: "What would make rollout realistic for your team — integrations, security, or resourcing?",
    });
  }

  if (!eg) {
    catalog.push({
      gap: "Event-level objective",
      whyItMatters:
        "Briefing Knowledge (strategy) doesn’t yet define your team’s booth objective — the brief can’t prioritize what ‘success’ means for this import.",
      probe:
        "Sync with your team on the booth objective for this event before you pitch, then align your ask to that definition of success.",
    });
  }

  if (!pf) {
    catalog.push({
      gap: "Product & positioning anchor",
      whyItMatters: "Reps need a crisp outcome to associate with your product after the hall noise fades.",
      probe:
        "Align with your team on the one outcome you want this contact to remember — capture it in Product Focus so the brief stays grounded.",
    });
  }

  if (!starter && (pain || wk)) {
    catalog.push({
      gap: "Opening & permission",
      whyItMatters: "Strong context without a clean opener wastes the first minute.",
      probe:
        "What’s the most expensive consequence of how this works today — and what would ‘good’ look like in the next 90 days?",
    });
  }

  if (!ne(detail.companySnapshot.name) || detail.companySnapshot.name === "—") {
    catalog.push({
      gap: "Account clarity",
      whyItMatters: "Follow-up and research depend on knowing which account and division you met.",
      probe: "Which company, team, and region are you with — and how is your org structured around this problem?",
    });
  }

  const deduped: StrategicGap[] = [];
  const seen = new Set<string>();
  for (const g of catalog) {
    if (seen.has(g.gap)) continue;
    seen.add(g.gap);
    deduped.push(g);
  }
  const indexed = deduped.map((g, i) => ({ g, i }));
  indexed.sort((a, b) => {
    const dw = strategicGapExhibitorPriority(b.g, batchCtx) - strategicGapExhibitorPriority(a.g, batchCtx);
    if (dw !== 0) return dw;
    return a.i - b.i;
  });
  return indexed.map((x) => x.g).slice(0, 10);
}

// --- Legacy names (same modules) for incremental adoption / tests ---

/** @deprecated Use composeWhyTheyMatterHere — returns the composed list, not “extra” lines. */
export function deriveContextWhyHereLines(detail: BriefingDetailView, batchCtx: BatchBriefingContextV1): string[] {
  return composeWhyTheyMatterHere(detail, batchCtx);
}

/** @deprecated Use composeStrategicTalkingPoints */
export function deriveContextTalkingPoints(
  detail: BriefingDetailView,
  batchCtx: BatchBriefingContextV1
): { title: string; detail: string }[] {
  return composeStrategicTalkingPoints(detail, batchCtx);
}

/** @deprecated Use composeStrategicQuestions */
export function deriveContextQuestions(detail: BriefingDetailView, batchCtx: BatchBriefingContextV1): string[] {
  return composeStrategicQuestions(detail, batchCtx);
}

/** @deprecated Use deriveStrategicGaps — old shape removed */
export function deriveWhatWeStillDontKnow(
  detail: BriefingDetailView,
  batchCtx: BatchBriefingContextV1
): { field: string; reason: string }[] {
  return deriveStrategicGaps(detail, batchCtx).map((g) => ({
    field: g.gap,
    reason: `${g.whyItMatters} ${g.probe}`,
  }));
}
