import { readFileSync } from "node:fs";
import {
  AbortMultipartUploadCommand,
  ListMultipartUploadsCommand,
  S3Client
} from "@aws-sdk/client-s3";

type MultipartUploadEntry = {
  key: string;
  uploadId: string;
};

const BUCKET = "lrapp";

function loadEnvFileIfPresent(path: string) {
  try {
    const content = readFileSync(path, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eqIndex = line.indexOf("=");
      if (eqIndex <= 0) continue;
      const key = line.slice(0, eqIndex).trim();
      if (!key || process.env[key] !== undefined) continue;
      let value = line.slice(eqIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {
    // Ignore missing .env.local; rely on process env.
  }
}

function getR2Client() {
  const endpoint = process.env.R2_ENDPOINT ?? "";
  const accessKeyId = process.env.R2_ACCESS_KEY_ID ?? "";
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? "";

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Missing R2 env vars. Required: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY"
    );
  }

  return new S3Client({
    endpoint,
    region: "auto",
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  });
}

async function listAllMultipartUploads(client: S3Client, bucket: string) {
  const uploads: MultipartUploadEntry[] = [];
  let keyMarker: string | undefined;
  let uploadIdMarker: string | undefined;

  while (true) {
    const response = await client.send(
      new ListMultipartUploadsCommand({
        Bucket: bucket,
        KeyMarker: keyMarker,
        UploadIdMarker: uploadIdMarker
      })
    );

    for (const upload of response.Uploads ?? []) {
      const key = typeof upload.Key === "string" ? upload.Key : "";
      const uploadId = String(upload.UploadId ?? "").trim();
      if (!key || !uploadId) continue;
      uploads.push({ key, uploadId });
    }

    if (!response.IsTruncated) break;
    keyMarker = response.NextKeyMarker;
    uploadIdMarker = response.NextUploadIdMarker;
  }

  return uploads;
}

async function main() {
  loadEnvFileIfPresent(".env.local");
  const client = getR2Client();

  const uploads = await listAllMultipartUploads(client, BUCKET);
  if (uploads.length === 0) {
    console.log(`[R2 MULTIPART CLEANUP] no ongoing uploads found in bucket=${BUCKET}`);
    console.log("[R2 MULTIPART CLEANUP] aborted_count=0");
    console.log("[R2 MULTIPART CLEANUP] already_gone_count=0");
    console.log("[R2 MULTIPART CLEANUP] failed_count=0");
    return;
  }

  let abortedCount = 0;
  let alreadyGoneCount = 0;
  let failedCount = 0;

  for (const upload of uploads) {
    console.log(`[R2 MULTIPART CLEANUP] raw_upload_key=${upload.key}`);
    console.log(`[R2 MULTIPART CLEANUP] aborting key=${upload.key} uploadId=${upload.uploadId}`);
    try {
      await client.send(
        new AbortMultipartUploadCommand({
          Bucket: BUCKET,
          Key: upload.key,
          UploadId: upload.uploadId
        })
      );
      abortedCount += 1;
    } catch (error) {
      const maybeError = error as { name?: string; Code?: string; code?: string; message?: string };
      const isNoSuchUpload =
        maybeError?.name === "NoSuchUpload" ||
        maybeError?.Code === "NoSuchUpload" ||
        maybeError?.code === "NoSuchUpload";

      if (isNoSuchUpload) {
        alreadyGoneCount += 1;
        console.warn(
          `[R2 MULTIPART CLEANUP] upload already gone key=${upload.key} uploadId=${upload.uploadId}`
        );
        continue;
      }

      failedCount += 1;
      console.error("[R2 MULTIPART CLEANUP] abort failed", {
        key: upload.key,
        uploadId: upload.uploadId,
        message: maybeError?.message ?? String(error),
        name: maybeError?.name ?? null,
        code: maybeError?.Code ?? maybeError?.code ?? null
      });
    }
  }

  console.log(`[R2 MULTIPART CLEANUP] total_found=${uploads.length}`);
  console.log(`[R2 MULTIPART CLEANUP] aborted_count=${abortedCount}`);
  console.log(`[R2 MULTIPART CLEANUP] already_gone_count=${alreadyGoneCount}`);
  console.log(`[R2 MULTIPART CLEANUP] failed_count=${failedCount}`);
}

void main().catch((error) => {
  console.error("[R2 MULTIPART CLEANUP] failed", {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : null
  });
  process.exit(1);
});
