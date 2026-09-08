import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import OpenAI, { toFile } from "openai";
import sgMail from "@sendgrid/mail";
import { r2Client } from "../../lib/r2";
import { LEAD_TEMPERATURE_VALUES, type LeadTemperature } from "../../lib/leads/temperature";
import type { LeadStatus } from "../../lib/leads/exhibitorLeadPatch";
import {
  CANARY_MARKER,
  canaryObjectKey,
  canaryRunLabel,
  createCanarySupabaseClient,
  printCanaryResources,
  requireEnv,
  setupCanaryResources,
  type CanaryResourceIds
} from "./prod-canary-common";
import { generateLeadDraftWithLLM, type DraftGenerationInput } from "../../lib/campaigns/llm-draft-generator";

const CANARY_NAMES = ["openai", "sendgrid", "r2", "audio", "live-db"] as const;
type CanaryName = (typeof CANARY_NAMES)[number];
const LEAD_STATUS_VALUES = ["new", "follow_up", "closed"] as const satisfies readonly LeadStatus[];
const LIVE_DB_INSERT_STATUS = "new" satisfies LeadStatus;
const LIVE_DB_UPDATE_STATUS = "follow_up" satisfies LeadStatus;
const LIVE_DB_INSERT_TEMPERATURE = "cold" satisfies LeadTemperature;
const LIVE_DB_UPDATE_TEMPERATURE = "warm" satisfies LeadTemperature;

type CanaryResult = {
  name: CanaryName;
  ok: boolean;
  providerCalled?: string;
  details?: Record<string, unknown>;
};

function selectedCanaries(argv: string[]) {
  const selected = argv[0] ?? "all";
  if (selected === "all") return [...CANARY_NAMES];
  if (CANARY_NAMES.includes(selected as CanaryName)) return [selected as CanaryName];
  throw new Error(`Unknown canary "${selected}". Use one of: all, ${CANARY_NAMES.join(", ")}.`);
}

function sendGridHeader(headers: Record<string, unknown>, name: string) {
  const lower = headers[name.toLowerCase()];
  const upper = headers[name];
  return typeof lower === "string" ? lower : typeof upper === "string" ? upper : null;
}

