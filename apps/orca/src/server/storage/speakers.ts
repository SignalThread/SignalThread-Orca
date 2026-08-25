import { createPresignedUpload, getDownloadUrl } from "@/src/server/storage/documents";

const MAX_HEADSHOT_BYTES = 5 * 1024 * 1024;
const SUPPORTED_HEADSHOT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function normalizeFilename(filename: string): string {
  return filename
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._-]/g, "")
    .replace(/^-+/, "")
    .slice(0, 120) || "headshot";
}

export function validateSpeakerHeadshotUpload(contentType: string, fileSizeBytes: number): void {
  if (!SUPPORTED_HEADSHOT_TYPES.has(contentType)) {
    throw new Error("Unsupported headshot type. Allowed: JPG, PNG, WEBP");
  }

  if (!Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0 || fileSizeBytes > MAX_HEADSHOT_BYTES) {
    throw new Error("Headshot size must be between 1 byte and 5MB");
  }
}

export function buildSpeakerHeadshotObjectKey(input: {
  eventId: string;
  speakerId: string;
  filename: string;
}): string {
  return `events/${input.eventId}/speakers/${input.speakerId}/headshot/${normalizeFilename(input.filename)}`;
}

export function buildSpeakerHeadshotUrl(objectKey: string): string {
  return `/api/speaker-headshots/${objectKey}`;
}

export async function createSpeakerHeadshotPresignedUpload(input: {
  eventId: string;
  speakerId: string;
  filename: string;
  contentType: string;
  fileSizeBytes: number;
}): Promise<{
  provider: "R2";
  method: "PUT";
  uploadUrl: string;
  objectKey: string;
  headers?: Record<string, string>;
  headshotUrl: string;
  maxFileSizeBytes: number;
}> {
  validateSpeakerHeadshotUpload(input.contentType, input.fileSizeBytes);

  const objectKey = buildSpeakerHeadshotObjectKey({
    eventId: input.eventId,
    speakerId: input.speakerId,
    filename: input.filename,
  });

  const presigned = await createPresignedUpload({
    objectKey,
    contentType: input.contentType,
    fileSizeBytes: input.fileSizeBytes,
  });

  return {
    ...presigned,
    objectKey,
    headshotUrl: buildSpeakerHeadshotUrl(objectKey),
    maxFileSizeBytes: MAX_HEADSHOT_BYTES,
  };
}

export async function getSpeakerHeadshotDownloadUrl(objectKey: string): Promise<string> {
  return getDownloadUrl(objectKey);
}

const MAX_SPEAKER_FILE_BYTES = 50 * 1024 * 1024;
const SUPPORTED_SPEAKER_FILE_TYPES = new Set([
  "application/pdf",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.apple.keynote",
  "application/zip",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
]);

export function validateSpeakerFileUpload(contentType: string, fileSizeBytes: number): void {
  if (!SUPPORTED_SPEAKER_FILE_TYPES.has(contentType)) {
    throw new Error("Unsupported file type. Allowed: PDF, PPT/PPTX, Keynote, DOC/DOCX, ZIP, JPG, PNG");
  }

  if (!Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0 || fileSizeBytes > MAX_SPEAKER_FILE_BYTES) {
    throw new Error("File size must be between 1 byte and 50MB");
  }
}

export function buildSpeakerFileObjectKey(input: {
  eventId: string;
  speakerId: string;
  kind: string;
  filename: string;
}): string {
  return `events/${input.eventId}/speakers/${input.speakerId}/files/${input.kind.toLowerCase()}/${Date.now()}-${normalizeFilename(input.filename)}`;
}

export async function createSpeakerFilePresignedUpload(input: {
  eventId: string;
  speakerId: string;
  kind: string;
  filename: string;
  contentType: string;
  fileSizeBytes: number;
}): Promise<{
  provider: "R2";
  method: "PUT";
  uploadUrl: string;
  objectKey: string;
  headers?: Record<string, string>;
  maxFileSizeBytes: number;
}> {
  validateSpeakerFileUpload(input.contentType, input.fileSizeBytes);

  const objectKey = buildSpeakerFileObjectKey({
    eventId: input.eventId,
    speakerId: input.speakerId,
    kind: input.kind,
    filename: input.filename,
  });

  const presigned = await createPresignedUpload({
    objectKey,
    contentType: input.contentType,
    fileSizeBytes: input.fileSizeBytes,
  });

  return {
    ...presigned,
    objectKey,
    maxFileSizeBytes: MAX_SPEAKER_FILE_BYTES,
  };
}

export async function getSpeakerFileDownloadUrl(objectKey: string): Promise<string> {
  return getDownloadUrl(objectKey);
}
