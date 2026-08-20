// Client-side helper for uploading Event Builder "Additional Docs" into an
// event's existing Docs Hub. This intentionally mirrors the upload sequence
// already used by the Docs Hub page (event-docs-page.tsx) so Event Builder
// reuses the canonical document/version path (draft -> presign -> PUT -> finalize)
// instead of introducing a second document storage system.
//
// Additional Docs cannot be saved before the event exists (document records,
// categories, and R2 object keys all require an eventId), so callers run this
// AFTER /api/events/import/create returns an eventId.

export type DocumentCategoryOption = {
  id: string;
  name: string;
  slug: string;
  color: string | null;
};

export type PendingDocumentUpload = {
  id: string;
  file: File;
  // Default Docs Hub category slug chosen in the builder, or null to fall back.
  categorySlug: string | null;
  // A failed upload may already have created its canonical Docs Hub draft.
  // Retrying with that id must reuse the draft instead of creating an orphan.
  documentId?: string | null;
};

export type DocumentUploadResult = {
  id: string;
  fileName: string;
  ok: boolean;
  documentId: string | null;
  categorySlug: string | null;
  error: string | null;
};

type FetchLike = typeof fetch;

type PresignPayload = {
  provider: "R2";
  method: "PUT";
  uploadUrl: string;
  objectKey: string;
  headers?: Record<string, string>;
  versionNumber: number;
};

class DocumentUploadError extends Error {
  readonly documentId: string | null;

  constructor(message: string, documentId: string | null, options?: ErrorOptions) {
    super(message, options);
    this.name = "DocumentUploadError";
    this.documentId = documentId;
  }
}

// Mirror of the server allow-list in src/server/storage/documents.ts. We do NOT
// widen storage constraints here — this only keeps the client picker honest.
const MAX_DOCUMENT_UPLOAD_BYTES = 50 * 1024 * 1024;

const SUPPORTED_DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
]);

// Classification options for Additional Docs. These slugs are kept in sync with
// DEFAULT_DOCUMENT_CATEGORIES in src/server/services/documents.ts, which are
// seeded per event. We offer them in the builder (before the event exists) and
// resolve the chosen slug to a real category id after creation.
export const ADDITIONAL_DOC_CATEGORY_OPTIONS: ReadonlyArray<{ slug: string; label: string }> = [
  { slug: "contracts", label: "Contract" },
  { slug: "insurance", label: "Insurance / compliance" },
  { slug: "vendor-docs", label: "Vendor agreement" },
  { slug: "av", label: "AV proposal" },
  { slug: "catering", label: "Catering / BEO" },
  { slug: "production", label: "Production" },
  { slug: "finance", label: "Finance" },
  { slug: "floorplans", label: "Floorplan" },
];

export const DEFAULT_ADDITIONAL_DOC_CATEGORY_SLUG = "contracts";

// Picker hint for the file input. Spreadsheets stay on the dedicated uploader,
// so the contract/document picker leans to PDFs and agreement-style files.
export const ADDITIONAL_DOCS_ACCEPT = ".pdf,.doc,.docx,.jpg,.jpeg,.png";

export function maxAdditionalDocBytes(): number {
  return MAX_DOCUMENT_UPLOAD_BYTES;
}

export function resolveDocumentMimeType(file: File): string {
  if (file.type) return file.type;

  const lowered = file.name.toLowerCase();
  if (lowered.endsWith(".pdf")) return "application/pdf";
  if (lowered.endsWith(".doc")) return "application/msword";
  if (lowered.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lowered.endsWith(".xls")) return "application/vnd.ms-excel";
  if (lowered.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (lowered.endsWith(".jpg") || lowered.endsWith(".jpeg")) return "image/jpeg";
  if (lowered.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}

export function isSupportedDocumentFile(file: File): boolean {
  return SUPPORTED_DOCUMENT_MIME_TYPES.has(resolveDocumentMimeType(file));
}

export function isWithinDocumentSizeLimit(file: File): boolean {
  return Number.isFinite(file.size) && file.size > 0 && file.size <= MAX_DOCUMENT_UPLOAD_BYTES;
}

// Returns a human-readable reason if the file cannot be uploaded, else null.
export function validateAdditionalDocFile(file: File): string | null {
  if (!isSupportedDocumentFile(file)) {
    return "Unsupported file type. Allowed: PDF, DOC/DOCX, JPG, PNG.";
  }
  if (!isWithinDocumentSizeLimit(file)) {
    return "File must be between 1 byte and 50MB.";
  }
  return null;
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: unknown; message?: unknown } | null;
    const message =
      (typeof payload?.message === "string" && payload.message) ||
      (typeof payload?.error === "string" && payload.error) ||
      "";
    return message || fallback;
  } catch {
    return fallback;
  }
}

