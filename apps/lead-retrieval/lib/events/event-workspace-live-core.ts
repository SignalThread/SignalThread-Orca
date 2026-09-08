/**
 * Pure derivation for the Live state of the canonical Event Workspace.
 *
 * The server loader (`lib/server/event-workspace-live-data.ts`) supplies
 * scoped, bounded rows — or `null` where a query failed — and every visible
 * Live module derives here deterministically:
 *
 * - KPIs carry an explicit `value: number | null`; null renders as
 *   unavailable, never as 0.
 * - Intelligence modules (topics / objections / competitors / buying signals) aggregate the
 *   persisted per-conversation synthesis arrays: deterministic normalization,
 *   junk exclusion, a minimum evidence sample, stable count-then-label
 *   ranking, capped rows, capped evidence. No baselines exist, so no trend
 *   or movement claims are produced.
 * - Operational notices exist only when real processing failures exist.
 * - What Matters Now follows a fixed priority ladder with stable tiebreaks.
 */

import { isNoSpeechConversation } from "@/lib/conversations/conversation-intelligence-read-model";

export type LiveConversationLeadRef = {
  leadId: string;
  leadName: string | null;
  leadCompany: string | null;
};

export type LiveConversationRow = LiveConversationLeadRef & {
  id: string;
  created_at: string;
  summary: string | null;
  transcript?: string | null;
  priority_themes: string[] | null;
  objections: string[] | null;
  competitors_mentioned: string[] | null;
  pain_points: string[] | null;
  buying_signals: string[] | null;
  rep_behavior_patterns: string[] | null;
  transcription_status: string | null;
  synthesis_status: string | null;
  transcription_error?: string | null;
  synthesis_error?: string | null;
};

export type LiveWorkspaceInput = {
  /** Recent conversations for this event (joined through leads), or null on failure. */
  conversations: LiveConversationRow[] | null;
  /** Authoritative event-scoped total, independent of the bounded detail window. */
  totalConversationCount?: number | null;
  /** Head-count of conversations created in the resolved product calendar day, or null. */
  conversationsTodayCount: number | null;
  /** Head-count of leads created in the resolved product calendar day, or null. */
  leadsTodayCount: number | null;
  /** Hot leads (canonical temperature) not closed and due or missing a follow-up, or null. */
  hotNeedingFollowUpCount: number | null;
  /** Follow-ups due today or earlier (not closed), or null. */
  followUpsDueCount: number | null;
  /** Follow-ups due exactly on `todayYmd` (not closed), or null. */
  followUpsDueTodayCount: number | null;
  /** Follow-ups due before `todayYmd` (not closed), or null. */
  followUpsOverdueCount: number | null;
  /** Brief counts for this event's leads, or null when unavailable/unused. */
  briefingCounts: { generated: number; approved: number } | null;
  todayYmd: string;
  hrefs: {
    hotLeads: string;
    followUpsDue: string;
    leads: string;
  };
};

/* ================================ Evidence ================================ */

export type LiveEvidenceRecord = {
  conversationId: string;
  leadId: string;
  leadName: string;
  leadCompany: string | null;
  /** Conversation summary or the matched detail line — human-readable, no IDs. */
  context: string;
  createdAt: string;
};

export type LiveInsightRow = {
  label: string;
  /** Number of distinct conversations mentioning this item. */
  conversationCount: number;
  evidence: LiveEvidenceRecord[];
};

export type LiveInsightModule = {
  key: "topics" | "objections" | "competitors" | "buying_signals";
  title: string;
  /** Completed-event recap metadata; the Live workspace intentionally does not render it. */
  description?: string;
  rows: LiveInsightRow[];
  /** Conversations with completed synthesis backing this module. */
  sampleSize: number;
};

export type LiveCoachingCallout = {
  pattern: string;
  conversationCount: number;
  evidence: LiveEvidenceRecord[];
};

export type LiveOperationalNotice = {
  kind: "processing_failures";
  failedCount: number;
  evidence: LiveEvidenceRecord[];
};

export type LiveIntelligenceCoverage = {
  analyzedCount: number;
  totalCount: number | null;
  isSampled: boolean;
  structuredCount: number;
  legacyCount: number;
};

export type LiveKpi = {
  key: "conversations_today" | "leads_today" | "hot_needing_follow_up" | "follow_ups_due";
  label: string;
  /** Null renders as an explicit unavailable state — never 0. */
  value: number | null;
  display: string;
  href: string | null;
};

