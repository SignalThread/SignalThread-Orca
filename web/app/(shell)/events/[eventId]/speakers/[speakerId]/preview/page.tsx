import Link from "next/link";
import { ArrowLeft, Eye } from "lucide-react";
import { ensureProvisionedUserAndContext } from "@/lib/request-user";
import {
  getSpeakerPortalPreview,
  SpeakerPortalPreviewError,
} from "@/src/server/services/speaker-portal-preview";
import { SpeakerPortalOnsitePacket } from "@/app/speaker-portal/[token]/_components/speaker-portal-onsite";
import { buildSpeakerPortalTheme } from "@/app/speaker-portal/[token]/_components/speaker-portal-theme";

export const dynamic = "force-dynamic";

type SpeakerPortalPreviewPageProps = {
  params: Promise<{ eventId: string; speakerId: string }>;
};

const FILE_REVIEW_LABELS: Record<string, string> = {
  RECEIVED: "Received",
  NEEDS_CHANGES: "Needs changes",
  APPROVED: "Approved",
  FINAL: "Final",
};

const DOCUMENT_STATUS_LABELS: Record<string, string> = {
  ASSIGNED: "Needs upload",
  SUBMITTED: "Submitted",
  IN_REVIEW: "In review",
  APPROVED: "Approved",
  REJECTED: "Needs changes",
};

/**
 * Read-only planner preview of what a speaker sees in their portal.
 * Server-rendered with zero client components and zero forms: there is
 * structurally no way to write speaker data from this page.
 */
export default async function SpeakerPortalPreviewPage({ params }: SpeakerPortalPreviewPageProps) {
  const { eventId, speakerId } = await params;

  const context = await ensureProvisionedUserAndContext();
  if (context.status !== "OK") {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-8">
        <h1 className="text-[18px] font-semibold text-slate-900">Preview unavailable</h1>
        <p className="mt-2 text-[14px] text-slate-600">Sign in with planner access to preview the speaker portal.</p>
      </section>
    );
  }

  let preview;
  try {
    preview = await getSpeakerPortalPreview(eventId, speakerId, {
      id: context.appUserId!,
      orgId: context.activeOrgId,
      role: context.role!,
    });
  } catch (error) {
    const message =
      error instanceof SpeakerPortalPreviewError ? error.message : "Failed to load portal preview";
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-8">
        <h1 className="text-[18px] font-semibold text-slate-900">Preview unavailable</h1>
        <p className="mt-2 text-[14px] text-slate-600">{message}</p>
      </section>
    );
  }

  const { view, files, documents, messages } = preview;
  const theme = buildSpeakerPortalTheme(view);

  return (
    <section className="space-y-5 bg-[#F6F8FC]">
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-3"
        role="status"
      >
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-amber-700" />
          <p className="text-[13px] font-semibold text-amber-900">
            Read-only portal preview — viewing what {view.speaker.name} sees. No actions can be taken in preview mode.
          </p>
        </div>
        <Link
          href={`/events/${eventId}/speakers`}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 text-[12px] font-semibold text-amber-800 hover:bg-amber-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Speakers
        </Link>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-[linear-gradient(135deg,#172554_0%,#28439A_46%,#6D5EF7_100%)] px-6 py-7 text-white sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/20 bg-white/15 text-[14px] font-bold">
                {theme.speakerInitials}
              </span>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">Speaker Portal</p>
                <h1 className="mt-1 text-[24px] leading-[29px] font-semibold">{theme.eventName}</h1>
              </div>
            </div>
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[12px] font-semibold text-white/90">
              Read-only preview
            </span>
          </div>
        </div>
        <div className="grid gap-4 px-6 py-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:px-8">
          {view.speaker.headshotUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={view.speaker.headshotUrl} alt="" className="h-16 w-16 rounded-2xl object-cover ring-4 ring-slate-100" />
          ) : (
            <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-50 text-[18px] font-bold text-violet-700 ring-4 ring-slate-100">
              {theme.speakerInitials}
            </span>
          )}
          <div className="min-w-0">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">{theme.speakerName}</p>
            <p className="mt-1 text-[14px] text-slate-600">
              {[view.speaker.title, view.speaker.company].filter(Boolean).join(" · ") || "No title/company on file"}
            </p>
            {view.speaker.bio ? (
              <p className="mt-3 whitespace-pre-wrap text-[13px] text-slate-700">{view.speaker.bio}</p>
            ) : (
              <p className="mt-3 text-[13px] text-slate-500">No bio submitted yet.</p>
            )}
          </div>
        </div>
      </div>

      <SpeakerPortalOnsitePacket sessions={view.sessions} onsite={view.onsite} />

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-[16px] font-semibold text-slate-900">Presentations</h2>
        {files.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {files.map((file) => (
              <li key={file.id} className="rounded-xl border border-slate-200 px-4 py-2.5">
                <p className="text-[13px] font-semibold text-slate-900">
                  {file.filename}
                  <span className="ml-2 text-[11px] font-semibold text-slate-500">v{file.version}</span>
                  <span className="ml-2 text-[11px] font-semibold text-slate-500">
                    {FILE_REVIEW_LABELS[file.reviewStatus] ?? file.reviewStatus}
                  </span>
                </p>
                {file.reviewFeedback ? (
                  <p className="mt-1 text-[12px] text-slate-600">Event team feedback: {file.reviewFeedback}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[13px] text-slate-500">No presentations uploaded.</p>
        )}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-[16px] font-semibold text-slate-900">Required Documents</h2>
        {documents.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {documents.map((doc) => (
              <li key={doc.id} className="rounded-xl border border-slate-200 px-4 py-2.5">
                <p className="text-[13px] font-semibold text-slate-900">
                  {doc.title}
                  <span className="ml-2 text-[11px] font-semibold text-slate-500">
                    {DOCUMENT_STATUS_LABELS[doc.status] ?? doc.status}
                  </span>
                </p>
                {doc.submittedFilename ? (
                  <p className="mt-1 text-[12px] text-slate-600">Submitted: {doc.submittedFilename}</p>
                ) : null}
                {doc.feedback ? (
                  <p className="mt-1 text-[12px] text-slate-600">Event team feedback: {doc.feedback}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[13px] text-slate-500">No documents assigned.</p>
        )}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h2 className="text-[16px] font-semibold text-slate-900">Messages</h2>
        {messages.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {messages.map((message) => (
              <li
                key={message.id}
                className={`max-w-[85%] rounded-xl px-4 py-2.5 ${
                  message.senderType === "SPEAKER"
                    ? "ml-auto bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-800"
                }`}
              >
                <p className="text-[11px] font-semibold opacity-70">
                  {message.senderType === "SPEAKER" ? "Speaker" : "Event team"} ·{" "}
                  {message.createdAt.toLocaleString()}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-[13px]">{message.body}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[13px] text-slate-500">No messages.</p>
        )}
      </div>
    </section>
  );
}
