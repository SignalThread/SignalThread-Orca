import { SpeakerDetailPageShell } from "../_components/speaker-detail-page";

type SpeakerDetailPageProps = {
  params: Promise<{ eventId: string; speakerId: string }>;
};

export default async function SpeakerDetailPage({ params }: SpeakerDetailPageProps) {
  const { eventId, speakerId } = await params;

  return <SpeakerDetailPageShell eventId={eventId} speakerId={speakerId} />;
}
