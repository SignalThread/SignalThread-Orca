export const DEFAULT_VOICE_CHUNK_SIZE_BYTES = 5 * 1024 * 1024;

export type ChunkedUploadSession = {
  leadId: string;
  storagePath: string;
  uploadId: string;
  contentType: string;
  fileSize: number;
  chunkSizeBytes: number;
  totalParts: number;
  chunkDurationSeconds?: number;
};

export type ChunkUploadUrl = {
  partNumber: number;
  uploadUrl: string;
  uploadMethod: "PUT";
  uploadHeaders: Record<string, string>;
};

export type CreateChunkedUploadSessionResponse = {
  success: boolean;
  session: ChunkedUploadSession;
};

export type RequestChunkUploadUrlsResponse = {
  success: boolean;
  storagePath: string;
  uploadId: string;
  uploadedPartNumbers: number[];
  uploadedParts?: Array<{ partNumber: number; etag: string }>;
  uploadedChunkIndexes?: number[];
  chunkUploadUrls: ChunkUploadUrl[];
};

export type CompleteChunkedUploadResponse = {
  success: boolean;
  conversationId: string;
  voiceNoteId: string | null;
  voiceNote: {
    id: string;
    conversationId: string | null;
    transcript: string | null;
    transcriptionStatus: "pending" | "processing" | "completed" | "failed";
    summary: string | null;
    durationMs: number | null;
    recordedAt: string | null;
    updatedAt: string | null;
    syncStatus: "pending" | "synced";
    syncedAt: string | null;
  } | null;
  storagePath: string;
  transcriptionStatus: "pending" | "completed" | "failed";
};

export type RollingChunkManifestEntry = {
  chunkIndex: number;
  partNumber: number;
  etag: string | null;
  status: "pending" | "uploaded" | "failed";
  attempts: number;
  uploadedAt: string | null;
};

export type RollingUploadState = {
  version: 1;
  leadId: string;
  storagePath: string;
  uploadId: string;
  contentType: string;
  fileSize: number;
  chunkSizeBytes: number;
  totalParts: number;
  chunkDurationSeconds: number;
  manifest: RollingChunkManifestEntry[];
  createdAt: string;
  updatedAt: string;
};

export function computeTotalParts(fileSize: number, chunkSizeBytes = DEFAULT_VOICE_CHUNK_SIZE_BYTES) {
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return 0;
  }
  return Math.ceil(fileSize / chunkSizeBytes);
}

export function buildPartNumbers(totalParts: number) {
  return Array.from({ length: Math.max(0, totalParts) }, (_, index) => index + 1);
}

export function buildChunkIndexes(totalParts: number) {
  return Array.from({ length: Math.max(0, totalParts) }, (_, index) => index);
}

export function partNumberFromChunkIndex(chunkIndex: number) {
  return chunkIndex + 1;
}

export function chunkIndexFromPartNumber(partNumber: number) {
  return partNumber - 1;
}

export function getRemainingPartNumbers(totalParts: number, uploadedPartNumbers: number[]) {
  const uploaded = new Set(uploadedPartNumbers);
  return buildPartNumbers(totalParts).filter((partNumber) => !uploaded.has(partNumber));
}

export function createRollingUploadState(session: ChunkedUploadSession): RollingUploadState {
  const nowIso = new Date().toISOString();
  return {
    version: 1,
    leadId: session.leadId,
    storagePath: session.storagePath,
    uploadId: session.uploadId,
    contentType: session.contentType,
    fileSize: session.fileSize,
    chunkSizeBytes: session.chunkSizeBytes,
    totalParts: session.totalParts,
    chunkDurationSeconds: Number(session.chunkDurationSeconds ?? 8),
    manifest: buildChunkIndexes(session.totalParts).map((chunkIndex) => ({
      chunkIndex,
      partNumber: partNumberFromChunkIndex(chunkIndex),
      etag: null,
      status: "pending",
      attempts: 0,
      uploadedAt: null
    })),
    createdAt: nowIso,
    updatedAt: nowIso
  };
}

export function upsertChunkUploadResult(
  state: RollingUploadState,
  chunkIndex: number,
  input: { etag?: string | null; success: boolean; attempts: number }
) {
  const partNumber = partNumberFromChunkIndex(chunkIndex);
  const existing = state.manifest.find((item) => item.chunkIndex === chunkIndex);
  const nowIso = new Date().toISOString();
  const normalizedEtag = String(input.etag ?? "").trim() || null;

  if (!existing) {
    state.manifest.push({
      chunkIndex,
      partNumber,
      etag: normalizedEtag,
      status: input.success ? "uploaded" : "failed",
      attempts: input.attempts,
      uploadedAt: input.success ? nowIso : null
    });
  } else {
    existing.partNumber = partNumber;
    existing.etag = input.success ? normalizedEtag : existing.etag;
    existing.status = input.success ? "uploaded" : "failed";
    existing.attempts = Math.max(existing.attempts, input.attempts);
    existing.uploadedAt = input.success ? nowIso : existing.uploadedAt;
  }

  state.updatedAt = nowIso;
  state.manifest.sort((a, b) => a.partNumber - b.partNumber);
  return state;
}

export function getMissingChunkIndexes(state: RollingUploadState) {
  return state.manifest
    .filter((item) => item.status !== "uploaded")
    .map((item) => item.chunkIndex)
    .sort((a, b) => a - b);
}

export function toOrderedChunkManifest(state: RollingUploadState) {
  return [...state.manifest]
    .sort((a, b) => a.partNumber - b.partNumber)
    .filter((item) => item.status === "uploaded")
    .map((item) => ({
      chunkIndex: item.chunkIndex,
      partNumber: item.partNumber,
      etag: item.etag
    }));
}

export function serializeRollingUploadState(state: RollingUploadState) {
  return JSON.stringify(state);
}

export function deserializeRollingUploadState(serialized: string): RollingUploadState | null {
  try {
    const parsed = JSON.parse(serialized) as RollingUploadState;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.manifest)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveRollingUploadState(storageKey: string, state: RollingUploadState) {
  if (typeof window === "undefined" || !window.localStorage) return;
  window.localStorage.setItem(storageKey, serializeRollingUploadState(state));
}

export function loadRollingUploadState(storageKey: string) {
  if (typeof window === "undefined" || !window.localStorage) return null;
  const serialized = window.localStorage.getItem(storageKey);
  if (!serialized) return null;
  return deserializeRollingUploadState(serialized);
}

export function clearRollingUploadState(storageKey: string) {
  if (typeof window === "undefined" || !window.localStorage) return;
  window.localStorage.removeItem(storageKey);
}
