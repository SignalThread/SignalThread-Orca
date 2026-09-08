import { ListPartsCommand, UploadPartCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import { resolveApiSession } from "@/lib/auth/resolveApiSession";
import { abortMultipartUploadWithVerification } from "@/lib/conversations/r2-multipart-abort";
import { assertLeadUploadAccess, isValidConversationStoragePath } from "@/lib/conversations/upload-access";
import { R2_BUCKET, r2Client } from "@/lib/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PART_URL_TTL_SECONDS = 15 * 60;

type UploadedPart = {
  partNumber: number;
  etag: string;
};

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
    if (!nextMarker || String(nextMarker) === marker) {
      break;
    }
    marker = String(nextMarker);
  }

  uploadedParts.sort((a, b) => a.partNumber - b.partNumber);
  return uploadedParts;
}

function normalizeNumericArray(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    return [];
  }

  return value
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item))
    .map((item) => Math.floor(item));
}

function normalizePartNumbers(value: unknown, chunkIndexes: unknown) {
  const explicitParts = normalizeNumericArray(value)
    .filter((part) => part >= 1 && part <= 10000);

  const partsFromChunkIndexes = normalizeNumericArray(chunkIndexes)
    .filter((index) => index >= 0 && index <= 9999)
    .map((index) => index + 1);

  const combined = [...explicitParts, ...partsFromChunkIndexes]
    .filter((part) => part >= 1 && part <= 10000);

  if (combined.length === 0) {
    throw new Error("partNumbers or chunkIndexes must contain at least one valid item");
  }

  const parts = combined
    .filter((part) => Number.isFinite(part) && part >= 1 && part <= 10000)
    .map((part) => Math.floor(part));

  if (parts.length === 0) {
    throw new Error("partNumbers must contain valid positive integers");
  }

  return Array.from(new Set(parts)).sort((a, b) => a - b);
}

export async function POST(request: Request) {
  let trackedLeadId = "";
  let trackedStoragePath = "";
  let trackedUploadId = "";
  let abortAttempted = false;

  const failWithAbort = async (input: {
    status: number;
    error: string;
    stage: "chunk-urls";
    reason: string;
  }) => {
    if (!abortAttempted && trackedUploadId && trackedStoragePath) {
      abortAttempted = true;
      await abortMultipartUploadWithVerification({
        leadId: trackedLeadId,
        storagePath: trackedStoragePath,
        uploadId: trackedUploadId,
        stage: input.stage,
        reason: input.reason
      });
    }
    return NextResponse.json({ error: input.error }, { status: input.status });
  };

  try {
    const sessionUser = await resolveApiSession(request);
    const payload = (await request.json().catch(() => ({}))) as {
      leadId?: unknown;
      storagePath?: unknown;
      uploadId?: unknown;
      partNumbers?: unknown;
      chunkIndexes?: unknown;
    };

    const leadId = String(payload.leadId ?? "").trim();
    const storagePath = String(payload.storagePath ?? "").trim();
    const uploadId = String(payload.uploadId ?? "").trim();
    const partNumbers = normalizePartNumbers(payload.partNumbers, payload.chunkIndexes);
    trackedLeadId = leadId;
    trackedStoragePath = storagePath;
    trackedUploadId = uploadId;

    if (!leadId) {
      return failWithAbort({
        status: 400,
        error: "leadId is required",
        stage: "chunk-urls",
        reason: "missing_lead_id"
      });
    }
    if (!storagePath) {
      return failWithAbort({
        status: 400,
        error: "storagePath is required",
        stage: "chunk-urls",
        reason: "missing_storage_path"
      });
    }
    if (!uploadId) {
      return failWithAbort({
        status: 400,
        error: "uploadId is required",
        stage: "chunk-urls",
        reason: "missing_upload_id"
      });
    }
    if (!isValidConversationStoragePath(leadId, storagePath)) {
      return failWithAbort({
        status: 400,
        error: "Invalid storagePath for leadId",
        stage: "chunk-urls",
        reason: "invalid_storage_path"
      });
    }

    await assertLeadUploadAccess(sessionUser, leadId);

    const uploadedParts = await listUploadedParts(storagePath, uploadId);
    const uploadedPartNumbers = uploadedParts.map((part) => part.partNumber);
    const uploadedChunkIndexes = uploadedPartNumbers.map((partNumber) => partNumber - 1);

    const chunkUploadUrls = await Promise.all(
      partNumbers.map(async (partNumber) => {
        const command = new UploadPartCommand({
          Bucket: R2_BUCKET,
          Key: storagePath,
          UploadId: uploadId,
          PartNumber: partNumber
        });

        const uploadUrl = await getSignedUrl(r2Client, command, {
          expiresIn: PART_URL_TTL_SECONDS
        });

        return {
          partNumber,
          uploadUrl,
          uploadMethod: "PUT" as const,
          uploadHeaders: {}
        };
      })
    );

    return NextResponse.json({
      success: true,
      storagePath,
      uploadId,
      uploadedPartNumbers,
      uploadedChunkIndexes,
      uploadedParts,
      chunkUploadUrls
    });
  } catch (error) {
    if (error instanceof Response) {
      if (!abortAttempted && trackedUploadId && trackedStoragePath) {
        abortAttempted = true;
        await abortMultipartUploadWithVerification({
          leadId: trackedLeadId,
          storagePath: trackedStoragePath,
          uploadId: trackedUploadId,
          stage: "chunk-urls",
          reason: "response_error"
        });
      }
      return error;
    }
    if (!abortAttempted && trackedUploadId && trackedStoragePath) {
      abortAttempted = true;
      await abortMultipartUploadWithVerification({
        leadId: trackedLeadId,
        storagePath: trackedStoragePath,
        uploadId: trackedUploadId,
        stage: "chunk-urls",
        reason: error instanceof Error ? error.message : "chunk_urls_error"
      });
    }
    const message = error instanceof Error ? error.message : "Failed generating chunk upload URLs";
    const status =
      message === "Forbidden"
        ? 403
        : message === "Lead not found"
          ? 404
          : message.includes("partNumbers")
              || message.includes("chunkIndexes")
            ? 400
            : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
