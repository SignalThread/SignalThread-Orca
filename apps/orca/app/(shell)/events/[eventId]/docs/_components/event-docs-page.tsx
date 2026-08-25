"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  ChevronRight,
  Clock3,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileImage,
  FileSpreadsheet,
  FileText,
  Plus,
  Search,
  Upload,
  X,
  XCircle,
} from "lucide-react";

type EventOption = {
  id: string;
  name: string;
};

type DocsPageProps = {
  eventIdOverride?: string;
  hideEventSelector?: boolean;
};

type Category = {
  id: string;
  name: string;
  slug?: string;
  color: string | null;
  count?: number;
};

type Tag = {
  id: string;
  name: string;
  color: string | null;
};

type UserMini = {
  id: string;
  name: string | null;
  email: string;
};

type LinkSummary = {
  linkType: "BUDGET_ITEM" | "DEADLINE" | "MATRIX_SESSION" | "EVENT";
  linkedId: string;
  label: string;
  href: string;
};

type DocumentVersion = {
  id: string;
  versionNumber: number;
  objectKey: string;
  objectEtag: string | null;
  mimeType: string;
  fileSizeBytes: number;
  originalFilename: string;
  uploadedByUserId: string;
  createdAt: string;
  uploadedByUser: UserMini | null;
};

type DocumentApproval = {
  id: string;
  status: "IN_REVIEW" | "APPROVED" | "REJECTED";
  actedByUserId: string;
  actedAt: string;
  note: string | null;
  actedByUser: UserMini | null;
  reviewAction?: "REVIEW_SUBMITTED" | "REVIEW_PULLED_BACK" | "REVIEW_APPROVED" | "REVIEW_REJECTED";
  recipients?: UserMini[];
};

type DocumentListItem = {
  id: string;
  title: string;
  status: "DRAFT" | "IN_REVIEW" | "APPROVED" | "REJECTED";
  visibility: "INTERNAL_ONLY" | "CLIENT_VISIBLE";
  createdAt: string;
  updatedAt: string;
  category: Category;
  tags: Tag[];
  latestVersion: DocumentVersion | null;
  latestApproval: DocumentApproval | null;
  links: LinkSummary[];
};

type DocumentDetails = DocumentListItem & {
  eventId: string;
  versions: DocumentVersion[];
  approvals: DocumentApproval[];
  activity: Array<{
    id: string;
    type: "UPLOAD" | "REVIEW_SUBMITTED" | "REVIEW_PULLED_BACK" | "REVIEW_APPROVED" | "REVIEW_REJECTED";
    label: string;
    at: string;
    actor: UserMini | null;
    note: string | null;
  }>;
  reviewRecipients?: UserMini[];
};

type DocumentsResponse = {
  event: {
    id: string;
    orgId: string;
    name: string;
  };
  documents: DocumentListItem[];
  counts: {
    all: number;
    needsReview: number;
    approved: number;
    categories: Category[];
  };
  reviewRecipients?: UserMini[];
  pagination?: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
};

type LinkOption = {
  id: string;
  label: string;
};

type LinkOptionsResponse = {
  budgetItems: LinkOption[];
  deadlines: LinkOption[];
  matrixSessions: LinkOption[];
};

type PresignPayload = {
  provider: "R2";
  method: "PUT";
  uploadUrl: string;
  objectKey: string;
  headers?: Record<string, string>;
  versionNumber: number;
};

const ORG_ID = "a5bc8820-c2ab-498b-9500-58f56421c733";
const EMPTY_LINK_OPTIONS: LinkOptionsResponse = {
  budgetItems: [],
  deadlines: [],
  matrixSessions: [],
};

type MainFilter = "ALL" | "IN_REVIEW" | "APPROVED";
type LoadState = "idle" | "loading" | "ready" | "error";

function readLoadError(status: number, subject: string): string {
  if (status === 401) return "Sign in again to continue.";
  if (status === 403) return `You do not have access to this event's ${subject}.`;
  if (status === 404) return `The requested ${subject} was not found.`;
  return `Unable to load ${subject}. Please try again.`;
}

function statusClasses(status: DocumentListItem["status"]): string {
  if (status === "APPROVED") return "border-emerald-300 bg-emerald-50 text-emerald-700";
  if (status === "IN_REVIEW") return "border-amber-300 bg-amber-50 text-amber-700";
  if (status === "REJECTED") return "border-rose-300 bg-rose-50 text-rose-700";
  return "border-slate-300 bg-slate-100 text-slate-700";
}

function cardBorderClass(status: DocumentListItem["status"]): string {
  if (status === "APPROVED") return "border-emerald-500";
  if (status === "IN_REVIEW") return "border-amber-500";
  if (status === "REJECTED") return "border-rose-500";
  return "border-slate-300";
}