async function bodyToString(body: unknown) {
  if (!body) return "";
  const maybeTransform = body as { transformToString?: () => Promise<string> };
  if (typeof maybeTransform.transformToString === "function") {
    return maybeTransform.transformToString();
  }
  const stream = body as AsyncIterable<Uint8Array>;
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function runOpenAiDraftCanary(): Promise<CanaryResult> {
  const input: DraftGenerationInput = {
    subjectTemplate: `${CANARY_MARKER} follow-up for {{first_name}}`,
    templateName: "Canary Follow-up",
    recipientContext: {
      firstName: "Canary",
      fullName: "Canary Lead",
      leadName: "Canary Lead",
      eventName: "Canary",
      companyText: "Canary",
      title: "Canary Evaluation Lead",
      companySize: "test account",
      industry: "software",
      companyDomain: "example.test",
      leadCount: 1,
      isMultiLeadDraft: false
    },
    selectedSignals: [
      {
        id: "canary-context",
        name: "Canary Context",
        category: "Contextual",
        defaultPromptText: "This is a production canary draft for the dedicated Canary account only.",
        tone: ["Professional"],
        visibility: "global",
        roleScope: null,
        templateScope: null
      },
      {
        id: "canary-cta",
        name: "Canary CTA",
        category: "Call-to-Action",
        defaultPromptText: "Ask whether the Canary validation should continue.",
        tone: ["Professional"],
        visibility: "global",
        roleScope: null,
        templateScope: null
      }
    ]
  };

  const generated = await generateLeadDraftWithLLM(input);
  if (!generated.subject.includes("Canary") || !generated.body.trim()) {
    throw new Error("OpenAI canary returned an empty or unmarked draft.");
  }
  console.log(`PROVIDER_CALLED openai.chat.completions model=${generated.model}`);
  return {
    name: "openai",
    ok: true,
    providerCalled: "openai.chat.completions",
    details: {
      model: generated.model,
      subjectLength: generated.subject.length,
      bodyLength: generated.body.length
    }
  };
}

async function runSendGridCanary(resources: CanaryResourceIds): Promise<CanaryResult> {
  sgMail.setApiKey(requireEnv("SENDGRID_API_KEY"));
  const subject = `${CANARY_MARKER} SendGrid canary ${new Date().toISOString()}`;
  const [response] = await sgMail.send({
    to: resources.testEmail,
    from: requireEnv("SENDGRID_FROM_EMAIL"),
    subject,
    text: [
      "This is a production canary for Lead Retrieval.",
      "It was sent only to CANARY_TEST_EMAIL.",
      `Canary company: ${resources.companyId}`,
      `Canary event: ${resources.eventId}`
    ].join("\n")
  });
  const headers = (response?.headers ?? {}) as Record<string, unknown>;
  const providerMessageId = sendGridHeader(headers, "x-message-id");
  const requestId = sendGridHeader(headers, "x-request-id");
  console.log(`PROVIDER_CALLED sendgrid.mail.send to=${resources.testEmail}`);
  return {
    name: "sendgrid",
    ok: true,
    providerCalled: "sendgrid.mail.send",
    details: {
      statusCode: response?.statusCode ?? null,
      providerMessageId,
      requestId
    }
  };
}

async function runR2Canary(resources: CanaryResourceIds): Promise<CanaryResult> {
  const bucket = requireEnv("R2_BUCKET");
  const key = canaryObjectKey(resources.r2Prefix);
  const body = `${CANARY_MARKER} R2 canary ${new Date().toISOString()}\n`;
  let deleted = false;
  try {
    await r2Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: "text/plain"
      })
    );
    const object = await r2Client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key
      })
    );
    const readBack = await bodyToString(object.Body);
    if (readBack !== body) {
      throw new Error("R2 canary read did not match uploaded body.");
    }
    await r2Client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key
      })
    );
    deleted = true;
    console.log(`PROVIDER_CALLED cloudflare-r2 put/get/delete key=${key}`);
    return {
      name: "r2",
      ok: true,
      providerCalled: "cloudflare-r2",
      details: {
        bucket,
        key,
        deleted
      }
    };
  } finally {
    if (!deleted) {
      await r2Client
        .send(
          new DeleteObjectCommand({
            Bucket: bucket,
            Key: key
          })
        )
        .catch(() => undefined);
    }
  }
}

async function runAudioCanary(): Promise<CanaryResult> {
  const openAi = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
  const audioPath = process.env.CANARY_AUDIO_FILE || join(process.cwd(), "load-tests/fixtures/voice-fixture.m4a");
  const audio = readFileSync(audioPath);
  const file = await toFile(audio, "lead-retrieval-canary.m4a", { type: "audio/m4a" });
  const result = await openAi.audio.transcriptions.create({
    model: "whisper-1",
    file
  });
  const transcriptLength = String(result.text ?? "").trim().length;
  if (transcriptLength === 0) {
    throw new Error("Audio transcription canary returned an empty transcript.");
  }
  console.log(`PROVIDER_CALLED openai.audio.transcriptions model=whisper-1 file=${audioPath}`);
  return {
    name: "audio",
    ok: true,
    providerCalled: "openai.audio.transcriptions",
    details: {
      model: "whisper-1",
      transcriptLength
    }
  };
}

export function buildLiveDbCanaryInsertPayload(input: {
  resources: CanaryResourceIds;
  fullName: string;
  email: string;
}) {
  return {
    company_id: input.resources.companyId,
    event_id: input.resources.eventId,
    owner_user_id: input.resources.exhibitorUserId,
    full_name: input.fullName,
    email: input.email,
    job_title: "Production Canary",
    status: LIVE_DB_INSERT_STATUS,
    priority_score: 1,
    rating: 1,
    temperature: LIVE_DB_INSERT_TEMPERATURE,
    metadata: {
      canary: true,
      marker: CANARY_MARKER
    }
  };
}

export function buildLiveDbCanaryUpdatePayload() {
  return {
    status: LIVE_DB_UPDATE_STATUS,
    rating: 2,
    temperature: LIVE_DB_UPDATE_TEMPERATURE
  };
}

