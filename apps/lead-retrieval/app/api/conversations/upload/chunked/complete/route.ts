import {
  CompleteMultipartUploadCommand,
  HeadObjectCommand,
  ListPartsCommand
} from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { leadConversationNeedsProcessing } from "@/lib/conversations/lead-conversation-needs-processing";
import { processConversationUpload } from "@/lib/conversations/process-upload";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { abortMultipartUploadWithVerification } from "@/lib/conversations/r2-multipart-abort";
import {
  assertLeadUploadAccess,
  isValidConversationStoragePath
} from "@/lib/conversations/upload-access";
import { findMissingPartNumbers } from "@/lib/conversations/chunked-upload-parts";
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

const MISSING_PARTS_RECHECK_ATTEMPTS = 3;
const MISSING_PARTS_RECHECK_DELAY_MS = 300;
const COMPLETE_LOG_PREFIX = "[CHUNKED_COMPLETE]";

type UploadedPart = {
  partNumber: number;
  etag: string;
};

type ManifestPart = {
  chunkIndex: number;
  partNumber: number;
  etag: string;
};

function normalizeContentType(value: unknown) {
  const raw = String(value ?? "").split(";")[0].trim().toLowerCase();
  return raw || "audio/m4a";
}

function normalizeTotalParts(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error("totalParts must be a positive number");
  }
  return Math.floor(parsed);
}

function normalizeEtag(etag: string) {
  const trimmed = String(etag ?? "").trim();
  return trimmed.replace(/^"+|"+$/g, "");
}

function normalizeChunkManifest(value: unknown, totalParts: number): ManifestPart[] {
  if (!Array.isArray(value) || value.length === 0) {
    return [];
  }

  const manifest = value
    .map((item) => {
      const record = item as Record<string, unknown>;
      const partNumber = Math.floor(Number(record.partNumber));
      const chunkIndex = record.chunkIndex === undefined
        ? partNumber - 1
        : Math.floor(Number(record.chunkIndex));
      const etag = normalizeEtag(String(record.etag ?? ""));
      return {
        partNumber,
        chunkIndex,
        etag
      };
    })
    .filter((item) =>
      Number.isFinite(item.partNumber) &&
      Number.isFinite(item.chunkIndex) &&
      item.partNumber >= 1 &&
      item.partNumber <= 10000 &&
      item.chunkIndex >= 0 &&
      item.chunkIndex === item.partNumber - 1 &&
      Boolean(item.etag)
    )
    .sort((a, b) => a.partNumber - b.partNumber);

  const deduped = new Map<number, ManifestPart>();
  for (const entry of manifest) {
    deduped.set(entry.partNumber, entry);
  }
  const uniqueParts = Array.from(deduped.values()).sort((a, b) => a.partNumber - b.partNumber);
  if (uniqueParts.length > 0 && uniqueParts.length !== totalParts) {
    throw new Error("chunkManifest does not include all parts.");
  }

  return uniqueParts;
}

