import type { createAdminClient } from "@/lib/supabase/admin";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

type ConversationLifecycleStatus = "healthy" | "warning" | "critical" | "unknown";
type IssueSeverity = "warning" | "critical";
type ReadinessMismatchCategory = keyof LeadRetrievalConversationLifecycleHealth["readinessMismatchCounts"];
type ReadinessMismatchAgeStats = {
  total: number;
  last24h: number;
  last7d: number;
  newestAffectedAt: string | null;
  oldestAffectedAt: string | null;
};

export type LeadRetrievalConversationLifecycleHealth = {
  product: "lead-retrieval";
  check: "conversation-lifecycle";
  status: ConversationLifecycleStatus;
  checkedAt: string;
  staleTranscriptionPendingOrProcessing: {
    count: number;
    thresholdMinutes: number;
  };
  completedTranscriptPendingSynthesis: {
    count: number;
    thresholdMinutes: number;
  };
  readinessMismatchCounts: {
    missingReadinessForConversation: number;
    readinessWithoutConversation: number;
    transcriptCompleteButReadinessNotReady: number;
    synthesisCompleteButReadinessNotReady: number;
  };
  readinessMismatchesLast24h: number;
  readinessMismatchesLast7d: number;
  newestReadinessMismatchAt: string | null;
  oldestReadinessMismatchAt: string | null;
  readinessMismatchActivityByCategory: Record<
    keyof LeadRetrievalConversationLifecycleHealth["readinessMismatchCounts"],
    ReadinessMismatchAgeStats
  >;
  workflowWaitsByReason: Array<{
    reason: string;
    count: number;
    oldestWaitStartedAt: string | null;
  }>;
  conversationCounts: {
    total: number;
    transcriptionPending: number;
    transcriptionProcessing: number;
    transcriptionCompleted: number;
    transcriptionFailed: number;
    synthesisPending: number;
    synthesisProcessing: number;
    synthesisCompleted: number;
    synthesisFailed: number;
  };
  issues: Array<{
    code: string;
    severity: IssueSeverity;
    message: string;
    count?: number;
  }>;
};

type ConversationHealthRow = {
  id: string | null;
  lead_id: string | null;
  conversation_version: number | null;
  transcription_status: string | null;
  synthesis_status: string | null;
  created_at: string | null;
  transcribed_at: string | null;
  synthesized_at: string | null;
};

type ReadinessHealthRow = {
  lead_id: string | null;
  latest_conversation_version: number | null;
  transcript_status: string | null;
  transcript_version: number | null;
  insights_status: string | null;
  insights_version: number | null;
  created_at: string | null;
  updated_at: string | null;
};

type WorkflowWaitHealthRow = {
  status: string | null;
  waiting_reason: string | null;
  wait_started_at: string | null;
  created_at: string | null;
};

export const STALE_TRANSCRIPTION_MINUTES = 15;
export const STALE_SYNTHESIS_MINUTES = 15;
export const WORKFLOW_WAIT_STALE_MINUTES = 15;
export const CRITICAL_STALE_COUNT = 5;
export const CRITICAL_MISMATCH_COUNT = 5;
export const CRITICAL_WORKFLOW_WAIT_COUNT = 5;
export const READINESS_MISMATCH_RECENT_HOURS = 24;
export const READINESS_MISMATCH_LOOKBACK_DAYS = 7;

const CONVERSATION_WAIT_REASONS = [
  "waiting_for_audio_transcript",
  "waiting_for_conversation_insights"
] as const;

const WORKFLOW_STEP_WAIT_STATUSES = [
  "waiting",
  "waiting_for_audio_transcript",
  "waiting_for_conversation_insights"
] as const;

