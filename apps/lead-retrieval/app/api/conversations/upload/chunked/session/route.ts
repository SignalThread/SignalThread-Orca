import { CreateMultipartUploadCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { computeTotalParts, DEFAULT_VOICE_CHUNK_SIZE_BYTES } from "@/lib/conversations/chunked-upload-client";
import { abortMultipartUploadWithVerification } from "@/lib/conversations/r2-multipart-abort";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { assertLeadUploadAccess, buildConversationStoragePath } from "@/lib/conversations/upload-access";
import { R2_BUCKET, r2Client } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeIncomingContentType(value: unknown) {
  const raw = String(value ?? "").split(";")[0].trim().toLowerCase();
  if (!raw) return "audio/m4a";
  if (!raw.startsWith("audio/")) {
    throw new Error("contentType must be an audio/* mime type");
  }
  return raw;
}

function normalizeFileSize(value: unknown) {
  const fileSize = Number(value);
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    throw new Error("fileSize must be a positive number");
  }
  return Math.floor(fileSize);
}

function normalizeChunkDurationSeconds(value: unknown) {
  const raw = value === undefined || value === null ? 8 : Number(value);
  if (!Number.isFinite(raw)) {
    throw new Error("chunkDurationSeconds must be numeric.");
  }
  const normalized = Math.floor(raw);
  if (normalized < 5 || normalized > 10) {
    throw new Error("chunkDurationSeconds must be between 5 and 10 seconds.");
  }
  return normalized;
}

export async function POST(request: Request) {
  let trackedLeadId = "";
  let trackedStoragePath = "";
  let trackedUploadId = "";
  let abortAttempted = false;
  try {
    const sessionUser = await resolveApiSession(request);
    const payload = (await request.json().catch(() => ({}))) as {
      leadId?: unknown;
      contentType?: unknown;
      fileSize?: unknown;
      chunkDurationSeconds?: unknown;
    };

    const leadId = String(payload.leadId ?? "").trim();
    trackedLeadId = leadId;
    if (!leadId) {
      return NextResponse.json({ error: "leadId is required" }, { status: 400 });
    }

    const contentType = normalizeIncomingContentType(payload.contentType);
    const fileSize = normalizeFileSize(payload.fileSize);
    const chunkDurationSeconds = normalizeChunkDurationSeconds(payload.chunkDurationSeconds);

    await assertLeadUploadAccess(sessionUser, leadId);

    const storagePath = buildConversationStoragePath(leadId);
    trackedStoragePath = storagePath;
    const multipartUpload = await r2Client.send(
      new CreateMultipartUploadCommand({
        Bucket: R2_BUCKET,
        Key: storagePath,
        ContentType: contentType
      })
    );

    const uploadId = String(multipartUpload.UploadId ?? "").trim();
    trackedUploadId = uploadId;
    if (!uploadId) {
      throw new Error("Failed to create multipart upload session.");
    }

    const totalParts = computeTotalParts(fileSize, DEFAULT_VOICE_CHUNK_SIZE_BYTES);

    return NextResponse.json({
      success: true,
      session: {
        leadId,
        storagePath,
        uploadId,
        contentType,
        fileSize,
        chunkSizeBytes: DEFAULT_VOICE_CHUNK_SIZE_BYTES,
        totalParts,
        chunkDurationSeconds
      }
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    if (!abortAttempted && trackedUploadId && trackedStoragePath) {
      abortAttempted = true;
      await abortMultipartUploadWithVerification({
        leadId: trackedLeadId,
        storagePath: trackedStoragePath,
        uploadId: trackedUploadId,
        stage: "session",
        reason: error instanceof Error ? error.message : "session_error"
      });
    }
    const message = error instanceof Error ? error.message : "Failed creating chunked upload session";
    const status =
      message === "Forbidden"
        ? 403
        : message === "Lead not found"
          ? 404
          : message.includes("contentType must") ||
              message.includes("fileSize must") ||
              message.includes("chunkDurationSeconds must")
            ? 400
            : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
