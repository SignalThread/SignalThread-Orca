import { getSpeakerPortalView, SpeakerPortalError } from "@/src/server/services/speaker-portal";
import { SpeakerPortalTokenError } from "@/src/server/services/speaker-portal-tokens";
import { listPortalSpeakerMessages } from "@/src/server/services/speaker-comms";
import { listPortalSpeakerDocumentRequests } from "@/src/server/services/speaker-documents";
import { listPortalSpeakerFiles } from "@/src/server/services/speaker-files";
import { SpeakerPortalDashboard } from "./_components/speaker-portal-dashboard";
import { SpeakerPortalDocuments } from "./_components/speaker-portal-documents";
import { SpeakerPortalFiles } from "./_components/speaker-portal-files";
import { SpeakerPortalForm } from "./_components/speaker-portal-form";
import { SpeakerPortalMessages } from "./_components/speaker-portal-messages";
import { SpeakerPortalOnsitePacket } from "./_components/speaker-portal-onsite";
import { SpeakerPortalSessions } from "./_components/speaker-portal-sessions";
import { SpeakerPortalWorkspace } from "./_components/speaker-portal-workspace";

type SpeakerPortalPageProps = {
  params: Promise<{ token: string }>;
};

export default async function SpeakerPortalPage({ params }: SpeakerPortalPageProps) {
  const { token } = await params;
  let view: Awaited<ReturnType<typeof getSpeakerPortalView>>;
  let files: Awaited<ReturnType<typeof listPortalSpeakerFiles>> = [];
  let documents: Awaited<ReturnType<typeof listPortalSpeakerDocumentRequests>> = [];
  let messages: Awaited<ReturnType<typeof listPortalSpeakerMessages>> = [];

  try {
    view = await getSpeakerPortalView(token);
  } catch (error) {
    const message = error instanceof SpeakerPortalTokenError || error instanceof SpeakerPortalError
      ? error.message
      : "This speaker portal link is invalid.";

    return (
      <main className="min-h-screen bg-slate-50 px-6 py-16">
        <div className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-500">Speaker Portal</p>
          <h1 className="mt-3 text-[28px] leading-[32px] font-semibold text-slate-900">Link unavailable</h1>
          <p className="mt-3 text-[14px] text-slate-600">{message}</p>
        </div>
      </main>
    );
  }

  const [filesResult, documentsResult, messagesResult] = await Promise.allSettled([
    listPortalSpeakerFiles(token),
    listPortalSpeakerDocumentRequests(token),
    listPortalSpeakerMessages(token),
  ]);

  if (filesResult.status === "fulfilled") {
    files = filesResult.value;
  }
  if (documentsResult.status === "fulfilled") {
    documents = documentsResult.value;
  }
  if (messagesResult.status === "fulfilled") {
    messages = messagesResult.value;
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#EEF4F8_0%,#F8FAFC_42%,#EEF2F7_100%)] px-4 py-5 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <SpeakerPortalWorkspace
          overview={<SpeakerPortalDashboard view={view} files={files} documents={documents} messages={messages} />}
          profile={<SpeakerPortalForm token={token} initialView={view} />}
          sessions={<SpeakerPortalSessions sessions={view.sessions} />}
          presentations={<SpeakerPortalFiles token={token} sessions={view.sessions} />}
          documents={<SpeakerPortalDocuments token={token} />}
          messages={<SpeakerPortalMessages token={token} />}
          onsite={<SpeakerPortalOnsitePacket sessions={view.sessions} onsite={view.onsite} />}
        />
      </div>
    </main>
  );
}