export type LiveFollowUpStatus = {
  /** These are independently derived states and may overlap. */
  hotAwaitingFollowUp: number | null;
  dueToday: number | null;
  overdue: number | null;
  actionHref: string;
};

export type LiveWhatMattersNow = {
  key: string;
  title: string;
  body: string;
  actionLabel: string | null;
  actionHref: string | null;
  tone: "action" | "steady";
};

export type LiveWorkspace = {
  whatMattersNow: LiveWhatMattersNow;
  kpis: LiveKpi[];
  modules: LiveInsightModule[];
  followUpStatus: LiveFollowUpStatus;
  operational: LiveOperationalNotice | null;
  intelligenceCoverage: LiveIntelligenceCoverage | null;
};

/* ============================ Normalization ============================ */

const MIN_MODULE_SAMPLE = 3;
const MIN_ITEM_CONVERSATIONS = 2;
const MAX_ROWS_PER_MODULE = 5;
const MAX_EVIDENCE_PER_ROW = 5;
const MAX_COACHING_CALLOUTS = 3;
const MIN_COACHING_CONVERSATIONS = 3;
const MAX_OPERATIONAL_EVIDENCE = 5;

const JUNK_ITEMS = new Set(["", "none", "n/a", "na", "unknown", "not mentioned", "no objections"]);

