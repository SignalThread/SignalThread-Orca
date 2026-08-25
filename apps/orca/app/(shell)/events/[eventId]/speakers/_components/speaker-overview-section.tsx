"use client";

import { Activity, AlertTriangle, CheckCircle2, ChevronRight, FileText, ShieldCheck } from "lucide-react";
import { completenessClasses } from "./speaker-completeness";
import type { SpeakerRecord } from "./speaker-profile-shared";
import {
  COMPLETENESS_FIELD_COUNT,
  EmptyState,
  formatDate,
  formatDateTime,
  MetricCard,
  OverviewCard,
  type OverviewData,
  type SpeakerDetailSection,
} from "./speaker-detail-shared";
import { getPortalAccessStatus, SpeakerPortalAccessCard } from "./speaker-portal-access-card";

export function SpeakerOverviewSection({
  eventId,
  speakerId,
  speaker,
  overview,
  completeness,
  completenessPercent,
  completedFields,
  missingItems,
  primarySummariesLoading,
  secondarySummariesLoading,
  primarySummaryError,
  secondarySummaryError,
  onRetryPrimarySummaries,
  onRetrySecondarySummaries,
  onOpenSection,
  portalGrantUrl,
  portalError,
  portalNotice,
  isPortalWorking,
  reminderSentAt,
  onGeneratePortalLink,
  onCopyPortalLink,
  onMarkReminderSent,
  onRevokePortalLink,
}: {
  eventId: string;
  speakerId: string;
  speaker: SpeakerRecord;
  overview: OverviewData;
  completeness: "Complete" | "Partial" | "Incomplete";
  completenessPercent: number;
  completedFields: number;
  missingItems: string[];
  primarySummariesLoading: boolean;
  secondarySummariesLoading: boolean;
  primarySummaryError: string | null;
  secondarySummaryError: string | null;
  onRetryPrimarySummaries: () => void;
  onRetrySecondarySummaries: () => void;
  onOpenSection: (section: SpeakerDetailSection) => void;
  portalGrantUrl: string | null;
  portalError: string | null;
  portalNotice: string | null;
  isPortalWorking: boolean;
  reminderSentAt: string | null;
  onGeneratePortalLink: () => void | Promise<void>;
  onCopyPortalLink: () => void | Promise<void>;
  onMarkReminderSent: () => void | Promise<void>;
  onRevokePortalLink: () => void | Promise<void>;
}) {
  const portalAccessStatus = getPortalAccessStatus(overview.portalStatus, speaker);

  return (
    <>
      {primarySummaryError ? (
        <SummaryLoadError message={primarySummaryError} onRetry={onRetryPrimarySummaries} />
      ) : null}
      {secondarySummaryError ? (
        <SummaryLoadError message={secondarySummaryError} onRetry={onRetrySecondarySummaries} />
      ) : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Profile Completeness"
          value={`${completenessPercent}%`}
          detail={completeness}
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone={completeness === "Complete" ? "green" : completeness === "Partial" ? "amber" : "red"}
          onAction={() => onOpenSection("profile")}
        />
        <MetricCard
          title="Portal Status"
          value={primarySummariesLoading ? "Loading..." : portalAccessStatus.label}
          detail={primarySummariesLoading ? "Checking portal state" : portalAccessStatus.detail}
          icon={<ShieldCheck className="h-4 w-4" />}
          tone={portalAccessStatus.tone}
        />
        <MetricCard
          title="Submissions"
          value={primarySummariesLoading ? "Loading..." : overview.pendingSubmission ? "Pending" : "Clear"}
          detail={primarySummariesLoading ? "Checking portal submissions" : overview.pendingSubmission ? `Submitted ${formatDate(overview.pendingSubmission.submittedAt)}` : "No pending profile review"}
          icon={<FileText className="h-4 w-4" />}
          tone={overview.pendingSubmission ? "amber" : "green"}
          onAction={() => onOpenSection("submissions")}
        />
        <MetricCard
          title="Conflicts"
          value={primarySummariesLoading ? "Loading..." : overview.conflicts.length > 0 ? `${overview.conflicts.length} conflict${overview.conflicts.length === 1 ? "" : "s"}` : "None"}
          detail={primarySummariesLoading ? "Checking assignments" : overview.conflicts[0]?.description ?? "No scheduling conflicts found"}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone={overview.conflicts.length > 0 ? "red" : "green"}
          onAction={() => onOpenSection("conflicts")}
        />
      </div>

      <OverviewCard id="profile" title="Readiness" actionLabel="View profile" onAction={() => onOpenSection("profile")}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <span className={`inline-flex rounded-full border px-3 py-1 text-[12px] font-semibold ${completenessClasses(completeness)}`}>
              {completeness}
            </span>
            <p className="mt-2 text-[13px] text-slate-600">
              {completedFields} of {COMPLETENESS_FIELD_COUNT} profile checkpoints are complete.
            </p>
          </div>
          {overview.readinessFlags.length > 0 || missingItems.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 lg:max-w-xl">
              {[...new Set([...missingItems, ...overview.readinessFlags])].slice(0, 8).map((flag) => (
                <span
                  key={flag}
                  className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800"
                >
                  {flag.replaceAll("_", " ")}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-emerald-700">Profile is ready for planner review.</p>
          )}
        </div>
      </OverviewCard>

      <OverviewCard id="portal-link" title="Speaker Portal Link">
        <SpeakerPortalAccessCard
          eventId={eventId}
          speakerId={speakerId}
          speaker={{ ...speaker, reminderSentAt }}
          status={overview.portalStatus}
          generatedUrl={portalGrantUrl}
          mode="full"
          isWorking={isPortalWorking}
          error={portalError}
          notice={portalNotice}
          onGenerate={onGeneratePortalLink}
          onCopy={onCopyPortalLink}
          onMarkReminderSent={onMarkReminderSent}
          onRevoke={onRevokePortalLink}
        />
      </OverviewCard>

      <OverviewCard id="submissions" title="Pending Submissions" actionLabel={overview.pendingSubmission ? "Review submission" : "Open submissions"} onAction={() => onOpenSection("submissions")}>
        {overview.pendingSubmission ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[13px] font-semibold text-amber-900">Profile changes waiting for review</p>
                <p className="mt-1 text-[12px] text-amber-800">
                  Submitted {formatDateTime(overview.pendingSubmission.submittedAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenSection("submissions")}
                className="inline-flex h-8 items-center gap-2 rounded-lg border border-amber-300 bg-white px-3 text-[12px] font-semibold text-amber-800 hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-100"
              >
                Review
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            {overview.pendingSubmission.noteToPlanner ? (
              <p className="mt-3 text-[13px] text-amber-900">{overview.pendingSubmission.noteToPlanner}</p>
            ) : null}
          </div>
        ) : (
          <EmptyState title="No pending submissions" body="Speaker profile submissions that need planner review will appear here." />
        )}
      </OverviewCard>

      <OverviewCard id="sessions" title={`Assigned Sessions (${overview.assignedSessions.length})`} actionLabel="Open sessions" onAction={() => onOpenSection("sessions")}>
        {overview.assignedSessions.length > 0 ? (
          <ul className="space-y-2">
            {overview.assignedSessions.slice(0, 5).map((session) => (
              <li key={session.id} className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 md:grid-cols-[70px_minmax(0,1fr)_auto] md:items-center">
                <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-2 py-1.5 text-center">
                  <p className="text-[11px] font-semibold uppercase text-slate-500">{formatDate(session.date).split(" ")[0]}</p>
                  <p className="text-[15px] font-semibold text-slate-900">{formatDate(session.date).split(" ")[1]?.replace(",", "")}</p>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-slate-950">{session.title}</p>
                  <p className="mt-1 text-[12px] text-slate-500">
                    {session.startTime} - {session.endTime} · {session.roomName}
                  </p>
                </div>
                <span className="inline-flex w-fit rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
                  {session.role}
                </span>
              </li>
            ))}
          </ul>
        ) : secondarySummariesLoading ? (
          <EmptyState title="Loading assigned sessions" body="Run of Show assignments are loading after the profile shell." />
        ) : (
          <EmptyState title="No assigned sessions" body="Session assignments from the Run of Show will summarize here once this speaker is assigned." />
        )}
      </OverviewCard>

      <OverviewCard id="files" title={`Files (${overview.files.length})`} actionLabel="Open files" onAction={() => onOpenSection("files")}>
        {overview.files.length > 0 ? (
          <ul className="space-y-2">
            {overview.files.slice(0, 5).map((file) => (
              <li key={file.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-slate-950">{file.filename}</p>
                  <p className="mt-1 text-[12px] text-slate-500">{file.kind} · Uploaded {formatDate(file.createdAt)}</p>
                </div>
                <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                  {file.reviewStatus.replaceAll("_", " ")}
                </span>
              </li>
            ))}
          </ul>
        ) : secondarySummariesLoading ? (
          <EmptyState title="Loading files" body="File summaries are loading after the profile shell." />
        ) : (
          <EmptyState title="No files yet" body="Slides, agreements, and other speaker uploads will appear here." />
        )}
      </OverviewCard>

      <div className="grid gap-4 xl:grid-cols-3">
        <OverviewCard id="communications" title="Communications" compact actionLabel="Open communications" onAction={() => onOpenSection("communications")}>
          {overview.messages.length > 0 ? (
            <ul className="space-y-3">
              {overview.messages.slice(0, 3).map((message) => (
                <li key={message.id} className="rounded-xl border border-blue-100 bg-blue-50/40 p-3">
                  <p className="line-clamp-2 text-[12px] font-medium text-slate-700">{message.body || "Message recorded"}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {message.senderType === "SPEAKER" ? "From speaker" : "From planner"} · {formatDate(message.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          ) : secondarySummariesLoading ? (
            <EmptyState title="Loading messages" body="Communication summaries are loading after the profile shell." />
          ) : (
            <EmptyState title="No messages" body="Planner and speaker messages will summarize here." />
          )}
        </OverviewCard>

        <OverviewCard id="conflicts" title="Conflicts" compact actionLabel="Open conflicts" onAction={() => onOpenSection("conflicts")}>
          {overview.conflicts.length > 0 ? (
            <ul className="space-y-3">
              {overview.conflicts.slice(0, 3).map((conflict) => (
                <li key={`${conflict.speakerId}-${conflict.sessionIds.join("-")}`} className="rounded-xl border border-rose-200 bg-rose-50/80 p-3">
                  <p className="text-[12px] font-semibold text-rose-800">{conflict.description}</p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No conflicts" body="Scheduling conflicts for this speaker will appear here." />
          )}
        </OverviewCard>

        <OverviewCard id="activity" title="Recent Activity" compact actionLabel="Open activity" onAction={() => onOpenSection("activity")}>
          {overview.activity.length > 0 ? (
            <ul className="space-y-3">
              {overview.activity.slice(0, 5).map((entry, index) => (
                <li key={`${entry.at}-${entry.action}-${index}`} className="flex gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-700">
                    <Activity className="h-3.5 w-3.5" />
                  </span>
                  <div>
                    <p className="text-[12px] font-semibold text-slate-800">{entry.action}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">{formatDateTime(entry.at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : secondarySummariesLoading ? (
            <EmptyState title="Loading activity" body="Activity summaries are loading after the profile shell." />
          ) : (
            <EmptyState title="No activity yet" body="Speaker updates, uploads, and planner actions will appear here." />
          )}
        </OverviewCard>
      </div>

      <OverviewCard id="onsite" title="Onsite Information" actionLabel="Open onsite" onAction={() => onOpenSection("onsite")}>
        <EmptyState
          title="Event-wide speaker instructions"
          body="Green room, badge pickup, arrival, AV rehearsal, and onsite contact details are managed here and shown to all speakers in the portal packet."
        />
      </OverviewCard>

      <OverviewCard id="notes" title="Notes" actionLabel="Open notes" onAction={() => onOpenSection("notes")}>
        {speaker.notes ? (
          <p className="whitespace-pre-wrap text-[13px] leading-6 text-slate-700">{speaker.notes}</p>
        ) : (
          <EmptyState title="No notes" body="Internal planner notes will appear in the Notes section." />
        )}
      </OverviewCard>
    </>
  );
}

function SummaryLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-900">
      <span>Some summary data could not be loaded: {message}</span>
      <button type="button" onClick={onRetry} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-semibold text-amber-900 hover:bg-amber-100">
        Retry
      </button>
    </div>
  );
}