function formatDate(dateValue: string): string {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatDateTime(dateValue: string): string {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatLongDate(dateValue: string): string {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function userName(user: UserMini | null): string {
  if (!user) return "Unknown User";
  return user.name?.trim() || user.email;
}

function initials(name: string): string {
  const parts = name.split(" ").filter(Boolean);
  return `${parts[0]?.[0] ?? "?"}${parts[1]?.[0] ?? ""}`.toUpperCase();
}

function toErrorMessage(payload: unknown, fallback: string): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }
  return fallback;
}

function fileIconForMime(mimeType?: string | null) {
  if (!mimeType) return FileText;
  if (mimeType.startsWith("image/")) return FileImage;
  if (mimeType.includes("sheet") || mimeType.includes("excel")) return FileSpreadsheet;
  return FileText;
}

function parseTags(tagsInput: string): string[] {
  return tagsInput
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function resolveMimeType(file: File): string {
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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function stepState(status: DocumentListItem["status"]) {
  if (status === "REJECTED") {
    return {
      labels: ["Draft", "In Review", "Rejected"],
      completed: [true, true, false],
      rejected: true,
    };
  }

  return {
    labels: ["Draft", "In Review", "Approved"],
    completed: [true, status === "IN_REVIEW" || status === "APPROVED", status === "APPROVED"],
    rejected: false,
  };
}

function DocsPageContent({ eventIdOverride = "", hideEventSelector = false }: DocsPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const scopedEventId = eventIdOverride.trim();

  const [events, setEvents] = useState<EventOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [documentApprovalsEnabled, setDocumentApprovalsEnabled] = useState(true);

  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [documentsTotal, setDocumentsTotal] = useState(0);
  const [hasMoreDocuments, setHasMoreDocuments] = useState(false);
  const [isLoadingMoreDocuments, setIsLoadingMoreDocuments] = useState(false);
  const [counts, setCounts] = useState<DocumentsResponse["counts"]>({
    all: 0,
    needsReview: 0,
    approved: 0,
    categories: [],
  });

  const [linkOptions, setLinkOptions] = useState<LinkOptionsResponse>({
    ...EMPTY_LINK_OPTIONS,
  });
  const [reviewRecipients, setReviewRecipients] = useState<UserMini[]>([]);

  const [documentsLoadState, setDocumentsLoadState] = useState<LoadState>("loading");
  const [documentsLoadError, setDocumentsLoadError] = useState<string | null>(null);
  const [detailsLoadState, setDetailsLoadState] = useState<LoadState>("idle");
  const [detailsLoadError, setDetailsLoadError] = useState<string | null>(null);
  const [linkOptionsLoadState, setLinkOptionsLoadState] = useState<LoadState>("idle");
  const [linkOptionsError, setLinkOptionsError] = useState<string | null>(null);
  const [uploadCategoriesError, setUploadCategoriesError] = useState<string | null>(null);
  const [approvalSettingsError, setApprovalSettingsError] = useState<string | null>(null);
  const [isReviewMutating, setIsReviewMutating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [mainFilter, setMainFilter] = useState<MainFilter>("ALL");
  const [categoryFilterId, setCategoryFilterId] = useState<string | null>(null);

  const [selectedDocument, setSelectedDocument] = useState<DocumentDetails | null>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDocumentId, setUploadDocumentId] = useState<string | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadCategoryId, setUploadCategoryId] = useState("");
  const [uploadCategories, setUploadCategories] = useState<Category[]>([]);
  const [isLoadingUploadCategories, setIsLoadingUploadCategories] = useState(false);
  const [uploadTags, setUploadTags] = useState("");
  const [uploadVisibility, setUploadVisibility] = useState<"INTERNAL_ONLY" | "CLIENT_VISIBLE">("INTERNAL_ONLY");
  const [uploadSendForReview, setUploadSendForReview] = useState(false);
  const [uploadBudgetItemId, setUploadBudgetItemId] = useState("");
  const [uploadDeadlineId, setUploadDeadlineId] = useState("");
  const [uploadMatrixSessionId, setUploadMatrixSessionId] = useState("");
  const [uploadReviewRecipientIds, setUploadReviewRecipientIds] = useState<string[]>([]);
  const [uploadReviewNote, setUploadReviewNote] = useState("");
  const [uploading, setUploading] = useState(false);

  const [reviewRecipientIds, setReviewRecipientIds] = useState<string[]>([]);
  const [reviewNote, setReviewNote] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const documentsRequestVersionRef = useRef(0);
  const detailsRequestVersionRef = useRef(0);
  const linkOptionsRequestVersionRef = useRef(0);
  const categoriesRequestVersionRef = useRef(0);
  const approvalSettingsRequestVersionRef = useRef(0);
  const requestDocId = searchParams.get("docId");
  const requestEventId = scopedEventId || searchParams.get("eventId");
  const budgetItemFilterId = searchParams.get("budgetItemId");

  const applyQuery = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParamsString);
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      }
      const queryString = next.toString();
      if (queryString === searchParamsString) return;
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
    },
    [pathname, router, searchParamsString],
  );

  const loadEvents = useCallback(async () => {
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/events?orgId=${ORG_ID}`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to load events"));
      }

      const items = Array.isArray(payload)
        ? payload.map((event) => ({ id: String(event.id), name: String(event.name) }))
        : [];

      setEvents(items);

      if (items.length === 0) {
        setSelectedEventId("");
        return;
      }

      const validQueryEventId = requestEventId && items.some((event) => event.id === requestEventId)
        ? requestEventId
        : null;
      const nextEventId = validQueryEventId ?? items[0].id;
      setSelectedEventId(nextEventId);

      if (!scopedEventId && nextEventId !== requestEventId) {
        applyQuery({ eventId: nextEventId });
      }
    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error ? error.message : "Failed to load events");
    }
  }, [applyQuery, requestEventId, scopedEventId]);

  // Build the docs query for a given offset (D2: bounded/paged loading). Filters
  // stay server-side so pagination composes with search/status/category.
  const buildDocsQuery = useCallback((offset: number) => {
    const query = new URLSearchParams();
    if (search.trim()) query.set("search", search.trim());
    if (mainFilter !== "ALL") query.set("status", mainFilter);
    if (categoryFilterId) query.set("categoryId", categoryFilterId);
    if (budgetItemFilterId) query.set("budgetItemId", budgetItemFilterId);
    if (offset > 0) query.set("offset", String(offset));
    return query;
  }, [search, mainFilter, categoryFilterId, budgetItemFilterId]);

  const loadDocuments = useCallback(async (signal?: AbortSignal) => {
    if (!selectedEventId) return;
    const requestVersion = ++documentsRequestVersionRef.current;

    setDocumentsLoadState("loading");
    setDocumentsLoadError(null);

    try {
      const response = await fetch(`/api/events/${selectedEventId}/documents?${buildDocsQuery(0).toString()}`, { signal });
      const payload = (await response.json()) as DocumentsResponse | { error?: string };

      if (!response.ok) {
        throw new Error(readLoadError(response.status, "documents"));
      }

      const data = payload as DocumentsResponse;
      if (data.event?.id !== selectedEventId || !Array.isArray(data.documents) || !data.counts || typeof data.counts.all !== "number") {
        throw new Error("The documents response was invalid. Please try again.");
      }
      if (signal?.aborted || documentsRequestVersionRef.current !== requestVersion) return;
      setDocuments(data.documents);
      setCounts(data.counts);
      setReviewRecipients(data.reviewRecipients ?? []);
      setDocumentsTotal(data.pagination?.total ?? data.documents.length);
      setHasMoreDocuments(Boolean(data.pagination?.hasMore));
      setDocumentsLoadState("ready");
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
      if (documentsRequestVersionRef.current !== requestVersion) return;
      console.error(error);
      setDocumentsLoadError(error instanceof Error ? error.message : "Unable to load documents. Please try again.");
      setDocumentsLoadState("error");
    }
  }, [selectedEventId, buildDocsQuery]);

  // Append the next page without disturbing the current filter/selection state.
  const loadMoreDocuments = useCallback(async () => {
    if (!selectedEventId || isLoadingMoreDocuments) return;
    setIsLoadingMoreDocuments(true);
    try {
      const response = await fetch(`/api/events/${selectedEventId}/documents?${buildDocsQuery(documents.length).toString()}`);
      const payload = (await response.json()) as DocumentsResponse | { error?: string };
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to load more documents"));
      }
      const data = payload as DocumentsResponse;
      setDocuments((prev) => [...prev, ...(data.documents ?? [])]);
      setDocumentsTotal(data.pagination?.total ?? documents.length + (data.documents?.length ?? 0));
      setHasMoreDocuments(Boolean(data.pagination?.hasMore));
    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error ? error.message : "Failed to load more documents");
    } finally {
      setIsLoadingMoreDocuments(false);
    }
  }, [selectedEventId, isLoadingMoreDocuments, buildDocsQuery, documents.length]);

  const loadLinkOptions = useCallback(async (signal?: AbortSignal) => {
    if (!selectedEventId) return;
    const requestVersion = ++linkOptionsRequestVersionRef.current;
    setLinkOptionsLoadState("loading");
    setLinkOptionsError(null);

    try {
      const response = await fetch(`/api/events/${selectedEventId}/documents/link-options`, { signal });
      const payload = (await response.json()) as LinkOptionsResponse | { error?: string };
      if (!response.ok) {
        throw new Error(readLoadError(response.status, "document link options"));
      }
      const options = payload as LinkOptionsResponse;
      if (!Array.isArray(options.budgetItems) || !Array.isArray(options.deadlines) || !Array.isArray(options.matrixSessions)) {
        throw new Error("The document link options response was invalid. Please try again.");
      }
      if (linkOptionsRequestVersionRef.current !== requestVersion) return;
      setLinkOptions(options);
      setLinkOptionsLoadState("ready");
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
      if (linkOptionsRequestVersionRef.current !== requestVersion) return;
      console.warn("Failed to load link options", error);
      setLinkOptionsError(error instanceof Error ? error.message : "Unable to load document link options. Please try again.");
      setLinkOptionsLoadState("error");
    }
  }, [selectedEventId]);

  const loadUploadCategories = useCallback(async (eventId: string, signal?: AbortSignal) => {
    if (!eventId) {
      setUploadCategories([]);
      setUploadCategoryId("");
      return;
    }

    const requestVersion = ++categoriesRequestVersionRef.current;
    setIsLoadingUploadCategories(true);
    setUploadCategoriesError(null);
    try {
      let response = await fetch(`/api/events/${eventId}/document-categories`, { signal });
      let payload = await response.json();
      if (!response.ok) {
        throw new Error(readLoadError(response.status, "document categories"));
      }
      if (!Array.isArray(payload)) throw new Error("The document categories response was invalid. Please try again.");
      if (payload.length === 0) {
        response = await fetch(`/api/events/${eventId}/document-categories`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initializeDefaults: true }),
          signal,
        });
        payload = await response.json();
        if (!response.ok) throw new Error(readLoadError(response.status, "document categories"));
        if (!Array.isArray(payload)) throw new Error("The document categories response was invalid. Please try again.");
      }

      const categories = payload.map((category) => ({
            id: String(category.id),
            name: String(category.name),
            slug: typeof category.slug === "string" ? category.slug : undefined,
            color: typeof category.color === "string" ? category.color : null,
          }));
      if (signal?.aborted || categoriesRequestVersionRef.current !== requestVersion) return;

      setUploadCategories(categories);
      setUploadCategoryId((current) =>
        current && categories.some((category) => category.id === current)
          ? current
          : (categories[0]?.id ?? ""),
      );
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
      if (categoriesRequestVersionRef.current !== requestVersion) return;
      console.error(error);
      setUploadCategoriesError(error instanceof Error ? error.message : "Unable to load document categories. Please try again.");
    } finally {
      if (categoriesRequestVersionRef.current === requestVersion) setIsLoadingUploadCategories(false);
    }
  }, []);

  const loadSelectedDocument = useCallback(async (signal?: AbortSignal) => {
    if (!selectedEventId || !requestDocId) {
      setSelectedDocument(null);
      setDetailsLoadState("idle");
      setDetailsLoadError(null);
      return;
    }

    const requestVersion = ++detailsRequestVersionRef.current;
    setDetailsLoadState("loading");
    setDetailsLoadError(null);
    try {
      const response = await fetch(`/api/events/${selectedEventId}/documents/${requestDocId}`, { signal });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(readLoadError(response.status, "document"));
      }

      const details = payload as DocumentDetails;
      if (details.id !== requestDocId || details.eventId !== selectedEventId || !Array.isArray(details.versions) || !Array.isArray(details.approvals)) {
        throw new Error("The document details response was invalid. Please try again.");
      }
      if (signal?.aborted || detailsRequestVersionRef.current !== requestVersion) return;
      setSelectedDocument(details);
      setDetailsLoadState("ready");
      if (Array.isArray(details.reviewRecipients)) {
        setReviewRecipients(details.reviewRecipients);
      }
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
      if (detailsRequestVersionRef.current !== requestVersion) return;
      console.error(error);
      setSelectedDocument(null);
      setDetailsLoadError(error instanceof Error ? error.message : "Unable to load the document. Please try again.");
      setDetailsLoadState("error");
    }
  }, [selectedEventId, requestDocId]);

  useEffect(() => {
    if (hideEventSelector) return;
    void loadEvents();
  }, [hideEventSelector, loadEvents]);

  useEffect(() => {
    if (!hideEventSelector) return;
    setEvents([]);
    setSelectedEventId(scopedEventId);
  }, [hideEventSelector, scopedEventId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadLinkOptions(controller.signal);
    return () => {
      linkOptionsRequestVersionRef.current += 1;
      controller.abort();
    };
  }, [loadLinkOptions]);

  useEffect(() => {
    if (!selectedEventId) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      void loadDocuments(controller.signal);
    }, 200);
    return () => {
      clearTimeout(timeout);
      documentsRequestVersionRef.current += 1;
      controller.abort();
    };
  }, [loadDocuments, selectedEventId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadSelectedDocument(controller.signal);
    return () => {
      detailsRequestVersionRef.current += 1;
      controller.abort();
    };
  }, [loadSelectedDocument]);

  useEffect(() => {
    if (!selectedEventId) return;
    const controller = new AbortController();
    const requestVersion = ++approvalSettingsRequestVersionRef.current;
    setApprovalSettingsError(null);
    void fetch(`/api/events/${selectedEventId}`, { credentials: "include", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(readLoadError(response.status, "document approval settings"));
        return await response.json() as { id?: string; documentApprovalsEnabled?: boolean };
      })
      .then((event) => {
        if (approvalSettingsRequestVersionRef.current !== requestVersion || controller.signal.aborted) return;
        if (event.id !== selectedEventId || typeof event.documentApprovalsEnabled !== "boolean") {
          throw new Error("The document approval settings response was invalid. Please try again.");
        }
        setDocumentApprovalsEnabled(event.documentApprovalsEnabled);
      })
      .catch((error) => {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
        if (approvalSettingsRequestVersionRef.current !== requestVersion) return;
        setDocumentApprovalsEnabled(false);
        setApprovalSettingsError(error instanceof Error ? error.message : "Unable to load document approval settings. Please try again.");
      });
    return () => {
      approvalSettingsRequestVersionRef.current += 1;
      controller.abort();
    };
  }, [selectedEventId]);

  useEffect(() => {
    if (!documentApprovalsEnabled) setUploadSendForReview(false);
  }, [documentApprovalsEnabled]);

  useEffect(() => {
    if (!uploadOpen || !selectedEventId) return;
    const controller = new AbortController();
    void loadUploadCategories(selectedEventId, controller.signal);
    return () => {
      categoriesRequestVersionRef.current += 1;
      controller.abort();
    };
  }, [uploadOpen, selectedEventId, loadUploadCategories]);

  const cards = useMemo(() => documents, [documents]);

  async function refreshAll() {
    await Promise.all([loadDocuments(), loadSelectedDocument()]);
  }

  function toggleReviewRecipient(userId: string) {
    setReviewRecipientIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );
  }

  function toggleUploadReviewRecipient(userId: string) {
    setUploadReviewRecipientIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );
  }

  function openDocument(documentId: string) {
    applyQuery({ eventId: scopedEventId ? null : selectedEventId, docId: documentId });
  }

  function closeDrawer() {
    applyQuery({ docId: null });
  }

  async function handleCreateCategory() {
    if (!selectedEventId) return;
    const name = window.prompt("Create category name", "General");
    if (!name?.trim()) return;

    try {
      const response = await fetch(`/api/events/${selectedEventId}/document-categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to create category"));
      }

      const created = {
        id: String(payload.id),
        name: String(payload.name),
        slug: typeof payload.slug === "string" ? payload.slug : undefined,
        color: typeof payload.color === "string" ? payload.color : null,
      };

      setUploadCategories((current) => {
        const withoutExisting = current.filter((category) => category.id !== created.id);
        return [...withoutExisting, created].sort((a, b) => a.name.localeCompare(b.name));
      });
      setUploadCategoryId(created.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create category");
    }
  }

  async function handleSubmitForReview(documentId: string, recipients: string[], note: string) {
    if (!documentApprovalsEnabled || !selectedEventId) return;
    const recipientUserIds = recipients
      .map((recipientId) => recipientId.trim())
      .filter((recipientId) => recipientId.length > 0);

    if (recipientUserIds.some((recipientId) => !isUuid(recipientId))) {
      setErrorMessage("Recipient IDs must be valid user UUIDs.");
      return;
    }

    setIsReviewMutating(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/events/${selectedEventId}/documents/${documentId}/review/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientUserIds,
          note: note.trim() || null,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to submit for review"));
      }

      await refreshAll();
      setReviewNote("");
    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error ? error.message : "Failed to submit for review");
    } finally {
      setIsReviewMutating(false);
    }
  }

  async function handlePullBack(documentId: string, note: string) {
    if (!selectedEventId) return;

    setIsReviewMutating(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/events/${selectedEventId}/documents/${documentId}/review/pull-back`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note: note.trim() || null,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to pull back review"));
      }

      await refreshAll();
      setReviewNote("");
    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error ? error.message : "Failed to pull back review");
    } finally {
      setIsReviewMutating(false);
    }
  }

  async function handleStatusAction(action: "submit-review" | "pullback") {
    if (!selectedDocument) return;
    if (selectedDocument.status === "APPROVED") return;

    if (action === "submit-review") {
      await handleSubmitForReview(selectedDocument.id, reviewRecipientIds, reviewNote);
      return;
    }

    await handlePullBack(selectedDocument.id, reviewNote);
  }

  async function handleSimulateAction(action: "approve" | "reject" | "reopen") {
    if (!selectedEventId || !selectedDocument) return;

    const body: Record<string, unknown> = {};
    if (action === "reject") {
      const note = window.prompt("Enter rejection reason");
      if (!note) return;
      body.note = note;
    }

    setErrorMessage(null);
    setIsReviewMutating(true);
    try {
      const response = await fetch(`/api/events/${selectedEventId}/documents/${selectedDocument.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to update status"));
      }

      await refreshAll();
    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error ? error.message : "Failed to update status");
    } finally {
      setIsReviewMutating(false);
    }
  }

  async function handleDownload(openInNewTab = false) {
    if (!selectedEventId || !selectedDocument) return;

    try {
      const response = await fetch(`/api/events/${selectedEventId}/documents/${selectedDocument.id}/download`);

      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok) {
        const payload = contentType.includes("application/json") ? await response.json() : null;
        throw new Error(toErrorMessage(payload, "Failed to get download link"));
      }

      if (contentType.includes("application/json")) {
        const payload = (await response.json()) as { url?: string };
        if (!payload.url) {
          throw new Error("Missing download URL");
        }

        if (openInNewTab) {
          window.open(payload.url, "_blank", "noopener,noreferrer");
        } else {
          const anchor = document.createElement("a");
          anchor.href = payload.url;
          anchor.target = "_blank";
          anchor.rel = "noopener noreferrer";
          anchor.click();
        }
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      if (openInNewTab) {
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = selectedDocument.latestVersion?.originalFilename || `${selectedDocument.title}.bin`;
        anchor.click();
      }

      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error ? error.message : "Failed to download file");
    }
  }

  async function handleUploadSubmit() {
    if (!selectedEventId || !uploadFile) {
      setErrorMessage("Choose a file before uploading");
      return;
    }

    if (!uploadTitle.trim() || !uploadCategoryId) {
      setErrorMessage("Title and category are required");
      return;
    }

    if (uploadSendForReview && uploadReviewRecipientIds.length === 0) {
      setErrorMessage("Select at least one recipient before submitting for review");
      return;
    }

    const selectedCategoryName = uploadCategories.find((category) => category.id === uploadCategoryId)?.name;
    const tagNames = Array.from(
      new Set([
        ...parseTags(uploadTags),
        ...(selectedCategoryName ? [selectedCategoryName] : []),
      ]),
    );

    const links: Array<{ linkType: LinkSummary["linkType"]; linkedId: string }> = [];
    if (uploadBudgetItemId) links.push({ linkType: "BUDGET_ITEM", linkedId: uploadBudgetItemId });
    if (uploadDeadlineId) links.push({ linkType: "DEADLINE", linkedId: uploadDeadlineId });
    if (uploadMatrixSessionId) links.push({ linkType: "MATRIX_SESSION", linkedId: uploadMatrixSessionId });

    setUploading(true);
    setErrorMessage(null);

    try {
      const mimeType = resolveMimeType(uploadFile);
      let documentId = uploadDocumentId;

      if (!documentId) {
        const createResponse = await fetch(`/api/events/${selectedEventId}/documents`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: uploadTitle,
            categoryId: uploadCategoryId,
            visibility: uploadVisibility,
            tagNames,
            links,
          }),
        });
        const createPayload = await createResponse.json();
        if (!createResponse.ok) {
          throw new Error(toErrorMessage(createPayload, "Failed to create document record"));
        }
        documentId = String((createPayload as { id: string }).id);
        setUploadDocumentId(documentId);
      }
      if (!documentId) {
        throw new Error("Missing document ID for upload");
      }

      const presignResponse = await fetch(`/api/events/${selectedEventId}/documents/presign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId,
          filename: uploadFile.name,
          contentType: mimeType,
          fileSizeBytes: uploadFile.size,
        }),
      });
      const presignPayload = (await presignResponse.json()) as PresignPayload | { error?: string };
      if (!presignResponse.ok) {
        throw new Error(toErrorMessage(presignPayload, "Failed to prepare upload"));
      }

      const uploadTarget = presignPayload as PresignPayload;
      const uploadResult = await fetch(uploadTarget.uploadUrl, {
        method: uploadTarget.method,
        headers: {
          "content-type": mimeType,
          ...(uploadTarget.headers ?? {}),
        },
        body: uploadFile,
      });

      if (!uploadResult.ok) {
        let responseText = "";
        try {
          responseText = await uploadResult.text();
        } catch {
          responseText = "";
        }
        console.error("[docs-upload] R2 PUT failed", {
          status: uploadResult.status,
          statusText: uploadResult.statusText,
          responseText,
          objectKey: uploadTarget.objectKey,
        });
        throw new Error("File transfer failed. Please try again.");
      }

      const etag = uploadResult.headers.get("etag")?.replace(/"/g, "") ?? null;

      const finalizeResponse = await fetch(
        `/api/events/${selectedEventId}/documents/${documentId}/finalize-upload`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            objectKey: uploadTarget.objectKey,
            objectEtag: etag,
            mimeType,
            fileSizeBytes: uploadFile.size,
            originalFilename: uploadFile.name,
            title: uploadTitle,
            categoryId: uploadCategoryId,
            visibility: uploadVisibility,
            tagNames,
            links,
          }),
        },
      );
      const finalizePayload = await finalizeResponse.json();
      if (!finalizeResponse.ok) {
        console.error("[docs-upload] finalize-upload failed", {
          status: finalizeResponse.status,
          statusText: finalizeResponse.statusText,
          payload: finalizePayload,
          documentId,
        });
        throw new Error(toErrorMessage(finalizePayload, "Failed to finalize upload"));
      }
      console.info("[docs-upload] finalize-upload success", {
        documentId,
        payload: finalizePayload,
      });

      if (uploadSendForReview) {
        const submitResponse = await fetch(
          `/api/events/${selectedEventId}/documents/${documentId}/review/submit`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              recipientUserIds: uploadReviewRecipientIds,
              note: uploadReviewNote.trim() || null,
            }),
          },
        );
        const submitPayload = await submitResponse.json();
        if (!submitResponse.ok) {
          throw new Error(toErrorMessage(submitPayload, "Upload succeeded but submit for review failed"));
        }
      }

      setUploadOpen(false);
      setUploadFile(null);
      setUploadDocumentId(null);
      setUploadTitle("");
      setUploadCategoryId("");
      setUploadTags("");
      setUploadVisibility("INTERNAL_ONLY");
      setUploadSendForReview(false);
      setUploadReviewRecipientIds([]);
      setUploadReviewNote("");
      setUploadBudgetItemId("");
      setUploadDeadlineId("");
      setUploadMatrixSessionId("");

      await loadDocuments();
      applyQuery({ eventId: scopedEventId ? null : selectedEventId, docId: documentId });
      await loadSelectedDocument();
    } catch (error) {
      console.error(error);
      if (error instanceof TypeError && error.message.includes("Failed to fetch")) {
        setErrorMessage("Upload network request failed. Check R2 endpoint/CORS and try again.");
      } else {
        setErrorMessage(error instanceof Error ? error.message : "Failed to upload document");
      }
    } finally {
      setUploading(false);
    }
  }

  const stepper = selectedDocument ? stepState(selectedDocument.status) : null;
  const latestApproval = selectedDocument?.approvals?.[0] ?? null;
  const latestSubmittedReview = selectedDocument?.approvals.find(
    (approval) => approval.reviewAction === "REVIEW_SUBMITTED",
  ) ?? null;
  const activeReviewRecipients =
    selectedDocument?.status === "IN_REVIEW"
      ? (latestSubmittedReview?.recipients ?? [])
      : [];

  useEffect(() => {
    if (!selectedDocument) {
      setReviewRecipientIds([]);
      setReviewNote("");
      return;
    }

    const recipientIds = (latestSubmittedReview?.recipients ?? []).map((recipient) => recipient.id);
    setReviewRecipientIds(recipientIds);
    setReviewNote("");
  }, [latestSubmittedReview, selectedDocument]);

  const canSubmitReview =
    documentApprovalsEnabled &&
    selectedDocument?.status === "DRAFT" &&
    reviewRecipientIds.length > 0 &&
    !isReviewMutating;
  const canPullBack =
    selectedDocument?.status === "IN_REVIEW" &&
    !isReviewMutating;
  const canUpload =
    Boolean(uploadFile) &&
    uploadTitle.trim().length > 0 &&
    uploadCategoryId.length > 0 &&
    (!uploadSendForReview || uploadReviewRecipientIds.length > 0) &&
    !isLoadingUploadCategories &&
    !uploading;

  return (
    <section className="-mx-6 -mt-6 flex min-h-[calc(100vh-80px)] bg-[#f8f8fb]">
      <div className="min-w-0 flex-1 border-r border-slate-200">
        <div className="border-b border-slate-200 px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-[40px] leading-[44px] font-semibold text-slate-900">Docs Hub</h2>
              <p className="mt-1 text-[20px] leading-[24px] text-slate-500">
                Event-scoped documentation and approvals
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-[14px] font-semibold text-slate-700"
              >
                <Plus className="h-4 w-4" />
                New Collection
              </button>
              <button
                type="button"
                onClick={() => setUploadOpen(true)}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#28439A] px-4 text-[14px] font-semibold text-white shadow-sm hover:bg-[#243d8e]"
              >
                <Upload className="h-4 w-4" />
                Upload Document
              </button>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <label className="relative w-full max-w-[460px]">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search documents..."
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-[14px] text-slate-700 outline-none focus:border-slate-300"
              />
            </label>

            {!hideEventSelector ? (
              <div className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3">
                <span className="text-[14px] font-semibold text-slate-600">Event</span>
                <select
                  value={selectedEventId}
                  onChange={(event) => {
                    const nextEventId = event.target.value;
                    setSelectedEventId(nextEventId);
                    applyQuery({ eventId: nextEventId, docId: null });
                  }}
                  className="bg-transparent text-[14px] font-semibold text-slate-700 outline-none"
                >
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setMainFilter("ALL");
                setCategoryFilterId(null);
              }}
              className={[
                "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[14px] font-semibold",
                mainFilter === "ALL" && !categoryFilterId
                  ? "bg-[#28439A] text-white"
                  : "text-slate-700 hover:bg-slate-100",
              ].join(" ")}
            >
              All Documents
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-[12px]">{counts.all}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMainFilter("IN_REVIEW");
                setCategoryFilterId(null);
              }}
              className={[
                "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[14px] font-semibold",
                mainFilter === "IN_REVIEW" ? "bg-amber-100 text-amber-800" : "text-slate-700 hover:bg-slate-100",
              ].join(" ")}
            >
              Needs Review
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[12px]">{counts.needsReview}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMainFilter("APPROVED");
                setCategoryFilterId(null);
              }}
              className={[
                "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[14px] font-semibold",
                mainFilter === "APPROVED" ? "bg-emerald-100 text-emerald-800" : "text-slate-700 hover:bg-slate-100",
              ].join(" ")}
            >
              Approved
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[12px]">{counts.approved}</span>
            </button>

            {counts.categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => {
                  setMainFilter("ALL");
                  setCategoryFilterId((current) => (current === category.id ? null : category.id));
                }}
                className={[
                  "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[14px] font-semibold",
                  categoryFilterId === category.id ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100",
                ].join(" ")}
              >
                {category.name}
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[12px] text-slate-700">{category.count ?? 0}</span>
              </button>
            ))}
          </div>

          {budgetItemFilterId && (
            <p className="mt-3 text-[13px] text-slate-500">
              Filtered by budget line item link. <button type="button" className="text-[#28439A]" onClick={() => applyQuery({ budgetItemId: null, docId: null })}>Clear</button>
            </p>
          )}
        </div>

        {errorMessage && (
          <p className="px-6 py-3 text-[13px] text-rose-600">{errorMessage}</p>
        )}

        <div className="px-6 py-5">
          {documentsLoadState === "loading" && cards.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-5 py-10 text-center text-[14px] text-slate-500">
              Loading documents...
            </div>
          ) : documentsLoadState === "error" && cards.length === 0 ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-10 text-center text-[14px] text-rose-700" role="alert">
              <p>{documentsLoadError}</p>
              <button type="button" onClick={() => void loadDocuments()} className="mt-3 rounded-lg border border-rose-300 bg-white px-3 py-2 font-semibold">
                Retry
              </button>
            </div>
          ) : cards.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-5 py-10 text-center text-[14px] text-slate-500">
              No documents match your filters.
            </div>
          ) : (
            <div>
              {documentsLoadState === "error" ? (
                <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700" role="alert">
                  <span>{documentsLoadError}</span>
                  <button type="button" onClick={() => void loadDocuments()} className="shrink-0 font-semibold underline">Retry</button>
                </div>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {cards.map((document) => {
                const latestVersion = document.latestVersion;
                const latestBy = userName(latestVersion?.uploadedByUser ?? null);
                const Icon = fileIconForMime(latestVersion?.mimeType ?? null);

                return (
                  <button
                    key={document.id}
                    type="button"
                    onClick={() => openDocument(document.id)}
                    className={[
                      "rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:shadow-md",
                      cardBorderClass(document.status),
                      requestDocId === document.id ? "ring-2 ring-[#89A4E8]" : "",
                    ].join(" ")}
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <span className="rounded-xl bg-slate-50 p-3 text-slate-500">
                        <Icon className="h-6 w-6" />
                      </span>
                      <span className="text-[13px] font-semibold text-slate-500">
                        v{latestVersion?.versionNumber ?? 0}
                      </span>
                    </div>

                    <h3 className="min-h-[56px] text-[20px] leading-[24px] font-semibold text-slate-900">
                      {document.title}
                    </h3>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[12px] font-semibold text-slate-700">
                        {document.category?.name ?? "General"}
                      </span>
                      <span className={`rounded-full border px-2 py-0.5 text-[12px] font-semibold ${statusClasses(document.status)}`}>
                        {document.status === "IN_REVIEW" ? "In Review" : document.status.charAt(0) + document.status.slice(1).toLowerCase()}
                      </span>
                    </div>

                    <div className="mt-3 min-h-[48px] space-y-1 border-b border-slate-100 pb-3 text-[13px] text-slate-600">
                      {document.links.slice(0, 2).map((link) => (
                        <p key={`${document.id}-${link.linkType}-${link.linkedId}`} className="truncate">
                          <ChevronRight className="mr-1 inline h-3 w-3" />
                          {link.label}
                        </p>
                      ))}
                    </div>

                    <div className="mt-3 flex items-center justify-between text-[13px] text-slate-500">
                      <span className="inline-flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#28439A] text-[11px] font-semibold text-white">
                          {initials(latestBy)}
                        </span>
                        {latestBy}
                      </span>
                      <span>{formatDate(document.updatedAt)}</span>
                    </div>
                  </button>
                );
              })}
              </div>
            </div>
          )}

          {documents.length > 0 && (
            <div className="flex items-center justify-center gap-3 py-4 text-[13px] text-slate-500">
              <span>
                Showing {documents.length} of {documentsTotal}
              </span>
              {hasMoreDocuments && (
                <button
                  type="button"
                  onClick={() => void loadMoreDocuments()}
                  disabled={isLoadingMoreDocuments}
                  className="rounded-md border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoadingMoreDocuments ? "Loading..." : "Load more"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {requestDocId && (
        <aside className="w-[430px] shrink-0 bg-white">
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <h3 className="text-[32px] leading-[36px] font-semibold text-slate-900">Document Details</h3>
              <button type="button" className="text-slate-400 hover:text-slate-600" onClick={closeDrawer}>
                <X className="h-6 w-6" />
              </button>
            </div>

            {detailsLoadState === "idle" || detailsLoadState === "loading" ? (
              <div className="flex flex-1 items-center justify-center text-[14px] text-slate-500">Loading...</div>
            ) : detailsLoadState === "error" || !selectedDocument ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center" role="alert">
                <p className="text-[14px] text-rose-700">
                  {detailsLoadError ?? "Unable to load the document. Please try again."}
                </p>
                <button
                  type="button"
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={() => void loadSelectedDocument()}
                >
                  Retry
                </button>
              </div>
            ) : (
              <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
                <div className="rounded-2xl bg-slate-100 p-8 text-center text-slate-400">
                  <FileText className="mx-auto h-12 w-12" />
                </div>

                <div>
                  <h4 className="text-[34px] leading-[36px] font-semibold text-slate-900">{selectedDocument.title}</h4>
                  <p className="mt-1 text-[16px] text-slate-500">
                    Last updated {formatLongDate(selectedDocument.updatedAt)}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => void handleDownload(false)}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-[14px] font-semibold text-slate-700"
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDownload(true)}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-[14px] font-semibold text-slate-700"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open
                    </button>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-5">
                  <div className="flex items-center gap-2">
                    <h5 className="text-[24px] leading-[28px] font-semibold text-slate-900">Approval Status</h5>
                    <span className={`rounded-full border px-2 py-0.5 text-[12px] font-semibold ${statusClasses(selectedDocument.status)}`}>
                      {selectedDocument.status === "IN_REVIEW"
                        ? "In Review"
                        : selectedDocument.status.charAt(0) + selectedDocument.status.slice(1).toLowerCase()}
                    </span>
                  </div>
                  {stepper && (
                    <div className="mt-4">
                      <div className="grid grid-cols-3 items-center gap-2">
                        {stepper.labels.map((label, index) => {
                          const isRejectedNode = stepper.rejected && index === 2;
                          const isComplete = stepper.completed[index];

                          return (
                            <div key={label} className="text-center">
                              <div
                                className={[
                                  "mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full",
                                  isRejectedNode
                                    ? "bg-rose-500 text-white"
                                    : isComplete
                                      ? "bg-emerald-500 text-white"
                                      : "bg-slate-200 text-slate-600",
                                ].join(" ")}
                              >
                                {isRejectedNode ? <XCircle className="h-5 w-5" /> : isComplete ? <Check className="h-5 w-5" /> : <Clock3 className="h-5 w-5" />}
                              </div>
                              <p className="text-[13px] font-semibold text-slate-700">{label}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {latestApproval?.note && (
                    <div className="mt-4 rounded-xl bg-slate-100 p-3">
                      <p className="text-[14px] font-semibold text-slate-800">{userName(latestApproval.actedByUser)}</p>
                      <p className="text-[13px] text-slate-500">{formatDateTime(latestApproval.actedAt)}</p>
                      <p className="mt-2 text-[14px] italic text-slate-700">“{latestApproval.note}”</p>
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-200 pt-5">
                  <h5 className="text-[24px] leading-[28px] font-semibold text-slate-900">Actions</h5>
                  <div
                    className={[
                      "mt-3 rounded-xl border p-3",
                      selectedDocument.status === "APPROVED"
                        ? "border-emerald-200 bg-emerald-50"
                        : selectedDocument.status === "IN_REVIEW"
                          ? "border-amber-200 bg-amber-50"
                          : selectedDocument.status === "REJECTED"
                            ? "border-rose-200 bg-rose-50"
                            : "border-slate-200 bg-slate-50",
                    ].join(" ")}
                  >
                    <p className="text-[14px] font-semibold text-slate-800">
                      {selectedDocument.status === "IN_REVIEW"
                        ? "In Review"
                        : selectedDocument.status === "APPROVED"
                          ? "Approved"
                          : selectedDocument.status === "REJECTED"
                            ? "Rejected"
                            : "Draft"}
                    </p>
                    <p className="text-[13px] text-slate-500">{formatLongDate(selectedDocument.updatedAt)}</p>
                  </div>

                  <div className="mt-3">
                    <label className="mb-1 block text-[14px] font-semibold text-slate-700">
                      Message to reviewer(s)
                    </label>
                    <textarea
                      value={reviewNote}
                      onChange={(event) => setReviewNote(event.target.value)}
                      rows={3}
                      placeholder="Optional note for review activity"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[14px] text-slate-700 outline-none focus:border-slate-300"
                    />
                  </div>

                  {documentApprovalsEnabled && selectedDocument.status === "DRAFT" && (
                    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                      <p className="text-[13px] font-semibold text-slate-700">Recipients</p>
                      <div className="mt-2 max-h-36 space-y-2 overflow-y-auto">
                        {reviewRecipients.map((recipient) => (
                          <label
                            key={`${selectedDocument.id}-${recipient.id}-${recipient.email}`}
                            className="flex items-center gap-2 text-[13px] text-slate-700"
                          >
                            <input
                              type="checkbox"
                              checked={reviewRecipientIds.includes(recipient.id)}
                              onChange={() => toggleReviewRecipient(recipient.id)}
                              className="h-4 w-4 rounded border-slate-300 text-[#28439A] focus:ring-[#28439A]"
                            />
                            <span>{recipient.name?.trim() || recipient.email}</span>
                            <span className="text-slate-400">{recipient.email}</span>
                          </label>
                        ))}
                        {reviewRecipients.length === 0 && (
                          <p className="text-[12px] text-slate-500">No recipients available for this event.</p>
                        )}
                      </div>
                    </div>
                  )}

                  {documentApprovalsEnabled && selectedDocument.status === "IN_REVIEW" && (
                    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                      <p className="text-[13px] font-semibold text-slate-700">Recipients</p>
                      <div className="mt-2 space-y-1">
                        {activeReviewRecipients.length === 0 ? (
                          <p className="text-[13px] text-slate-500">No recipients recorded.</p>
                        ) : (
                          activeReviewRecipients.map((recipient) => (
                            <p
                              key={`${selectedDocument.id}-active-${recipient.id}-${recipient.email}`}
                              className="text-[13px] text-slate-700"
                            >
                              {recipient.name?.trim() || recipient.email}
                              <span className="text-slate-400"> ({recipient.email})</span>
                            </p>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {documentApprovalsEnabled && selectedDocument.status === "DRAFT" && (
                      <button
                        type="button"
                        onClick={() => void handleStatusAction("submit-review")}
                        disabled={!canSubmitReview}
                        className="inline-flex h-10 items-center rounded-xl bg-[#28439A] px-4 text-[13px] font-semibold text-white disabled:opacity-60"
                      >
                        Submit for Review
                      </button>
                    )}
                    {documentApprovalsEnabled && selectedDocument.status === "IN_REVIEW" && (
                      <button
                        type="button"
                        onClick={() => void handleStatusAction("pullback")}
                        disabled={!canPullBack}
                        className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-700 disabled:opacity-60"
                      >
                        Pull back
                      </button>
                    )}
                    {selectedDocument.status === "REJECTED" && (
                      <button
                        type="button"
                        onClick={() => void handleSimulateAction("reopen")}
                        disabled={isReviewMutating}
                        className="inline-flex h-10 items-center rounded-xl bg-[#28439A] px-4 text-[13px] font-semibold text-white disabled:opacity-60"
                      >
                        Revise
                      </button>
                    )}
                    {documentApprovalsEnabled && selectedDocument.status === "APPROVED" && (
                      <>
                        <button
                          type="button"
                          disabled
                          className="inline-flex h-10 items-center rounded-xl bg-[#28439A] px-4 text-[13px] font-semibold text-white opacity-60"
                        >
                          Submit for Review
                        </button>
                        <button
                          type="button"
                          disabled
                          className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-700 opacity-60"
                        >
                          Pull back
                        </button>
                      </>
                    )}
                  </div>

                  {documentApprovalsEnabled && process.env.NODE_ENV !== "production" && selectedDocument.status === "IN_REVIEW" && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleSimulateAction("approve")}
                        className="inline-flex h-9 items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-[12px] font-semibold text-emerald-700"
                      >
                        Simulate Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSimulateAction("reject")}
                        className="inline-flex h-9 items-center rounded-lg border border-rose-200 bg-rose-50 px-3 text-[12px] font-semibold text-rose-700"
                      >
                        Simulate Reject
                      </button>
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-200 pt-5">
                  <div className="flex items-center justify-between">
                    <h5 className="text-[24px] leading-[28px] font-semibold text-slate-900">Version History</h5>
                    <button type="button" className="text-[13px] font-semibold text-[#28439A]">Compare versions</button>
                  </div>
                  <div className="mt-3 space-y-3">
                    {selectedDocument.versions.map((version) => {
                      const versionStatus =
                        selectedDocument.approvals.find((approval) => new Date(approval.actedAt) >= new Date(version.createdAt))?.status ?? "IN_REVIEW";

                      return (
                        <div key={version.id} className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 items-start gap-3">
                            <span className="rounded-full bg-slate-100 px-2 py-1 text-[12px] font-semibold text-slate-700">v{version.versionNumber}</span>
                            <div className="min-w-0">
                              <p className="truncate text-[14px] font-semibold text-slate-800">{userName(version.uploadedByUser)}</p>
                              <p className="truncate text-[14px] text-slate-600">{version.originalFilename}</p>
                              <p className="text-[13px] text-slate-500">{formatDateTime(version.createdAt)}</p>
                            </div>
                          </div>
                          <span className={`rounded-full border px-2 py-0.5 text-[12px] font-semibold ${statusClasses((versionStatus === "IN_REVIEW" ? "IN_REVIEW" : versionStatus === "APPROVED" ? "APPROVED" : "REJECTED") as DocumentListItem["status"])}`}>
                            {versionStatus === "IN_REVIEW" ? "In Review" : versionStatus.charAt(0) + versionStatus.slice(1).toLowerCase()}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-5">
                  <h5 className="text-[24px] leading-[28px] font-semibold text-slate-900">Activity Timeline</h5>
                  <div className="mt-3 space-y-3">
                    {selectedDocument.activity.map((activity) => (
                      <div key={activity.id} className="flex gap-3">
                        <span className="mt-1 h-2 w-2 rounded-full bg-[#28439A]" />
                        <div>
                          <p className="text-[14px] font-semibold text-slate-800">{activity.label}</p>
                          <p className="text-[13px] text-slate-500">
                            {userName(activity.actor)} • {formatDateTime(activity.at)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-5">
                  <h5 className="text-[24px] leading-[28px] font-semibold text-slate-900">Linked Objects</h5>
                  <div className="mt-3 space-y-2">
                    {selectedDocument.links.map((link) => (
                      <Link
                        key={`${link.linkType}-${link.linkedId}`}
                        href={link.href}
                        className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[14px] text-slate-700 hover:bg-slate-100"
                      >
                        <span className="truncate">
                          <ChevronRight className="mr-1 inline h-3 w-3" />
                          {link.label}
                        </span>
                        <ExternalLink className="h-4 w-4 shrink-0 text-slate-400" />
                      </Link>
                    ))}
                    {selectedDocument.links.length === 0 && (
                      <p className="text-[13px] text-slate-500">No linked objects yet.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>
      )}

      {uploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-5">
          <div className="w-full max-w-[960px] rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
              <h3 className="text-[40px] leading-[44px] font-semibold text-slate-900">Upload Document</h3>
              <button
                type="button"
                className="text-slate-400"
                onClick={() => {
                  setUploadDocumentId(null);
                  setUploadReviewRecipientIds([]);
                  setUploadReviewNote("");
                  setUploadSendForReview(false);
                  setUploadOpen(false);
                }}
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="max-h-[72vh] overflow-y-auto px-6 py-6">
              {!uploadFile ? (
                <div
                  className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-16 text-center"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const file = event.dataTransfer.files?.[0] ?? null;
                    if (!file) return;
                    setUploadFile(file);
                    setUploadDocumentId(null);
                    setUploadTitle(file.name.replace(/\.[^/.]+$/, ""));
                    if (uploadCategories[0]) {
                      setUploadCategoryId(uploadCategories[0].id);
                    }
                  }}
                >
                  <Upload className="mx-auto h-10 w-10 text-slate-400" />
                  <p className="mt-4 text-[24px] leading-[28px] font-semibold text-slate-800">Drop your file here, or browse</p>
                  <p className="mt-2 text-[16px] text-slate-500">Supports: PDF, DOC, XLS, JPG, PNG up to 50MB</p>
                  <button
                    type="button"
                    className="mt-6 inline-flex h-11 items-center rounded-xl bg-[#28439A] px-5 text-[14px] font-semibold text-white"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Browse Files
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      if (!file) return;
                      setUploadFile(file);
                      setUploadDocumentId(null);
                      setUploadTitle(file.name.replace(/\.[^/.]+$/, ""));
                      if (uploadCategories[0]) {
                        setUploadCategoryId(uploadCategories[0].id);
                      }
                    }}
                  />
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <FileText className="h-7 w-7 text-rose-500" />
                      <div className="min-w-0">
                        <p className="truncate text-[20px] leading-[24px] font-semibold text-slate-900">{uploadFile.name}</p>
                        <p className="text-[14px] text-slate-500">{(uploadFile.size / (1024 * 1024)).toFixed(1)} MB</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="text-slate-400 hover:text-slate-600"
                      onClick={() => {
                        setUploadFile(null);
                        setUploadDocumentId(null);
                        setUploadTitle("");
                        setUploadReviewRecipientIds([]);
                        setUploadReviewNote("");
                        setUploadSendForReview(false);
                      }}
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <div>
                    <label className="mb-1 block text-[14px] font-semibold text-slate-700">Document Title</label>
                    <input
                      value={uploadTitle}
                      onChange={(event) => setUploadTitle(event.target.value)}
                      className="h-11 w-full rounded-xl border border-slate-200 px-3 text-[14px] text-slate-800 outline-none focus:border-slate-300"
                    />
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <label className="block text-[14px] font-semibold text-slate-700">Category</label>
                      <button
                        type="button"
                        className="text-[13px] font-semibold text-[#28439A] hover:underline"
                        onClick={() => void handleCreateCategory()}
                      >
                        Create category
                      </button>
                    </div>
                    <select
                      value={uploadCategoryId}
                      onChange={(event) => setUploadCategoryId(event.target.value)}
                      className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[14px] text-slate-800 outline-none focus:border-slate-300"
                    >
                      {isLoadingUploadCategories ? (
                        <option value="">Loading categories...</option>
                      ) : uploadCategories.length === 0 ? (
                        <option value="">No categories yet</option>
                      ) : (
                        <>
                          <option value="">Select category</option>
                          {uploadCategories.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                        </>
                      )}
                    </select>
                    {uploadCategoriesError && (
                      <div className="mt-2 flex items-center gap-3 text-[13px]" role="alert">
                        <p className="text-rose-700">{uploadCategoriesError}</p>
                        <button
                          type="button"
                          className="font-semibold text-[#28439A] hover:underline"
                          onClick={() => void loadUploadCategories(selectedEventId)}
                        >
                          Retry
                        </button>
                      </div>
                    )}
                    {!isLoadingUploadCategories && uploadCategories.length === 0 && (
                      <div className="mt-2 flex items-center gap-3 text-[13px]">
                        <p className="text-slate-500">No categories yet for this event.</p>
                        <button
                          type="button"
                          className="font-semibold text-[#28439A] hover:underline"
                          onClick={() => void handleCreateCategory()}
                        >
                          Create category
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="mb-1 block text-[14px] font-semibold text-slate-700">Tags</label>
                    <input
                      value={uploadTags}
                      onChange={(event) => setUploadTags(event.target.value)}
                      placeholder="Add tags separated by commas"
                      className="h-11 w-full rounded-xl border border-slate-200 px-3 text-[14px] text-slate-800 outline-none focus:border-slate-300"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-[14px] font-semibold text-slate-700">Link to</label>
                    <div className="grid gap-3 md:grid-cols-3">
                      <select
                        value={uploadBudgetItemId}
                        onChange={(event) => setUploadBudgetItemId(event.target.value)}
                        className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-[14px] text-slate-800 outline-none"
                      >
                        <option value="">Budget Item</option>
                        {linkOptions.budgetItems.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label}
                          </option>
                        ))}
                      </select>

                      <select
                        value={uploadDeadlineId}
                        onChange={(event) => setUploadDeadlineId(event.target.value)}
                        className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-[14px] text-slate-800 outline-none"
                      >
                        <option value="">Deadline</option>
                        {linkOptions.deadlines.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label}
                          </option>
                        ))}
                      </select>

                      <select
                        value={uploadMatrixSessionId}
                        onChange={(event) => setUploadMatrixSessionId(event.target.value)}
                        className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-[14px] text-slate-800 outline-none"
                      >
                        <option value="">Matrix Session</option>
                        {linkOptions.matrixSessions.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {linkOptionsLoadState === "loading" && (
                      <p className="mt-2 text-[13px] text-slate-500">Loading link options...</p>
                    )}
                    {linkOptionsError && (
                      <div className="mt-2 flex items-center gap-3 text-[13px]" role="alert">
                        <p className="text-rose-700">{linkOptionsError}</p>
                        <button
                          type="button"
                          className="font-semibold text-[#28439A] hover:underline"
                          onClick={() => void loadLinkOptions()}
                        >
                          Retry
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="mb-2 block text-[14px] font-semibold text-slate-700">Visibility</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setUploadVisibility("INTERNAL_ONLY")}
                        className={[
                          "inline-flex h-11 items-center gap-2 rounded-xl px-4 text-[14px] font-semibold",
                          uploadVisibility === "INTERNAL_ONLY"
                            ? "bg-[#28439A] text-white"
                            : "bg-slate-100 text-slate-700",
                        ].join(" ")}
                      >
                        <EyeOff className="h-4 w-4" />
                        Internal Only
                      </button>
                      <button
                        type="button"
                        onClick={() => setUploadVisibility("CLIENT_VISIBLE")}
                        className={[
                          "inline-flex h-11 items-center gap-2 rounded-xl px-4 text-[14px] font-semibold",
                          uploadVisibility === "CLIENT_VISIBLE"
                            ? "bg-[#28439A] text-white"
                            : "bg-slate-100 text-slate-700",
                        ].join(" ")}
                      >
                        <Eye className="h-4 w-4" />
                        Client Visible
                      </button>
                    </div>
                  </div>

                  {approvalSettingsError && (
                    <p className="text-[13px] text-rose-700" role="alert">{approvalSettingsError}</p>
                  )}
                  <div className={`${documentApprovalsEnabled ? "flex" : "hidden"} items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3`}>
                    <div>
                      <p className="text-[20px] leading-[24px] font-semibold text-slate-800">Send for Review After Upload</p>
                      <p className="text-[14px] text-slate-500">Document will be marked as &quot;In Review&quot;</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setUploadSendForReview((current) => !current)}
                      className={[
                        "relative h-8 w-14 rounded-full transition-colors",
                        uploadSendForReview ? "bg-[#28439A]" : "bg-slate-300",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "absolute top-1 h-6 w-6 rounded-full bg-white transition-transform",
                          uploadSendForReview ? "translate-x-7" : "translate-x-1",
                        ].join(" ")}
                      />
                    </button>
                  </div>

                  {uploadSendForReview && (
                    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                      <div>
                        <p className="text-[14px] font-semibold text-slate-700">Recipients</p>
                        <div className="mt-2 max-h-40 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">
                          {reviewRecipients.map((recipient) => (
                            <label
                              key={`${selectedEventId}-upload-${recipient.id}-${recipient.email}`}
                              className="flex items-center gap-2 text-[13px] text-slate-700"
                            >
                              <input
                                type="checkbox"
                                checked={uploadReviewRecipientIds.includes(recipient.id)}
                                onChange={() => toggleUploadReviewRecipient(recipient.id)}
                                className="h-4 w-4 rounded border-slate-300 text-[#28439A] focus:ring-[#28439A]"
                              />
                              <span>{recipient.name?.trim() || recipient.email}</span>
                              <span className="text-slate-400">{recipient.email}</span>
                            </label>
                          ))}
                          {reviewRecipients.length === 0 && (
                            <p className="text-[12px] text-slate-500">No recipients available for this event.</p>
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-[14px] font-semibold text-slate-700">Message to reviewer(s)</label>
                        <textarea
                          value={uploadReviewNote}
                          onChange={(event) => setUploadReviewNote(event.target.value)}
                          rows={3}
                          placeholder="Optional note for review"
                          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-[14px] text-slate-700 outline-none focus:border-slate-300"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 px-6 py-5">
              <button
                type="button"
                onClick={() => {
                  if (uploadFile) {
                    setUploadFile(null);
                    setUploadDocumentId(null);
                    setUploadReviewRecipientIds([]);
                    setUploadReviewNote("");
                    setUploadSendForReview(false);
                    return;
                  }
                  setUploadDocumentId(null);
                  setUploadReviewRecipientIds([]);
                  setUploadReviewNote("");
                  setUploadSendForReview(false);
                  setUploadOpen(false);
                }}
                className="text-[14px] font-semibold text-slate-600"
              >
                {uploadFile ? "Back" : "Cancel"}
              </button>
              {uploadFile && (
                <button
                  type="button"
                  onClick={() => void handleUploadSubmit()}
                  disabled={!canUpload}
                  className="inline-flex h-11 items-center rounded-xl bg-[#28439A] px-5 text-[14px] font-semibold text-white disabled:opacity-60"
                >
                  {uploading ? "Uploading..." : "Upload"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default function DocsPage(props: DocsPageProps) {
  return (
    <Suspense fallback={<section className="p-6 text-[14px] text-slate-500">Loading Docs Hub...</section>}>
      <DocsPageContent {...props} />
    </Suspense>
  );
}
