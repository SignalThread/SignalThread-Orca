import { Readable } from "node:stream";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { createAdminClient } from "@/lib/supabase/admin";
import { R2_BUCKET, r2Client } from "@/lib/r2";
import {
  markConversationInsightsFailed,
  markConversationInsightsReady,
  markConversationTranscriptFailed,
  markConversationTranscriptReady
} from "@/lib/conversations/conversation-readiness";
import { runConversationReadinessSideEffect } from "@/lib/conversations/readiness-side-effects";
import { resumeWaitingWorkflowStepsForLead } from "@/lib/workflows/runner/resume-waiting";
import {
  buildConversationInsightPrompt,
  CONVERSATION_INSIGHT_JSON_SCHEMA,
  CONVERSATION_INSIGHT_SCHEMA_NAME,
  parseConversationInsightJson,
  type ConversationInsightPayload
} from "@/lib/conversations/conversation-insight-contract";
import { EMPTY_TRANSCRIPT_SYNTHESIS_ERROR } from "@/lib/conversations/conversation-lifecycle";

const SYNTHESIS_MODEL = "gpt-4.1-mini";

export type ProcessConversationUploadParams = {
  conversationId: string;
  leadId: string;
  storagePath: string;
  contentType: string;
  /** When true, post-transcript sync hits `lead_voice_notes` via SQL RPC (context voice notes only). */
  voiceNoteContextConversationSync?: boolean;
};

export type ProcessConversationSynthesisParams = {
  conversationId: string;
  leadId: string;
  transcriptText: string;
};

export type ConversationSynthesisResult =
  | { status: "completed"; synthesizedAt: string }
  | { status: "failed"; error: string };

