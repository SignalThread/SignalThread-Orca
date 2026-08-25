import { EventActivity } from "./_components/event-activity";

type EventActivityPageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function EventActivityPage({ params }: EventActivityPageProps) {
  const { eventId } = await params;
  return (
    <section className="h-full min-h-0 overflow-y-auto">
      <EventActivity eventId={eventId} />
    </section>
  );
}