export async function fetchEventDocumentCategories(
  eventId: string,
  fetchImpl: FetchLike = fetch,
): Promise<DocumentCategoryOption[]> {
  const response = await fetchImpl(`/api/events/${eventId}/document-categories`, {
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Failed to load document categories"));
  }
  return (await response.json()) as DocumentCategoryOption[];
}

async function uploadSingleDocument(params: {
  eventId: string;
  file: File;
  categoryId: string;
  documentId?: string | null;
  fetchImpl: FetchLike;
}): Promise<string> {
  const { eventId, file, categoryId, fetchImpl } = params;
  const mimeType = resolveDocumentMimeType(file);
  const title = file.name;
  let documentId = params.documentId ?? null;

  if (!documentId) {
    // 1) Create the document draft through the canonical Docs Hub service.
    const createResponse = await fetchImpl(`/api/events/${eventId}/documents`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, categoryId, visibility: "INTERNAL_ONLY" }),
    });
    if (!createResponse.ok) {
      throw new DocumentUploadError(
        await readErrorMessage(createResponse, "Failed to create document record"),
        null,
      );
    }
    const createPayload = (await createResponse.json()) as { id?: string };
    documentId = createPayload?.id ? String(createPayload.id) : null;
    if (!documentId) {
      throw new DocumentUploadError("Document record did not return an id", null);
    }
  }

  try {
    // 2) Request an R2 presigned upload for the new version.
    const presignResponse = await fetchImpl(`/api/events/${eventId}/documents/presign`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentId,
        filename: file.name,
        contentType: mimeType,
        fileSizeBytes: file.size,
      }),
    });
    if (!presignResponse.ok) {
      throw new Error(await readErrorMessage(presignResponse, "Failed to prepare upload"));
    }
    const uploadTarget = (await presignResponse.json()) as PresignPayload;

    // 3) PUT the file bytes straight to R2.
    const putResponse = await fetchImpl(uploadTarget.uploadUrl, {
      method: uploadTarget.method,
      headers: {
        "content-type": mimeType,
        ...(uploadTarget.headers ?? {}),
      },
      body: file,
    });
    if (!putResponse.ok) {
      throw new Error("Upload to storage failed");
    }
    const objectEtag = putResponse.headers.get("etag")?.replace(/"/g, "") ?? null;

    // 4) Finalize: records the DocumentVersion through the canonical service.
    const finalizeResponse = await fetchImpl(
      `/api/events/${eventId}/documents/${documentId}/finalize-upload`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objectKey: uploadTarget.objectKey,
          objectEtag,
          mimeType,
          fileSizeBytes: file.size,
          originalFilename: file.name,
          title,
          categoryId,
          visibility: "INTERNAL_ONLY",
        }),
      },
    );
    if (!finalizeResponse.ok) {
      throw new Error(await readErrorMessage(finalizeResponse, "Failed to finalize upload"));
    }
  } catch (error) {
    throw new DocumentUploadError(
      error instanceof Error ? error.message : "Upload failed",
      documentId,
      error instanceof Error ? { cause: error } : undefined,
    );
  }

  return documentId;
}

// Uploads each pending Additional Doc into the event's Docs Hub independently.
// One failed file does NOT abort the rest, and this never touches the event
// record itself — the event stays valid regardless of upload outcomes, and
// failures surface a retry path through Docs Hub.
export async function uploadAdditionalDocs(params: {
  eventId: string;
  docs: PendingDocumentUpload[];
  fetchImpl?: FetchLike;
}): Promise<DocumentUploadResult[]> {
  const { eventId, docs } = params;
  const fetchImpl = params.fetchImpl ?? fetch;

  if (docs.length === 0) {
    return [];
  }

  // Resolve the event's seeded categories once, mapping chosen slugs to ids.
  let categoryIdBySlug = new Map<string, string>();
  let fallbackCategoryId: string | null = null;
  let categoryLoadError: string | null = null;
  try {
    const categories = await fetchEventDocumentCategories(eventId, fetchImpl);
    categoryIdBySlug = new Map(categories.map((category) => [category.slug, category.id]));
    fallbackCategoryId =
      categoryIdBySlug.get(DEFAULT_ADDITIONAL_DOC_CATEGORY_SLUG) ?? categories[0]?.id ?? null;
  } catch (error) {
    categoryLoadError = error instanceof Error ? error.message : "Failed to load document categories";
  }

  const results: DocumentUploadResult[] = [];
  for (const doc of docs) {
    const baseResult = {
      id: doc.id,
      fileName: doc.file.name,
      categorySlug: doc.categorySlug,
    };

    if (categoryLoadError) {
      results.push({ ...baseResult, ok: false, documentId: doc.documentId ?? null, error: categoryLoadError });
      continue;
    }

    const categoryId =
      (doc.categorySlug ? categoryIdBySlug.get(doc.categorySlug) : undefined) ?? fallbackCategoryId;

    if (!categoryId) {
      results.push({
        ...baseResult,
        ok: false,
        documentId: doc.documentId ?? null,
        error: "No document category is available for this event.",
      });
      continue;
    }

    try {
      const documentId = await uploadSingleDocument({
        eventId,
        file: doc.file,
        categoryId,
        documentId: doc.documentId,
        fetchImpl,
      });
      results.push({ ...baseResult, ok: true, documentId, error: null });
    } catch (error) {
      results.push({
        ...baseResult,
        ok: false,
        documentId: error instanceof DocumentUploadError ? error.documentId : (doc.documentId ?? null),
        error: error instanceof Error ? error.message : "Upload failed",
      });
    }
  }

  return results;
}
