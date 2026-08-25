import { SpeakerDirectory } from "./_components/speaker-directory";

type EventSpeakersPageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function EventSpeakersPage({ params }: EventSpeakersPageProps) {
  const { eventId } = await params;
  return <SpeakerDirectory eventId={eventId} />;
}
