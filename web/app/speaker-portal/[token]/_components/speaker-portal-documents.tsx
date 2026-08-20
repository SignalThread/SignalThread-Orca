"use client";

import { type ChangeEvent, useEffect, useState } from "react";
import { FileCheck, PenLine } from "lucide-react";

type PortalDocumentStatus = "ASSIGNED" | "SUBMITTED" | "IN_REVIEW" | "APPROVED" | "REJECTED";

type PortalDocumentRequest = {
  id: string;
  title: string;
  instructions: string | null;
  requiresSignature: boolean;
  status: PortalDocumentStatus;
  submittedAt: string | null;
  submittedFilename: string | null;
  feedback: string | null;
};

const STATUS_LABELS: Record<PortalDocumentStatus, string> = {
  ASSIGNED: "Needs upload",
  SUBMITTED: "Submitted",
  IN_REVIEW: "In review",
  APPROVED: "Approved",
  REJECTED: "Needs changes",
};

function statusClasses(status: PortalDocumentStatus): string {
  if (status === "APPROVED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "REJECTED") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "ASSIGNED") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
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

type SpeakerPortalDocumentsProps = {
  token: string;
};

export function SpeakerPortalDocuments({ token }: SpeakerPortalDocumentsProps) {
  const [requests, setRequests] = useState<PortalDocumentRequest[]>([]);
  const [uploadingRequestId, setUploadingRequestId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadRequests() {
      try {
        const response = await fetch(`/api/public/speaker-portal/${encodeURIComponent(token)}/documents`);
        const payload = await response.json();
        if (!isActive) return;
        setRequests(response.ok && Array.isArray(payload) ? (payload as PortalDocumentRequest[]) : []);
      } catch {
        if (!isActive) return;
        setRequests([]);
      }
    }

    void loadRequests();

    return () => {
      isActive = false;
    };
  }, [token]);

  async function handleDocumentSelected(requestId: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploadingRequestId(requestId);
    setErrorMessage(null);

    try {
      const uploadMeta = {
        kind: "AGREEMENT" as const,
        filename: file.name,
        contentType: file.type,
        fileSizeBytes: file.size,
      };

      const presignResponse = await fetch(
        `/api/public/speaker-portal/${encodeURIComponent(token)}/files/presign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(uploadMeta),
        },
      );
      const presignPayload = await presignResponse.json();
      if (!presignResponse.ok) {
        throw new Error(toErrorMessage(presignPayload, "Failed to prepare upload"));
      }

      const uploadResponse = await fetch(String(presignPayload.uploadUrl), {
        method: "PUT",
        headers: {
          "Content-Type": file.type,
          ...(presignPayload.headers && typeof presignPayload.headers === "object"
            ? (presignPayload.headers as Record<string, string>)
            : {}),
        },
        body: file,
      });
      if (!uploadResponse.ok) {
        throw new Error("Upload to storage failed");
      }

      const submitResponse = await fetch(
        `/api/public/speaker-portal/${encodeURIComponent(token)}/documents/${encodeURIComponent(requestId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type,
            fileSizeBytes: file.size,
            objectKey: presignPayload.objectKey,
          }),
        },
      );
      const submitPayload = await submitResponse.json();
      if (!submitResponse.ok) {
        throw new Error(toErrorMessage(submitPayload, "Failed to submit document"));
      }

      const updated = submitPayload as PortalDocumentRequest;
      setRequests((current) => current.map((request) => (request.id === updated.id ? updated : request)));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploadingRequestId(null);
    }
  }

  if (requests.length === 0) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
        <div className="flex items-center gap-2">
          <FileCheck className="h-4 w-4 text-slate-500" />
          <h2 className="text-[16px] font-semibold text-slate-900">Documents</h2>
        </div>
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-6 text-center">
          <p className="text-[14px] font-semibold text-slate-900">No document requests</p>
          <p className="mt-2 text-[13px] text-slate-500">
            If the event team needs agreements, forms, or signed documents, they will appear here.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      <div className="flex items-center gap-2">
        <FileCheck className="h-4 w-4 text-slate-500" />
        <h2 className="text-[16px] font-semibold text-slate-900">Documents</h2>
      </div>
      <p className="mt-1 text-[13px] text-slate-500">
        Complete any agreements, forms, or signature requests from the event team.
      </p>

      {errorMessage ? <p className="mt-3 text-[13px] text-rose-600">{errorMessage}</p> : null}

      <ul className="mt-4 space-y-2">
        {requests.map((request) => (
          <li key={request.id} className="rounded-xl border border-slate-200 px-4 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold text-slate-900">
                  {request.title}
                  {request.requiresSignature ? (
                    <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                      <PenLine className="h-3 w-3" />
                      Signature required
                    </span>
                  ) : null}
                </p>
                {request.instructions ? (
                  <p className="mt-0.5 text-[12px] text-slate-500">{request.instructions}</p>
                ) : null}
                {request.submittedFilename ? (
                  <p className="mt-0.5 text-[12px] text-slate-500">
                    Submitted: {request.submittedFilename}
                    {request.submittedAt ? ` · ${new Date(request.submittedAt).toLocaleDateString()}` : ""}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClasses(request.status)}`}
                >
                  {STATUS_LABELS[request.status]}
                </span>
                {request.status !== "APPROVED" && request.status !== "IN_REVIEW" ? (
                  <label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-lg border border-slate-300 px-3 text-[12px] font-semibold text-slate-700 hover:bg-slate-50">
                    {uploadingRequestId === request.id
                      ? "Uploading..."
                      : request.submittedFilename
                        ? "Replace"
                        : request.requiresSignature
                          ? "Upload Signed Copy"
                          : "Upload"}
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,application/pdf"
                      className="hidden"
                      onChange={(event) => void handleDocumentSelected(request.id, event)}
                    />
                  </label>
                ) : null}
              </div>
            </div>
            {request.feedback ? (
              <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-700">
                <span className="font-semibold">Event team feedback:</span> {request.feedback}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
