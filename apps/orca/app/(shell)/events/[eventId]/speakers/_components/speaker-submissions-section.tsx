"use client";

import { useEffect, useState } from "react";
import {
  EmptyState,
  formatDateTime,
  OverviewCard,
  SectionHeader,
  SUBMISSION_PREVIEW_FIELDS,
  toErrorMessage,
  type SpeakerSubmissionRecord,
  type SpeakerSubmissionSummary,
} from "./speaker-detail-shared";
import type { SpeakerRecord } from "./speaker-profile-shared";

export function SpeakerSubmissionsSection({
  eventId,
  speaker,
  initialSubmission,
  onSubmissionResolved,
}: {
  eventId: string;
  speaker: SpeakerRecord;
  initialSubmission: SpeakerSubmissionSummary | null;
  onSubmissionResolved: (speaker?: SpeakerRecord) => void;
}) {
  const [pendingSubmission, setPendingSubmission] = useState<SpeakerSubmissionRecord | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    async function loadSubmission() {
      try {
        const response = await fetch(`/api/events/${eventId}/speakers/${speaker.id}/submission`);
        const payload = await response.json();
        if (!isActive) return;
        setPendingSubmission(response.ok && payload?.submission ? (payload.submission as SpeakerSubmissionRecord) : null);
      } catch {
        if (isActive) setPendingSubmission(null);
      }
    }
    void loadSubmission();
    return () => {
      isActive = false;
    };
  }, [eventId, speaker.id]);

  async function refreshSpeaker(): Promise<SpeakerRecord | undefined> {
    const response = await fetch(`/api/events/${eventId}/speakers/${speaker.id}`);
    const payload = await response.json();
    return response.ok ? (payload as SpeakerRecord) : undefined;
  }

  async function handleReview(action: "approve" | "reject") {
    if (!pendingSubmission) return;
    setIsReviewing(true);
    setErrorMessage(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/events/${eventId}/speaker-submissions/${pendingSubmission.id}/${action}`, {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(toErrorMessage(payload, `Failed to ${action} submission`));
      setPendingSubmission(null);
      const nextSpeaker = action === "approve" ? await refreshSpeaker() : undefined;
      onSubmissionResolved(nextSpeaker);
      setNotice(action === "approve" ? "Submission approved and applied." : "Submission rejected.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : `Failed to ${action} submission`);
    } finally {
      setIsReviewing(false);
    }
  }

  const displayedSubmission = pendingSubmission ?? (initialSubmission as SpeakerSubmissionRecord | null);

  return (
    <OverviewCard id="submissions-section" title="Portal Submissions">
      <SectionHeader
        eyebrow="Submissions"
        title="Speaker profile review"
        body="Portal submissions are pending until a planner approves or rejects them. Approval applies supported profile fields to the canonical speaker."
      />
      {displayedSubmission ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[13px] font-semibold text-amber-900">Pending update</p>
              <p className="mt-1 text-[12px] text-amber-800">Submitted {formatDateTime(displayedSubmission.submittedAt)}</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => void handleReview("approve")} disabled={isReviewing || !pendingSubmission} className="inline-flex h-8 items-center rounded-lg bg-emerald-600 px-3 text-[12px] font-semibold text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:opacity-60">
                {isReviewing ? "Working..." : "Approve"}
              </button>
              <button type="button" onClick={() => void handleReview("reject")} disabled={isReviewing || !pendingSubmission} className="inline-flex h-8 items-center rounded-lg border border-rose-300 bg-white px-3 text-[12px] font-semibold text-rose-700 hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-100 disabled:opacity-60">
                Reject
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <th className="px-3 py-2 font-semibold">Field</th>
                  <th className="px-3 py-2 font-semibold">Current</th>
                  <th className="px-3 py-2 font-semibold">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {SUBMISSION_PREVIEW_FIELDS.map(({ key, label }) => {
                  const submitted = displayedSubmission[key];
                  if (submitted === null || typeof submitted === "undefined") return null;
                  const current = speaker[key];
                  const currentText = typeof current === "string" && current.trim() ? current : "—";
                  if (String(submitted) === currentText) return null;
                  return (
                    <tr key={key} className="border-b border-slate-100 last:border-b-0 align-top">
                      <td className="px-3 py-2 font-semibold text-slate-700">{label}</td>
                      <td className="max-w-[240px] break-words px-3 py-2 text-slate-500">{currentText}</td>
                      <td className="max-w-[240px] break-words px-3 py-2 text-slate-900">{String(submitted)}</td>
                    </tr>
                  );
                })}
                {displayedSubmission.topics?.length > 0 ? (
                  <tr className="border-b border-slate-100 last:border-b-0 align-top">
                    <td className="px-3 py-2 font-semibold text-slate-700">Topics</td>
                    <td className="max-w-[240px] break-words px-3 py-2 text-slate-500">{(speaker.topics ?? []).join(", ") || "—"}</td>
                    <td className="max-w-[240px] break-words px-3 py-2 text-slate-900">{displayedSubmission.topics.join(", ")}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {displayedSubmission.noteToPlanner ? (
            <p className="mt-3 text-[13px] text-slate-700"><span className="font-semibold">Note:</span> {displayedSubmission.noteToPlanner}</p>
          ) : null}
        </div>
      ) : (
        <div className="mt-4">
          <EmptyState title="No pending submissions" body="When this speaker submits portal profile changes, the review diff will appear here." />
        </div>
      )}
      {errorMessage ? <p className="mt-3 text-[13px] text-rose-600">{errorMessage}</p> : null}
      {notice ? <p className="mt-3 text-[13px] text-emerald-700">{notice}</p> : null}
    </OverviewCard>
  );
}
