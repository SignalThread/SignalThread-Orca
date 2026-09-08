"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { Eye, FileText, Link2, Pencil, Send, Trash2 } from "lucide-react";
import { PageHeader, PageShell } from "@/components/layout/page-header";

type AssetKind = "file" | "link";

type DocumentRecord = {
  id: string;
  title: string;
  type: string;
  asset_kind: AssetKind;
  event_id: string | null;
  event_name: string | null;
  tags: string[];
  storage_path: string | null;
  file_url: string | null;
  mime_type: string | null;
  uploaded_by: string | null;
  uploaded_by_name: string;
  rep_sendable: boolean;
  sent_count: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  preview_href: string;
};

type DocumentsResponse = {
  documents: DocumentRecord[];
  filters: {
    types: string[];
    tags: string[];
    events: Array<{ id: string; name: string }>;
  };
  fallback?: boolean;
  fallback_reason?: string;
  warning?: string;
  error?: string;
};

type EmailTemplate = {
  id: string;
  account_id: string;
  name: string;
  subject: string;
  body: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

type EmailTemplatesResponse = {
  templates?: EmailTemplate[];
  error?: string;
};

type LeadOption = {
  id: string;
  full_name: string;
  email: string | null;
};

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function toTagList(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  );
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function assetKind(document: DocumentRecord): AssetKind {
  return document.asset_kind === "link" ? "link" : "file";
}

function fileKindLabel(document: DocumentRecord) {
  if (assetKind(document) === "link") return "Link";

  const mime = String(document.mime_type ?? "").trim().toLowerCase();
  if (mime.includes("pdf")) return "PDF";
  if (mime.includes("presentation") || mime.includes("powerpoint")) return "PPTX";
  if (mime.includes("word")) return "DOCX";

  const path = String(document.storage_path ?? document.file_url ?? "").toLowerCase();
  if (path.endsWith(".pdf")) return "PDF";
  if (path.endsWith(".ppt") || path.endsWith(".pptx")) return "PPTX";
  if (path.endsWith(".doc") || path.endsWith(".docx")) return "DOCX";
  return "File";
}

function itemKindLabel(document: DocumentRecord) {
  return assetKind(document) === "link" ? "Link" : "Document";
}

export function ExhibitorDocumentsHub({
  googleWorkspace,
  embedded = false,
}: {
  googleWorkspace: { ready: boolean; senderEmail: string | null };
  embedded?: boolean;
}) {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadSubmitting, setUploadSubmitting] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    assetKind: "file" as AssetKind,
    title: "",
    type: "",
    tags: "",
    repSendable: true,
    url: "",
    file: null as File | null,
  });

  const [editTarget, setEditTarget] = useState<DocumentRecord | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editForm, setEditForm] = useState({
    title: "",
    type: "",
    tags: "",
    repSendable: true,
  });

  const [sendTarget, setSendTarget] = useState<DocumentRecord | null>(null);
  const [sendSubmitting, setSendSubmitting] = useState(false);
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [sendIdempotencyKey, setSendIdempotencyKey] = useState("");
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [sendForm, setSendForm] = useState({
    recipientEmail: "",
    templateId: "",
    optionalMessage: "",
    leadId: "",
    subject: "",
    body: "",
  });
  const [deleteTarget, setDeleteTarget] = useState<DocumentRecord | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [toasts, setToasts] = useState<Array<{ id: number; tone: "success" | "error"; message: string }>>([]);

  async function loadDocuments() {
    setIsLoading(true);
    setErrorMessage(null);

    const params = new URLSearchParams();
    if (searchQuery) params.set("q", searchQuery);

    const suffix = params.toString();
    const endpoint = suffix ? `/api/exhibitor/documents?${suffix}` : "/api/exhibitor/documents";

    const response = await fetch(endpoint, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    const payload = (await response.json().catch(() => ({}))) as DocumentsResponse;
    if (!response.ok) {
      setErrorMessage(payload.error ?? "Failed to load documents and links.");
      setIsLoading(false);
      return;
    }

    setDocuments(payload.documents ?? []);
    if (payload.fallback) {
      setNoticeMessage(
        payload.warning ??
          "Documents & Links Hub tables are unavailable in this environment. Showing an empty state until migration is applied."
      );
    }
    setIsLoading(false);
  }

  async function loadEmailTemplates() {
    setTemplatesLoading(true);
    try {
      const response = await fetch("/api/exhibitor/email-templates", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      const payload = (await response.json().catch(() => ({}))) as EmailTemplatesResponse;
      if (!response.ok) {
        setErrorMessage(payload.error ?? "Failed to load email templates.");
        setTemplatesLoading(false);
        return;
      }

      const templates = payload.templates ?? [];
      setEmailTemplates(templates);
      if (templates.length > 0) {
        const preferred = templates.find((template) => template.is_default) ?? templates[0];
        setSendForm((current) => ({
          ...current,
          templateId: current.templateId || preferred.id,
        }));
      }
    } finally {
      setTemplatesLoading(false);
    }
  }

  useEffect(() => {
    void loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  useEffect(() => {
    void loadEmailTemplates();
  }, []);

  useEffect(() => {
    if (!googleWorkspace.ready) return;
    void fetch("/api/exhibitor/leads/list", { headers: { Accept: "application/json" } })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as { leads?: LeadOption[] };
        if (response.ok) setLeads((payload.leads ?? []).filter((lead) => Boolean(String(lead.email ?? "").trim())));
      })
      .catch(() => undefined);
  }, [googleWorkspace.ready]);

  useEffect(() => {
    if (!noticeMessage) return;
    const timer = setTimeout(() => setNoticeMessage(null), 5000);
    return () => clearTimeout(timer);
  }, [noticeMessage]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  function pushToast(tone: "success" | "error", message: string) {
    const nextId = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((current) => [...current, { id: nextId, tone, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== nextId));
    }, 3200);
  }

  const selectedTemplate = useMemo(() => {
    const foundById = emailTemplates.find((template) => template.id === sendForm.templateId);
    if (foundById) return foundById;
    return emailTemplates.find((template) => template.is_default) ?? emailTemplates[0] ?? null;
  }, [emailTemplates, sendForm.templateId]);

  const selectedLead = useMemo(
    () => leads.find((lead) => lead.id === sendForm.leadId) ?? null,
    [leads, sendForm.leadId]
  );

  function openDocumentSend(document: DocumentRecord) {
    const defaultTemplate = emailTemplates.find((template) => template.is_default) ?? emailTemplates[0];
    setSendTarget(document);
    setSendIdempotencyKey(crypto.randomUUID());
    setSendForm((current) => ({
      ...current,
      recipientEmail: "",
      leadId: "",
      templateId: current.templateId || defaultTemplate?.id || "",
      subject: `Sharing ${document.title}`,
      body: "Hi,\n\nI wanted to share this resource with you."
    }));
  }

  useEffect(() => {
    if (!editTarget) return;
    setEditForm({
      title: editTarget.title,
      type: editTarget.type,
      tags: editTarget.tags.join(", "),
      repSendable: editTarget.rep_sendable,
    });
  }, [editTarget]);

  async function handleUploadSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (uploadSubmitting) return;

    const title = uploadForm.title.trim();
    const type = uploadForm.type.trim();
    const url = uploadForm.url.trim();
    if (!title) {
      setErrorMessage(uploadForm.assetKind === "link" ? "Link name is required." : "Document name is required.");
      return;
    }
    if (!type) {
      setErrorMessage(uploadForm.assetKind === "link" ? "Link type is required." : "Document type is required.");
      return;
    }
    if (uploadForm.assetKind === "file" && !uploadForm.file) {
      setErrorMessage("Choose a file before saving.");
      return;
    }
    if (uploadForm.assetKind === "link" && !isValidHttpUrl(url)) {
      setErrorMessage("Enter a valid http(s) URL.");
      return;
    }

    setUploadSubmitting(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append("assetKind", uploadForm.assetKind);
      if (uploadForm.assetKind === "file" && uploadForm.file) formData.append("file", uploadForm.file);
      if (uploadForm.assetKind === "link") formData.append("url", url);
      formData.append("title", title);
      formData.append("type", type);
      formData.append("tags", uploadForm.tags);
      formData.append("repSendable", uploadForm.repSendable ? "true" : "false");

      const response = await fetch("/api/exhibitor/documents", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        upload?: { mode?: string; warning?: string | null };
      };

      if (!response.ok) {
        setErrorMessage(
          payload.error ?? (uploadForm.assetKind === "link" ? "Failed to save link." : "Failed to upload document.")
        );
        return;
      }

      setIsUploadOpen(false);
      setUploadForm({
        assetKind: "file",
        title: "",
        type: "",
        tags: "",
        repSendable: true,
        url: "",
        file: null,
      });

      if (uploadForm.assetKind === "link") {
        setNoticeMessage("Link saved.");
      } else if (payload.upload?.mode === "stored") {
        setNoticeMessage("Document uploaded and saved.");
      } else {
        setNoticeMessage(
          payload.upload?.warning
            ? `File metadata saved (storage stubbed): ${payload.upload.warning}`
            : "File metadata saved (storage upload is currently stubbed for MVP)."
        );
      }

      await loadDocuments();
    } finally {
      setUploadSubmitting(false);
    }
  }

  async function handleSendSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sendTarget || sendSubmitting) return;
    if (googleWorkspace.ready && (!sendForm.leadId || !selectedLead?.email)) {
      setErrorMessage("Choose a lead with an email address before sending.");
      return;
    }
    if (googleWorkspace.ready && (!sendForm.subject.trim() || !sendForm.body.trim())) {
      setErrorMessage("Subject and message are required.");
      return;
    }
    if (!googleWorkspace.ready && !sendForm.templateId) {
      setErrorMessage("Choose an email template before sending.");
      return;
    }

    setSendSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/exhibitor/documents/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          googleWorkspace.ready
            ? {
                deliveryMode: "google",
                documentId: sendTarget.id,
                leadId: sendForm.leadId,
                idempotencyKey: sendIdempotencyKey,
                subject: sendForm.subject,
                body: sendForm.body
              }
            : {
                deliveryMode: "fallback",
                documentId: sendTarget.id,
                recipientEmail: sendForm.recipientEmail,
                templateId: sendForm.templateId,
                message: sendForm.optionalMessage
              }
        ),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        trackedUrl?: string;
        outcome?: string;
      };

      if (!response.ok || !payload.success) {
        setErrorMessage(
          payload.outcome === "unknown"
            ? "Delivery could not be confirmed. Do not resend yet."
            : payload.error ?? "Failed to create tracked send."
        );
        if (payload.outcome !== "unknown") setSendIdempotencyKey(crypto.randomUUID());
        return;
      }

      setSendTarget(null);
      setSendForm({
        recipientEmail: "",
        templateId: emailTemplates.find((template) => template.is_default)?.id ?? emailTemplates[0]?.id ?? "",
        optionalMessage: "",
        leadId: "",
        subject: "",
        body: "",
      });

      if (payload.trackedUrl) {
        try {
          await navigator.clipboard.writeText(payload.trackedUrl);
          setNoticeMessage(googleWorkspace.ready ? "Document sent through Gmail." : "Tracked link created and copied.");
        } catch {
          setNoticeMessage(googleWorkspace.ready ? "Document sent through Gmail." : "Tracked link created.");
        }
      } else {
        setNoticeMessage(googleWorkspace.ready ? "Document sent through Gmail." : "Tracked link created.");
      }

      await loadDocuments();
    } finally {
      setSendSubmitting(false);
    }
  }

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editTarget || editSubmitting) return;

    const title = editForm.title.trim();
    const type = editForm.type.trim();
    if (!title || !type) {
      setErrorMessage(`${itemKindLabel(editTarget)} name and type are required.`);
      return;
    }

    setEditSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/exhibitor/documents/${encodeURIComponent(editTarget.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          type,
          tags: toTagList(editForm.tags),
          rep_sendable: editForm.repSendable,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };

      if (!response.ok || !payload.success) {
        setErrorMessage(payload.error ?? `Failed to update ${itemKindLabel(editTarget).toLowerCase()}.`);
        return;
      }

      setEditTarget(null);
      setNoticeMessage(`${itemKindLabel(editTarget)} updated.`);
      await loadDocuments();
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleDeleteDocument() {
    if (!deleteTarget || deleteSubmitting) return;
    setDeleteSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/exhibitor/documents/${encodeURIComponent(deleteTarget.id)}`, {
        method: "DELETE",
      });

      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        storage?: {
          missingObject?: boolean;
        };
      };

      if (!response.ok || !payload.success) {
        const message = payload.error ?? `Failed to delete ${itemKindLabel(deleteTarget).toLowerCase()}.`;
        setErrorMessage(message);
        pushToast("error", message);
        return;
      }

      if (payload.storage?.missingObject) {
        pushToast("success", "Item removed. Storage object was already missing.");
      } else {
        pushToast("success", "Item deleted successfully.");
      }

      setDeleteTarget(null);
      await loadDocuments();
    } finally {
      setDeleteSubmitting(false);
    }
  }

  const addDocumentAction = (
    <button
      type="button"
      onClick={() => setIsUploadOpen(true)}
      className="inline-flex h-9 items-center justify-center rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 px-3.5 text-sm font-semibold text-white shadow-sm transition hover:from-indigo-600 hover:to-violet-700"
    >
      Add Document or Link
    </button>
  );

  const content = (
    <>
      {embedded ? <div className="mb-5 flex justify-end">{addDocumentAction}</div> : null}

      {toasts.length ? <ToastStack toasts={toasts} /> : null}

      {errorMessage ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {errorMessage}
        </p>
      ) : null}
      {noticeMessage ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {noticeMessage}
        </p>
      ) : null}

      <div className="relative max-w-xl">
        <SearchIcon />
        <input
          type="search"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search documents and links by name or type..."
          className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-800 placeholder:text-slate-500 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/15"
        />
      </div>

      <section className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white md:block">
        {isLoading ? (
          <div className="p-6 text-sm text-slate-600">Loading documents and links...</div>
        ) : documents.length === 0 ? (
          <div className="p-6 text-sm text-slate-600">
            No documents or links found. Add your first collateral asset to get started.
          </div>
        ) : (
          <table className="w-full min-w-[880px] table-fixed border-collapse text-left text-sm">
            <colgroup>
              <col style={{ width: "38%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "168px" }} />
            </colgroup>
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-800">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Item
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Type
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Added By
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Last Updated
                </th>
                <th className="border-l border-slate-200 bg-slate-50 px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {documents.map((document) => (
                <tr key={document.id} className="border-t border-slate-200">
                  <td className="min-w-0 overflow-hidden px-4 py-2.5">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0 text-rose-500/90">
                        <DocumentIcon />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="line-clamp-1 text-sm font-semibold leading-tight text-slate-900">{document.title}</p>
                          <AssetKindBadge document={document} />
                          <span
                            className={`inline-flex shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                              document.rep_sendable ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
                            }`}
                          >
                            {document.rep_sendable ? "Sendable" : "Internal"}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] font-medium text-slate-500">{fileKindLabel(document)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="min-w-0 overflow-hidden px-3 py-2.5">
                    <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-slate-100/90 px-2 py-0.5 text-xs font-semibold text-slate-800">
                      <TypeIcon />
                      <span className="min-w-0 truncate">{document.type}</span>
                    </span>
                  </td>
                  <td className="min-w-0 overflow-hidden px-3 py-2.5 text-sm text-slate-700">
                    <span className="block truncate font-medium" title={document.uploaded_by_name}>
                      {document.uploaded_by_name}
                    </span>
                  </td>
                  <td className="min-w-0 overflow-hidden px-3 py-2.5 text-sm text-slate-600">
                    <span
                      className="block max-w-full truncate tabular-nums"
                      title={formatDateTime(document.updated_at)}
                    >
                      {formatDateTime(document.updated_at)}
                    </span>
                  </td>
                  <td className="box-border w-[168px] min-w-[168px] max-w-[168px] overflow-hidden border-l border-slate-100 bg-slate-50/50 px-2 py-2 align-middle">
                    <DocumentRowActions
                      document={document}
                      repSendable={document.rep_sendable}
                      onEdit={() => setEditTarget(document)}
                      onSend={() => openDocumentSend(document)}
                      onDelete={() => setDeleteTarget(document)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="md:hidden">
        {isLoading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
            Loading documents and links...
          </div>
        ) : documents.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
            No documents or links found. Add your first collateral asset to get started.
          </div>
        ) : null}
      </section>

      {!isLoading && documents.length > 0 ? (
        <section className="grid gap-3 md:hidden">
          {documents.map((document) => (
            <article key={document.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="min-w-0 break-words text-sm font-semibold text-slate-950">{document.title}</h3>
                    <AssetKindBadge document={document} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-slate-100/90 px-2 py-0.5 text-xs font-semibold text-slate-800">
                      <TypeIcon />
                      <span className="truncate">{document.type}</span>
                    </span>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                        document.rep_sendable ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {document.rep_sendable ? "Sendable" : "Internal"}
                    </span>
                  </div>
                </div>
              </div>
              <dl className="mt-3 grid gap-1 text-xs text-slate-600">
                <div className="flex justify-between gap-3">
                  <dt className="font-semibold uppercase tracking-wide text-slate-400">Updated</dt>
                  <dd className="text-right tabular-nums">{formatDateTime(document.updated_at)}</dd>
                </div>
              </dl>
              <div className="mt-3 border-t border-slate-100 pt-3">
                <DocumentRowActions
                  document={document}
                  repSendable={document.rep_sendable}
                  onEdit={() => setEditTarget(document)}
                  onSend={() => openDocumentSend(document)}
                  onDelete={() => setDeleteTarget(document)}
                />
              </div>
            </article>
          ))}
        </section>
      ) : null}

      {isUploadOpen ? (
        <ModalShell
          title="Add Document or Link"
          onClose={() => {
            if (uploadSubmitting) return;
            setIsUploadOpen(false);
          }}
        >
          <form className="space-y-4" onSubmit={handleUploadSubmit}>
            <div className="grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-100 p-1">
              {[
                { value: "file" as AssetKind, label: "Upload file" },
                { value: "link" as AssetKind, label: "Add Link" },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    setUploadForm((current) => ({
                      ...current,
                      assetKind: option.value,
                      file: option.value === "link" ? null : current.file,
                    }))
                  }
                  className={`h-9 rounded-lg text-sm font-semibold transition ${
                    uploadForm.assetKind === option.value
                      ? "bg-white text-slate-950 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                  aria-pressed={uploadForm.assetKind === option.value}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {uploadForm.assetKind === "file" ? (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">File</label>
                <input
                  type="file"
                  required
                  onChange={(event) => {
                    const selected = event.target.files?.[0] ?? null;
                    setUploadForm((current) => ({ ...current, file: selected }));
                    if (selected && !uploadForm.title.trim()) {
                      setUploadForm((current) => ({ ...current, title: selected.name }));
                    }
                  }}
                  className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">URL</label>
                <input
                  type="url"
                  required
                  value={uploadForm.url}
                  onChange={(event) => setUploadForm((current) => ({ ...current, url: event.target.value }))}
                  placeholder="https://example.com/resource"
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">
                {uploadForm.assetKind === "link" ? "Link name" : "Document name"}
              </label>
              <input
                type="text"
                required
                value={uploadForm.title}
                onChange={(event) => setUploadForm((current) => ({ ...current, title: event.target.value }))}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">
                {uploadForm.assetKind === "link" ? "Link type" : "Document type"}
              </label>
              <input
                type="text"
                required
                value={uploadForm.type}
                onChange={(event) => setUploadForm((current) => ({ ...current, type: event.target.value }))}
                placeholder="e.g. Datasheet, Case Study"
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Tags</label>
              <input
                type="text"
                value={uploadForm.tags}
                onChange={(event) => setUploadForm((current) => ({ ...current, tags: event.target.value }))}
                placeholder="Comma separated tags"
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
              />
              {uploadForm.tags.trim() ? (
                <div className="flex flex-wrap gap-1 pt-1">
                  {toTagList(uploadForm.tags).map((tag) => (
                    <span key={tag} className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={uploadForm.repSendable}
                onChange={(event) => setUploadForm((current) => ({ ...current, repSendable: event.target.checked }))}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600"
              />
              <span>
                <span className="block font-semibold text-slate-900">Allow reps to send this item</span>
                <span className="block text-xs text-slate-600">If disabled, this item is internal only.</span>
              </span>
            </label>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsUploadOpen(false)}
                className="h-10 rounded-lg bg-slate-100 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                disabled={uploadSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={uploadSubmitting}
                className="h-10 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 px-3 text-sm font-semibold text-white hover:from-indigo-600 hover:to-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {uploadSubmitting ? "Saving..." : "Save"}
              </button>
            </div>
          </form>
        </ModalShell>
      ) : null}

      {editTarget ? (
        <ModalShell
          title={`Edit ${itemKindLabel(editTarget)}`}
          onClose={() => {
            if (editSubmitting) return;
            setEditTarget(null);
          }}
        >
          <form className="space-y-4" onSubmit={handleEditSubmit}>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">{itemKindLabel(editTarget)} name</label>
              <input
                type="text"
                required
                value={editForm.title}
                onChange={(event) => setEditForm((current) => ({ ...current, title: event.target.value }))}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">{itemKindLabel(editTarget)} type</label>
              <input
                type="text"
                required
                value={editForm.type}
                onChange={(event) => setEditForm((current) => ({ ...current, type: event.target.value }))}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Tags</label>
              <input
                type="text"
                value={editForm.tags}
                onChange={(event) => setEditForm((current) => ({ ...current, tags: event.target.value }))}
                placeholder="Comma separated tags"
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
              />
            </div>

            <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={editForm.repSendable}
                onChange={(event) => setEditForm((current) => ({ ...current, repSendable: event.target.checked }))}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600"
              />
              <span>
                <span className="block font-semibold text-slate-900">Allow reps to send this item</span>
                <span className="block text-xs text-slate-600">If disabled, this item is internal only.</span>
              </span>
            </label>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                className="h-10 rounded-lg bg-slate-100 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                disabled={editSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={editSubmitting}
                className="h-10 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 px-3 text-sm font-semibold text-white hover:from-indigo-600 hover:to-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {editSubmitting ? "Saving..." : "Save changes"}
              </button>
            </div>
          </form>
        </ModalShell>
      ) : null}

      {sendTarget ? (
        <ModalShell
          title={`Send ${itemKindLabel(sendTarget)}`}
          onClose={() => {
            if (sendSubmitting) return;
            setSendTarget(null);
          }}
        >
          <form className="space-y-4" onSubmit={handleSendSubmit}>
            {googleWorkspace.ready ? (
              <>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">From</label>
                  <input
                    readOnly
                    value={googleWorkspace.senderEmail ?? ""}
                    className="h-10 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 text-sm text-slate-700"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Lead</label>
                  <select
                    required
                    value={sendForm.leadId}
                    onChange={(event) => setSendForm((current) => ({ ...current, leadId: event.target.value }))}
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                  >
                    <option value="">Choose a lead</option>
                    {leads.map((lead) => (
                      <option key={lead.id} value={lead.id}>{lead.full_name || lead.email}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Recipient</label>
                  <input
                    readOnly
                    value={selectedLead?.email ?? ""}
                    className="h-10 w-full cursor-not-allowed rounded-lg border border-slate-300 bg-slate-50 px-3 text-sm text-slate-700"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Subject</label>
                  <input
                    required
                    maxLength={200}
                    value={sendForm.subject}
                    onChange={(event) => setSendForm((current) => ({ ...current, subject: event.target.value }))}
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Message</label>
                  <textarea
                    required
                    maxLength={19000}
                    rows={6}
                    value={sendForm.body}
                    onChange={(event) => setSendForm((current) => ({ ...current, body: event.target.value }))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Recipient email</label>
                  <input
                    type="email"
                    required
                    value={sendForm.recipientEmail}
                    onChange={(event) => setSendForm((current) => ({ ...current, recipientEmail: event.target.value }))}
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Template</label>
                  <select
                    value={sendForm.templateId}
                    onChange={(event) => setSendForm((current) => ({ ...current, templateId: event.target.value }))}
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                    disabled={templatesLoading || emailTemplates.length === 0}
                  >
                    {emailTemplates.length === 0 ? (
                      <option value="">{templatesLoading ? "Loading templates..." : "No templates available"}</option>
                    ) : emailTemplates.map((template) => (
                      <option key={template.id} value={template.id}>{template.name}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Selected item</label>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                <div className="flex flex-wrap items-center gap-1.5 font-semibold">
                  <span>{sendTarget.title}</span>
                  <AssetKindBadge document={sendTarget} />
                </div>
                <p className="mt-1 text-xs text-slate-500">{sendTarget.type}</p>
              </div>
            </div>

            {!googleWorkspace.ready ? <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Optional message</label>
              <textarea
                value={sendForm.optionalMessage}
                onChange={(event) => setSendForm((current) => ({ ...current, optionalMessage: event.target.value }))}
                rows={3}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </div> : null}

            {!googleWorkspace.ready ? <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email preview</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                Subject: {selectedTemplate?.subject ?? "Select a template"}
              </p>
              <p className="mt-1 text-sm text-slate-700">
                {selectedTemplate?.body ?? "Template body preview will appear here."}
                {sendForm.optionalMessage.trim() ? ` ${sendForm.optionalMessage.trim()}` : ""}
              </p>
              <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">{sendTarget.title}</p>
                <p className="text-xs text-slate-500">{sendTarget.type}</p>
                <p className="mt-2 font-semibold text-indigo-700">Open item</p>
              </div>
            </div> : null}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSendTarget(null)}
                className="h-10 rounded-lg bg-slate-100 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                disabled={sendSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={sendSubmitting}
                className="h-10 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 px-3 text-sm font-semibold text-white hover:from-indigo-600 hover:to-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sendSubmitting ? "Sending..." : googleWorkspace.ready ? "Confirm and send" : "Send"}
              </button>
            </div>
          </form>
        </ModalShell>
      ) : null}

      {deleteTarget ? (
        <ModalShell
          title={`Delete ${itemKindLabel(deleteTarget)}`}
          onClose={() => {
            if (deleteSubmitting) return;
            setDeleteTarget(null);
          }}
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              This item will be removed from the admin library and can no longer be sent to leads.
            </p>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800">
              {deleteTarget.title}
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="h-10 rounded-lg bg-slate-100 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                disabled={deleteSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteDocument()}
                disabled={deleteSubmitting}
                className="h-10 rounded-lg bg-rose-600 px-3 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleteSubmitting ? "Deleting..." : `Delete ${itemKindLabel(deleteTarget)}`}
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </>
  );

  if (embedded) return content;

  return (
    <PageShell>
      <PageHeader
        title="Documents & Links"
        subtitle="Manage sales collateral, marketing assets, and links for your team."
        actions={addDocumentAction}
      />
      {content}
    </PageShell>
  );
}

/** Row actions for exhibitor Documents table — single source of truth. */
function DocumentRowActions({
  document,
  repSendable,
  onEdit,
  onSend,
  onDelete,
}: {
  document: DocumentRecord;
  repSendable: boolean;
  onEdit: () => void;
  onSend: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="flex w-full min-w-0 flex-nowrap items-center justify-end gap-1"
      role="group"
      aria-label={`Actions for ${document.title}`}
    >
      <a
        href={document.preview_href}
        target="_blank"
        rel="noreferrer"
        title={`View ${document.title}`}
        aria-label={`View ${document.title}`}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40"
      >
        <Eye className="h-4 w-4" aria-hidden="true" />
      </a>
      <button
        type="button"
        onClick={onEdit}
        title={`Edit ${document.title}`}
        aria-label={`Edit ${document.title}`}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40"
      >
        <Pencil className="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onSend}
        disabled={!repSendable}
        title={repSendable ? `Send ${document.title}` : "Internal only - not sendable"}
        aria-label={repSendable ? `Send ${document.title}` : `${document.title} is internal only`}
        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/35 ${
          repSendable
            ? "border border-indigo-200/90 bg-indigo-50 text-indigo-900 hover:border-indigo-300 hover:bg-indigo-50/90"
            : "cursor-not-allowed border border-transparent text-slate-400 opacity-60 shadow-none"
        }`}
      >
        <Send className="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        title={`Delete ${document.title}`}
        aria-label={`Delete ${document.title}`}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-200/60 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40"
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function AssetKindBadge({ document }: { document: DocumentRecord }) {
  const kind = assetKind(document);
  const isLink = kind === "link";
  const Icon = isLink ? Link2 : FileText;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
        isLink ? "bg-sky-100 text-sky-700" : "bg-rose-100 text-rose-700"
      }`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {isLink ? "Link" : "File"}
    </span>
  );
}

function SearchIcon() {
  return (
    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
        <path d="M20 20L16.7 16.7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function DocumentIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 3.5h7.5L19 8v12.5H7z" stroke="currentColor" strokeWidth="2" />
      <path d="M14.5 3.5V8H19" stroke="currentColor" strokeWidth="2" />
      <path d="M10 12h6M10 15.5h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function TypeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 19h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ToastStack({
  toasts,
}: {
  toasts: Array<{ id: number; tone: "success" | "error"; message: string }>;
}) {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[60] flex w-[320px] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto rounded-lg border px-3 py-2 text-sm font-medium shadow-lg ${
            toast.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-3 py-4 sm:items-center sm:px-4 sm:py-6">
      <div className="max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-lg sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