async function streamToBuffer(stream: Readable) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function readObjectBodyAsBuffer(body: unknown) {
  if (!body) {
    throw new Error("Missing object body.");
  }

  if (typeof (body as { transformToByteArray?: () => Promise<Uint8Array> }).transformToByteArray === "function") {
    const bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
    return Buffer.from(bytes);
  }

  if (body instanceof Readable) {
    return streamToBuffer(body);
  }

  if (typeof (body as { arrayBuffer?: () => Promise<ArrayBuffer> }).arrayBuffer === "function") {
    const ab = await (body as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer();
    return Buffer.from(ab);
  }

  throw new Error("Unsupported object body stream.");
}

async function updateConversationWithFallback(
  admin: ReturnType<typeof createAdminClient>,
  conversationId: string,
  primaryPayload: Record<string, unknown>,
  fallbackPayload?: Record<string, unknown>
) {
  const primary = await (admin as any)
    .from("lead_conversations")
    .update(primaryPayload)
    .eq("id", conversationId);

  if (!primary.error) {
    return null;
  }

  if (!fallbackPayload) {
    return primary.error;
  }

  const fallback = await (admin as any)
    .from("lead_conversations")
    .update(fallbackPayload)
    .eq("id", conversationId);

  return fallback.error ?? null;
}

async function runConversationSynthesis(openAi: OpenAI, transcriptText: string) {
  const completion = await openAi.chat.completions.create({
    model: SYNTHESIS_MODEL,
    temperature: 0.1,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: CONVERSATION_INSIGHT_SCHEMA_NAME,
        strict: true,
        schema: CONVERSATION_INSIGHT_JSON_SCHEMA
      }
    },
    messages: [
      {
        role: "system",
        content: "You are an enterprise sales intelligence analyst for RevOps and sales engineering. Output strict JSON only."
      },
      {
        role: "user",
        content: buildConversationInsightPrompt({
          transcriptTitle: "Transcript:",
          transcript: transcriptText
        })
      }
    ]
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  return parseConversationInsightJson(raw);
}

async function runVoiceNoteTimelineSummary(openAi: OpenAI, transcriptText: string): Promise<string> {
  const completion = await openAi.chat.completions.create({
    model: SYNTHESIS_MODEL,
    temperature: 0.2,
    max_tokens: 160,
    messages: [
      {
        role: "system",
        content:
          "You summarize a salesperson's voice memo for a timeline. Respond with one concise plain-language sentence only. No markdown, no quotation marks."
      },
      {
        role: "user",
        content: transcriptText.slice(0, 12_000)
      }
    ]
  });
  return String(completion.choices[0]?.message?.content ?? "").trim();
}

async function markConversationSynthesisFailed(input: {
  admin: ReturnType<typeof createAdminClient>;
  conversationId: string;
  leadId: string;
  message: string;
}): Promise<ConversationSynthesisResult> {
  const synthesisFailError = await updateConversationWithFallback(
    input.admin,
    input.conversationId,
    {
      synthesis_status: "failed",
      synthesis_error: input.message,
      synthesized_at: null
    }
  );

  if (synthesisFailError) {
    console.error("[conversations/upload] failed to persist synthesis error", {
      conversationId: input.conversationId,
      message: synthesisFailError.message,
      code: synthesisFailError.code
    });
  }
  await runConversationReadinessSideEffect("insights_failed", () =>
    markConversationInsightsFailed({
      supabase: input.admin,
      leadId: input.leadId,
      conversationId: input.conversationId
    })
  );
  await runConversationReadinessSideEffect("resume_after_insights_failed", () =>
    resumeWaitingWorkflowStepsForLead({ supabase: input.admin, leadId: input.leadId })
  );

  return { status: "failed", error: input.message };
}

async function synthesizeConversationTranscript(input: {
  admin: ReturnType<typeof createAdminClient>;
  openAi: OpenAI;
  conversationId: string;
  leadId: string;
  transcriptText: string;
}): Promise<ConversationSynthesisResult> {
  const transcriptText = input.transcriptText.trim();
  if (!transcriptText) {
    return markConversationSynthesisFailed({
      admin: input.admin,
      conversationId: input.conversationId,
      leadId: input.leadId,
      message: EMPTY_TRANSCRIPT_SYNTHESIS_ERROR
    });
  }

  try {
    console.log("[conversations/upload] synthesis started", {
      conversationId: input.conversationId
    });

    const synthesis = await runConversationSynthesis(input.openAi, transcriptText);
    const nowIso = new Date().toISOString();

    const synthesisBasePayload = {
      summary: synthesis.summary,
      sentiment: synthesis.sentiment,
      objections: synthesis.objections,
      next_steps: synthesis.next_steps,
      synthesis_status: "completed",
      synthesized_at: nowIso,
      synthesis_error: null
    };

    const synthesisExtendedPayload: Partial<ConversationInsightPayload> & Record<string, unknown> = {
      ...synthesisBasePayload,
      problem_severity: synthesis.problem_severity,
      buying_intent: synthesis.buying_intent,
      competitors_mentioned: synthesis.competitors_mentioned,
      pain_points: synthesis.pain_points,
      feature_requests: synthesis.feature_requests,
      buying_signals: synthesis.buying_signals,
      operational_pains: synthesis.operational_pains,
      workflow_constraints: synthesis.workflow_constraints,
      technical_constraints: synthesis.technical_constraints,
      desired_outcomes: synthesis.desired_outcomes,
      adoption_risks: synthesis.adoption_risks,
      management_visibility_needs: synthesis.management_visibility_needs,
      business_process_concerns: synthesis.business_process_concerns,
      product_objections: synthesis.product_objections,
      rep_behavior_patterns: synthesis.rep_behavior_patterns,
      priority_themes: synthesis.priority_themes
    };

    const synthesisPersistError = await updateConversationWithFallback(
      input.admin,
      input.conversationId,
      synthesisExtendedPayload,
      synthesisBasePayload
    );

    if (synthesisPersistError) {
      throw new Error(synthesisPersistError.message ?? "Failed saving synthesis.");
    }

    console.log("[conversations/upload] synthesis completed", {
      conversationId: input.conversationId,
      leadId: input.leadId
    });
    await runConversationReadinessSideEffect("insights_ready", () =>
      markConversationInsightsReady({
        supabase: input.admin,
        leadId: input.leadId,
        conversationId: input.conversationId,
        nowIso
      })
    );
    await runConversationReadinessSideEffect("resume_after_insights_ready", () =>
      resumeWaitingWorkflowStepsForLead({
        supabase: input.admin,
        leadId: input.leadId,
        nowIso
      })
    );

    return { status: "completed", synthesizedAt: nowIso };
  } catch (synthesisError) {
    const synthesisMessage =
      synthesisError instanceof Error ? synthesisError.message : "Synthesis failed";
    console.error("[conversations/upload] synthesis failed", {
      conversationId: input.conversationId,
      error: synthesisMessage
    });

    return markConversationSynthesisFailed({
      admin: input.admin,
      conversationId: input.conversationId,
      leadId: input.leadId,
      message: synthesisMessage
    });
  }
}

export async function processConversationSynthesisForCompletedTranscript({
  conversationId,
  leadId,
  transcriptText
}: ProcessConversationSynthesisParams): Promise<ConversationSynthesisResult> {
  const admin = createAdminClient();
  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  if (!openAiKey) {
    return markConversationSynthesisFailed({
      admin,
      conversationId,
      leadId,
      message: "OPENAI_API_KEY is missing"
    });
  }

  const openAi = new OpenAI({ apiKey: openAiKey });
  return synthesizeConversationTranscript({
    admin,
    openAi,
    conversationId,
    leadId,
    transcriptText
  });
}

export async function processConversationUpload({
  conversationId,
  leadId,
  storagePath,
  contentType,
  voiceNoteContextConversationSync = false
}: ProcessConversationUploadParams) {
  const admin = createAdminClient();
  let transcriptionStatus: "pending" | "completed" | "failed" = "pending";

  try {
    try {
      console.log("[conversations/upload] transcription started", {
        conversationId
      });

      await updateConversationWithFallback(admin, conversationId, {
        transcription_status: "processing",
        transcription_error: null
      });

      const openAiKey = process.env.OPENAI_API_KEY?.trim();
      if (!openAiKey) {
        throw new Error("OPENAI_API_KEY is missing");
      }

      const object = await r2Client.send(
        new GetObjectCommand({
          Bucket: R2_BUCKET,
          Key: storagePath
        })
      );
      console.log("[conversations/upload] R2 object fetched for transcription", {
        key: storagePath
      });

      const audioBuffer = await readObjectBodyAsBuffer(object.Body);
      const openAi = new OpenAI({ apiKey: openAiKey });
      const whisperFile = await toFile(audioBuffer, "conversation.m4a", { type: contentType });
      console.log("[conversations/upload] calling Whisper transcription", {
        conversationId
      });
      const transcriptResult = await openAi.audio.transcriptions.create({
        model: "whisper-1",
        file: whisperFile
      });

      const transcriptText = String(transcriptResult.text ?? "").trim();
      const { error: transcriptionUpdateError } = await (admin as any)
        .from("lead_conversations")
        .update({
          transcript: transcriptText || null,
          transcription_status: "completed",
          transcription_error: null,
          transcribed_at: new Date().toISOString()
        })
        .eq("id", conversationId);

      if (transcriptionUpdateError) {
        throw new Error(transcriptionUpdateError.message ?? "Failed saving transcription.");
      }

      transcriptionStatus = "completed";
      await runConversationReadinessSideEffect("transcript_ready", () =>
        markConversationTranscriptReady({
          supabase: admin,
          leadId,
          conversationId
        })
      );
      await runConversationReadinessSideEffect("resume_after_transcript_ready", () =>
        resumeWaitingWorkflowStepsForLead({ supabase: admin, leadId })
      );
      console.log("[conversations/upload] transcription completed", {
        conversationId
      });

      if (voiceNoteContextConversationSync) {
        try {
          let noteSummaryText: string | null = null;
          if (transcriptText) {
            try {
              const generated = await runVoiceNoteTimelineSummary(openAi, transcriptText);
              noteSummaryText = generated.trim() || null;
            } catch (summaryError) {
              console.error("[conversations/upload] voice note summary failed", {
                conversationId,
                error:
                  summaryError instanceof Error ? summaryError.message : String(summaryError)
              });
            }
          }

          const { error: syncVoiceNotesError } = await admin.rpc("sync_voice_notes_from_conversation", {
            p_conversation_id: conversationId,
            p_transcript: transcriptText,
            p_transcription_status: "completed",
            p_note_summary: noteSummaryText ?? undefined
          });

          if (syncVoiceNotesError) {
            console.error("[conversations/upload] sync_voice_notes_from_conversation failed", {
              conversationId,
              message: syncVoiceNotesError.message,
              code: syncVoiceNotesError.code
            });
          } else {
            console.log("[conversations/upload] lead_voice_notes synced from conversation", {
              conversationId,
              summaryGenerated: Boolean(noteSummaryText)
            });
          }
        } catch (voiceSyncUnexpected) {
          console.error("[conversations/upload] voice note sync fatal", {
            conversationId,
            error:
              voiceSyncUnexpected instanceof Error
                ? voiceSyncUnexpected.message
                : String(voiceSyncUnexpected)
          });
        }
      }

      await synthesizeConversationTranscript({
        admin,
        openAi,
        conversationId,
        leadId,
        transcriptText
      });
    } catch (transcriptionError) {
      const message =
        transcriptionError instanceof Error ? transcriptionError.message : "Transcription failed";
      transcriptionStatus = "failed";
      console.error("[conversations/upload] transcription failed", {
        conversationId,
        error: message
      });

      const { error: failUpdateError } = await (admin as any)
        .from("lead_conversations")
        .update({
          transcript: null,
          transcription_status: "failed",
          transcription_error: message,
          transcribed_at: null,
          synthesis_status: "failed",
          synthesis_error: message
        })
        .eq("id", conversationId);

      if (failUpdateError) {
        console.error("[conversations/upload] failed to persist transcription error", {
          conversationId,
          message: failUpdateError.message,
          code: failUpdateError.code
        });
      }
      await runConversationReadinessSideEffect("transcript_failed", () =>
        markConversationTranscriptFailed({ supabase: admin, leadId, conversationId })
      );
      await runConversationReadinessSideEffect("resume_after_transcript_failed", () =>
        resumeWaitingWorkflowStepsForLead({ supabase: admin, leadId })
      );
    }
  } catch (backgroundError) {
    const message =
      backgroundError instanceof Error ? backgroundError.message : String(backgroundError);
    console.error("[conversations/upload] background processing fatal error", {
      conversationId,
      message,
      stack: backgroundError instanceof Error ? backgroundError.stack : null
    });

    const { data: snap } = await (admin as any)
      .from("lead_conversations")
      .select("transcription_status, synthesis_status")
      .eq("id", conversationId)
      .maybeSingle();

    const ts = String(snap?.transcription_status ?? "").trim().toLowerCase();
    const ss = String(snap?.synthesis_status ?? "").trim().toLowerCase();
    const patch: Record<string, unknown> = {};

    if (ts === "pending" || ts === "") {
      patch.transcription_status = "failed";
      patch.transcription_error = message;
      patch.transcribed_at = null;
    }

    if (ts === "completed" && ss !== "completed" && ss !== "failed") {
      patch.synthesis_status = "failed";
      patch.synthesis_error = message;
    }

    if (Object.keys(patch).length > 0) {
      const { error: unexpectedPersistError } = await (admin as any)
        .from("lead_conversations")
        .update(patch)
        .eq("id", conversationId);
      if (unexpectedPersistError) {
        console.error("[conversations/upload] failed persisting unexpected processing failure", {
          conversationId,
          message: unexpectedPersistError.message,
          code: unexpectedPersistError.code
        });
      }
    }
  } finally {
    console.log("[conversations/upload] background processing finished", {
      conversationId,
      transcriptionStatus
    });
  }
}