async function listUploadedParts(storagePath: string, uploadId: string): Promise<UploadedPart[]> {
  const uploadedParts: UploadedPart[] = [];
  let marker: string | undefined;

  while (true) {
    const response = await r2Client.send(
      new ListPartsCommand({
        Bucket: R2_BUCKET,
        Key: storagePath,
        UploadId: uploadId,
        PartNumberMarker: marker
      })
    );

    for (const part of response.Parts ?? []) {
      const partNumber = Number(part.PartNumber ?? 0);
      const etag = String(part.ETag ?? "").trim();
      if (!partNumber || !etag) continue;
      uploadedParts.push({ partNumber, etag });
    }

    if (!response.IsTruncated) {
      break;
    }

    const nextMarker = Number(response.NextPartNumberMarker ?? 0);
    if (!nextMarker || marker === String(nextMarker)) {
      break;
    }
    marker = String(nextMarker);
  }

  uploadedParts.sort((a, b) => a.partNumber - b.partNumber);
  return uploadedParts;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function abortMultipartUploadSafely(input: {
  leadId: string;
  storagePath: string;
  uploadId: string;
  reason: string;
  details?: Record<string, unknown>;
}) {
  await abortMultipartUploadWithVerification({
    leadId: input.leadId,
    storagePath: input.storagePath,
    uploadId: input.uploadId,
    stage: "finalize",
    reason: input.reason,
    details: {
      completed: false,
      aborted: true,
      ...(input.details ?? {})
    }
  });
}

async function loadUploadedPartsWithRetries(input: {
  leadId: string;
  storagePath: string;
  uploadId: string;
  totalParts: number;
}) {
  let uploadedParts: UploadedPart[] = [];
  let missingPartNumbers: number[] = [];
  for (let attempt = 1; attempt <= MISSING_PARTS_RECHECK_ATTEMPTS; attempt += 1) {
    uploadedParts = await listUploadedParts(input.storagePath, input.uploadId);
    const uploadedPartNumbers = uploadedParts.map((part) => part.partNumber);
    missingPartNumbers = findMissingPartNumbers(input.totalParts, uploadedPartNumbers);

    if (missingPartNumbers.length === 0) {
      return { uploadedParts, missingPartNumbers, attemptsUsed: attempt };
    }

    if (attempt < MISSING_PARTS_RECHECK_ATTEMPTS) {
      await sleep(MISSING_PARTS_RECHECK_DELAY_MS);
    }
  }

  return {
    uploadedParts,
    missingPartNumbers,
    attemptsUsed: MISSING_PARTS_RECHECK_ATTEMPTS
  };
}

export async function POST(request: Request) {
  let trackedLeadId = "";
  let trackedStoragePath = "";
  let trackedUploadId = "";
  let multipartCompleted = false;
  let abortAttempted = false;

  const failWithAbort = async (input: {
    status: number;
    body: Record<string, unknown>;
    reason: string;
    details?: Record<string, unknown>;
  }) => {
    console.error(`${COMPLETE_LOG_PREFIX} failure_path`, {
      leadId: trackedLeadId,
      storagePath: trackedStoragePath,
      uploadId: trackedUploadId,
      status: input.status,
      reason: input.reason,
      details: input.details ?? null
    });

    if (!abortAttempted && !multipartCompleted && trackedUploadId && trackedStoragePath) {
      abortAttempted = true;
      await abortMultipartUploadSafely({
        leadId: trackedLeadId,
        storagePath: trackedStoragePath,
        uploadId: trackedUploadId,
        reason: input.reason,
        details: input.details
      });
    }

    return NextResponse.json(input.body, { status: input.status });
  };

  try {
    const sessionUser = await resolveApiSession(request);
    const payload = (await request.json().catch(() => ({}))) as {
      leadId?: unknown;
      storagePath?: unknown;
      uploadId?: unknown;
      contentType?: unknown;
      totalParts?: unknown;
      chunkManifest?: unknown;
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
    const uploadId = String(payload.uploadId ?? "").trim();
    trackedLeadId = leadId;
    trackedStoragePath = storagePath;
    trackedUploadId = uploadId;
    const contentType = normalizeContentType(payload.contentType);
    const totalParts = normalizeTotalParts(payload.totalParts);
    const manifestParts = normalizeChunkManifest(payload.chunkManifest, totalParts);

    if (!leadId) {
      return failWithAbort({
        status: 400,
        body: { error: "leadId is required" },
        reason: "missing_lead_id"
      });
    }
    if (!storagePath) {
      return failWithAbort({
        status: 400,
        body: { error: "storagePath is required" },
        reason: "missing_storage_path"
      });
    }
    if (!uploadId) {
      return failWithAbort({
        status: 400,
        body: { error: "uploadId is required" },
        reason: "missing_upload_id"
      });
    }
    if (!isValidConversationStoragePath(leadId, storagePath)) {
      return failWithAbort({
        status: 400,
        body: { error: "Invalid storagePath for leadId" },
        reason: "invalid_storage_path"
      });
    }

    await assertLeadUploadAccess(sessionUser, leadId);

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
        logContext: `app/api/conversations/upload/chunked/complete:${source}`
      });
      console.info(`${COMPLETE_LOG_PREFIX} workflow_re_evaluation_completed`, {
        leadId,
        storagePath,
        source,
        workflowEmitAttempted: workflowEmit.attempted,
        workflowEmitStatus: workflowEmit.status,
        workflowEmitReason: workflowEmit.reason ?? null
      });
    }

    if (existingConversation?.id) {
      const conversationId = String(existingConversation.id);
      const voiceNoteId = await finalizeContextVoiceNoteLink(conversationId);
      if (!leadConversationNeedsProcessing(existingConversation)) {
        const st = await reloadStatuses(conversationId);
        const voiceNoteResponse = await buildVoiceNoteResponse(conversationId, voiceNoteId);
        await reEvaluateWorkflowsAfterConversation("conversation_chunked_existing");
        return NextResponse.json({
          success: true,
          conversationId,
          storagePath,
          transcriptionStatus: st.transcriptionStatus,
          synthesisStatus: st.synthesisStatus,
          ...voiceNoteResponse
        });
      }

      const resolvedContentType =
        String(existingConversation.content_type ?? "").trim() || contentType;
      await runConversationReadinessSideEffect("audio_finalized_existing", () =>
        markConversationAudioFinalized({
          supabase: admin,
          leadId,
          conversationId
        })
      );
      await runConversationReadinessSideEffect("resume_after_audio_finalized_existing", () =>
        resumeWaitingWorkflowStepsForLead({ supabase: admin, leadId })
      );
      await processConversationUpload({
        conversationId,
        leadId,
        storagePath,
        contentType: resolvedContentType,
        voiceNoteContextConversationSync: voiceNoteMeta.adoptAndSyncConversation
      });
      const st = await reloadStatuses(conversationId);
      const voiceNoteResponse = await buildVoiceNoteResponse(conversationId, voiceNoteId);
      await reEvaluateWorkflowsAfterConversation("conversation_chunked_existing_processed");
      return NextResponse.json({
        success: true,
        conversationId,
        storagePath,
        transcriptionStatus: st.transcriptionStatus,
        synthesisStatus: st.synthesisStatus,
        ...voiceNoteResponse
      });
    }

    const { uploadedParts, missingPartNumbers: initiallyMissingPartNumbers, attemptsUsed } =
      await loadUploadedPartsWithRetries({
      leadId,
      storagePath,
      uploadId,
      totalParts
    });
    const uploadedPartNumbers = uploadedParts.map((part) => part.partNumber);
    const uploadedPartMap = new Map(
      uploadedParts.map((part) => [part.partNumber, normalizeEtag(part.etag)])
    );
    const missingPartNumbers = [...initiallyMissingPartNumbers];

    if (missingPartNumbers.length > 0) {
      return failWithAbort({
        status: 400,
        body: {
          error: "Upload is incomplete. Some chunks are missing.",
          missingPartNumbers
        },
        reason: "missing_parts_after_retries",
        details: {
          attemptsUsed,
          expectedPartCount: totalParts,
          missingParts: missingPartNumbers
        }
      });
    }

    const partsForCompletion = manifestParts.length > 0
      ? manifestParts.map((part) => ({
          PartNumber: part.partNumber,
          ETag: part.etag
        }))
      : uploadedParts.map((part) => ({
          PartNumber: part.partNumber,
          ETag: part.etag
        }));

    if (manifestParts.length > 0) {
      const mismatchedParts: number[] = [];
      for (const part of manifestParts) {
        const uploadedEtag = uploadedPartMap.get(part.partNumber);
        if (!uploadedEtag || uploadedEtag !== normalizeEtag(part.etag)) {
          mismatchedParts.push(part.partNumber);
        }
      }

      if (mismatchedParts.length > 0) {
        return failWithAbort({
          status: 400,
          body: {
            error: "chunkManifest does not match uploaded chunks.",
            mismatchedPartNumbers: mismatchedParts
          },
          reason: "manifest_mismatch",
          details: { mismatchedParts }
        });
      }
    }

    try {
      console.log(`${COMPLETE_LOG_PREFIX} before_complete_multipart_upload`, {
        leadId,
        storagePath,
        uploadId,
        partCount: partsForCompletion.length,
        totalParts
      });
      await r2Client.send(
        new CompleteMultipartUploadCommand({
          Bucket: R2_BUCKET,
          Key: storagePath,
          UploadId: uploadId,
          MultipartUpload: {
            Parts: partsForCompletion
          }
        })
      );
      await r2Client.send(
        new HeadObjectCommand({
          Bucket: R2_BUCKET,
          Key: storagePath
        })
      );
      multipartCompleted = true;
    } catch (completeError) {
      console.error(`${COMPLETE_LOG_PREFIX} complete_multipart_upload_failed`, {
        leadId,
        storagePath,
        uploadId,
        partCount: partsForCompletion.length,
        totalParts,
        message: completeError instanceof Error ? completeError.message : String(completeError),
        stack: completeError instanceof Error ? completeError.stack : null
      });
      abortAttempted = true;
      await abortMultipartUploadSafely({
        leadId,
        storagePath,
        uploadId,
        reason: "complete_failed",
        details: {
          message: completeError instanceof Error ? completeError.message : String(completeError)
        }
      });
      throw completeError;
    }

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

    const conversationId = String(insertedConversation?.id ?? "").trim();
    if (!conversationId) {
      throw new Error("Failed creating lead conversation.");
    }

    const voiceNoteId = await finalizeContextVoiceNoteLink(conversationId);
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
    await processConversationUpload({
      conversationId,
      leadId,
      storagePath,
      contentType,
      voiceNoteContextConversationSync: voiceNoteMeta.adoptAndSyncConversation
    });

    const { data: finalRow } = await (admin as any)
      .from("lead_conversations")
      .select("transcription_status, synthesis_status")
      .eq("id", conversationId)
      .maybeSingle();

    const voiceNoteResponse = await buildVoiceNoteResponse(conversationId, voiceNoteId);
    await reEvaluateWorkflowsAfterConversation("conversation_chunked_complete");

    return NextResponse.json({
      success: true,
      conversationId,
      storagePath,
      transcriptionStatus: String(finalRow?.transcription_status ?? "pending"),
      synthesisStatus: finalRow?.synthesis_status != null ? String(finalRow.synthesis_status) : null,
      ...voiceNoteResponse
    });
  } catch (error) {
    if (!abortAttempted && !multipartCompleted && trackedUploadId && trackedStoragePath) {
      abortAttempted = true;
      await abortMultipartUploadSafely({
        leadId: trackedLeadId,
        storagePath: trackedStoragePath,
        uploadId: trackedUploadId,
        reason: error instanceof Error ? error.message : "finalize_error",
        details: {
          completed: false,
          aborted: true
        }
      });
    }
    if (error instanceof Response) {
      console.error(`${COMPLETE_LOG_PREFIX} response_error_thrown`, {
        leadId: trackedLeadId,
        storagePath: trackedStoragePath,
        uploadId: trackedUploadId
      });
      return error;
    }
    console.error(`${COMPLETE_LOG_PREFIX} unhandled_error`, {
      leadId: trackedLeadId,
      storagePath: trackedStoragePath,
      uploadId: trackedUploadId,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null
    });
    const message = error instanceof Error ? error.message : "Failed completing chunked upload";
    const status =
      message === "Forbidden"
        ? 403
        : message === "Lead not found"
          ? 404
          : message.includes("totalParts must be") || message.includes("chunkManifest")
            ? 400
            : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
