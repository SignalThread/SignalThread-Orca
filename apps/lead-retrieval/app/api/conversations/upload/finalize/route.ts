import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { leadConversationNeedsProcessing } from "@/lib/conversations/lead-conversation-needs-processing";
import { processConversationUpload } from "@/lib/conversations/process-upload";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import {
  assertLeadUploadAccess,
  isValidConversationStoragePath
} from "@/lib/conversations/upload-access";
import {
  adoptContextVoiceNoteFromUpload,
  loadContextVoiceNoteSnapshot,
  parseContextVoiceNoteFromUploadCompletePayload,
  syncContextVoiceNoteFromConversationIfNeeded
} from "@/lib/conversations/context-voice-note-complete";
import { createAdminClient } from "@/lib/supabase/admin";
import { markConversationAudioFinalized } from "@/lib/conversations/conversation-readiness";
import { runConversationReadinessSideEffect } from "@/lib/conversations/readiness-side-effects";
import { resumeWaitingWorkflowStepsForLead } from "@/lib/workflows/runner/resume-waiting";
import { attemptLeadCapturedWorkflowEmitForLeadId } from "@/lib/workflows/emit/lead-captured-emit-for-lead";
import { R2_BUCKET, r2Client } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function normalizeContentType(value: unknown) {
  const raw = String(value ?? "").split(";")[0].trim().toLowerCase();
  return raw || "audio/m4a";
}