export async function getLeadRetrievalConversationLifecycleHealth(input: {
  supabase: SupabaseAdmin;
  nowIso?: string;
}): Promise<LeadRetrievalConversationLifecycleHealth> {
  const checkedAt = input.nowIso ?? new Date().toISOString();
  const staleTranscriptionCutoff = minutesBeforeIso(checkedAt, STALE_TRANSCRIPTION_MINUTES);
  const staleSynthesisCutoff = minutesBeforeIso(checkedAt, STALE_SYNTHESIS_MINUTES);
  const staleWorkflowWaitCutoff = minutesBeforeIso(checkedAt, WORKFLOW_WAIT_STALE_MINUTES);

  const [conversationResult, readinessResult, waitResult] = await Promise.all([
    loadConversationRows(input.supabase),
    loadReadinessRows(input.supabase),
    loadWorkflowWaitRows(input.supabase)
  ]);

  const conversations = conversationResult;
  const readinessRows = readinessResult;
  const waitRows = waitResult;

  const conversationCounts = emptyConversationCounts();
  let staleTranscriptionCount = 0;
  let completedTranscriptPendingSynthesisCount = 0;
  const conversationLeadIds = new Set<string>();
  const latestConversationByLead = new Map<string, ConversationHealthRow>();

  for (const row of conversations) {
    const transcriptionStatus = normalize(row.transcription_status);
    const synthesisStatus = normalize(row.synthesis_status);
    conversationCounts.total += 1;
    incrementConversationStatus(conversationCounts, "transcription", transcriptionStatus);
    incrementConversationStatus(conversationCounts, "synthesis", synthesisStatus);

    if (
      (transcriptionStatus === "pending" || transcriptionStatus === "processing") &&
      isAtOrBefore(row.created_at, staleTranscriptionCutoff)
    ) {
      staleTranscriptionCount += 1;
    }

    if (
      transcriptionStatus === "completed" &&
      (synthesisStatus === "pending" || synthesisStatus === "processing") &&
      isAtOrBefore(row.transcribed_at, staleSynthesisCutoff)
    ) {
      completedTranscriptPendingSynthesisCount += 1;
    }

    const leadId = normalizeId(row.lead_id);
    if (!leadId) continue;
    conversationLeadIds.add(leadId);
    const existing = latestConversationByLead.get(leadId);
    if (!existing || compareConversationRecency(row, existing) > 0) {
      latestConversationByLead.set(leadId, row);
    }
  }

  const readinessByLead = new Map<string, ReadinessHealthRow>();
  for (const row of readinessRows) {
    const leadId = normalizeId(row.lead_id);
    if (leadId) readinessByLead.set(leadId, row);
  }

  const transcriptPresenceCandidateIds: string[] = [];
  const summaryPresenceCandidateIds: string[] = [];
  for (const [leadId, conversation] of latestConversationByLead.entries()) {
    const readiness = readinessByLead.get(leadId);
    if (!readiness) continue;
    const conversationId = normalizeId(conversation.id);
    if (!conversationId) continue;
    const conversationVersion = positiveInt(conversation.conversation_version);

    if (normalize(conversation.transcription_status) === "completed") {
      const transcriptVersion = positiveInt(readiness.transcript_version);
      if (
        normalize(readiness.transcript_status) !== "ready" ||
        !versionCoversLatest(transcriptVersion, conversationVersion)
      ) {
        transcriptPresenceCandidateIds.push(conversationId);
      }
    }

    if (normalize(conversation.synthesis_status) === "completed") {
      const insightsVersion = positiveInt(readiness.insights_version);
      if (
        normalize(readiness.insights_status) !== "ready" ||
        !versionCoversLatest(insightsVersion, conversationVersion)
      ) {
        summaryPresenceCandidateIds.push(conversationId);
      }
    }
  }

  const [conversationIdsWithTranscript, conversationIdsWithSummary] = await Promise.all([
    loadConversationIdsWithNonEmptyColumn(input.supabase, "transcript", transcriptPresenceCandidateIds),
    loadConversationIdsWithNonEmptyColumn(input.supabase, "summary", summaryPresenceCandidateIds)
  ]);

  const readinessMismatchCounts = {
    missingReadinessForConversation: 0,
    readinessWithoutConversation: 0,
    transcriptCompleteButReadinessNotReady: 0,
    synthesisCompleteButReadinessNotReady: 0
  };
  const readinessMismatchDates = emptyReadinessMismatchDates();

  for (const leadId of conversationLeadIds) {
    if (!readinessByLead.has(leadId)) {
      readinessMismatchCounts.missingReadinessForConversation += 1;
      const conversation = latestConversationByLead.get(leadId);
      pushReadinessMismatchDate(
        readinessMismatchDates,
        "missingReadinessForConversation",
        latestConversationLifecycleAt(conversation)
      );
    }
  }

  for (const [leadId, readiness] of readinessByLead.entries()) {
    if (!conversationLeadIds.has(leadId)) {
      readinessMismatchCounts.readinessWithoutConversation += 1;
      pushReadinessMismatchDate(
        readinessMismatchDates,
        "readinessWithoutConversation",
        latestReadinessTouchedAt(readiness)
      );
    }
  }

  for (const [leadId, conversation] of latestConversationByLead.entries()) {
    const readiness = readinessByLead.get(leadId);
    if (!readiness) continue;

    const conversationVersion = positiveInt(conversation.conversation_version);
    const conversationId = normalizeId(conversation.id);
    if (normalize(conversation.transcription_status) === "completed") {
      const transcriptVersion = positiveInt(readiness.transcript_version);
      if (
        conversationId &&
        conversationIdsWithTranscript.has(conversationId) &&
        (normalize(readiness.transcript_status) !== "ready" ||
          !versionCoversLatest(transcriptVersion, conversationVersion))
      ) {
        readinessMismatchCounts.transcriptCompleteButReadinessNotReady += 1;
        pushReadinessMismatchDate(
          readinessMismatchDates,
          "transcriptCompleteButReadinessNotReady",
          latestMismatchTouchedAt(conversation, readiness)
        );
      }
    }

    if (normalize(conversation.synthesis_status) === "completed") {
      const insightsVersion = positiveInt(readiness.insights_version);
      if (
        conversationId &&
        conversationIdsWithSummary.has(conversationId) &&
        (normalize(readiness.insights_status) !== "ready" ||
          !versionCoversLatest(insightsVersion, conversationVersion))
      ) {
        readinessMismatchCounts.synthesisCompleteButReadinessNotReady += 1;
        pushReadinessMismatchDate(
          readinessMismatchDates,
          "synthesisCompleteButReadinessNotReady",
          latestMismatchTouchedAt(conversation, readiness)
        );
      }
    }
  }

  const readinessMismatchActivityByCategory = buildReadinessMismatchActivity(
    readinessMismatchDates,
    checkedAt
  );
  const readinessMismatchActivity = buildReadinessMismatchTotals(
    readinessMismatchActivityByCategory
  );

  const workflowWaitsByReason = buildWorkflowWaitsByReason(waitRows);
  const totalWorkflowWaits = workflowWaitsByReason.reduce((sum, row) => sum + row.count, 0);
  const oldestWorkflowWait = minIso(workflowWaitsByReason.map((row) => row.oldestWaitStartedAt));
  const hasStaleWorkflowWait =
    oldestWorkflowWait !== null && isAtOrBefore(oldestWorkflowWait, staleWorkflowWaitCutoff);

  const issues: LeadRetrievalConversationLifecycleHealth["issues"] = [];
  pushCountIssue(issues, {
    code: "stale_transcription_pending_or_processing",
    count: staleTranscriptionCount,
    warningMessage: "Recordings are pending or processing beyond the transcription health threshold.",
    criticalMessage: "Multiple recordings are stuck pending or processing transcription.",
    criticalAt: CRITICAL_STALE_COUNT
  });
  pushCountIssue(issues, {
    code: "completed_transcript_pending_synthesis",
    count: completedTranscriptPendingSynthesisCount,
    warningMessage: "Completed transcripts are waiting for insight synthesis beyond the health threshold.",
    criticalMessage: "Multiple completed transcripts are stuck before insight synthesis.",
    criticalAt: CRITICAL_STALE_COUNT
  });

  const mismatchTotal = Object.values(readinessMismatchCounts).reduce((sum, count) => sum + count, 0);
  pushReadinessMismatchIssue(issues, {
    total: mismatchTotal,
    last24h: readinessMismatchActivity.last24h,
    last7d: readinessMismatchActivity.last7d
  });

  if (totalWorkflowWaits > 0) {
    issues.push({
      code: hasStaleWorkflowWait ? "stale_workflow_conversation_waits" : "workflow_conversation_waits",
      severity:
        hasStaleWorkflowWait || totalWorkflowWaits >= CRITICAL_WORKFLOW_WAIT_COUNT
          ? "critical"
          : "warning",
      message: hasStaleWorkflowWait
        ? "Workflow steps are waiting on conversation readiness beyond the health threshold."
        : "Workflow steps are currently waiting on conversation readiness.",
      count: totalWorkflowWaits
    });
  }

  return {
    product: "lead-retrieval",
    check: "conversation-lifecycle",
    status: deriveStatus(issues),
    checkedAt,
    staleTranscriptionPendingOrProcessing: {
      count: staleTranscriptionCount,
      thresholdMinutes: STALE_TRANSCRIPTION_MINUTES
    },
    completedTranscriptPendingSynthesis: {
      count: completedTranscriptPendingSynthesisCount,
      thresholdMinutes: STALE_SYNTHESIS_MINUTES
    },
    readinessMismatchCounts,
    readinessMismatchesLast24h: readinessMismatchActivity.last24h,
    readinessMismatchesLast7d: readinessMismatchActivity.last7d,
    newestReadinessMismatchAt: readinessMismatchActivity.newestAffectedAt,
    oldestReadinessMismatchAt: readinessMismatchActivity.oldestAffectedAt,
    readinessMismatchActivityByCategory,
    workflowWaitsByReason,
    conversationCounts,
    issues
  };
}

