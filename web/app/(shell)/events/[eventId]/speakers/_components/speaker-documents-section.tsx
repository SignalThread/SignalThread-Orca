"use client";

import { type FormEvent, useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { EmptyState, FORM_INPUT_CLASS, OverviewCard, SectionHeader } from "./speaker-detail-shared";

type SpeakerDocumentStatus = "ASSIGNED" | "SUBMITTED" | "IN_REVIEW" | "APPROVED" | "REJECTED";

type SpeakerDocumentRequestRecord = {
  id: string;
  title: string;
  instructions: string | null;
  requiresSignature: boolean;
  status: SpeakerDocumentStatus;
  submittedAt: string | null;
  createdAt: string;
  documentId: string | null;
  documentStatus: string | null;
  speakerFile: {
    id: string;
    filename: string;
    fileSizeBytes: number;
    createdAt: string;
    reviewFeedback: string | null;
  } | null;
};

const STATUS_LABELS: Record<SpeakerDocumentStatus, string> = {
  ASSIGNED: "Assigned",
  SUBMITTED: "Submitted",
  IN_REVIEW: "In review",
  APPROVED: "Approved",
  REJECTED: "Needs changes",
};

function statusClasses(status: SpeakerDocumentStatus): string {
  if (status === "APPROVED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "REJECTED") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "ASSIGNED") return "border-slate-200 bg-slate-50 text-slate-600";
  return "border-sky-200 bg-sky-50 text-sky-700";
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

type SpeakerDocumentsSectionProps = {
  eventId: string;
  speakerId: string;
  embeddedInForm?: boolean;
};

export function SpeakerDocumentsSection({ eventId, speakerId, embeddedInForm = false }: SpeakerDocumentsSectionProps) {
  const [requests, setRequests] = useState<SpeakerDocumentRequestRecord[]>([]);
  const [titleDraft, setTitleDraft] = useState("");
  const [instructionsDraft, setInstructionsDraft] = useState("");
  const [requiresSignatureDraft, setRequiresSignatureDraft] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [linkingRequestId, setLinkingRequestId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadRequests() {
      try {
        const response = await fetch(`/api/events/${eventId}/speakers/${speakerId}/documents`);
        const payload = await response.json();
        if (!isActive) return;
        setRequests(response.ok && Array.isArray(payload) ? (payload as SpeakerDocumentRequestRecord[]) : []);
      } catch {
        if (!isActive) return;
        setRequests([]);
      }
    }

    void loadRequests();

    return () => {
      isActive = false;
    };
  }, [eventId, speakerId]);

  async function assignDocument() {
    if (!titleDraft.trim()) return;

    setIsAssigning(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/events/${eventId}/speakers/${speakerId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: titleDraft.trim(),
          instructions: instructionsDraft.trim() || null,
          requiresSignature: requiresSignatureDraft,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to assign document"));
      }

      setRequests((current) => [payload as SpeakerDocumentRequestRecord, ...current]);
      setTitleDraft("");
      setInstructionsDraft("");
      setRequiresSignatureDraft(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to assign document");
    } finally {
      setIsAssigning(false);
    }
  }

  function handleAssign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void assignDocument();
  }

  const assignmentControls = (
    <>
      <input
        value={titleDraft}
        onChange={(event) => setTitleDraft(event.target.value)}
        placeholder="Document title (e.g. Speaker agreement)"
        className={FORM_INPUT_CLASS}
        aria-label="Document title"
      />
      <input
        value={instructionsDraft}
        onChange={(event) => setInstructionsDraft(event.target.value)}
        placeholder="Instructions for the speaker (optional)"
        className={FORM_INPUT_CLASS}
        aria-label="Document instructions"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="inline-flex items-center gap-2 text-[13px] text-slate-700">
          <input
            type="checkbox"
            checked={requiresSignatureDraft}
            onChange={(event) => setRequiresSignatureDraft(event.target.checked)}
          />
          Signature required
        </label>
        <button
          type={embeddedInForm ? "button" : "submit"}
          onClick={embeddedInForm ? () => void assignDocument() : undefined}
          disabled={isAssigning || !titleDraft.trim()}
          className="inline-flex h-9 items-center rounded-lg bg-[#28439A] px-3 text-[12px] font-semibold text-white hover:bg-[#243d8e] focus:outline-none focus:ring-2 focus:ring-violet-100 disabled:opacity-60"
        >
          {isAssigning ? "Assigning..." : "Assign Document"}
        </button>
      </div>
    </>
  );

  async function handleSendToDocsHub(requestId: string) {
    setLinkingRequestId(requestId);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/events/${eventId}/speakers/${speakerId}/documents/${requestId}/link-docs-hub`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(toErrorMessage(payload, "Failed to send to Docs Hub"));
      }

      const updated = payload as SpeakerDocumentRequestRecord;
      setRequests((current) => current.map((request) => (request.id === updated.id ? updated : request)));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to send to Docs Hub");
    } finally {
      setLinkingRequestId(null);
    }
  }

  return (
    <OverviewCard id="documents-section" title={`Required Documents (${requests.length})`}>
      <SectionHeader
        eyebrow="Documents"
        title="Required documents"
        body="Assign required documents to this speaker. Formal review happens in Docs Hub once submitted."
      />

      {embeddedInForm ? (
        <div className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
          {assignmentControls}
        </div>
      ) : (
        <form onSubmit={handleAssign} className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
          {assignmentControls}
        </form>
      )}

      {errorMessage ? <p className="mt-3 text-[13px] text-rose-600">{errorMessage}</p> : null}

      {requests.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {requests.map((request) => (
            <li key={request.id} className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-slate-900">
                    {request.title}
                    {request.requiresSignature ? (
                      <span className="ml-2 text-[11px] font-semibold text-slate-500">Signature required</span>
                    ) : null}
                  </p>
                  <p className="text-[12px] text-slate-500">
                    {request.speakerFile
                      ? `${request.speakerFile.filename} · ${new Date(request.speakerFile.createdAt).toLocaleDateString()}`
                      : "Awaiting speaker upload"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClasses(request.status)}`}
                  >
                    {STATUS_LABELS[request.status]}
                  </span>
                  {request.speakerFile ? (
                    <a
                      href={`/api/events/${eventId}/speakers/${speakerId}/files/${request.speakerFile.id}/download`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-100"
                    >
                      Download
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                  {request.speakerFile && !request.documentId ? (
                    <button
                      type="button"
                      onClick={() => void handleSendToDocsHub(request.id)}
                      disabled={linkingRequestId === request.id}
                      className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-100 disabled:opacity-60"
                    >
                      {linkingRequestId === request.id ? "Sending..." : "Send to Docs Hub"}
                    </button>
                  ) : null}
                  {request.documentId ? (
                    <a
                      href={`/events/${eventId}/docs?documentId=${encodeURIComponent(request.documentId)}`}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-100"
                    >
                      In Docs Hub
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-3">
          <EmptyState title="No documents assigned" body="Required agreements, forms, and signature requests will appear here." />
        </div>
      )}
    </OverviewCard>
  );
}
