import { notFound } from "next/navigation";
import { getEventHeaderById } from "@/lib/event-loaders";
import { isVoiceDemoEvent } from "@/lib/event-voice-demo";
import { EventVoiceDemo } from "./_components/event-voice-demo";

type EventVoicePageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function EventVoicePage({ params }: EventVoicePageProps) {
  const { eventId } = await params;

  if (!isVoiceDemoEvent(eventId)) notFound();

  const event = await getEventHeaderById(eventId);
  if (!event) notFound();

  return <EventVoiceDemo eventId={event.id} eventName={event.name} />;
}