async function loadConversationRows(supabase: SupabaseAdmin): Promise<ConversationHealthRow[]> {
  return loadAllHealthRows<ConversationHealthRow>({
    supabase,
    table: "lead_conversations",
    select:
      "id, lead_id, conversation_version, transcription_status, synthesis_status, created_at, transcribed_at, synthesized_at",
    errorMessage: "Failed to load conversation lifecycle aggregate source."
  });
}

async function loadConversationIdsWithNonEmptyColumn(
  supabase: SupabaseAdmin,
  column: "transcript" | "summary",
  conversationIds: string[]
): Promise<Set<string>> {
  const uniqueIds = [...new Set(conversationIds.map((id) => id.trim()).filter(Boolean))];
  const idsWithContent = new Set<string>();

  for (let index = 0; index < uniqueIds.length; index += 500) {
    const chunk = uniqueIds.slice(index, index + 500);
    if (chunk.length === 0) continue;
    const { data, error } = await (supabase as any)
      .from("lead_conversations")
      .select("id")
      .in("id", chunk)
      .not(column, "is", null)
      .neq(column, "");

    if (error) {
      throw new Error("Failed to load conversation content presence aggregate source.");
    }

    for (const row of data ?? []) {
      const id = normalizeId(row.id);
      if (id) idsWithContent.add(id);
    }
  }

  return idsWithContent;
}

