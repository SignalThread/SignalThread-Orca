import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";

export type Args = {
  userEmail: string | null;
  companyId: string | null;
  staleMinutes: number;
};

type SupabaseLike = {
  from: (table: string) => unknown;
};

export const WORKFLOW_CONVERSATION_WAIT_REASONS = [
  "waiting_for_audio_transcript",
  "waiting_for_conversation_insights"
] as const;

const WORKFLOW_STEP_WAIT_STATUSES = [
  "waiting",
  "waiting_for_audio_transcript",
  "waiting_for_conversation_insights"
] as const;

export function parseArgs(argv: string[]): Args {
  const args: Args = { userEmail: null, companyId: null, staleMinutes: 10 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--user-email") {
      args.userEmail = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === "--company-id") {
      args.companyId = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === "--stale-minutes") {
      args.staleMinutes = Math.max(1, Number(argv[i + 1] ?? 10));
      i += 1;
    }
  }
  return args;
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

export async function countWorkflowConversationWaitsByReason(
  supabase: SupabaseLike,
  runIds: string[]
) {
  const workflowWaitsByReason = new Map<string, number>();

  for (let i = 0; i < runIds.length; i += 500) {
    const chunk = runIds.slice(i, i + 500);
    if (chunk.length === 0) continue;

    const { data: waits, error: waitingError } = await (supabase as any)
      .from("workflow_step_runs")
      .select("status, waiting_reason")
      .in("run_id", chunk)
      .in("status", [...WORKFLOW_STEP_WAIT_STATUSES])
      .in("waiting_reason", [...WORKFLOW_CONVERSATION_WAIT_REASONS]);
    if (waitingError) throw new Error(waitingError.message);

    for (const row of waits ?? []) {
      const reason = String(row.waiting_reason ?? "unknown");
      workflowWaitsByReason.set(reason, (workflowWaitsByReason.get(reason) ?? 0) + 1);
    }
  }

  return [...workflowWaitsByReason.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([reason, count]) => ({ reason, count }));
}

export async function main(args: Args) {
  if (!args.userEmail && !args.companyId) {
    throw new Error("Pass --company-id <uuid> or --user-email <email>.");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || requireEnv("SUPABASE_URL");
  const supabase = createClient(supabaseUrl, requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false }
  });

  let companyId = args.companyId;
  if (!companyId && args.userEmail) {
    const { data, error } = await supabase
      .from("users")
      .select("company_id")
      .eq("email", args.userEmail)
      .maybeSingle();
    if (error) throw new Error(error.message);
    companyId = String(data?.company_id ?? "").trim() || null;
  }

  if (!companyId) {
    throw new Error("Could not resolve company_id.");
  }

  const { data: leads, error: leadsError } = await supabase
    .from("leads")
    .select("id")
    .eq("company_id", companyId);
  if (leadsError) throw new Error(leadsError.message);

  const leadIds = (leads ?? []).map((lead) => lead.id);
  if (leadIds.length === 0) {
    console.log(JSON.stringify({ companyId, leadCount: 0, conversationCounts: [] }, null, 2));
    return;
  }

  const counts = new Map<string, number>();
  let staleTranscriptionCount = 0;
  let completedTranscriptPendingSynthesisCount = 0;
  const staleCutoffIso = new Date(Date.now() - args.staleMinutes * 60_000).toISOString();
  for (let i = 0; i < leadIds.length; i += 500) {
    const chunk = leadIds.slice(i, i + 500);
    const { data, error } = await supabase
      .from("lead_conversations")
      .select("transcription_status, synthesis_status, created_at, transcribed_at")
      .in("lead_id", chunk);
    if (error) throw new Error(error.message);

    for (const row of data ?? []) {
      const key = `${row.transcription_status ?? "null"}/${row.synthesis_status ?? "null"}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
      const transcriptionStatus = String(row.transcription_status ?? "").toLowerCase();
      const synthesisStatus = String(row.synthesis_status ?? "").toLowerCase();
      if (
        ["pending", "processing"].includes(transcriptionStatus) &&
        String(row.created_at ?? "") <= staleCutoffIso
      ) {
        staleTranscriptionCount += 1;
      }
      if (
        transcriptionStatus === "completed" &&
        ["pending", "processing"].includes(synthesisStatus) &&
        String(row.transcribed_at ?? "") <= staleCutoffIso
      ) {
        completedTranscriptPendingSynthesisCount += 1;
      }
    }
  }

  const { data: readinessRows, error: readinessError } = await supabase
    .from("lead_conversation_readiness")
    .select("lead_id, transcript_status, insights_status")
    .in("lead_id", leadIds);
  if (readinessError) throw new Error(readinessError.message);

  const readinessMismatchCounts = {
    transcriptNotReady: 0,
    insightsNotReady: 0
  };
  for (const row of readinessRows ?? []) {
    if (row.transcript_status !== "ready") readinessMismatchCounts.transcriptNotReady += 1;
    if (row.insights_status !== "ready") readinessMismatchCounts.insightsNotReady += 1;
  }

  const workflowWaitsByReason = new Map<string, number>();
  for (let i = 0; i < leadIds.length; i += 500) {
    const chunk = leadIds.slice(i, i + 500);
    const { data: runs, error: runsError } = await supabase
      .from("workflow_runs")
      .select("id")
      .in("lead_id", chunk);
    if (runsError) throw new Error(runsError.message);
    const runIds = (runs ?? []).map((run) => run.id);
    if (runIds.length === 0) continue;
    for (const row of await countWorkflowConversationWaitsByReason(supabase, runIds)) {
      workflowWaitsByReason.set(row.reason, (workflowWaitsByReason.get(row.reason) ?? 0) + row.count);
    }
  }

  console.log(
    JSON.stringify(
      {
        companyId,
        leadCount: leadIds.length,
        staleMinutes: args.staleMinutes,
        conversationCounts: [...counts.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([statusPair, count]) => {
            const [transcriptionStatus, synthesisStatus] = statusPair.split("/");
            return {
              transcriptionStatus,
              synthesisStatus,
              count
            };
          }),
        staleTranscriptionPendingOrProcessing: staleTranscriptionCount,
        completedTranscriptPendingSynthesis: completedTranscriptPendingSynthesisCount,
        readinessMismatchCounts,
        workflowWaitsByReason: [...workflowWaitsByReason.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([reason, count]) => ({ reason, count }))
      },
      null,
      2
    )
  );
}

function isDirectInvocation() {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint && import.meta.url === pathToFileURL(entrypoint).href);
}

if (isDirectInvocation()) {
  main(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
