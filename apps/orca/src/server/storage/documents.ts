import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getR2Bucket, getR2Client } from "@/lib/r2";

const MAX_FILE_BYTES = 50 * 1024 * 1024;

const SUPPORTED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
]);

type PresignedUpload = {
  provider: "R2";
  method: "PUT";
  uploadUrl: string;
  objectKey: string;
  headers?: Record<string, string>;
};

function normalizeFilename(filename: string): string {
  return filename
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._-]/g, "")
    .replace(/^-+/, "")
    .slice(0, 120) || "file";
}

export function validateUploadConstraints(contentType: string, fileSizeBytes: number): void {
  if (!SUPPORTED_MIME_TYPES.has(contentType)) {
    throw new Error("Unsupported file type. Allowed: PDF, DOC/DOCX, XLS/XLSX, JPG, PNG");
  }

  if (!Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0 || fileSizeBytes > MAX_FILE_BYTES) {
    throw new Error("File size must be between 1 byte and 50MB");
  }
}

export function buildDocumentObjectKey(params: {
  eventId: string;
  documentId: string;
  originalFilename: string;
}): string {
  const filename = normalizeFilename(params.originalFilename);
  return `events/${params.eventId}/documents/${params.documentId}/${filename}`;
}

export async function createPresignedUpload(params: {
  objectKey: string;
  contentType: string;
  fileSizeBytes: number;
}): Promise<PresignedUpload> {
  validateUploadConstraints(params.contentType, params.fileSizeBytes);

  const client = getR2Client();
  const bucket = getR2Bucket();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: params.objectKey,
    ContentType: params.contentType,
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 60 * 10 });

  return {
    provider: "R2",
    method: "PUT",
    uploadUrl,
    objectKey: params.objectKey,
    headers: {
      "content-type": params.contentType,
    },
  };
}

export async function getDownloadUrl(objectKey: string): Promise<string> {
  const client = getR2Client();
  const bucket = getR2Bucket();
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: objectKey,
  });

  return getSignedUrl(client, command, { expiresIn: 60 * 10 });
}

export function maxUploadBytes(): number {
  return MAX_FILE_BYTES;
}