async function loadReadinessRows(supabase: SupabaseAdmin): Promise<ReadinessHealthRow[]> {
  return loadAllHealthRows<ReadinessHealthRow>({
    supabase,
    table: "lead_conversation_readiness",
    select:
      "lead_id, latest_conversation_version, transcript_status, transcript_version, insights_status, insights_version, created_at, updated_at",
    errorMessage: "Failed to load conversation readiness aggregate source."
  });
}

async function loadWorkflowWaitRows(supabase: SupabaseAdmin): Promise<WorkflowWaitHealthRow[]> {
  const rows = await loadAllHealthRows<WorkflowWaitHealthRow>({
    supabase,
    table: "workflow_step_runs",
    select: "status, waiting_reason, wait_started_at, created_at",
    configure: (query) => query.in("status", [...WORKFLOW_STEP_WAIT_STATUSES]),
    errorMessage: "Failed to load workflow wait aggregate source."
  });

  return rows.filter((row) => {
    const reason = normalizeWaitReason(row);
    return reason !== null;
  });
}

async function loadAllHealthRows<T>(input: {
  supabase: SupabaseAdmin;
  table: string;
  select: string;
  configure?: (query: any) => any;
  errorMessage: string;
}): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const baseQuery = (input.supabase as any).from(input.table).select(input.select);
    const filteredQuery = input.configure ? input.configure(baseQuery) : baseQuery;
    const { data, error } = await filteredQuery.range(from, to);

    if (error) {
      throw new Error(input.errorMessage);
    }

    const page = (data ?? []) as T[];
    rows.push(...page);

    if (page.length < pageSize) {
      return rows;
    }
  }
}

function buildWorkflowWaitsByReason(rows: WorkflowWaitHealthRow[]) {
  const byReason = new Map<string, { count: number; oldestWaitStartedAt: string | null }>();

  for (const row of rows) {
    const reason = normalizeWaitReason(row);
    if (!reason) continue;
    const waitStartedAt = normalizedIso(row.wait_started_at) ?? normalizedIso(row.created_at);
    const current = byReason.get(reason) ?? { count: 0, oldestWaitStartedAt: null };
    byReason.set(reason, {
      count: current.count + 1,
      oldestWaitStartedAt: minIso([current.oldestWaitStartedAt, waitStartedAt])
    });
  }

  return [...byReason.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([reason, value]) => ({
      reason,
      count: value.count,
      oldestWaitStartedAt: value.oldestWaitStartedAt
    }));
}

