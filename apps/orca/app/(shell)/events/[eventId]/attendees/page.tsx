import { EventAttendees } from "./_components/event-attendees";

type EventAttendeesPageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function EventAttendeesPage({ params }: EventAttendeesPageProps) {
  const { eventId } = await params;
  return (
    <section className="h-full min-h-0 overflow-y-auto">
      <EventAttendees eventId={eventId} />
    </section>
  );
}
