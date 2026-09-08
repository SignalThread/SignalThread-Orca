import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { assertProdCanariesEnabled } from "./canaries/prod-canary-common";
import { checkConversationLifecycleEnv } from "./check-conversation-lifecycle-env";
import { checkConversationLifecycleSchema } from "./check-conversation-lifecycle-schema";
import { countWorkflowConversationWaitsByReason } from "./verify-conversation-processing-status";

type Args = {
  baseUrl: string;
  authBearer: string;
  leadId: string | null;
  companyId: string | null;
  eventId: string | null;
  ownerUserId: string | null;
  audioFile: string;
  timeoutMs: number;
  pollMs: number;
};

function argValue(argv: string[], name: string) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] ?? "" : "";
}

function parseArgs(argv: string[]): Args {
  return {
    baseUrl: argValue(argv, "--base-url") || process.env.CANARY_BASE_URL || "",
    authBearer: argValue(argv, "--auth-bearer") || process.env.CANARY_AUTH_BEARER || "",
    leadId: argValue(argv, "--lead-id") || process.env.CANARY_LEAD_ID || null,
    companyId: argValue(argv, "--company-id") || process.env.CANARY_COMPANY_ID || null,
    eventId: argValue(argv, "--event-id") || process.env.CANARY_EVENT_ID || null,
    ownerUserId: argValue(argv, "--owner-user-id") || process.env.CANARY_OWNER_USER_ID || null,
    audioFile:
      argValue(argv, "--audio-file") ||
      process.env.CANARY_AUDIO_FILE ||
      join(process.cwd(), "load-tests/fixtures/voice-fixture.m4a"),
    timeoutMs: Math.max(30_000, Number(argValue(argv, "--timeout-ms") || 180_000)),
    pollMs: Math.max(2_000, Number(argValue(argv, "--poll-ms") || 5_000))
  };
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function assertCanaryArgs(args: Args) {
  if (!args.baseUrl) throw new Error("--base-url or CANARY_BASE_URL is required.");
  if (!args.authBearer) throw new Error("--auth-bearer or CANARY_AUTH_BEARER is required.");
  if (!args.leadId && (!args.companyId || !args.eventId || !args.ownerUserId)) {
    throw new Error(
      "Pass --lead-id, or pass --company-id, --event-id, and --owner-user-id to create a marked canary lead."
    );
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createCanaryLead(input: {
  supabase: any;
  companyId: string;
  eventId: string;
  ownerUserId: string;
}) {
  const now = new Date().toISOString();
  const { data, error } = await input.supabase
    .from("leads")
    .insert({
      company_id: input.companyId,
      event_id: input.eventId,
      owner_user_id: input.ownerUserId,
      full_name: `Lifecycle Canary ${now}`,
      email: `conversation-canary+${Date.now()}@example.test`,
      status: "new"
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  const leadId = String(data?.id ?? "").trim();
  if (!leadId) throw new Error("Canary lead creation returned no id.");
  return leadId;
}

async function callTick(baseUrl: string) {
  const secret = process.env.WORKFLOW_TICK_SECRET?.trim();
  if (!secret) {
    throw new Error("WORKFLOW_TICK_SECRET is missing; canary cannot run internal tick.");
  }
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/internal/workflow-tick`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` }
  });
  if (!response.ok) {
    throw new Error(`Internal tick failed with HTTP ${response.status}.`);
  }
}

async function uploadCanaryAudio(input: {
  baseUrl: string;
  authBearer: string;
  leadId: string;
  audioFile: string;
}) {
  const bytes = readFileSync(input.audioFile);
  const form = new FormData();
  form.set("leadId", input.leadId);
  form.set("file", new File([bytes], "conversation-canary.m4a", { type: "audio/m4a" }));

  const response = await fetch(`${input.baseUrl.replace(/\/$/, "")}/api/conversations/upload`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.authBearer}`
    },
    body: form
  });

  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`Upload failed with HTTP ${response.status}: ${String(json.error ?? "unknown")}`);
  }
  const conversationId = String(json.conversationId ?? "").trim();
  if (!conversationId) throw new Error("Upload response did not include conversationId.");
  return {
    conversationId,
    apiTranscriptionStatus: String(json.transcriptionStatus ?? ""),
    apiSynthesisStatus: String(json.synthesisStatus ?? "")
  };
}

export async function loadSafeCanaryState(input: {
  supabase: any;
  leadId: string;
  conversationId: string;
}) {
  const { data: conversation, error: conversationError } = await input.supabase
    .from("lead_conversations")
    .select(
      "id, transcription_status, synthesis_status, transcribed_at, synthesized_at, transcript, summary"
    )
    .eq("id", input.conversationId)
    .maybeSingle();
  if (conversationError) throw new Error(conversationError.message);

  const { data: readiness, error: readinessError } = await input.supabase
    .from("lead_conversation_readiness")
    .select("transcript_status, insights_status, transcript_version, insights_version")
    .eq("lead_id", input.leadId)
    .maybeSingle();
  if (readinessError) throw new Error(readinessError.message);

  const { data: workflowRuns, error: runsError } = await input.supabase
    .from("workflow_runs")
    .select("id")
    .eq("lead_id", input.leadId);
  if (runsError) throw new Error(runsError.message);
  const runIds = (workflowRuns ?? []).map((run: { id: string }) => run.id);
  let waitingWorkflowCount = 0;
  if (runIds.length > 0) {
    const waits = await countWorkflowConversationWaitsByReason(input.supabase, runIds);
    waitingWorkflowCount = waits.reduce((total, row) => total + row.count, 0);
  }

  return {
    transcriptionStatus: conversation?.transcription_status ?? null,
    synthesisStatus: conversation?.synthesis_status ?? null,
    transcribedAtPresent: Boolean(conversation?.transcribed_at),
    synthesizedAtPresent: Boolean(conversation?.synthesized_at),
    transcriptPresent: Boolean(String(conversation?.transcript ?? "").trim()),
    summaryPresent: Boolean(String(conversation?.summary ?? "").trim()),
    readinessTranscriptStatus: readiness?.transcript_status ?? null,
    readinessInsightsStatus: readiness?.insights_status ?? null,
    waitingWorkflowCount
  };
}

function canarySucceeded(state: Awaited<ReturnType<typeof loadSafeCanaryState>>) {
  return (
    state.transcriptionStatus === "completed" &&
    state.synthesisStatus === "completed" &&
    state.transcribedAtPresent &&
    state.synthesizedAtPresent &&
    state.transcriptPresent &&
    state.summaryPresent &&
    state.readinessTranscriptStatus === "ready" &&
    state.readinessInsightsStatus === "ready" &&
    state.waitingWorkflowCount === 0
  );
}

async function main() {
  assertProdCanariesEnabled();
  const args = parseArgs(process.argv.slice(2));
  assertCanaryArgs(args);

  const envCheck = checkConversationLifecycleEnv();
  if (!envCheck.ok) {
    throw new Error(`Canary blocked by missing env: ${envCheck.missing.map((item) => item.name).join(", ")}`);
  }

  const schemaCheck = await checkConversationLifecycleSchema();
  if (!schemaCheck.ok) {
    throw new Error(
      `Canary blocked by schema check failures: ${schemaCheck.checks
        .filter((check) => !check.ok)
        .map((check) => check.name)
        .join(", ")}`
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || requiredEnv("SUPABASE_URL");
  const supabase: any = createClient(supabaseUrl, requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false }
  });

  const leadId =
    args.leadId ??
    (await createCanaryLead({
      supabase,
      companyId: args.companyId!,
      eventId: args.eventId!,
      ownerUserId: args.ownerUserId!
    }));

  const upload = await uploadCanaryAudio({
    baseUrl: args.baseUrl,
    authBearer: args.authBearer,
    leadId,
    audioFile: args.audioFile
  });

  const deadline = Date.now() + args.timeoutMs;
  let lastState = await loadSafeCanaryState({
    supabase,
    leadId,
    conversationId: upload.conversationId
  });

  while (Date.now() < deadline && !canarySucceeded(lastState)) {
    await callTick(args.baseUrl);
    await sleep(args.pollMs);
    lastState = await loadSafeCanaryState({
      supabase,
      leadId,
      conversationId: upload.conversationId
    });
    if (
      lastState.transcriptionStatus === "failed" ||
      lastState.synthesisStatus === "failed"
    ) {
      break;
    }
  }

  const result = {
    ok: canarySucceeded(lastState),
    leadId,
    conversationId: upload.conversationId,
    apiStatus: {
      transcriptionStatus: upload.apiTranscriptionStatus,
      synthesisStatus: upload.apiSynthesisStatus
    },
    finalState: lastState
  };

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}

function isDirectInvocation() {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint && import.meta.url === pathToFileURL(entrypoint).href);
}

if (isDirectInvocation()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