function normalizeWaitReason(row: WorkflowWaitHealthRow) {
  const waitingReason = normalize(row.waiting_reason);
  if ((CONVERSATION_WAIT_REASONS as readonly string[]).includes(waitingReason)) {
    return waitingReason;
  }

  const status = normalize(row.status);
  if ((CONVERSATION_WAIT_REASONS as readonly string[]).includes(status)) {
    return status;
  }

  return null;
}

function emptyConversationCounts(): LeadRetrievalConversationLifecycleHealth["conversationCounts"] {
  return {
    total: 0,
    transcriptionPending: 0,
    transcriptionProcessing: 0,
    transcriptionCompleted: 0,
    transcriptionFailed: 0,
    synthesisPending: 0,
    synthesisProcessing: 0,
    synthesisCompleted: 0,
    synthesisFailed: 0
  };
}

function incrementConversationStatus(
  counts: LeadRetrievalConversationLifecycleHealth["conversationCounts"],
  kind: "transcription" | "synthesis",
  status: string
) {
  const prefix = kind === "transcription" ? "transcription" : "synthesis";
  if (status === "pending") counts[`${prefix}Pending` as keyof typeof counts] += 1;
  if (status === "processing") counts[`${prefix}Processing` as keyof typeof counts] += 1;
  if (status === "completed") counts[`${prefix}Completed` as keyof typeof counts] += 1;
  if (status === "failed") counts[`${prefix}Failed` as keyof typeof counts] += 1;
}

function pushCountIssue(
  issues: LeadRetrievalConversationLifecycleHealth["issues"],
  input: {
    code: string;
    count: number;
    warningMessage: string;
    criticalMessage: string;
    criticalAt: number;
  }
) {
  if (input.count <= 0) return;
  const critical = input.count >= input.criticalAt;
  issues.push({
    code: input.code,
    severity: critical ? "critical" : "warning",
    message: critical ? input.criticalMessage : input.warningMessage,
    count: input.count
  });
}

function pushReadinessMismatchIssue(
  issues: LeadRetrievalConversationLifecycleHealth["issues"],
  input: {
    total: number;
    last24h: number;
    last7d: number;
  }
) {
  if (input.total <= 0) return;

  if (input.last24h > 0 || input.last7d > 0) {
    issues.push({
      code: "conversation_readiness_recent_mismatch",
      severity: "warning",
      message: "Conversation readiness aggregates have recent drift that should be reviewed.",
      count: Math.max(input.last24h, input.last7d)
    });
    return;
  }

  issues.push({
    code: "conversation_readiness_historical_mismatch",
    severity: "warning",
    message: "Conversation readiness aggregates have historical drift, but no recent growth was detected.",
    count: input.total
  });
}

function deriveStatus(issues: Array<{ severity: IssueSeverity }>): ConversationLifecycleStatus {
  if (issues.some((issue) => issue.severity === "critical")) return "critical";
  if (issues.some((issue) => issue.severity === "warning")) return "warning";
  return "healthy";
}

function compareConversationRecency(a: ConversationHealthRow, b: ConversationHealthRow) {
  const aVersion = positiveInt(a.conversation_version);
  const bVersion = positiveInt(b.conversation_version);
  if (aVersion !== null || bVersion !== null) {
    return (aVersion ?? 0) - (bVersion ?? 0);
  }
  return String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));
}

function emptyReadinessMismatchDates(): Record<ReadinessMismatchCategory, string[]> {
  return {
    missingReadinessForConversation: [],
    readinessWithoutConversation: [],
    transcriptCompleteButReadinessNotReady: [],
    synthesisCompleteButReadinessNotReady: []
  };
}

function pushReadinessMismatchDate(
  dates: Record<ReadinessMismatchCategory, string[]>,
  category: ReadinessMismatchCategory,
  value: string | null
) {
  const iso = normalizedIso(value);
  if (iso) dates[category].push(iso);
}

