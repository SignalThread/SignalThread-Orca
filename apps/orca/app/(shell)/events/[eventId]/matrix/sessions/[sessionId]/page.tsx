import { SessionDetailWorkspace } from "./_components/session-detail-workspace";

type MatrixSessionDetailPageProps = {
  params: Promise<{
    eventId: string;
    sessionId: string;
  }>;
};

export default async function MatrixSessionDetailPage({ params }: MatrixSessionDetailPageProps) {
  const { eventId, sessionId } = await params;
  return <SessionDetailWorkspace eventId={eventId} sessionId={sessionId} />;
}