/** Grouping key: trimmed, whitespace-collapsed, casefolded. */
function normalizeItemKey(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

function displayLabel(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

function isJunkItem(key: string): boolean {
  return key.length < 3 || JUNK_ITEMS.has(key);
}

function synthesisCompleted(row: LiveConversationRow): boolean {
  return String(row.synthesis_status ?? "").trim().toLowerCase() === "completed";
}

function hasStructuredIntelligence(row: LiveConversationRow): boolean {
  return [
    row.priority_themes,
    row.competitors_mentioned,
    row.pain_points,
    row.buying_signals,
    row.rep_behavior_patterns
  ].some((items) => Array.isArray(items) && items.some((item) => String(item ?? "").trim().length > 0));
}

function evidenceFromConversation(row: LiveConversationRow, context: string): LiveEvidenceRecord {
  return {
    conversationId: row.id,
    leadId: row.leadId,
    leadName: String(row.leadName ?? "").trim() || "Lead",
    leadCompany: row.leadCompany ? String(row.leadCompany).trim() || null : null,
    context,
    createdAt: row.created_at
  };
}

function compareLabels(a: string, b: string): number {
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  if (al < bl) return -1;
  if (al > bl) return 1;
  return 0;
}

/**
 * Aggregate one persisted array field across conversations into ranked,
 * evidence-backed rows. Deterministic: count desc, then label A–Z.
 */
export type AggregatableConversationField =
  | "priority_themes"
  | "objections"
  | "competitors_mentioned"
  | "pain_points"
  | "buying_signals";

export function aggregateConversationField(
  conversations: LiveConversationRow[],
  field: AggregatableConversationField,
  sampleSize: number
): LiveInsightRow[] {
  type Bucket = { label: string; conversationIds: Set<string>; evidence: LiveEvidenceRecord[] };
  const buckets = new Map<string, Bucket>();

  for (const row of conversations) {
    if (!synthesisCompleted(row)) continue;
    const items = row[field];
    if (!Array.isArray(items)) continue;
    const seenInRow = new Set<string>();
    for (const raw of items) {
      if (typeof raw !== "string") continue;
      const key = normalizeItemKey(raw);
      if (isJunkItem(key) || seenInRow.has(key)) continue;
      seenInRow.add(key);
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { label: displayLabel(raw), conversationIds: new Set(), evidence: [] };
        buckets.set(key, bucket);
      }
      bucket.conversationIds.add(row.id);
      if (bucket.evidence.length < MAX_EVIDENCE_PER_ROW) {
        const context = String(row.summary ?? "").trim() || displayLabel(raw);
        bucket.evidence.push(evidenceFromConversation(row, context));
      }
    }
  }

  if (sampleSize < MIN_MODULE_SAMPLE) return [];

  return [...buckets.values()]
    .filter((bucket) => bucket.conversationIds.size >= MIN_ITEM_CONVERSATIONS)
    .map((bucket) => ({
      label: bucket.label,
      conversationCount: bucket.conversationIds.size,
      evidence: bucket.evidence
    }))
    .sort((a, b) => b.conversationCount - a.conversationCount || compareLabels(a.label, b.label))
    .slice(0, MAX_ROWS_PER_MODULE);
}

/* ============================== Derivation ============================== */

export function deriveLiveWorkspace(input: LiveWorkspaceInput): LiveWorkspace {
  const conversations = input.conversations;
  const synthesized = conversations?.filter(synthesisCompleted) ?? [];
  const sampleSize = synthesized.length;
  const intelligenceCoverage: LiveIntelligenceCoverage | null =
    conversations === null
      ? null
      : {
          analyzedCount: sampleSize,
          totalCount: input.totalConversationCount ?? null,
          isSampled: input.totalConversationCount != null && input.totalConversationCount > conversations.length,
          structuredCount: synthesized.filter(hasStructuredIntelligence).length,
          legacyCount: synthesized.filter((row) => !hasStructuredIntelligence(row)).length
        };

  /* ------------------------------ Modules ------------------------------ */

  const moduleDefs: Array<{
    key: LiveInsightModule["key"];
    title: string;
    field: "priority_themes" | "objections" | "competitors_mentioned" | "buying_signals";
  }> = [
    {
      key: "topics",
      title: "Emerging topics",
      field: "priority_themes"
    },
    {
      key: "objections",
      title: "Rising objections",
      field: "objections"
    },
    {
      key: "competitors",
      title: "Competitor mentions",
      field: "competitors_mentioned"
    },
    {
      key: "buying_signals",
      title: "Messaging that’s resonating",
      field: "buying_signals"
    }
  ];

  const modules: LiveInsightModule[] = [];
  if (conversations !== null) {
    for (const def of moduleDefs) {
      const rows = aggregateConversationField(conversations, def.field, sampleSize);
      if (rows.length > 0) {
        modules.push({ key: def.key, title: def.title, rows, sampleSize });
      }
    }
  }

  /* ---------------------------- Operational ---------------------------- */

  let operational: LiveOperationalNotice | null = null;
  if (conversations !== null) {
    const failed = conversations.filter(
      (row) =>
        !isNoSpeechConversation(row) &&
        (String(row.transcription_status ?? "").trim().toLowerCase() === "failed" ||
          String(row.synthesis_status ?? "").trim().toLowerCase() === "failed")
    );
    if (failed.length > 0) {
      operational = {
        kind: "processing_failures",
        failedCount: failed.length,
        evidence: failed
          .slice(0, MAX_OPERATIONAL_EVIDENCE)
          .map((row) => evidenceFromConversation(row, "Recording failed to process."))
      };
    }
  }

  /* ------------------------------- KPIs ------------------------------- */

  const kpis: LiveKpi[] = [
    {
      key: "conversations_today",
      label: "Conversations today",
      value: input.conversationsTodayCount,
      display: input.conversationsTodayCount === null ? "—" : String(input.conversationsTodayCount),
      href: null
    },
    {
      key: "leads_today",
      label: "Leads today",
      value: input.leadsTodayCount,
      display: input.leadsTodayCount === null ? "—" : String(input.leadsTodayCount),
      href: input.leadsTodayCount === null ? null : input.hrefs.leads
    },
    {
      key: "hot_needing_follow_up",
      label: "Hot leads",
      value: input.hotNeedingFollowUpCount,
      display: input.hotNeedingFollowUpCount === null ? "—" : String(input.hotNeedingFollowUpCount),
      href: input.hotNeedingFollowUpCount === null ? null : input.hrefs.hotLeads
    },
    {
      key: "follow_ups_due",
      label: "Follow-ups due",
      value: input.followUpsDueCount,
      display: input.followUpsDueCount === null ? "—" : String(input.followUpsDueCount),
      href: input.followUpsDueCount === null ? null : input.hrefs.followUpsDue
    }
  ];

  /* ------------------------- What Matters Now ------------------------- */
  // Fixed ladder (audit §17): hot-without-follow-up → overdue → processing
  // failures → top emerging theme → steady state.

  let whatMattersNow: LiveWhatMattersNow;
  const hotCount = input.hotNeedingFollowUpCount;
  const dueCount = input.followUpsDueCount;
  const topicsModule = modules.find((m) => m.key === "topics") ?? null;

  if (hotCount === null || dueCount === null) {
    whatMattersNow = {
      key: "metrics_unavailable",
      title: "Follow-up status is unavailable",
      body: "Some live dashboard metrics could not be loaded. Refresh to try again; no all-clear is being inferred.",
      actionLabel: null,
      actionHref: null,
      tone: "action"
    };
  } else if (hotCount > 0) {
    whatMattersNow = {
      key: "hot_needing_follow_up",
      title: `${hotCount} hot ${hotCount === 1 ? "lead needs" : "leads need"} a follow-up`,
      body: "These open hot leads have no scheduled follow-up or are already due.",
      actionLabel: `Follow up ${hotCount} hot`,
      actionHref: input.hrefs.hotLeads,
      tone: "action"
    };
  } else if (dueCount !== null && dueCount > 0) {
    whatMattersNow = {
      key: "follow_ups_overdue",
      title: `${dueCount} follow-${dueCount === 1 ? "up is" : "ups are"} due`,
      body: "These open follow-ups are due today or are overdue.",
      actionLabel: "Open follow-up queue",
      actionHref: input.hrefs.followUpsDue,
      tone: "action"
    };
  } else if (operational !== null) {
    whatMattersNow = {
      key: "processing_failures",
      title: `${operational.failedCount} ${operational.failedCount === 1 ? "recording" : "recordings"} failed to process`,
      body: "Captured audio did not finish processing for these event conversations.",
      actionLabel: null,
      actionHref: null,
      tone: "action"
    };
  } else if (topicsModule !== null && topicsModule.rows.length > 0) {
    const top = topicsModule.rows[0];
    whatMattersNow = {
      key: "top_topic",
      title: `“${top.label}” is the leading topic on the floor`,
      body: `Mentioned in ${top.conversationCount} captured conversations so far.`,
      actionLabel: null,
      actionHref: null,
      tone: "steady"
    };
  } else {
    const parts: string[] = [];
    if (input.conversationsTodayCount !== null) {
      parts.push(`${input.conversationsTodayCount} ${input.conversationsTodayCount === 1 ? "conversation" : "conversations"}`);
    }
    if (input.leadsTodayCount !== null) {
      parts.push(`${input.leadsTodayCount} ${input.leadsTodayCount === 1 ? "lead" : "leads"}`);
    }
    whatMattersNow = {
      key: "steady",
      title: "You're on top of the floor",
      body:
        parts.length > 0
          ? `${parts.join(" and ")} captured today, and nothing is waiting on a follow-up.`
          : "Nothing is waiting on a follow-up right now.",
      actionLabel: null,
      actionHref: null,
      tone: "steady"
    };
  }

  return {
    whatMattersNow,
    kpis,
    modules,
    followUpStatus: {
      hotAwaitingFollowUp: input.hotNeedingFollowUpCount,
      dueToday: input.followUpsDueTodayCount,
      overdue: input.followUpsOverdueCount,
      actionHref: input.hrefs.followUpsDue
    },
    operational,
    intelligenceCoverage
  };
}

/** Recurring rep behavior observations — factual patterns only, no scores. */
export function aggregateRepPatterns(conversations: LiveConversationRow[]): LiveCoachingCallout[] {
  type Bucket = { label: string; conversationIds: Set<string>; evidence: LiveEvidenceRecord[] };
  const buckets = new Map<string, Bucket>();

  for (const row of conversations) {
    if (!synthesisCompleted(row)) continue;
    const items = row.rep_behavior_patterns;
    if (!Array.isArray(items)) continue;
    const seenInRow = new Set<string>();
    for (const raw of items) {
      if (typeof raw !== "string") continue;
      const key = normalizeItemKey(raw);
      if (isJunkItem(key) || seenInRow.has(key)) continue;
      seenInRow.add(key);
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { label: displayLabel(raw), conversationIds: new Set(), evidence: [] };
        buckets.set(key, bucket);
      }
      bucket.conversationIds.add(row.id);
      if (bucket.evidence.length < MAX_EVIDENCE_PER_ROW) {
        const context = String(row.summary ?? "").trim() || displayLabel(raw);
        bucket.evidence.push(evidenceFromConversation(row, context));
      }
    }
  }

  return [...buckets.values()]
    .filter((bucket) => bucket.conversationIds.size >= MIN_COACHING_CONVERSATIONS)
    .map((bucket) => ({
      pattern: bucket.label,
      conversationCount: bucket.conversationIds.size,
      evidence: bucket.evidence
    }))
    .sort((a, b) => b.conversationCount - a.conversationCount || compareLabels(a.pattern, b.pattern))
    .slice(0, MAX_COACHING_CALLOUTS);
}
