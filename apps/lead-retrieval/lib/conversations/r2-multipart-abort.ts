import { AbortMultipartUploadCommand } from "@aws-sdk/client-s3";
import { R2_BUCKET, r2Client } from "@/lib/r2";

type AbortStage = "session" | "chunk-urls" | "part" | "finalize" | "abort";

type AbortMultipartUploadWithVerificationInput = {
  leadId: string;
  storagePath: string;
  uploadId: string;
  stage: AbortStage;
  reason: string;
  details?: Record<string, unknown>;
};

export async function abortMultipartUploadWithVerification(
  input: AbortMultipartUploadWithVerificationInput
) {
  try {
    await r2Client.send(
      new AbortMultipartUploadCommand({
        Bucket: R2_BUCKET,
        Key: input.storagePath,
        UploadId: input.uploadId
      })
    );
    return true;
  } catch (error) {
    console.error("[CHUNKED_MULTIPART] abort_error", {
      uploadId: input.uploadId,
      stage: input.stage,
      reason: input.reason,
      bucket: R2_BUCKET,
      key: input.storagePath,
      leadId: input.leadId,
      ...(input.details ?? {}),
      error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null
    });
    return false;
  }
}