function buildReadinessMismatchActivity(
  datesByCategory: Record<ReadinessMismatchCategory, string[]>,
  checkedAt: string
): LeadRetrievalConversationLifecycleHealth["readinessMismatchActivityByCategory"] {
  return {
    missingReadinessForConversation: buildReadinessMismatchDateStats(
      datesByCategory.missingReadinessForConversation,
      checkedAt
    ),
    readinessWithoutConversation: buildReadinessMismatchDateStats(
      datesByCategory.readinessWithoutConversation,
      checkedAt
    ),
    transcriptCompleteButReadinessNotReady: buildReadinessMismatchDateStats(
      datesByCategory.transcriptCompleteButReadinessNotReady,
      checkedAt
    ),
    synthesisCompleteButReadinessNotReady: buildReadinessMismatchDateStats(
      datesByCategory.synthesisCompleteButReadinessNotReady,
      checkedAt
    )
  };
}

function buildReadinessMismatchDateStats(
  dates: string[],
  checkedAt: string
): ReadinessMismatchAgeStats {
  return {
    total: dates.length,
    last24h: dates.filter((date) =>
      isWithinLookback(date, checkedAt, READINESS_MISMATCH_RECENT_HOURS * 60 * 60_000)
    ).length,
    last7d: dates.filter((date) =>
      isWithinLookback(date, checkedAt, READINESS_MISMATCH_LOOKBACK_DAYS * 24 * 60 * 60_000)
    ).length,
    newestAffectedAt: maxIso(dates),
    oldestAffectedAt: minIso(dates)
  };
}

function buildReadinessMismatchTotals(
  byCategory: LeadRetrievalConversationLifecycleHealth["readinessMismatchActivityByCategory"]
): ReadinessMismatchAgeStats {
  const statsList = Object.values(byCategory);
  return {
    total: statsList.reduce((sum, stats) => sum + stats.total, 0),
    last24h: statsList.reduce((sum, stats) => sum + stats.last24h, 0),
    last7d: statsList.reduce((sum, stats) => sum + stats.last7d, 0),
    newestAffectedAt: maxIso(statsList.map((stats) => stats.newestAffectedAt)),
    oldestAffectedAt: minIso(statsList.map((stats) => stats.oldestAffectedAt))
  };
}

function latestMismatchTouchedAt(
  conversation: ConversationHealthRow,
  readiness: ReadinessHealthRow
) {
  return maxIso([
    latestConversationLifecycleAt(conversation),
    latestReadinessTouchedAt(readiness)
  ]);
}

function latestConversationLifecycleAt(row: ConversationHealthRow | undefined) {
  if (!row) return null;
  return maxIso([row.created_at, row.transcribed_at, row.synthesized_at]);
}

function latestReadinessTouchedAt(row: ReadinessHealthRow) {
  return maxIso([row.updated_at, row.created_at]);
}

function versionCoversLatest(currentVersion: number | null, conversationVersion: number | null) {
  if (conversationVersion === null) return currentVersion !== null;
  return currentVersion !== null && currentVersion >= conversationVersion;
}

function minutesBeforeIso(nowIso: string, minutes: number) {
  return new Date(new Date(nowIso).getTime() - minutes * 60_000).toISOString();
}

function isAtOrBefore(value: string | null | undefined, cutoffIso: string) {
  const iso = normalizedIso(value);
  if (!iso) return true;
  return iso <= cutoffIso;
}

function minIso(values: Array<string | null | undefined>) {
  let min: string | null = null;
  for (const value of values) {
    const iso = normalizedIso(value);
    if (iso && (min === null || iso < min)) min = iso;
  }
  return min;
}

function maxIso(values: Array<string | null | undefined>) {
  let max: string | null = null;
  for (const value of values) {
    const iso = normalizedIso(value);
    if (iso && (max === null || iso > max)) max = iso;
  }
  return max;
}

function isWithinLookback(value: string, nowIso: string, lookbackMs: number) {
  const valueMs = Date.parse(value);
  const nowMs = Date.parse(nowIso);
  if (!Number.isFinite(valueMs) || !Number.isFinite(nowMs)) return false;
  return valueMs <= nowMs && nowMs - valueMs <= lookbackMs;
}

function normalizedIso(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeId(value: unknown) {
  const id = String(value ?? "").trim();
  return id || null;
}

function positiveInt(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? Math.floor(numberValue) : null;
}