export async function POST(request: Request) {
  try {
    console.log("[conversations/upload/finalize] route entered", {
      method: request.method,
      contentType: request.headers.get("content-type"),
      contentLength: request.headers.get("content-length"),
      authHeaderPresent: Boolean(request.headers.get("authorization"))
    });

    const sessionUser = await resolveApiSession(request);
    const payload = (await request.json().catch(() => ({}))) as {
      leadId?: unknown;
      storagePath?: unknown;
      contentType?: unknown;
      voiceNoteLocalId?: unknown;
      voice_note_local_id?: unknown;
      voiceNoteSource?: unknown;
      voice_note_source?: unknown;
      voiceNoteDurationMs?: unknown;
      voice_note_duration_ms?: unknown;
      durationMs?: unknown;
      duration_ms?: unknown;
      voiceNoteDurationSeconds?: unknown;
      voice_note_duration_seconds?: unknown;
      durationSeconds?: unknown;
      duration_seconds?: unknown;
    };
    const voiceNoteMeta = parseContextVoiceNoteFromUploadCompletePayload(
      payload as Record<string, unknown>
    );

    const leadId = String(payload.leadId ?? "").trim();
    const storagePath = String(payload.storagePath ?? "").trim();
    const contentType = normalizeContentType(payload.contentType);

    if (!leadId) {
      return NextResponse.json({ error: "leadId is required" }, { status: 400 });
    }
    if (!storagePath) {
      return NextResponse.json({ error: "storagePath is required" }, { status: 400 });
    }
    if (!isValidConversationStoragePath(leadId, storagePath)) {
      return NextResponse.json({ error: "Invalid storagePath for leadId" }, { status: 400 });
    }

    await assertLeadUploadAccess(sessionUser, leadId);

    try {
      await r2Client.send(
        new HeadObjectCommand({
          Bucket: R2_BUCKET,
          Key: storagePath
        })
      );
    } catch (error) {
      console.error("[conversations/upload/finalize] uploaded object missing", {
        leadId,
        storagePath,
        message: error instanceof Error ? error.message : String(error)
      });
      return NextResponse.json({ error: "Uploaded object not found in storage" }, { status: 400 });
    }

    const admin = createAdminClient();

    async function finalizeContextVoiceNoteLink(conversationId: string): Promise<string | null> {
      if (!voiceNoteMeta.adoptAndSyncConversation || !voiceNoteMeta.clientLocalNoteId) {
        return null;
      }
      return await adoptContextVoiceNoteFromUpload({
        admin,
        leadId,
        createdByUserId: sessionUser.userId,
        conversationId,
        storagePathAsAudioUrl: storagePath,
        clientLocalNoteId: voiceNoteMeta.clientLocalNoteId,
        durationMs: voiceNoteMeta.durationMs
      });
    }

    const { data: existingConversation, error: existingConversationError } = await (admin as any)
      .from("lead_conversations")
      .select("id, transcription_status, synthesis_status, transcript, summary, content_type")
      .eq("lead_id", leadId)
      .eq("storage_path", storagePath)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingConversationError) {
      throw new Error(existingConversationError.message ?? "Failed checking existing conversation.");
    }

    async function reloadStatuses(conversationId: string) {
      const { data: row } = await (admin as any)
        .from("lead_conversations")
        .select("transcription_status, synthesis_status")
        .eq("id", conversationId)
        .maybeSingle();
      return {
        transcriptionStatus: String(row?.transcription_status ?? "pending"),
        synthesisStatus: row?.synthesis_status != null ? String(row.synthesis_status) : null
      };
    }

    async function buildVoiceNoteResponse(conversationId: string, voiceNoteId: string | null) {
      const voiceNote = voiceNoteMeta.adoptAndSyncConversation
        ? await syncContextVoiceNoteFromConversationIfNeeded({
            admin,
            leadId,
            conversationId,
            voiceNoteId
          })
        : await loadContextVoiceNoteSnapshot({
            admin,
            leadId,
            voiceNoteId,
            conversationId
          });

      if (voiceNoteMeta.adoptAndSyncConversation && !voiceNote?.id) {
        throw new Error("Canonical voice note row was not created.");
      }

      return {
        voiceNoteId: voiceNote?.id ?? voiceNoteId ?? null,
        voiceNote
      };
    }

    async function reEvaluateWorkflowsAfterConversation(source: string) {
      await runConversationReadinessSideEffect(`resume:${source}`, () =>
        resumeWaitingWorkflowStepsForLead({ supabase: admin, leadId })
      );
      const workflowEmit = await attemptLeadCapturedWorkflowEmitForLeadId({
        leadId,
        source,
        logContext: `app/api/conversations/upload/finalize:${source}`
      });
      console.info("[conversations/upload/finalize] workflow re-evaluation completed", {
        leadId,
        storagePath,
        source,
        workflowEmitAttempted: workflowEmit.attempted,
        workflowEmitStatus: workflowEmit.status,
        workflowEmitReason: workflowEmit.reason ?? null
      });
    }

    let conversationId = "";
    let voiceNoteId: string | null = null;

    if (existingConversation?.id) {
      conversationId = String(existingConversation.id);
      voiceNoteId = await finalizeContextVoiceNoteLink(conversationId);
      if (!leadConversationNeedsProcessing(existingConversation)) {
        const st = await reloadStatuses(conversationId);
        const voiceNoteResponse = await buildVoiceNoteResponse(conversationId, voiceNoteId);
        await reEvaluateWorkflowsAfterConversation("conversation_finalize_existing");
        return NextResponse.json({
          success: true,
          conversationId,
          storagePath,
          transcriptionStatus: st.transcriptionStatus,
          synthesisStatus: st.synthesisStatus,
          ...voiceNoteResponse
        });
      }
    } else {
      console.log("[conversations/upload/finalize] inserting lead_conversations row");
      const { data: insertedConversation, error: insertError } = await (admin as any)
        .from("lead_conversations")
        .insert({
          lead_id: leadId,
          storage_path: storagePath,
          content_type: contentType,
          transcription_status: "pending",
          transcription_error: null,
          transcript: null,
          transcribed_at: null,
          created_at: new Date().toISOString()
        })
        .select("id")
        .single();

      if (insertError) {
        throw new Error(insertError.message ?? "Failed creating lead conversation.");
      }

      conversationId = String(insertedConversation?.id ?? "").trim();
      if (!conversationId) {
        throw new Error("Failed creating lead conversation.");
      }

      voiceNoteId = await finalizeContextVoiceNoteLink(conversationId);

      console.log("[conversations/upload/finalize] conversation row inserted", {
        leadId,
        conversationId,
        storagePath
      });
    }

    await runConversationReadinessSideEffect("audio_finalized", () =>
      markConversationAudioFinalized({
        supabase: admin,
        leadId,
        conversationId
      })
    );
    await runConversationReadinessSideEffect("resume_after_audio_finalized", () =>
      resumeWaitingWorkflowStepsForLead({ supabase: admin, leadId })
    );

    const resolvedContentType =
      existingConversation?.id && leadConversationNeedsProcessing(existingConversation)
        ? String(existingConversation.content_type ?? "").trim() || contentType
        : contentType;

    await processConversationUpload({
      conversationId,
      leadId,
      storagePath,
      contentType: resolvedContentType
    });

    const st = await reloadStatuses(conversationId);
    const voiceNoteResponse = await buildVoiceNoteResponse(conversationId, voiceNoteId);
    await reEvaluateWorkflowsAfterConversation("conversation_finalize");

    return NextResponse.json({
      success: true,
      conversationId,
      storagePath,
      transcriptionStatus: st.transcriptionStatus,
      synthesisStatus: st.synthesisStatus,
      ...voiceNoteResponse
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    const message = error instanceof Error ? error.message : "Finalize failed";
    const status = message === "Forbidden" ? 403 : message === "Lead not found" ? 404 : 500;
    console.error("[conversations/upload/finalize] fatal error", {
      message,
      stack: error instanceof Error ? error.stack : null
    });
    return NextResponse.json({ error: message }, { status });
  }
}
