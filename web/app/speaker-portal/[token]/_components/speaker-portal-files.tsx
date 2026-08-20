"use client";

import { type ChangeEvent, useEffect, useState } from "react";
import { FileUp } from "lucide-react";
import type { SpeakerPortalSession } from "@/src/server/services/speaker-portal";

type PortalFileRecord = {
  id: string;
  sessionId: string | null;
  kind: "SLIDES" | "AGREEMENT" | "OTHER";
  filename: string;
  fileSizeBytes: number;
  version: number;
  reviewStatus: "RECEIVED" | "NEEDS_CHANGES" | "APPROVED" | "FINAL";
  reviewFeedback: string | null;
  createdAt: string;
};

const REVIEW_STATUS_LABELS: Record<PortalFileRecord["reviewStatus"], string> = {
  RECEIVED: "Received",
  NEEDS_CHANGES: "Needs changes",
  APPROVED: "Approved",
  FINAL: "Final",
};

function reviewStatusClasses(status: PortalFileRecord["reviewStatus"]): string {
  if (status === "APPROVED" || status === "FINAL") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "NEEDS_CHANGES") return "border-amber-200 bg-amber-50 text-amber-800";
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

type SpeakerPortalFilesProps = {
  token: string;
  sessions: SpeakerPortalSession[];
};

export function SpeakerPortalFiles({ token, sessions }: SpeakerPortalFilesProps) {
  const [files, setFiles] = useState<PortalFileRecord[]>([]);
  const [uploadSessionId, setUploadSessionId] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function loadFiles() {
      try {
        const response = await fetch(`/api/public/speaker-portal/${encodeURIComponent(token)}/files`);
        const payload = await response.json();
        if (!isActive) return;
        setFiles(response.ok && Array.isArray(payload) ? (payload as PortalFileRecord[]) : []);
      } catch {
        if (!isActive) return;
        setFiles([]);
      }
    }

    void loadFiles();

    return () => {
      isActive = false;
    };
  }, [token]);

  async function handleDeckSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setIsUploading(true);
    setErrorMessage(null);
    setNotice(null);

    try {
      const uploadMeta = {
        kind: "SLIDES" as const,
        filename: file.name,
        contentType: file.type,
        fileSizeBytes: file.size,
        ...(uploadSessionId ? { sessionId: uploadSessionId } : {}),
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

      const finalizeResponse = await fetch(`/api/public/speaker-portal/${encodeURIComponent(token)}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...uploadMeta, objectKey: presignPayload.objectKey }),
      });
      const finalizePayload = await finalizeResponse.json();
      if (!finalizeResponse.ok) {
        throw new Error(toErrorMessage(finalizePayload, "Failed to save upload"));
      }

      const created = finalizePayload as PortalFileRecord;
      setFiles((current) => [created, ...current]);
      setNotice(`Version ${created.version} uploaded. Previous versions are kept for the event team.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  }

  const sessionNameById = new Map(sessions.map((session) => [session.id, session.sessionName ?? "Untitled session"]));

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FileUp className="h-4 w-4 text-slate-500" />
            <h2 className="text-[16px] font-semibold text-slate-900">Presentations</h2>
          </div>
          <p className="mt-1 text-[13px] text-slate-500">
            Upload your presentation or supporting files. Each upload creates a new version — nothing is overwritten.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          {sessions.length > 0 ? (
            <select
              value={uploadSessionId}
              onChange={(event) => setUploadSessionId(event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 px-2 text-[13px] text-slate-700 outline-none focus:border-slate-300 sm:max-w-[220px]"
              aria-label="Session for this presentation"
            >
              <option value="">General (no session)</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.sessionName ?? "Untitled session"}
                </option>
              ))}
            </select>
          ) : null}
          <label className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 sm:w-auto">
            <FileUp className="h-3.5 w-3.5" />
            {isUploading ? "Uploading..." : "Upload presentation"}
            <input
              type="file"
              accept=".pdf,.ppt,.pptx,.key,.zip,application/pdf"
              className="hidden"
              onChange={(event) => void handleDeckSelected(event)}
            />
          </label>
        </div>
      </div>

      {errorMessage ? <p className="mt-3 text-[13px] text-rose-600">{errorMessage}</p> : null}
      {notice ? <p className="mt-3 text-[13px] text-emerald-700">{notice}</p> : null}

      {files.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {files.map((file) => (
            <li key={file.id} className="rounded-xl border border-slate-200 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-slate-900">
                    {file.filename}
                    <span className="ml-2 text-[12px] font-semibold text-slate-500">v{file.version}</span>
                  </p>
                  <p className="mt-0.5 text-[12px] text-slate-500">
                    {[
                      file.kind === "SLIDES" ? "Presentation" : file.kind === "AGREEMENT" ? "Agreement" : "File",
                      file.sessionId ? sessionNameById.get(file.sessionId) ?? "Session" : "General",
                      `${(file.fileSizeBytes / 1024 / 1024).toFixed(1)} MB`,
                      new Date(file.createdAt).toLocaleDateString(),
                    ].join(" · ")}
                  </p>
                </div>
                <span
                  className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${reviewStatusClasses(file.reviewStatus)}`}
                >
                  {REVIEW_STATUS_LABELS[file.reviewStatus]}
                </span>
              </div>
              {file.reviewFeedback ? (
                <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-700">
                  <span className="font-semibold">Event team feedback:</span> {file.reviewFeedback}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-6 text-center">
          <p className="text-[14px] font-semibold text-slate-900">No presentation files uploaded yet</p>
          <p className="mt-2 text-[13px] text-slate-500">
            Upload your presentation when it is ready. You can upload another version later if anything changes.
          </p>
        </div>
      )}
    </section>
  );
}