function inferFailedPayloadField(message: string) {
  if (/leads_temperature_allowed_check|temperature/i.test(message)) return "temperature";
  if (/leads_status|status/i.test(message)) return "status";
  if (/rating/i.test(message)) return "rating";
  if (/priority_score/i.test(message)) return "priority_score";
  if (/company_id/i.test(message)) return "company_id";
  if (/event_id/i.test(message)) return "event_id";
  if (/owner_user_id/i.test(message)) return "owner_user_id";
  return "unknown";
}

export function formatLiveDbCanaryMutationError(
  phase: "insert" | "update",
  error: { message?: string; details?: string | null; hint?: string | null; code?: string | null },
  payload: Record<string, unknown>
) {
  const message = String(error.message ?? "unknown");
  const combined = [message, String(error.details ?? ""), String(error.hint ?? ""), String(error.code ?? "")].join(" ");
  const safePayload = {
    status: payload.status ?? null,
    temperature: payload.temperature ?? null,
    rating: payload.rating ?? null,
    priority_score: payload.priority_score ?? null,
    company_id: payload.company_id ? "set" : "missing",
    event_id: payload.event_id ? "set" : "missing",
    owner_user_id: payload.owner_user_id ? "set" : "missing"
  };

  return [
    `Live DB canary ${phase} failed`,
    `field=${inferFailedPayloadField(combined)}`,
    `message=${message}`,
    `allowed_temperature_values=${LEAD_TEMPERATURE_VALUES.join(",")}`,
    `allowed_status_values=${LEAD_STATUS_VALUES.join(",")}`,
    `payload=${JSON.stringify(safePayload)}`
  ].join(": ");
}

async function runLiveDbCanary(resources: CanaryResourceIds): Promise<CanaryResult> {
  const supabase = createCanarySupabaseClient();
  const fullName = canaryRunLabel("live_db_lead");
  let leadId: string | null = null;

  try {
    const insertPayload = buildLiveDbCanaryInsertPayload({
      resources,
      fullName,
      email: `canary-${Date.now()}@example.test`
    });
    const { data: inserted, error: insertError } = await supabase
      .from("leads")
      .insert(insertPayload)
      .select("id")
      .single();
    if (insertError) throw new Error(formatLiveDbCanaryMutationError("insert", insertError, insertPayload));
    leadId = String(inserted.id);

    const { data: loaded, error: loadError } = await supabase
      .from("leads")
      .select("id,company_id,event_id,full_name")
      .eq("id", leadId)
      .single();
    if (loadError) throw new Error(`Live DB canary read failed: ${loadError.message}`);
    if (loaded.company_id !== resources.companyId || loaded.event_id !== resources.eventId) {
      throw new Error("Live DB canary lead was not scoped to the Canary company/event.");
    }

    const updatePayload = buildLiveDbCanaryUpdatePayload();
    const { error: updateError } = await supabase
      .from("leads")
      .update(updatePayload)
      .eq("id", leadId);
    if (updateError) throw new Error(formatLiveDbCanaryMutationError("update", updateError, updatePayload));

    console.log(`PROVIDER_CALLED supabase.live-db lead_insert_read_update_delete lead=${leadId}`);
    return {
      name: "live-db",
      ok: true,
      providerCalled: "supabase.live-db",
      details: {
        leadId,
        companyId: resources.companyId,
        eventId: resources.eventId
      }
    };
  } finally {
    if (leadId) {
      const { error: cleanupError } = await supabase.from("leads").delete().eq("id", leadId);
      if (cleanupError) {
        console.warn(`Live DB canary cleanup warning: ${cleanupError.message}`);
      }
    }
  }
}

async function runOneCanary(name: CanaryName, resources: CanaryResourceIds) {
  switch (name) {
    case "openai":
      return runOpenAiDraftCanary();
    case "sendgrid":
      return runSendGridCanary(resources);
    case "r2":
      return runR2Canary(resources);
    case "audio":
      return runAudioCanary();
    case "live-db":
      return runLiveDbCanary(resources);
  }
}

export async function main() {
  const names = selectedCanaries(process.argv.slice(2));
  const resources = await setupCanaryResources();
  printCanaryResources(resources);
  const results: CanaryResult[] = [];

  for (const name of names) {
    console.log(`CANARY_START ${name}`);
    const result = await runOneCanary(name, resources);
    results.push(result);
    console.log(`CANARY_PASS ${name} provider=${result.providerCalled}`);
  }

  console.log(JSON.stringify({ ok: true, results }, null, 2));
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
