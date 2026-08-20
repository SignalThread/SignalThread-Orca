"use client";

import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import {
  EmptyState,
  fileReviewStatusClasses,
  formatDate,
  FORM_TEXTAREA_CLASS,
  OverviewCard,
  SectionHeader,
  SPEAKER_FILE_KINDS,
  SPEAKER_FILE_REVIEW_STATUSES,
  toErrorMessage,
  type SpeakerFileRecord,
  type SpeakerFileReviewStatus,
} from "./speaker-detail-shared";

export function SpeakerFilesSection({ eventId, speakerId }: { eventId: string; speakerId: string }) {
  const [files, setFiles] = useState<SpeakerFileRecord[]>([]);
  const [fileUploadKind, setFileUploadKind] = useState<SpeakerFileRecord["kind"]>("SLIDES");
  const [reviewingFileId, setReviewingFileId] = useState<string | null>(null);
  const [reviewStatusDraft, setReviewStatusDraft] = useState<SpeakerFileReviewStatus>("RECEIVED");
  const [reviewFeedbackDraft, setReviewFeedbackDraft] = useState("");
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isSavingReview, setIsSavingReview] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let isActive = true;
    async function loadFiles() {
      try {
        const response = await fetch(`/api/events/${eventId}/speakers/${speakerId}/files`);
        const payload = await response.json();
        if (!isActive) return;
        setFiles(response.ok && Array.isArray(payload) ? (payload as SpeakerFileRecord[]) : []);
      } catch {
        if (isActive) setFiles([]);
      }
    }
    void loadFiles();
    return () => {
      isActive = false;
    };
  }, [eventId, speakerId]);

  async function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setIsUploadingFile(true);
    setErrorMessage(null);

    try {
      const uploadMeta = { kind: fileUploadKind, filename: file.name, contentType: file.type, fileSizeBytes: file.size };
      const presignResponse = await fetch(`/api/events/${eventId}/speakers/${speakerId}/files/presign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(uploadMeta),
      });
      const presignPayload = await presignResponse.json();
      if (!presignResponse.ok) throw new Error(toErrorMessage(presignPayload, "Failed to prepare upload"));

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
      if (!uploadResponse.ok) throw new Error("File upload to storage failed");

      const finalizeResponse = await fetch(`/api/events/${eventId}/speakers/${speakerId}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...uploadMeta, objectKey: presignPayload.objectKey }),
      });
      const finalizePayload = await finalizeResponse.json();
      if (!finalizeResponse.ok) throw new Error(toErrorMessage(finalizePayload, "Failed to save file record"));

      setFiles((current) => [finalizePayload as SpeakerFileRecord, ...current]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "File upload failed");
    } finally {
      setIsUploadingFile(false);
    }
  }

  function startReview(file: SpeakerFileRecord) {
    setReviewingFileId(file.id);
    setReviewStatusDraft(file.reviewStatus);
    setReviewFeedbackDraft(file.reviewFeedback ?? "");
    setErrorMessage(null);
  }

  async function handleSaveReview(fileId: string) {
    setIsSavingReview(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/events/${eventId}/speakers/${speakerId}/files/${fileId}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewStatus: reviewStatusDraft, reviewFeedback: reviewFeedbackDraft.trim() || null }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(toErrorMessage(payload, "Failed to save review"));
      const updated = payload as SpeakerFileRecord;
      setFiles((current) => current.map((file) => (file.id === updated.id ? updated : file)));
      setReviewingFileId(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save review");
    } finally {
      setIsSavingReview(false);
    }
  }

  return (
    <OverviewCard id="files-section" title={`Speaker Files (${files.length})`}>
      <SectionHeader
        eyebrow="Files"
        title="Slides, agreements, and uploads"
        body="Generic speaker uploads stay separate from required/requested documents."
        action={
          <div className="flex items-center gap-2">
            <select value={fileUploadKind} onChange={(event) => setFileUploadKind(event.target.value as SpeakerFileRecord["kind"])} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-[12px] text-slate-700 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100">
              {SPEAKER_FILE_KINDS.map(({ kind, label }) => <option key={kind} value={kind}>{label}</option>)}
            </select>
            <input ref={fileInputRef} type="file" className="hidden" onChange={(event) => void handleFileSelected(event)} />
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploadingFile} className="inline-flex h-9 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 text-[12px] font-semibold text-blue-700 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-violet-100 disabled:opacity-60">
              <Upload className="h-4 w-4" />
              {isUploadingFile ? "Uploading..." : "Upload"}
            </button>
          </div>
        }
      />
      {errorMessage ? <p className="mt-3 text-[13px] text-rose-600">{errorMessage}</p> : null}
      {files.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {files.map((file) => (
            <li key={file.id} className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-slate-950">
                    {file.filename}
                    <span className="ml-2 text-[11px] font-semibold text-slate-500">v{file.version}</span>
                  </p>
                  <p className="mt-1 text-[12px] text-slate-500">
                    {file.kind} · {(file.fileSizeBytes / 1024 / 1024).toFixed(1)} MB · {file.uploadedViaPortal ? "Speaker upload" : "Team upload"} · {formatDate(file.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${fileReviewStatusClasses(file.reviewStatus)}`}>
                    {SPEAKER_FILE_REVIEW_STATUSES.find((entry) => entry.status === file.reviewStatus)?.label ?? file.reviewStatus}
                  </span>
                  <button type="button" onClick={() => (reviewingFileId === file.id ? setReviewingFileId(null) : startReview(file))} className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-100">
                    {reviewingFileId === file.id ? "Close" : "Review"}
                  </button>
                  <a href={`/api/events/${eventId}/speakers/${speakerId}/files/${file.id}/download`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-100">
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </a>
                </div>
              </div>
              {reviewingFileId === file.id ? (
                <div className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <select value={reviewStatusDraft} onChange={(event) => setReviewStatusDraft(event.target.value as SpeakerFileReviewStatus)} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[12px] text-slate-700 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100">
                      {SPEAKER_FILE_REVIEW_STATUSES.map(({ status, label }) => <option key={status} value={status}>{label}</option>)}
                    </select>
                    <button type="button" onClick={() => void handleSaveReview(file.id)} disabled={isSavingReview} className="inline-flex h-8 items-center rounded-lg bg-[#28439A] px-3 text-[12px] font-semibold text-white hover:bg-[#243d8e] focus:outline-none focus:ring-2 focus:ring-violet-100 disabled:opacity-60">
                      {isSavingReview ? "Saving..." : "Save Review"}
                    </button>
                  </div>
                  <textarea value={reviewFeedbackDraft} onChange={(event) => setReviewFeedbackDraft(event.target.value)} rows={2} placeholder="Feedback visible to the speaker" className={FORM_TEXTAREA_CLASS} />
                </div>
              ) : file.reviewFeedback ? (
                <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-700">
                  <span className="font-semibold">Feedback:</span> {file.reviewFeedback}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4">
          <EmptyState title="No files uploaded" body="Upload slides, agreements, or other speaker files when they are available." />
        </div>
      )}
    </OverviewCard>
  );
}
